//! The torrent engine sidecar: starting it, tying it to the app, and cleaning up stale ones.

use crate::{cache, engine_process, lock};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

pub(crate) struct EngineState {
    pub(crate) child: Mutex<Option<std::process::Child>>,
    pub(crate) pid: Mutex<Option<u32>>,
    pub(crate) port: Mutex<Option<u16>>,
}

/// Path to the PID file tracking the currently-running (or most recently
/// running) rqbit sidecar process, inside the app's own cache directory.
pub(crate) fn pid_file_path(app_cache_dir: &Path) -> PathBuf {
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
pub(crate) fn remove_pid_file(path: &Path) {
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
                eprintln!(
                    "PID {} (rqbit) did not exit within 3s of being killed; proceeding anyway",
                    pid
                );
            }
        } else {
            eprintln!(
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

/// A port nothing is listening on right now, for the engine to take.
fn free_port() -> Result<u16, String> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| e.to_string())
}

pub(crate) fn engine_environment() -> [(&'static str, &'static str); 1] {
    [("CORS_ALLOW_REGEXP", r"^http://tauri\.localhost$")]
}

#[tauri::command]
pub async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    // No lock is held across the cleanup wait below, so closing the window
    // (which takes `state.child`) never blocks on it.
    {
        let mut child_guard = lock(&state.child);
        forget_exited_engine(&mut child_guard);
        let port_guard = lock(&state.port);
        if child_guard.is_some() {
            if let Some(p) = *port_guard {
                return Ok(format!("http://127.0.0.1:{}", p));
            }
            return Ok("Engine already running".to_string());
        }
    }

    // Kill an rqbit orphaned by a previous run, found through the PID file.
    let app_cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::create_dir_all(&app_cache_dir) {
        eprintln!("Failed to create app cache dir for engine PID file: {}", e);
    }
    let pid_path = pid_file_path(&app_cache_dir);
    let cleanup_pid_path = pid_path.clone();
    tauri::async_runtime::spawn_blocking(move || cleanup_stale_engine(&cleanup_pid_path))
        .await
        .map_err(|e| e.to_string())?;

    let mut child_guard = lock(&state.child);
    forget_exited_engine(&mut child_guard);
    let mut pid_guard = lock(&state.pid);
    let mut port_guard = lock(&state.port);
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

    // The downloads folder backs the video cache, so only entries the manifest
    // no longer knows about are removed.
    let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
    for orphan_name in cache::find_orphan_top_level_names(&output_folder, &manifest) {
        cache::remove_path_best_effort(&output_folder.join(orphan_name));
    }

    let port = free_port()?;
    let peer_port = free_port()?;

    // The shell plugin resolves the sidecar path; spawning the resulting std
    // command ourselves lets engine_process tie the engine to the app.
    let mut command: std::process::Command = app
        .shell()
        .sidecar("rqbit")
        .map_err(|e| {
            eprintln!("Sidecar builder error: {}", e);
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
        eprintln!("Sidecar spawn error: {}", e);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_gives_a_port_that_can_be_bound() {
        // Another test may take the port between the two calls, so allow a retry.
        let bound = (0..5).any(|_| {
            let port = free_port().unwrap();
            std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
        });
        assert!(bound);
    }

    fn unique_test_pid_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "grid-engine-test-{}-{}.pid",
            name,
            std::process::id()
        ))
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
}
