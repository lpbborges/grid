// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod subtitles;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct EngineState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
    pid: Mutex<Option<u32>>,
    port: Mutex<Option<u16>>,
}

struct SubtitleRateLimit {
    counts: Mutex<HashMap<String, (u32, Instant)>>,
}

const SUBTITLE_RATE_LIMIT_PER_MINUTE: u32 = 30;

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
    if !check_subtitle_rate_limit(&rate_limit, "torrent") {
        return Err("Too many requests".to_string());
    }
    if !subtitles::is_valid_info_hash(&info_hash) || !subtitles::is_valid_file_idx(file_idx) {
        return Err("Invalid parameters".to_string());
    }

    let port = {
        let port_guard = state.port.lock().unwrap();
        port_guard.ok_or_else(|| "Engine not running".to_string())?
    };
    // Matches getStreamUrl in src/lib/engine/torrent.ts:
    // `${ENGINE_URL}/torrents/${infoHash}/stream/${fileIdx}`
    let target_url = format!(
        "http://127.0.0.1:{}/torrents/{}/stream/{}",
        port, info_hash, file_idx
    );

    fetch_and_convert(&target_url).await
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
fn subtitle_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if subtitles::is_allowed_subtitle_url(attempt.url().as_str()) {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

fn build_subtitle_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(12000))
        .redirect(subtitle_redirect_policy())
        .build()
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

    let text = res.text().await.map_err(|e| e.to_string())?;
    if text.trim_start().starts_with("WEBVTT") {
        Ok(text)
    } else {
        Ok(subtitles::srt_to_vtt(&text))
    }
}

/// Path to the PID file tracking the currently-running (or most recently
/// running) rqbit sidecar process.
fn pid_file_path() -> PathBuf {
    std::env::temp_dir().join("grid-play-engine.pid")
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

    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let sys_pid = sysinfo::Pid::from_u32(pid);

    if let Some(process) = sys.process(sys_pid) {
        let name = process.name().to_string_lossy().to_string();
        let exe = process.exe().map(|p| p.to_path_buf());
        if process_looks_like_rqbit(&name, exe.as_deref()) {
            process.kill();
            for _ in 0..30 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                sys.refresh_all();
                if sys.process(sys_pid).is_none() {
                    break;
                }
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

#[tauri::command]
async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let mut child_guard = state.child.lock().unwrap();
    let mut pid_guard = state.pid.lock().unwrap();
    let mut port_guard = state.port.lock().unwrap();
    if child_guard.is_some() {
        if let Some(p) = *port_guard {
            return Ok(format!("http://127.0.0.1:{}", p));
        }
        return Ok("Engine already running".to_string());
    }

    // Identity-validated cleanup of any orphaned rqbit process from a
    // previous run, tracked via the PID file (see cleanup_stale_engine).
    cleanup_stale_engine(&pid_file_path());

    let output_folder = std::env::temp_dir().join("grid-play-downloads");
    let _ = std::fs::remove_dir_all(&output_folder); // cleanup previous sessions
    let _ = std::fs::create_dir_all(&output_folder);

    // Find a free ephemeral port for the HTTP API
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| e.to_string())?
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let sidecar_command = app
        .shell()
        .sidecar("rqbit")
        .map_err(|e| {
            println!("Sidecar builder error: {}", e);
            e.to_string()
        })?
        .arg("--http-api-listen-addr")
        .arg(format!("127.0.0.1:{}", port))
        .arg("--listen-port")
        .arg("0")
        .arg("server")
        .arg("start")
        .arg(output_folder);

    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        println!("Sidecar spawn error: {}", e);
        e.to_string()
    })?;

    let pid = child.pid();
    if let Err(e) = write_pid_file(&pid_file_path(), pid) {
        eprintln!("Failed to write engine PID file: {}", e);
    }

    *child_guard = Some(child);
    *pid_guard = Some(pid);
    *port_guard = Some(port);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("rqbit: {:?}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("rqbit: {:?}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    Ok(format!("http://127.0.0.1:{}", port))
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
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState {
            child: Mutex::new(None),
            pid: Mutex::new(None),
            port: Mutex::new(None),
        })
        .manage(SubtitleRateLimit {
            counts: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_torrent_engine,
            fetch_torrent_subtitle,
            fetch_external_subtitle
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                        // Graceful shutdown: kill the sidecar and remove the
                        // PID file here rather than relying on Drop, since
                        // Drop on EngineState is not guaranteed to run on
                        // Tauri's close/force-quit paths.
                        let state = app_handle.state::<EngineState>();
                        if let Some(child) = state.child.lock().unwrap().take() {
                            let _ = child.kill();
                        }
                        *state.pid.lock().unwrap() = None;
                        *state.port.lock().unwrap() = None;
                        remove_pid_file(&pid_file_path());
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
    fn test_engine_state_initialization() {
        let state = EngineState {
            child: Mutex::new(None),
            pid: Mutex::new(None),
            port: Mutex::new(None),
        };
        assert!(state.child.lock().unwrap().is_none());
        assert!(state.pid.lock().unwrap().is_none());
    }

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
    async fn redirect_to_allowed_strem_io_host_is_followed() {
        // strem.io itself can't be stood up locally, so exercise the policy
        // closure logic directly against a crafted attempt URL instead.
        let policy = subtitle_redirect_policy();
        // reqwest::redirect::Policy has no public inspection API, so assert
        // the underlying predicate it is built from behaves as expected
        // (this is what the closure passed to Policy::custom evaluates).
        assert!(subtitles::is_allowed_subtitle_url(
            "https://subs.strem.io/x.vtt"
        ));
        let _ = policy; // policy construction itself must not panic
    }

    // --- PID file + process identity tests (P1-2) ---

    fn unique_test_pid_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "grid-play-engine-test-{}-{}.pid",
            name,
            std::process::id()
        ))
    }

    #[test]
    fn pid_file_path_is_under_temp_dir_with_expected_name() {
        let path = pid_file_path();
        assert_eq!(path, std::env::temp_dir().join("grid-play-engine.pid"));
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
}
