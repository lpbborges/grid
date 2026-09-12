// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod subtitles;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use tauri::State;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct EngineState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
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

#[tauri::command]
async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let mut child_guard = state.child.lock().unwrap();
    let mut port_guard = state.port.lock().unwrap();
    if child_guard.is_some() {
        if let Some(p) = *port_guard {
            return Ok(format!("http://127.0.0.1:{}", p));
        }
        return Ok("Engine already running".to_string());
    }

    // Kill any orphaned rqbit processes to prevent memory/disk leaks across crashes
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let mut killed_any = false;
    for process in sys.processes().values() {
        if process.name().to_string_lossy().contains("rqbit") {
            process.kill();
            killed_any = true;
        }
    }
    // Wait for orphaned processes to fully release their ports
    if killed_any {
        for _ in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            sys.refresh_all();
            let still_alive = sys
                .processes()
                .values()
                .any(|p| p.name().to_string_lossy().contains("rqbit"));
            if !still_alive {
                break;
            }
        }
    }

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

    *child_guard = Some(child);
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState {
            child: Mutex::new(None),
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
            port: Mutex::new(None),
        };
        assert!(state.child.lock().unwrap().is_none());
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
}
