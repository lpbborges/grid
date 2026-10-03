//! Subtitle commands: the torrent engine's own files and the strem.io allowlist.

use crate::engine_lifecycle::EngineState;
use crate::lock;
use crate::{stream_proxy, subtitles};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Instant;
use tauri::State;

#[derive(Default)]
pub(crate) struct SubtitleRateLimit {
    buckets: Mutex<HashMap<String, (f64, Instant)>>,
}

/// Token bucket per key: holds two playbacks' worth of subtitle fetches (the
/// frontend caps, pinned by a test) and refills continuously.
const SUBTITLE_RATE_LIMIT_BURST: u32 = 50;
const SUBTITLE_RATE_LIMIT_PER_MINUTE: u32 = 30;

/// A custom redirect policy gets no default hop limit, so it sets its own.
const MAX_SUBTITLE_REDIRECTS: usize = 10;

/// Most bytes of a subtitle response buffered into memory: real files are a few
/// hundred KB, and this bounds what a wrong `file_idx` or a hostile host can force.
const MAX_SUBTITLE_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

fn check_subtitle_rate_limit(state: &SubtitleRateLimit, key: &str) -> bool {
    take_subtitle_token(state, key, Instant::now())
}

fn take_subtitle_token(state: &SubtitleRateLimit, key: &str, now: Instant) -> bool {
    let mut buckets = state.buckets.lock().unwrap_or_else(|e| e.into_inner());
    let burst = f64::from(SUBTITLE_RATE_LIMIT_BURST);
    let (tokens, last) = buckets.entry(key.to_string()).or_insert((burst, now));
    let refill = now.saturating_duration_since(*last).as_secs_f64()
        * f64::from(SUBTITLE_RATE_LIMIT_PER_MINUTE)
        / 60.0;
    *tokens = (*tokens + refill).min(burst);
    *last = now;
    if *tokens < 1.0 {
        return false;
    }
    *tokens -= 1.0;
    true
}

#[tauri::command]
pub async fn fetch_torrent_subtitle(
    info_hash: String,
    file_idx: i64,
    state: State<'_, EngineState>,
    rate_limit: State<'_, SubtitleRateLimit>,
) -> Result<String, String> {
    let port = {
        let port_guard = lock(&state.port);
        port_guard.ok_or_else(|| "Engine not running".to_string())?
    };
    fetch_torrent_subtitle_impl(info_hash, file_idx, port, &rate_limit).await
}

/// The logic behind `fetch_torrent_subtitle`, split out so tests need no `tauri::State`.
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

    // `file_idx` is only format-checked so far: reject anything the engine does not
    // list as a subtitle before fetching it, or the main video would be buffered.
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

/// The name the engine lists for `file_idx` of `info_hash`.
async fn resolve_torrent_file_name(
    port: u16,
    info_hash: &str,
    file_idx: i64,
) -> Result<String, String> {
    let details_url = format!("http://127.0.0.1:{}/torrents/{}", port, info_hash);
    let res = ENGINE_CLIENT
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
pub async fn fetch_external_subtitle(
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

/// Every redirect target, not just the first URL, must pass the allowlist, so an
/// allowed host cannot bounce the fetch to an arbitrary address (SSRF).
fn redirect_policy_allowing(is_allowed: fn(&str) -> bool) -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_SUBTITLE_REDIRECTS {
            attempt.error("too many redirects")
        } else if is_allowed(attempt.url().as_str()) {
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

/// Shared by every fetch so connections to the same host are reused.
static SUBTITLE_CLIENT: LazyLock<reqwest::Client> =
    LazyLock::new(|| build_subtitle_client().expect("the subtitle HTTP client builds"));

static ENGINE_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(8000))
        .build()
        .expect("the engine HTTP client builds")
});

async fn fetch_and_convert(target_url: &str) -> Result<String, String> {
    let res = SUBTITLE_CLIENT
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

/// Streams `res` as subtitle text and fails once more than `max_bytes` arrive,
/// instead of buffering the whole body with `Response::text()`.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_allows_a_burst_then_blocks() {
        let state = SubtitleRateLimit::default();
        let now = Instant::now();
        for _ in 0..SUBTITLE_RATE_LIMIT_BURST {
            assert!(take_subtitle_token(&state, "k", now));
        }
        assert!(!take_subtitle_token(&state, "k", now));
    }

    #[test]
    fn rate_limit_refills_continuously() {
        let state = SubtitleRateLimit::default();
        let start = Instant::now();
        for _ in 0..SUBTITLE_RATE_LIMIT_BURST {
            take_subtitle_token(&state, "k", start);
        }
        let one_token = std::time::Duration::from_secs(60) / SUBTITLE_RATE_LIMIT_PER_MINUTE;

        assert!(take_subtitle_token(&state, "k", start + one_token));
        assert!(!take_subtitle_token(&state, "k", start + one_token));
    }

    #[test]
    fn rate_limit_fits_two_playbacks_of_subtitle_fetches() {
        for (file, constant) in [
            (
                include_str!("../../src/lib/api/subtitles.ts"),
                "const MAX_EXTERNAL_SUBTITLE_FETCHES = ",
            ),
            (
                include_str!("../../src/lib/engine/torrent.ts"),
                "const MAX_TORRENT_SUBTITLE_FETCHES = ",
            ),
        ] {
            let cap: u32 = file
                .lines()
                .find_map(|line| {
                    line.trim()
                        .strip_prefix(constant)?
                        .trim_end_matches(';')
                        .parse()
                        .ok()
                })
                .unwrap_or_else(|| panic!("{constant} is declared"));
            assert!(
                SUBTITLE_RATE_LIMIT_BURST >= 2 * cap,
                "{constant}{cap} does not fit twice in the burst ({SUBTITLE_RATE_LIMIT_BURST})"
            );
        }
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
    async fn a_redirect_loop_between_allowed_hosts_is_cut_short() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/loop.srt", listener.local_addr().unwrap());
        let requests = Arc::new(AtomicUsize::new(0));
        let served = requests.clone();
        let target = url.clone();
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                served.fetch_add(1, Ordering::SeqCst);
                let response = format!(
                    "HTTP/1.1 302 Found\r\nLocation: {target}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let mut buf = [0u8; 1024];
                let _ = socket.read(&mut buf).await;
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.shutdown().await;
            }
        });

        let client = build_client_with_redirect_allowlist(|_| true).expect("client builds");
        let result = client.get(&url).send().await;

        assert!(result.is_err_and(|error| error.is_redirect()));
        assert!(requests.load(Ordering::SeqCst) <= 11);
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
        SubtitleRateLimit::default()
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
