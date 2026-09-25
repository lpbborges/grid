// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod cache;
mod engine_process;
mod media_patch;
#[cfg(test)]
mod playback_engine_tests;
mod player;
mod stream_proxy;
mod subtitles;
mod window_embed;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

struct EngineState {
    child: Mutex<Option<std::process::Child>>,
    pid: Mutex<Option<u32>>,
    port: Mutex<Option<u16>>,
}

struct SubtitleRateLimit {
    counts: Mutex<HashMap<String, (u32, Instant)>>,
}

const SUBTITLE_RATE_LIMIT_PER_MINUTE: u32 = 30;

/// Hard cap on how many bytes of a subtitle response we'll buffer into
/// memory. Real subtitle files are at most a few hundred KB; this is
/// generous headroom while still making it impossible for a
/// mis-resolved/attacker-influenced `file_idx` (or a malicious external
/// host) to force multi-gigabyte buffering, as defense in depth on top of
/// the subtitle-file-name check in `fetch_torrent_subtitle`.
const MAX_SUBTITLE_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

fn check_subtitle_rate_limit(state: &SubtitleRateLimit, key: &str) -> bool {
    let mut counts = state.counts.lock().unwrap();
    let now = Instant::now();
    let entry = counts.entry(key.to_string()).or_insert((0, now));
    if now.duration_since(entry.1).as_secs() >= 60 {
        *entry = (1, now);
        return true;
    }
    if entry.0 >= SUBTITLE_RATE_LIMIT_PER_MINUTE {
        return false;
    }
    entry.0 += 1;
    true
}

#[tauri::command]
async fn fetch_torrent_subtitle(
    info_hash: String,
    file_idx: i64,
    state: State<'_, EngineState>,
    rate_limit: State<'_, SubtitleRateLimit>,
) -> Result<String, String> {
    let port = {
        let port_guard = state.port.lock().unwrap();
        port_guard.ok_or_else(|| "Engine not running".to_string())?
    };
    fetch_torrent_subtitle_impl(info_hash, file_idx, port, &rate_limit).await
}

/// The actual logic behind the `fetch_torrent_subtitle` command, factored
/// out so it can be exercised in tests without needing a real `tauri::State`
/// (whose only public constructor requires a live `AppHandle`/`Manager`).
async fn fetch_torrent_subtitle_impl(
    info_hash: String,
    file_idx: i64,
    port: u16,
    rate_limit: &SubtitleRateLimit,
) -> Result<String, String> {
    if !check_subtitle_rate_limit(rate_limit, "torrent") {
        return Err("Too many requests".to_string());
    }
    if !subtitles::is_valid_info_hash(&info_hash) || !subtitles::is_valid_file_idx(file_idx) {
        return Err("Invalid parameters".to_string());
    }

    // `file_idx` is caller-supplied and only format-validated above — it is
    // NOT yet checked against this torrent's actual file list. Resolve the
    // real file name from the torrent engine and reject anything that isn't
    // a subtitle file (e.g. the main video) before fetching its content,
    // which would otherwise buffer a potentially multi-gigabyte file into
    // memory (see fetch_and_convert).
    let file_name = resolve_torrent_file_name(port, &info_hash, file_idx).await?;
    if !subtitles::is_subtitle_file_name(&file_name) {
        return Err("Requested file is not a subtitle".to_string());
    }

    fetch_and_convert(&stream_proxy::engine_stream_url(port, &info_hash, file_idx)).await
}

#[derive(serde::Deserialize)]
struct TorrentDetailsFile {
    name: String,
}

#[derive(serde::Deserialize)]
struct TorrentDetailsResponse {
    #[serde(default)]
    files: Option<Vec<TorrentDetailsFile>>,
}

/// Queries the local torrent engine for `info_hash`'s file listing and
/// returns the name of the file at `file_idx`, so callers can validate it
/// server-side before treating it as a subtitle (see `fetch_torrent_subtitle`).
async fn resolve_torrent_file_name(
    port: u16,
    info_hash: &str,
    file_idx: i64,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(8000))
        .build()
        .map_err(|e| e.to_string())?;

    let details_url = format!("http://127.0.0.1:{}/torrents/{}", port, info_hash);
    let res = client
        .get(&details_url)
        .send()
        .await
        .map_err(|e| format!("Error fetching torrent details: {}", e))?;

    if !res.status().is_success() {
        return Err("Failed to fetch torrent details".to_string());
    }

    let details: TorrentDetailsResponse = res.json().await.map_err(|e| e.to_string())?;
    let files = details
        .files
        .ok_or_else(|| "Torrent has no file listing".to_string())?;

    let idx = usize::try_from(file_idx).map_err(|_| "Invalid file index".to_string())?;
    files
        .get(idx)
        .map(|f| f.name.clone())
        .ok_or_else(|| "File index out of range".to_string())
}

#[tauri::command]
async fn fetch_external_subtitle(
    url: String,
    rate_limit: State<'_, SubtitleRateLimit>,
) -> Result<String, String> {
    if !check_subtitle_rate_limit(&rate_limit, "external") {
        return Err("Too many requests".to_string());
    }
    if !subtitles::is_allowed_subtitle_url(&url) {
        return Err("URL not allowed".to_string());
    }
    fetch_and_convert(&url).await
}

/// Redirect policy shared by the subtitle-fetching client: every redirect
/// target (not just the original request URL) is re-validated against the
/// strem.io allowlist before being followed. This closes an SSRF hole where
/// an allowed host could redirect the fetch to an arbitrary internal or
/// external address.
fn redirect_policy_allowing(is_allowed: fn(&str) -> bool) -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(move |attempt| {
        if is_allowed(attempt.url().as_str()) {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

fn build_client_with_redirect_allowlist(
    is_allowed: fn(&str) -> bool,
) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(12000))
        .redirect(redirect_policy_allowing(is_allowed))
        .build()
}

fn build_subtitle_client() -> Result<reqwest::Client, reqwest::Error> {
    build_client_with_redirect_allowlist(subtitles::is_allowed_subtitle_url)
}

async fn fetch_and_convert(target_url: &str) -> Result<String, String> {
    let client = build_subtitle_client().map_err(|e| e.to_string())?;

    let res = client
        .get(target_url)
        .send()
        .await
        .map_err(|e| format!("Error fetching subtitle: {}", e))?;

    if !res.status().is_success() {
        return Err("Failed to fetch subtitle".to_string());
    }

    let text = read_capped_body_as_string(res, MAX_SUBTITLE_RESPONSE_BYTES).await?;
    if text.trim_start().starts_with("WEBVTT") {
        Ok(text)
    } else {
        Ok(subtitles::srt_to_vtt(&text))
    }
}

/// Reads `res`'s body as subtitle text, streaming it in chunks and
/// aborting with an error as soon as more than `max_bytes` have been read.
/// This is defense in depth on top of the subtitle-file-name validation in
/// `fetch_torrent_subtitle`: even if a non-subtitle (e.g. multi-gigabyte
/// video) file were ever reached here, this keeps memory use bounded
/// instead of buffering the whole response via `Response::text()`.
async fn read_capped_body_as_string(
    res: reqwest::Response,
    max_bytes: usize,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let mut stream = res.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error reading response body: {}", e))?;
        if buf.len() + chunk.len() > max_bytes {
            return Err(format!(
                "Response body exceeded the {}-byte limit",
                max_bytes
            ));
        }
        buf.extend_from_slice(&chunk);
    }

    Ok(subtitles::decode_subtitle(&buf))
}

#[tauri::command]
async fn get_cache_manifest(app: tauri::AppHandle) -> Result<Vec<cache::CacheEntry>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(cache::read_manifest(&cache::manifest_path(&app_data_dir)).entries)
}

#[tauri::command]
async fn upsert_cache_entry(app: tauri::AppHandle, entry: cache::CacheEntry) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = cache::manifest_path(&app_data_dir);
    let mut manifest = cache::read_manifest(&path);
    cache::upsert_entry(&mut manifest, entry);
    cache::write_manifest(&path, &manifest).map_err(|e| e.to_string())
}

#[tauri::command]
async fn evict_for_space(
    app: tauri::AppHandle,
    exclude_info_hash: String,
    needed_bytes: u64,
    limit_bytes: u64,
) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        evict_for_space_blocking(&app_data_dir, &exclude_info_hash, needed_bytes, limit_bytes)
    })
    .await
    .map_err(|e| format!("Cache eviction task failed: {}", e))?
}

fn evict_for_space_blocking(
    app_data_dir: &Path,
    exclude_info_hash: &str,
    needed_bytes: u64,
    limit_bytes: u64,
) -> Result<Vec<String>, String> {
    let downloads_dir = cache::downloads_dir(app_data_dir);
    let path = cache::manifest_path(app_data_dir);
    let mut manifest = cache::read_manifest(&path);

    let to_evict =
        cache::pick_eviction_candidates(&manifest, exclude_info_hash, needed_bytes, limit_bytes);

    for info_hash in &to_evict {
        let Some(entry) = cache::remove_entry(&mut manifest, info_hash) else {
            continue;
        };
        // The torrent's whole folder, not only the file played last.
        let Some(std::path::Component::Normal(top)) =
            std::path::Path::new(&entry.file_name).components().next()
        else {
            continue;
        };
        if top != "manifest.json" {
            cache::remove_path_best_effort(&downloads_dir.join(top));
        }
    }

    cache::write_manifest(&path, &manifest).map_err(|e| e.to_string())?;
    Ok(to_evict)
}

/// Path to the PID file tracking the currently-running (or most recently
/// running) rqbit sidecar process, inside the app's own cache directory.
fn pid_file_path(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join("grid-engine.pid")
}

/// Reads and parses a PID from `path`. Returns `None` on any error: missing
/// file, unreadable file, or content that isn't a plain `u32`.
fn read_pid_file(path: &Path) -> Option<u32> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
}

/// Writes `pid` as plain text to `path`, overwriting any existing content.
fn write_pid_file(path: &Path, pid: u32) -> std::io::Result<()> {
    std::fs::write(path, pid.to_string())
}

/// Best-effort removal of the PID file; errors (e.g. file already gone) are
/// intentionally ignored since this is always a cleanup step.
fn remove_pid_file(path: &Path) {
    let _ = std::fs::remove_file(path);
}

/// Pure identity check: does a process with this name/exe path look like our
/// rqbit sidecar? Used to avoid killing an unrelated process that happens to
/// have reused a stale PID.
fn process_looks_like_rqbit(name: &str, exe: Option<&Path>) -> bool {
    if name.to_lowercase().contains("rqbit") {
        return true;
    }
    if let Some(exe_path) = exe {
        if let Some(stem) = exe_path.file_stem().and_then(|s| s.to_str()) {
            if stem.to_lowercase().contains("rqbit") {
                return true;
            }
        }
    }
    false
}

/// Looks up the PID recorded in the PID file at `pid_path` and, only if that
/// process still exists and its identity matches our rqbit sidecar, kills it
/// and waits (best-effort) for the port to be released. In every case the
/// (now stale) PID file is removed at the end. This replaces the previous
/// "kill anything named rqbit, system-wide" logic, which risked killing an
/// unrelated user process.
fn cleanup_stale_engine(pid_path: &Path) {
    let Some(pid) = read_pid_file(pid_path) else {
        return;
    };

    let sys_pid = sysinfo::Pid::from_u32(pid);
    let pids = [sys_pid];
    let refresh_kind =
        sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::OnlyIfNotSet);
    let mut sys = sysinfo::System::new();
    let refresh = |sys: &mut sysinfo::System| {
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&pids),
            true,
            refresh_kind,
        );
    };
    refresh(&mut sys);

    if let Some(process) = sys.process(sys_pid) {
        let name = process.name().to_string_lossy().to_string();
        let exe = process.exe().map(|p| p.to_path_buf());
        if process_looks_like_rqbit(&name, exe.as_deref()) {
            process.kill();
            let mut died = false;
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                refresh(&mut sys);
                if sys.process(sys_pid).is_none() {
                    died = true;
                    break;
                }
            }
            if !died {
                println!(
                    "PID {} (rqbit) did not exit within 3s of being killed; proceeding anyway",
                    pid
                );
            }
        } else {
            println!(
                "PID {} from stale PID file does not look like our rqbit process (name: {}); leaving it alone",
                pid, name
            );
        }
    }
    // Process already gone, or we just killed it, or it didn't match our
    // identity check — either way the recorded PID is no longer actionable.
    remove_pid_file(pid_path);
}

/// Prints every line the engine writes with an `rqbit:` prefix, which the
/// E2E app log relies on.
fn forward_engine_output(stream: impl std::io::Read + Send + 'static, to_stderr: bool) {
    use std::io::BufRead;

    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stream);
        let mut line = Vec::new();
        while matches!(reader.read_until(b'\n', &mut line), Ok(read) if read > 0) {
            let text = String::from_utf8_lossy(&line);
            let text = text.trim_end_matches(['\r', '\n']);
            if to_stderr {
                eprintln!("rqbit: {:?}", text);
            } else {
                println!("rqbit: {:?}", text);
            }
            line.clear();
        }
    });
}

/// Drops an engine whose process has exited, so the next start spawns a new one.
fn forget_exited_engine(child: &mut Option<std::process::Child>) {
    if let Some(process) = child {
        match process.try_wait() {
            Ok(None) => return,
            Ok(Some(status)) => eprintln!("The engine exited ({status}); it will be restarted"),
            Err(e) => eprintln!("Could not check the engine process: {e}"),
        }
        *child = None;
    }
}

fn engine_environment() -> [(&'static str, &'static str); 1] {
    [("CORS_ALLOW_REGEXP", r"^http://tauri\.localhost$")]
}

#[tauri::command]
async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    // Check-and-bail without holding any lock across the (up to ~3s)
    // cleanup wait below: the window CloseRequested handler needs to be
    // able to acquire `state.child` promptly even if a startup cleanup is
    // still polling for a stale process to die, otherwise closing the
    // window could block on this same mutex.
    {
        let mut child_guard = state.child.lock().unwrap();
        forget_exited_engine(&mut child_guard);
        let port_guard = state.port.lock().unwrap();
        if child_guard.is_some() {
            if let Some(p) = *port_guard {
                return Ok(format!("http://127.0.0.1:{}", p));
            }
            return Ok("Engine already running".to_string());
        }
    }

    // Identity-validated cleanup of any orphaned rqbit process from a
    // previous run, tracked via the PID file (see cleanup_stale_engine).
    // Deliberately run with no EngineState locks held (see comment above).
    let app_cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::create_dir_all(&app_cache_dir) {
        eprintln!("Failed to create app cache dir for engine PID file: {}", e);
    }
    let pid_path = pid_file_path(&app_cache_dir);
    let cleanup_pid_path = pid_path.clone();
    tauri::async_runtime::spawn_blocking(move || cleanup_stale_engine(&cleanup_pid_path))
        .await
        .map_err(|e| e.to_string())?;

    let mut child_guard = state.child.lock().unwrap();
    forget_exited_engine(&mut child_guard);
    let mut pid_guard = state.pid.lock().unwrap();
    let mut port_guard = state.port.lock().unwrap();
    // Re-check in case another invocation raced us while cleanup ran.
    if child_guard.is_some() {
        if let Some(p) = *port_guard {
            return Ok(format!("http://127.0.0.1:{}", p));
        }
        return Ok("Engine already running".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let output_folder = cache::downloads_dir(&app_data_dir);
    let _ = std::fs::create_dir_all(&output_folder);

    // The downloads folder now persists across restarts (it backs the video
    // cache), so instead of wiping it we only remove state inconsistent with
    // the manifest: entries the manifest no longer knows about.
    let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
    for orphan_name in cache::find_orphan_top_level_names(&output_folder, &manifest) {
        cache::remove_path_best_effort(&output_folder.join(orphan_name));
    }

    // Find free ephemeral ports for HTTP API and peer listener
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| e.to_string())?
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let peer_port = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| e.to_string())?
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    // The shell plugin resolves the sidecar path; spawning the resulting std
    // command ourselves lets engine_process tie the engine to the app.
    let mut command: std::process::Command = app
        .shell()
        .sidecar("rqbit")
        .map_err(|e| {
            println!("Sidecar builder error: {}", e);
            e.to_string()
        })?
        .envs(engine_environment())
        .arg("--disable-dht-persistence")
        .arg("--http-api-listen-addr")
        .arg(format!("127.0.0.1:{}", port))
        .arg("--listen-port")
        .arg(peer_port.to_string())
        .arg("server")
        .arg("start")
        .arg("--disable-persistence")
        .arg(output_folder)
        .into();
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Spawned on this async command's Tokio worker thread, never inside
    // spawn_blocking: on Linux the engine is tied to the spawning thread.
    let mut child = engine_process::spawn_tied_to_app(&mut command).map_err(|e| {
        println!("Sidecar spawn error: {}", e);
        e.to_string()
    })?;
    if let Some(stdout) = child.stdout.take() {
        forward_engine_output(stdout, false);
    }
    if let Some(stderr) = child.stderr.take() {
        forward_engine_output(stderr, true);
    }

    let pid = child.id();
    if let Err(e) = write_pid_file(&pid_path, pid) {
        eprintln!("Failed to write engine PID file: {}", e);
    }

    *child_guard = Some(child);
    *pid_guard = Some(pid);
    *port_guard = Some(port);

    Ok(format!("http://127.0.0.1:{}", port))
}

struct StreamProxyState {
    port: Mutex<Option<u16>>,
}

#[tauri::command]
async fn get_stream_proxy_url(state: State<'_, StreamProxyState>) -> Result<String, String> {
    let port = state.port.lock().unwrap();
    port.map(|p| format!("http://127.0.0.1:{}", p))
        .ok_or_else(|| "Stream proxy not running".to_string())
}

/// Writes the fetched subtitles where mpv can read them, replacing the previous
/// playback's.
///
/// External subtitles reach the frontend as `blob:` URLs, which mpv cannot load,
/// so the text is written to the app cache and passed as `--sub-file`. The
/// strem.io allowlist and the rate limit stay on the fetch path, untouched:
/// this only persists what those checks already approved.
#[tauri::command]
async fn cache_native_subtitles(
    app: tauri::AppHandle,
    contents: Vec<String>,
) -> Result<Vec<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let dir = player::model::subtitle_cache_dir(&cache_dir);
    let paths = tauri::async_runtime::spawn_blocking(move || {
        player::model::write_subtitles(&dir, &contents)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

/// Starts native playback inside Grid's own window and returns its track list.
///
/// The track list comes back from the call rather than as an event: the
/// frontend needs it before it can apply preferences, and a returned value
/// cannot race the listener being attached.
#[tauri::command]
async fn start_native_player(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    proxy: State<'_, StreamProxyState>,
    state: State<'_, player::NativePlayerState>,
    url: String,
    start_seconds: f64,
    subtitle_files: Vec<String>,
) -> Result<player::model::Playback, String> {
    let port = proxy
        .port
        .lock()
        .unwrap()
        .ok_or_else(|| "Stream proxy not running".to_string())?;
    // libmpv never goes through the frontend fetch layer, so this is the only
    // thing keeping it pointed at our own proxy.
    let Some(url) = player::model::local_stream_url(&url, port) else {
        return Err("Refusing to play a URL that is not the local stream proxy".to_string());
    };
    if !start_seconds.is_finite() || start_seconds < 0.0 {
        return Err("Invalid start position".to_string());
    }
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if let Some(bad) = subtitle_files
        .iter()
        .find(|path| !player::model::is_cached_subtitle_path(&cache_dir, path))
    {
        eprintln!("Refusing a subtitle path outside the app cache: {bad}");
        return Err("Refusing to load a subtitle from outside the cache".to_string());
    }

    // Resolved before anything is stopped or loaded, so failing here cannot
    // leave a file loaded that nothing will ever order behind the UI.
    #[cfg(windows)]
    let video_parent = (!player::is_headless())
        .then(|| player::surface_windows::parent_handle(&window))
        .transpose()?;

    let controller = state.controller(&window).await?;
    controller.stop();
    // Whatever the previous playback left unpumped belongs to a stopped file.
    state.discard_events();
    #[cfg(target_os = "linux")]
    player::surface_linux::rearm_render_failure();
    let (playback, events) = controller
        .load(&url, start_seconds, &subtitle_files)
        .await?;

    // mpv creates its `wid` child above WebView2; with no video output there
    // is no window to order.
    #[cfg(windows)]
    if let Some(parent) = video_parent {
        player::surface_windows::order_video_behind_ui(parent).await;
    }

    // Not pumped yet: nothing is listening until this call has returned.
    // `native_player_set_tracks` starts the pump (see `NativePlayerState`).
    state.hold_events(events);
    Ok(playback)
}

fn running_player(state: &player::NativePlayerState) -> Result<player::Controller, String> {
    state
        .running()
        .ok_or_else(|| "No native player is running".to_string())
}

/// Applies the preselected tracks, then starts playback.
///
/// Startup only: it writes both track properties and unpauses as one step.
/// The mid-session controls below are separate for exactly that reason.
///
/// Also where the playback's events start flowing to the frontend.
/// `useMpvBackend.start` (src/lib/composables/useMpvBackend.svelte.ts)
/// awaits every `listen()` (lines 218-245) before it invokes this command
/// (line 255), so nothing emitted from here on can be dropped for lack of a
/// listener. Pumped before the tracks are applied so a failure below still
/// leaves mpv's own events (e.g. an error) reaching the UI.
#[tauri::command]
async fn native_player_set_tracks(
    app: tauri::AppHandle,
    state: State<'_, player::NativePlayerState>,
    aid: Option<i64>,
    sid: Option<i64>,
) -> Result<(), String> {
    let player = running_player(&state)?;
    if let Some(events) = state.take_events() {
        pump_player_events(app, events);
    }
    player.set_tracks(aid, sid)?;
    player.set_paused(false)
}

/// Pauses or resumes playback.
///
/// Separate from `native_player_set_tracks`, which unpauses as part of
/// starting: that one applies preferences once, this one is the control the
/// user presses.
#[tauri::command]
async fn native_player_set_paused(
    state: State<'_, player::NativePlayerState>,
    paused: bool,
) -> Result<(), String> {
    running_player(&state)?.set_paused(paused)
}

/// Seeks to an absolute position in seconds.
#[tauri::command]
async fn native_player_seek(
    state: State<'_, player::NativePlayerState>,
    seconds: f64,
) -> Result<(), String> {
    if !seconds.is_finite() || seconds < 0.0 {
        return Err("Invalid seek position".to_string());
    }
    running_player(&state)?.seek(seconds)
}

/// Sets the output volume on mpv's 0-100 scale.
#[tauri::command]
async fn native_player_set_volume(
    state: State<'_, player::NativePlayerState>,
    percent: f64,
) -> Result<(), String> {
    if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
        return Err("Invalid volume".to_string());
    }
    running_player(&state)?.set_volume(percent)
}

/// Switches the audio track mid-playback.
///
/// Distinct from `native_player_set_tracks`, which writes both properties and
/// then unpauses. That is right when applying preferences at startup and wrong
/// here twice over: changing the audio while paused must not start the film,
/// and it must not disable the subtitles.
#[tauri::command]
async fn native_player_select_audio(
    state: State<'_, player::NativePlayerState>,
    aid: Option<i64>,
) -> Result<(), String> {
    running_player(&state)?.set_audio_track(aid)
}

/// Switches the subtitle track mid-playback. `None` means no subtitles.
#[tauri::command]
async fn native_player_select_subtitle(
    state: State<'_, player::NativePlayerState>,
    sid: Option<i64>,
) -> Result<(), String> {
    running_player(&state)?.set_subtitle_track(sid)
}

/// Ends the current file. The player itself lives for the whole app run.
#[tauri::command]
async fn stop_native_player(
    app: tauri::AppHandle,
    state: State<'_, player::NativePlayerState>,
) -> Result<(), String> {
    if let Some(player) = state.running() {
        player.stop();
    }
    // A playback stopped before `native_player_set_tracks` was never pumped.
    state.discard_events();
    // Subtitles belong to the playback that just ended.
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        let dir = player::model::subtitle_cache_dir(&cache_dir);
        let _ = tauri::async_runtime::spawn_blocking(move || player::model::clear_subtitles(&dir))
            .await;
    }
    Ok(())
}

/// Forwards one playback's events to the frontend until that playback ends.
///
/// The channel closes only when `stop` or a newer `load` replaces this
/// playback's sink - an in-process player never disappears on its own - so
/// closing is not an "ended": emitting one here would land in the next
/// playback.
fn pump_player_events(
    app: tauri::AppHandle,
    mut events: tokio::sync::mpsc::UnboundedReceiver<player::model::PlayerEvent>,
) {
    use player::model::PlayerEvent;
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            let emitted = match event {
                PlayerEvent::Time(seconds) => app.emit("native-player-time", seconds),
                PlayerEvent::Paused(paused) => app.emit("native-player-paused", paused),
                PlayerEvent::Duration(seconds) => app.emit("native-player-duration", seconds),
                // Consumed by `load`; a second one would only mean a reload.
                PlayerEvent::Loaded => Ok(()),
                PlayerEvent::Presenting => app.emit("native-player-presenting", ()),
                PlayerEvent::Ended => app.emit("native-player-ended", ()),
                PlayerEvent::Failed(detail) => app.emit("native-player-error", detail),
            };
            if let Err(e) = emitted {
                eprintln!("Failed to forward a native player event: {e}");
            }
        }
    });
}

fn start_stream_proxy(app: &tauri::AppHandle) -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let engine_app = app.clone();
    let engine_port: stream_proxy::EnginePort =
        std::sync::Arc::new(move || *engine_app.state::<EngineState>().port.lock().unwrap());
    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => stream_proxy::serve(listener, engine_port).await,
            Err(e) => eprintln!("Failed to start the stream proxy: {}", e),
        }
    });
    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so it can intercept before other plugins
        // initialize (required by the plugin's own contract). Prevents two
        // app instances from ever running past startup, which is the direct
        // fix for "two instances' cleanup logic kills each other's engines".
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(EngineState {
            child: Mutex::new(None),
            pid: Mutex::new(None),
            port: Mutex::new(None),
        })
        .manage(SubtitleRateLimit {
            counts: Mutex::new(HashMap::new()),
        })
        .manage(player::NativePlayerState::default())
        .manage(StreamProxyState {
            port: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_torrent_engine,
            get_stream_proxy_url,
            fetch_torrent_subtitle,
            fetch_external_subtitle,
            get_cache_manifest,
            upsert_cache_entry,
            evict_for_space,
            start_native_player,
            native_player_set_tracks,
            native_player_set_paused,
            native_player_seek,
            native_player_set_volume,
            native_player_select_audio,
            native_player_select_subtitle,
            stop_native_player,
            cache_native_subtitles
        ])
        .setup(|app| {
            // libmpv refuses to initialise unless LC_NUMERIC is "C", and GTK has
            // just set it from the environment (pt_BR and de_DE use a comma).
            // GTK initialises before `setup`, so this cannot move into `run()`.
            #[cfg(target_os = "linux")]
            // SAFETY: a static C string; nothing else in Grid changes the
            // locale, and libmpv, which reads it, is created on the first Play.
            unsafe {
                libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
            }
            match start_stream_proxy(app.handle()) {
                Ok(port) => *app.state::<StreamProxyState>().port.lock().unwrap() = Some(port),
                Err(e) => eprintln!("Failed to bind the stream proxy: {}", e),
            }
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                        // Graceful shutdown: kill the sidecar and remove the
                        // PID file here rather than relying on Drop, since
                        // Drop on EngineState is not guaranteed to run on
                        // Tauri's close/force-quit paths.
                        let state = app_handle.state::<EngineState>();
                        if let Some(mut child) = state.child.lock().unwrap().take() {
                            let _ = child.kill();
                        }
                        *state.pid.lock().unwrap() = None;
                        *state.port.lock().unwrap() = None;
                        if let Ok(app_cache_dir) = app_handle.path().app_cache_dir() {
                            remove_pid_file(&pid_file_path(&app_cache_dir));
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_allows_then_blocks_after_threshold() {
        let state = SubtitleRateLimit {
            counts: Mutex::new(HashMap::new()),
        };
        for _ in 0..SUBTITLE_RATE_LIMIT_PER_MINUTE {
            assert!(check_subtitle_rate_limit(&state, "k"));
        }
        assert!(!check_subtitle_rate_limit(&state, "k"));
    }

    /// Starts a tiny raw-socket HTTP server that always replies with a 302
    /// redirect to `location`, for exactly one connection. Returns the
    /// server's base URL.
    async fn spawn_redirecting_server(location: &str) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let location = location.to_string();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0u8; 1024];
                let _ = socket.read(&mut buf).await;
                let response = format!(
                    "HTTP/1.1 302 Found\r\nLocation: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    location
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.shutdown().await;
            }
        });

        format!("http://{}", addr)
    }

    #[tokio::test]
    async fn redirect_to_disallowed_host_is_not_followed() {
        let server_url = spawn_redirecting_server("https://evil.example.com/payload.srt").await;

        let client = build_subtitle_client().expect("client builds");
        let res = client.get(&server_url).send().await.expect("request sent");

        // The custom redirect policy must stop at the disallowed target,
        // so the client sees the original 302 response rather than
        // transparently following it to evil.example.com.
        assert_eq!(res.status(), reqwest::StatusCode::FOUND);
        assert_eq!(
            res.headers().get("location").unwrap(),
            "https://evil.example.com/payload.srt"
        );
    }

    #[tokio::test]
    async fn redirect_to_an_allowed_host_is_followed() {
        let target_port =
            spawn_mock_engine_server("WEBVTT".to_string(), "unused".to_string()).await;
        let server_url =
            spawn_redirecting_server(&format!("http://127.0.0.1:{}/sub.vtt", target_port)).await;

        let client = build_client_with_redirect_allowlist(|url| url.contains("/sub.vtt"))
            .expect("client builds");
        let res = client.get(&server_url).send().await.expect("request sent");

        assert_eq!(res.status(), reqwest::StatusCode::OK);
        assert_eq!(res.text().await.unwrap(), "WEBVTT");
    }

    // --- PID file + process identity tests (P1-2) ---

    fn unique_test_pid_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "grid-engine-test-{}-{}.pid",
            name,
            std::process::id()
        ))
    }

    #[test]
    fn eviction_removes_every_file_of_a_season_pack() {
        let app_data_dir =
            std::env::temp_dir().join(format!("grid-evict-pack-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app_data_dir);
        let hash = "a".repeat(40);
        let pack = cache::downloads_dir(&app_data_dir).join(&hash).join("Show");
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::write(pack.join("S01E01.mkv"), b"one").unwrap();
        std::fs::write(pack.join("S01E02.mkv"), b"two").unwrap();
        let manifest = cache::Manifest {
            entries: vec![cache::CacheEntry {
                info_hash: hash.clone(),
                magnet: String::new(),
                media_id: None,
                season: Some(1),
                episode: Some(2),
                file_name: format!("{hash}/Show/S01E02.mkv"),
                total_bytes: 100,
                downloaded_bytes: 100,
                complete: true,
                last_accessed_at: 0,
            }],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        let evicted = evict_for_space_blocking(&app_data_dir, "other", 50, 100).unwrap();

        assert_eq!(evicted, vec![hash.clone()]);
        assert!(!cache::downloads_dir(&app_data_dir).join(&hash).exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn eviction_never_deletes_outside_the_downloads_folder() {
        let app_data_dir =
            std::env::temp_dir().join(format!("grid-evict-escape-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app_data_dir);
        std::fs::create_dir_all(cache::downloads_dir(&app_data_dir)).unwrap();
        let outside = app_data_dir.join("outside.mkv");
        std::fs::write(&outside, b"keep").unwrap();
        let manifest = cache::Manifest {
            entries: vec![cache::CacheEntry {
                info_hash: "b".repeat(40),
                magnet: String::new(),
                media_id: None,
                season: None,
                episode: None,
                file_name: "../outside.mkv".to_string(),
                total_bytes: 100,
                downloaded_bytes: 100,
                complete: true,
                last_accessed_at: 0,
            }],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        evict_for_space_blocking(&app_data_dir, "other", 50, 100).unwrap();

        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn forgets_an_engine_whose_process_has_exited() {
        let mut exited = std::process::Command::new(env!("CARGO"))
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        exited.wait().unwrap();
        let mut child = Some(exited);

        forget_exited_engine(&mut child);

        assert!(child.is_none());
    }

    const ENGINE_STAND_IN: &str = "GRID_ENGINE_STAND_IN";

    #[test]
    #[ignore = "a long-running process for keeps_an_engine_that_is_still_running"]
    fn engine_stand_in() {
        if std::env::var_os(ENGINE_STAND_IN).is_some() {
            std::thread::sleep(std::time::Duration::from_secs(30));
        }
    }

    #[test]
    fn keeps_an_engine_that_is_still_running() {
        let running = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "tests::engine_stand_in", "--ignored"])
            .env(ENGINE_STAND_IN, "1")
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let mut child = Some(running);

        forget_exited_engine(&mut child);

        let mut kept = child.expect("a running engine must be kept");
        let _ = kept.kill();
        let _ = kept.wait();
    }

    #[test]
    fn pid_file_path_is_under_the_given_cache_dir_with_expected_name() {
        let cache_dir = PathBuf::from("/home/user/.cache/com.lp01.grid");
        assert_eq!(pid_file_path(&cache_dir), cache_dir.join("grid-engine.pid"));
    }

    #[test]
    fn read_pid_file_returns_none_for_missing_file() {
        let path = unique_test_pid_path("missing");
        let _ = std::fs::remove_file(&path);
        assert_eq!(read_pid_file(&path), None);
    }

    #[test]
    fn read_pid_file_returns_none_for_garbage_content() {
        let path = unique_test_pid_path("garbage");
        std::fs::write(&path, "not-a-pid").unwrap();
        assert_eq!(read_pid_file(&path), None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_then_read_pid_file_round_trips() {
        let path = unique_test_pid_path("roundtrip");
        write_pid_file(&path, 12345).unwrap();
        assert_eq!(read_pid_file(&path), Some(12345));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn remove_pid_file_deletes_existing_file() {
        let path = unique_test_pid_path("remove");
        std::fs::write(&path, "1").unwrap();
        remove_pid_file(&path);
        assert!(!path.exists());
    }

    #[test]
    fn remove_pid_file_is_best_effort_when_file_missing() {
        let path = unique_test_pid_path("remove-missing");
        let _ = std::fs::remove_file(&path);
        // Must not panic even though the file doesn't exist.
        remove_pid_file(&path);
        assert!(!path.exists());
    }

    #[test]
    fn process_looks_like_rqbit_matches_name_substring_case_insensitive() {
        assert!(process_looks_like_rqbit("rqbit", None));
        assert!(process_looks_like_rqbit("RQbit.exe", None));
    }

    #[test]
    fn process_looks_like_rqbit_matches_exe_stem() {
        let exe = std::path::Path::new("/opt/app/resources/rqbit-x86_64");
        assert!(process_looks_like_rqbit("some-generic-name", Some(exe)));
    }

    #[test]
    fn process_looks_like_rqbit_rejects_unrelated_process() {
        assert!(!process_looks_like_rqbit("chrome", None));
        assert!(!process_looks_like_rqbit(
            "sleep",
            Some(std::path::Path::new("/usr/bin/sleep"))
        ));
    }

    #[test]
    fn cleanup_stale_engine_leaves_an_unrelated_live_process_alone_and_removes_the_pid_file() {
        let path = unique_test_pid_path("cleanup-unrelated");
        write_pid_file(&path, std::process::id()).unwrap();
        cleanup_stale_engine(&path);
        assert!(!path.exists());
    }

    #[test]
    fn cleanup_stale_engine_removes_the_pid_file_when_the_process_is_gone() {
        let path = unique_test_pid_path("cleanup-gone");
        write_pid_file(&path, u32::MAX - 1).unwrap();
        cleanup_stale_engine(&path);
        assert!(!path.exists());
    }

    #[test]
    fn cleanup_stale_engine_is_a_no_op_without_a_pid_file() {
        let path = unique_test_pid_path("cleanup-missing");
        let _ = std::fs::remove_file(&path);
        cleanup_stale_engine(&path);
        assert!(!path.exists());
    }

    fn csp_directive_sources(directive: &str) -> Vec<String> {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is valid JSON");
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("app.security.csp is a string");
        csp.split(';')
            .map(str::split_whitespace)
            .find_map(|mut parts| {
                (parts.next() == Some(directive)).then(|| parts.map(String::from).collect())
            })
            .unwrap_or_default()
    }

    #[test]
    fn main_window_may_use_the_custom_titlebar_controls() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("capabilities/default.json is valid JSON");
        assert!(capability["windows"]
            .as_array()
            .expect("windows is an array")
            .contains(&serde_json::json!("main")));
        let permissions = capability["permissions"]
            .as_array()
            .expect("permissions is an array");
        for permission in [
            "core:window:allow-minimize",
            "core:window:allow-toggle-maximize",
            "core:window:allow-close",
            "core:window:allow-start-dragging",
        ] {
            assert!(
                permissions.contains(&serde_json::json!(permission)),
                "missing {permission}"
            );
        }
    }

    #[test]
    fn csp_allows_blob_media_for_subtitle_tracks() {
        // Subtitles are rendered as <track src="blob:..."> (getTorrentSubtitles /
        // getExternalSubtitles). WebKit checks <track> URLs against media-src, so
        // without blob: every subtitle silently fails to load.
        assert!(csp_directive_sources("media-src").contains(&"blob:".to_string()));
    }

    #[test]
    fn csp_still_allows_local_engine_stream_media() {
        assert!(csp_directive_sources("media-src").contains(&"http://127.0.0.1:*".to_string()));
    }

    // --- fetch_torrent_subtitle file-idx validation (P0-1) ---

    /// A minimal mock of the rqbit engine HTTP API: serves a fixed JSON
    /// response for `GET /torrents/{hash}` (the file-listing/"details"
    /// endpoint) and a fixed plain-text body for
    /// `GET /torrents/{hash}/stream/{idx}` (the raw file-content endpoint),
    /// for however many requests are made against it. Returns the server's
    /// base URL port.
    async fn spawn_mock_engine_server(
        details_json: String,
        stream_body: impl Into<Vec<u8>>,
    ) -> u16 {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let stream_body = stream_body.into();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let details_json = details_json.clone();
                let stream_body = stream_body.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let n = match socket.read(&mut buf).await {
                        Ok(n) => n,
                        Err(_) => return,
                    };
                    let request = String::from_utf8_lossy(&buf[..n]);
                    let path = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("");

                    let (content_type, body) = if path.contains("/stream/") {
                        ("text/plain", stream_body.as_slice())
                    } else {
                        ("application/json", details_json.as_bytes())
                    };

                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        content_type,
                        body.len()
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    let _ = socket.write_all(body).await;
                    let _ = socket.shutdown().await;
                });
            }
        });

        port
    }

    fn test_rate_limit_state() -> SubtitleRateLimit {
        SubtitleRateLimit {
            counts: Mutex::new(HashMap::new()),
        }
    }

    #[tokio::test]
    async fn fetch_torrent_subtitle_rejects_a_file_idx_that_resolves_to_a_non_subtitle_file() {
        // The torrent's file 0 is the main video, not a subtitle. Even
        // though `file_idx: 0` passes the plain format check
        // (is_valid_file_idx), it must be rejected once resolved against
        // the torrent's real file listing — this is the regression case for
        // the "unbounded read of an attacker-influenceable file index" bug.
        let details_json =
            r#"{"info_hash":"deadbeef","files":[{"name":"movie.mkv"},{"name":"subs/en.srt"}]}"#
                .to_string();
        let port = spawn_mock_engine_server(details_json, "unused".to_string()).await;

        let rate_limit = test_rate_limit_state();

        let result = fetch_torrent_subtitle_impl("a".repeat(40), 0, port, &rate_limit).await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Requested file is not a subtitle");
    }

    const SUBTITLE_DETAILS_JSON: &str = r#"{"info_hash":"deadbeef","files":[{"name":"pt.srt"}]}"#;

    #[tokio::test]
    async fn fetch_torrent_subtitle_reads_a_windows_1252_srt() {
        let srt = b"1\n00:00:01,000 --> 00:00:02,000\nOl\xe1, voc\xea!\n".to_vec();
        let port = spawn_mock_engine_server(SUBTITLE_DETAILS_JSON.to_string(), srt).await;

        let vtt = fetch_torrent_subtitle_impl("a".repeat(40), 0, port, &test_rate_limit_state())
            .await
            .expect("a Windows-1252 subtitle should be accepted");

        assert!(vtt.contains("Olá, você!"));
    }

    #[tokio::test]
    async fn fetch_torrent_subtitle_keeps_a_vtt_with_a_byte_order_mark_as_is() {
        let vtt = "\u{FEFF}WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOi\n";
        let port = spawn_mock_engine_server(SUBTITLE_DETAILS_JSON.to_string(), vtt).await;

        let result = fetch_torrent_subtitle_impl("a".repeat(40), 0, port, &test_rate_limit_state())
            .await
            .unwrap();

        assert_eq!(result, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOi\n");
    }

    #[tokio::test]
    async fn fetch_torrent_subtitle_accepts_a_file_idx_that_resolves_to_a_subtitle_file() {
        let details_json =
            r#"{"info_hash":"deadbeef","files":[{"name":"movie.mkv"},{"name":"subs/en.srt"}]}"#
                .to_string();
        let srt_body = "1\n00:00:01,000 --> 00:00:02,000\nHello\n".to_string();
        let port = spawn_mock_engine_server(details_json, srt_body).await;

        let rate_limit = test_rate_limit_state();

        let result = fetch_torrent_subtitle_impl("a".repeat(40), 1, port, &rate_limit).await;

        let vtt = result.expect("subtitle file idx should be accepted");
        assert!(vtt.starts_with("WEBVTT"));
        assert!(vtt.contains("Hello"));
    }

    #[tokio::test]
    async fn fetch_torrent_subtitle_rejects_an_out_of_range_file_idx() {
        let details_json = r#"{"info_hash":"deadbeef","files":[{"name":"movie.mkv"}]}"#.to_string();
        let port = spawn_mock_engine_server(details_json, "unused".to_string()).await;

        let rate_limit = test_rate_limit_state();

        let result = fetch_torrent_subtitle_impl("a".repeat(40), 99, port, &rate_limit).await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "File index out of range");
    }

    #[tokio::test]
    async fn read_capped_body_as_string_rejects_a_response_over_the_limit() {
        let big_body = "x".repeat(100);
        // Reuse the mock engine server's plain-body path (anything not
        // containing "/stream/" would serve JSON; here we just hit the
        // details path directly since content doesn't matter for this test).
        let port = spawn_mock_engine_server(big_body.clone(), big_body.clone()).await;

        let client = reqwest::Client::new();
        let res = client
            .get(format!("http://127.0.0.1:{}/torrents/x", port))
            .send()
            .await
            .unwrap();

        let result = read_capped_body_as_string(res, 10).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceeded"));
    }

    #[tokio::test]
    async fn read_capped_body_as_string_accepts_a_response_under_the_limit() {
        let body = "hello".to_string();
        let port = spawn_mock_engine_server(body.clone(), body.clone()).await;

        let client = reqwest::Client::new();
        let res = client
            .get(format!("http://127.0.0.1:{}/torrents/x", port))
            .send()
            .await
            .unwrap();

        let result = read_capped_body_as_string(res, MAX_SUBTITLE_RESPONSE_BYTES).await;
        assert_eq!(result.unwrap(), "hello");
    }
}
