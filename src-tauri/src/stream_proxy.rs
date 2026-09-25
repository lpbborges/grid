use crate::media_patch::{self, FileView, Patch, Step};
use crate::subtitles::{is_valid_file_idx, is_valid_info_hash};
use futures_util::StreamExt;
use reqwest::{Method, StatusCode};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::OnceCell;

pub type EnginePort = Arc<dyn Fn() -> Option<u16> + Send + Sync>;

type PatchCell = Arc<OnceCell<Option<Arc<Patch>>>>;
type SharedPatchCache = Arc<Mutex<PatchCache>>;

const MAX_CACHED_PATCHES: usize = 64;
const PROBE_REQUEST_TIMEOUT: std::time::Duration = if cfg!(test) {
    std::time::Duration::from_millis(500)
} else {
    std::time::Duration::from_secs(30)
};
const ENGINE_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// Header patches by stream URL, dropping the oldest past `MAX_CACHED_PATCHES`.
#[derive(Default)]
struct PatchCache {
    cells: HashMap<String, PatchCell>,
    order: VecDeque<String>,
}

impl PatchCache {
    fn cell(&mut self, url: &str) -> PatchCell {
        if let Some(cell) = self.cells.get(url) {
            return cell.clone();
        }
        if self.order.len() >= MAX_CACHED_PATCHES {
            if let Some(oldest) = self.order.pop_front() {
                self.cells.remove(&oldest);
            }
        }
        let cell = PatchCell::default();
        self.cells.insert(url.to_string(), cell.clone());
        self.order.push_back(url.to_string());
        cell
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.cells.len()
    }
}

const MAX_REQUEST_HEAD_BYTES: usize = 16 * 1024;
const MAX_PROBE_STEPS: usize = 32;
const FORWARDED_REQUEST_HEADERS: [&str; 2] = ["range", "origin"];
const FORWARDED_RESPONSE_HEADERS: [&str; 6] = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "access-control-allow-origin",
    "vary",
];

struct ProxyRequest {
    method: Method,
    path: String,
    headers: Vec<(&'static str, String)>,
}

struct ProbeFailed;

pub fn engine_stream_url(port: u16, info_hash: &str, file_idx: i64) -> String {
    format!("http://127.0.0.1:{port}/torrents/{info_hash}/stream/{file_idx}")
}

pub async fn serve(listener: TcpListener, engine_port: EnginePort) {
    let client = reqwest::Client::builder()
        .connect_timeout(ENGINE_CONNECT_TIMEOUT)
        .build()
        .expect("the stream proxy's HTTP client builds");
    let cache = SharedPatchCache::default();
    loop {
        match listener.accept().await {
            Ok((socket, _)) => {
                tokio::spawn(handle_connection(
                    socket,
                    engine_port.clone(),
                    client.clone(),
                    cache.clone(),
                ));
            }
            Err(e) => eprintln!("Stream proxy failed to accept a connection: {}", e),
        }
    }
}

async fn handle_connection(
    mut socket: TcpStream,
    engine_port: EnginePort,
    client: reqwest::Client,
    cache: SharedPatchCache,
) {
    let Some(request) = read_request(&mut socket).await else {
        return;
    };
    let result = match forward(request, &engine_port, &client, &cache).await {
        Ok((response, patch)) => relay_response(&mut socket, response, patch.as_deref()).await,
        Err(status) => write_empty_response(&mut socket, status).await,
    };
    if let Err(e) = result {
        if !matches!(
            e.kind(),
            std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::ConnectionReset
        ) {
            eprintln!("Stream proxy stopped relaying a response: {}", e);
        }
    }
}

const ENGINE_RESTART_RETRY_ATTEMPTS: usize = 5;
const ENGINE_RESTART_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(500);

async fn forward(
    request: ProxyRequest,
    engine_port: &EnginePort,
    client: &reqwest::Client,
    cache: &SharedPatchCache,
) -> Result<(reqwest::Response, Option<Arc<Patch>>), StatusCode> {
    if request.method != Method::GET && request.method != Method::HEAD {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    let (info_hash, file_idx) = parse_stream_path(&request.path).ok_or(StatusCode::NOT_FOUND)?;
    let port = engine_port().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let url = engine_stream_url(port, info_hash, file_idx);
    let patch = if request.method == Method::GET && !wants_raw(&request.path) {
        patch_for(client, &url, cache).await
    } else {
        None
    };
    let response = send_with_engine_restart_retry(client, request.method, &url, &request.headers)
        .await
        .map_err(|e| {
            eprintln!("Stream proxy failed to reach the engine: {}", e);
            StatusCode::BAD_GATEWAY
        })?;
    Ok((response, patch))
}

async fn send_with_engine_restart_retry(
    client: &reqwest::Client,
    method: Method,
    url: &str,
    headers: &[(&'static str, String)],
) -> Result<reqwest::Response, reqwest::Error> {
    let build_request = || {
        headers.iter().fold(
            client.request(method.clone(), url),
            |builder, (name, value)| builder.header(*name, value),
        )
    };
    let mut last_error = None;
    for attempt in 0..ENGINE_RESTART_RETRY_ATTEMPTS {
        match build_request().send().await {
            Ok(response) => return Ok(response),
            Err(e) => {
                if attempt + 1 < ENGINE_RESTART_RETRY_ATTEMPTS {
                    tokio::time::sleep(ENGINE_RESTART_RETRY_DELAY).await;
                }
                last_error = Some(e);
            }
        }
    }
    Err(last_error.expect("looped at least once"))
}

async fn read_request(socket: &mut TcpStream) -> Option<ProxyRequest> {
    let mut head = Vec::new();
    let mut buf = [0u8; 2048];
    while !head.windows(4).any(|window| window == b"\r\n\r\n") {
        if head.len() > MAX_REQUEST_HEAD_BYTES {
            return None;
        }
        let read = socket.read(&mut buf).await.ok()?;
        if read == 0 {
            return None;
        }
        head.extend_from_slice(&buf[..read]);
    }
    let head = String::from_utf8_lossy(&head);
    let mut lines = head.split("\r\n");
    let mut request_line = lines.next()?.split_whitespace();
    let method = Method::from_bytes(request_line.next()?.as_bytes()).ok()?;
    let path = request_line.next()?.to_string();
    let headers = lines
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            let name = FORWARDED_REQUEST_HEADERS
                .into_iter()
                .find(|forwarded| name.trim().eq_ignore_ascii_case(forwarded))?;
            Some((name, value.trim().to_string()))
        })
        .collect();
    Some(ProxyRequest {
        method,
        path,
        headers,
    })
}

fn parse_stream_path(path: &str) -> Option<(&str, i64)> {
    let path = path.split('?').next()?;
    let mut segments = path.strip_prefix("/torrents/")?.split('/');
    let info_hash = segments.next()?;
    if segments.next()? != "stream" {
        return None;
    }
    let file_idx: i64 = segments.next()?.parse().ok()?;
    if segments.next().is_some() || !is_valid_info_hash(info_hash) || !is_valid_file_idx(file_idx) {
        return None;
    }
    Some((info_hash, file_idx))
}

/// The native Windows player (mpv) demuxes Matroska correctly and must see the
/// embedded subtitle tracks the `media_patch` header rewrite hides from
/// WebKitGTK, so it asks for the stream with `?raw=1`.
fn wants_raw(path: &str) -> bool {
    let Some((_, query)) = path.split_once('?') else {
        return false;
    };
    query
        .split('&')
        .any(|param| param.split_once('=') == Some(("raw", "1")))
}

async fn patch_for(
    client: &reqwest::Client,
    url: &str,
    cache: &SharedPatchCache,
) -> Option<Arc<Patch>> {
    let cell = cache.lock().unwrap_or_else(|e| e.into_inner()).cell(url);
    cell.get_or_try_init(|| probe_patch(client, url))
        .await
        .ok()
        .cloned()
        .flatten()
}

async fn probe_patch(
    client: &reqwest::Client,
    url: &str,
) -> Result<Option<Arc<Patch>>, ProbeFailed> {
    let mut view = FileView::default();
    for _ in 0..MAX_PROBE_STEPS {
        match media_patch::next_step(&view) {
            Step::Done(patch) => return Ok(patch.map(Arc::new)),
            Step::Fetch { offset, len } => {
                let (bytes, file_len) = fetch_range(client, url, offset, len).await?;
                if bytes.is_empty() {
                    return Ok(None);
                }
                view.insert(offset, bytes, file_len);
            }
        }
    }
    Ok(None)
}

async fn fetch_range(
    client: &reqwest::Client,
    url: &str,
    offset: u64,
    len: u64,
) -> Result<(Vec<u8>, u64), ProbeFailed> {
    let response = client
        .get(url)
        .timeout(PROBE_REQUEST_TIMEOUT)
        .header(
            reqwest::header::RANGE,
            format!("bytes={}-{}", offset, offset + len - 1),
        )
        .send()
        .await
        .map_err(|_| ProbeFailed)?;
    if !response.status().is_success() {
        return Err(ProbeFailed);
    }
    let range = content_range(&response);
    if range.map_or(0, |(start, _)| start) != offset {
        return Err(ProbeFailed);
    }
    let file_len = range
        .map(|(_, total)| total)
        .or(response.content_length())
        .ok_or(ProbeFailed)?;
    let len = usize::try_from(len).map_err(|_| ProbeFailed)?;
    let bytes = read_prefix(response, len).await.ok_or(ProbeFailed)?;
    Ok((bytes, file_len))
}

async fn read_prefix(response: reqwest::Response, size: usize) -> Option<Vec<u8>> {
    let mut stream = response.bytes_stream();
    let mut head = Vec::with_capacity(size.min(1024 * 1024));
    while head.len() < size {
        match stream.next().await {
            Some(chunk) => head.extend_from_slice(&chunk.ok()?),
            None => break,
        }
    }
    head.truncate(size);
    Some(head)
}

fn content_range(response: &reqwest::Response) -> Option<(u64, u64)> {
    let value = response
        .headers()
        .get(reqwest::header::CONTENT_RANGE)?
        .to_str()
        .ok()?;
    let (range, total) = value.strip_prefix("bytes ")?.split_once('/')?;
    let start = range.split('-').next()?.trim().parse().ok()?;
    Some((start, total.trim().parse().ok()?))
}

fn status_line(status: StatusCode) -> String {
    format!(
        "HTTP/1.1 {} {}\r\n",
        status.as_u16(),
        status.canonical_reason().unwrap_or("")
    )
}

async fn relay_response(
    socket: &mut TcpStream,
    response: reqwest::Response,
    patch: Option<&Patch>,
) -> std::io::Result<()> {
    let mut head = status_line(response.status());
    for name in FORWARDED_RESPONSE_HEADERS {
        if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
            head.push_str(&format!("{}: {}\r\n", name, value));
        }
    }
    head.push_str("Connection: close\r\n\r\n");
    socket.write_all(head.as_bytes()).await?;

    let mut offset = content_range(&response).map_or(0, |(start, _)| start);
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(std::io::Error::other)?;
        match patch {
            Some(patch) if patch.overlaps(offset, chunk.len()) => {
                let mut patched = chunk.to_vec();
                patch.apply(&mut patched, offset);
                socket.write_all(&patched).await?;
            }
            _ => socket.write_all(&chunk).await?,
        }
        offset += chunk.len() as u64;
    }
    socket.shutdown().await
}

async fn write_empty_response(socket: &mut TcpStream, status: StatusCode) -> std::io::Result<()> {
    let head = format!(
        "{}Content-Length: 0\r\nConnection: close\r\n\r\n",
        status_line(status)
    );
    socket.write_all(head.as_bytes()).await?;
    socket.shutdown().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_patch::matroska_fixtures::{matroska_with_cluster, track_entry, TestFile};
    use crate::media_patch::mp4_fixtures::{mp4, trak};
    use crate::media_patch::patched;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const HASH: &str = "31810da7088bdd8b9293b3f5649d4ece574c930d";

    async fn spawn_mock_engine(body: Vec<u8>) -> (u16, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let requests = Arc::new(AtomicUsize::new(0));
        let body = Arc::new(body);
        let counter = requests.clone();
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                counter.fetch_add(1, Ordering::SeqCst);
                let body = body.clone();
                tokio::spawn(async move {
                    let mut head = Vec::new();
                    let mut buf = [0u8; 1024];
                    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
                        let Ok(n) = socket.read(&mut buf).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        head.extend_from_slice(&buf[..n]);
                    }
                    let head = String::from_utf8_lossy(&head).to_lowercase();
                    let total = body.len();
                    let range = head
                        .lines()
                        .find_map(|line| line.strip_prefix("range: bytes="))
                        .and_then(|spec| {
                            let (start, end) = spec.trim().split_once('-')?;
                            let start: usize = start.parse().ok()?;
                            let end = end.parse().unwrap_or(total - 1).min(total - 1);
                            Some((start, end))
                        });
                    let (status, start, end) = match range {
                        Some((start, end)) => ("206 Partial Content", start, end),
                        None => ("200 OK", 0, total - 1),
                    };
                    let mut response = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: video/x-matroska\r\nAccept-Ranges: bytes\r\nContent-Length: {}\r\n",
                        end - start + 1
                    );
                    if range.is_some() {
                        response
                            .push_str(&format!("Content-Range: bytes {start}-{end}/{total}\r\n"));
                    }
                    response.push_str("Connection: close\r\n\r\n");
                    if socket.write_all(response.as_bytes()).await.is_err() {
                        return;
                    }
                    if !head.starts_with("head") {
                        for chunk in body[start..=end].chunks(7_000) {
                            if socket.write_all(chunk).await.is_err() {
                                return;
                            }
                        }
                    }
                    let _ = socket.shutdown().await;
                });
            }
        });
        (port, requests)
    }

    #[test]
    fn keeps_only_the_most_recent_patches() {
        let mut cache = PatchCache::default();
        let first = cache.cell("stream-0");
        for i in 1..=MAX_CACHED_PATCHES {
            cache.cell(&format!("stream-{i}"));
        }

        assert_eq!(cache.len(), MAX_CACHED_PATCHES);
        assert!(!Arc::ptr_eq(&first, &cache.cell("stream-0")));
    }

    #[test]
    fn reuses_the_patch_of_a_stream_played_again() {
        let mut cache = PatchCache::default();
        let first = cache.cell("stream");

        assert!(Arc::ptr_eq(&first, &cache.cell("stream")));
    }

    #[tokio::test]
    async fn gives_up_on_a_header_probe_the_engine_never_answers() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let mut held = Vec::new();
            while let Ok((socket, _)) = listener.accept().await {
                held.push(socket);
            }
        });

        let client = reqwest::Client::new();
        let url = engine_stream_url(port, HASH, 0);
        let result =
            tokio::time::timeout(PROBE_REQUEST_TIMEOUT * 3, probe_patch(&client, &url)).await;

        assert!(matches!(result, Ok(Err(ProbeFailed))));
    }

    async fn spawn_proxy_with(engine_port: EnginePort) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(serve(listener, engine_port));
        port
    }

    async fn spawn_proxy(engine_port: u16) -> u16 {
        spawn_proxy_with(Arc::new(move || Some(engine_port))).await
    }

    fn file_with_subtitles() -> TestFile {
        matroska_with_cluster(
            &[
                track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
                track_entry(2, 0x02, "A_EAC3"),
                track_entry(3, 0x11, "S_TEXT/UTF8"),
                track_entry(4, 0x11, "S_TEXT/UTF8"),
            ],
            300_000,
        )
    }

    fn stream_url(proxy_port: u16) -> String {
        format!("http://127.0.0.1:{proxy_port}/torrents/{HASH}/stream/0")
    }

    async fn get_range(proxy_port: u16, range: String) -> reqwest::Response {
        reqwest::Client::new()
            .get(stream_url(proxy_port))
            .header("Range", range)
            .send()
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn retries_when_the_engine_is_briefly_unreachable_after_a_restart() {
        let body: Vec<u8> = (0..50_000u32).map(|i| (i % 256) as u8).collect();

        let reserved = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = reserved.local_addr().unwrap().port();
        drop(reserved);

        let engine_body = body.clone();
        tokio::spawn(async move {
            let body = engine_body;
            tokio::time::sleep(ENGINE_RESTART_RETRY_DELAY * 2).await;
            let listener = TcpListener::bind(format!("127.0.0.1:{port}"))
                .await
                .unwrap();
            while let Ok((mut socket, _)) = listener.accept().await {
                let body = body.clone();
                tokio::spawn(async move {
                    let mut head = Vec::new();
                    let mut buf = [0u8; 1024];
                    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
                        let Ok(n) = socket.read(&mut buf).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        head.extend_from_slice(&buf[..n]);
                    }
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: video/x-matroska\r\nAccept-Ranges: bytes\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    if socket.write_all(response.as_bytes()).await.is_err() {
                        return;
                    }
                    let _ = socket.write_all(&body).await;
                    let _ = socket.shutdown().await;
                });
            }
        });

        let proxy_port = spawn_proxy(port).await;

        let res = reqwest::get(stream_url(proxy_port)).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.bytes().await.unwrap().to_vec(), body);
    }

    #[tokio::test]
    async fn serves_the_whole_file_with_subtitle_tracks_voided() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let res = reqwest::get(stream_url(proxy_port)).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers()["content-type"], "video/x-matroska");
        assert_eq!(
            res.headers()["content-length"],
            file.bytes.len().to_string().as_str()
        );
        assert_eq!(res.bytes().await.unwrap().to_vec(), patched(&file.bytes));
    }

    fn mkv_fixture() -> Vec<u8> {
        // The E2E media fixture is a real ffmpeg-produced Matroska file with an
        // embedded SRT track, so it exercises the header rewrite against bytes
        // no hand-built fixture can vouch for. Generated by
        // scripts/fixtures/generate-media.sh and committed, so a missing file
        // means a rename went unnoticed - fail rather than skip silently.
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/media/movie-mkv/Grid.Fixture.2026.1080p.mkv"
        );
        std::fs::read(path).unwrap_or_else(|e| panic!("media fixture missing at {path}: {e}"))
    }

    #[tokio::test]
    async fn raw_keeps_the_subtitle_track_a_real_mkv_fixture_carries() {
        let bytes = mkv_fixture();
        assert_ne!(
            patched(&bytes),
            bytes,
            "the fixture must carry an embedded subtitle track to patch"
        );
        let (engine_port, _) = spawn_mock_engine(bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let raw = reqwest::get(format!("{}?raw=1", stream_url(proxy_port)))
            .await
            .unwrap();
        assert_eq!(raw.status(), StatusCode::OK);
        assert_eq!(raw.bytes().await.unwrap().to_vec(), bytes);

        let default = reqwest::get(stream_url(proxy_port)).await.unwrap();
        assert_eq!(default.status(), StatusCode::OK);
        assert_eq!(default.bytes().await.unwrap().to_vec(), patched(&bytes));
    }

    #[tokio::test]
    async fn serves_the_raw_file_with_subtitle_tracks_intact() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let res = reqwest::get(format!("{}?raw=1", stream_url(proxy_port)))
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_ne!(
            patched(&file.bytes),
            file.bytes,
            "fixture must be patchable"
        );
        assert_eq!(res.bytes().await.unwrap().to_vec(), file.bytes);
    }

    #[tokio::test]
    async fn serves_a_raw_range_unpatched() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;
        let start = file.tracks_offset + 10;
        let end = file.tracks_offset + file.tracks_len + 99;

        let res = reqwest::Client::new()
            .get(format!("{}?raw=1", stream_url(proxy_port)))
            .header("Range", format!("bytes={start}-{end}"))
            .send()
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            res.bytes().await.unwrap().to_vec(),
            file.bytes[start..=end].to_vec()
        );
    }

    #[tokio::test]
    async fn keeps_patching_when_the_query_does_not_opt_out() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        for query in ["", "?raw=0", "?raw", "?notraw=1", "?xraw=1"] {
            let res = reqwest::get(format!("{}{query}", stream_url(proxy_port)))
                .await
                .unwrap();

            assert_eq!(res.status(), StatusCode::OK, "{query}");
            assert_eq!(
                res.bytes().await.unwrap().to_vec(),
                patched(&file.bytes),
                "{query}"
            );
        }
    }

    #[tokio::test]
    async fn patches_a_range_that_starts_inside_the_tracks_element() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;
        let start = file.tracks_offset + 10;
        let end = file.tracks_offset + file.tracks_len + 99;

        let res = get_range(proxy_port, format!("bytes={start}-{end}")).await;

        assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            res.headers()["content-range"],
            format!("bytes {start}-{end}/{}", file.bytes.len()).as_str()
        );
        assert_eq!(res.headers()["accept-ranges"], "bytes");
        assert_eq!(
            res.bytes().await.unwrap().to_vec(),
            patched(&file.bytes)[start..=end].to_vec()
        );
    }

    #[tokio::test]
    async fn leaves_ranges_after_the_tracks_element_untouched() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;
        let start = file.bytes.len() - 50_000;

        let res = get_range(proxy_port, format!("bytes={start}-")).await;

        assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            res.bytes().await.unwrap().to_vec(),
            file.bytes[start..].to_vec()
        );
    }

    #[tokio::test]
    async fn frees_mp4_text_tracks_when_the_moov_follows_the_media_data() {
        let file = mp4(
            &[trak(b"vide"), trak(b"soun"), trak(b"sbtl")],
            true,
            300_000,
        );
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;
        let start = file.bytes.len() - 2_000;

        let res = get_range(proxy_port, format!("bytes={start}-")).await;

        let body = res.bytes().await.unwrap().to_vec();
        assert_ne!(body, file.bytes[start..].to_vec());
        assert_eq!(body, patched(&file.bytes)[start..].to_vec());
    }

    #[tokio::test]
    async fn passes_files_without_subtitle_tracks_through_unchanged() {
        let file = mp4(&[trak(b"vide"), trak(b"soun")], false, 200_000);
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let res = reqwest::get(stream_url(proxy_port)).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.bytes().await.unwrap().to_vec(), file.bytes);
    }

    #[tokio::test]
    async fn answers_head_requests_with_headers_only() {
        let file = file_with_subtitles();
        let (engine_port, _) = spawn_mock_engine(file.bytes.clone()).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let res = reqwest::Client::new()
            .head(stream_url(proxy_port))
            .send()
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers()["content-length"],
            file.bytes.len().to_string().as_str()
        );
        assert!(res.bytes().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn rejects_paths_other_than_a_valid_stream_without_contacting_the_engine() {
        let (engine_port, requests) = spawn_mock_engine(vec![0; 16]).await;
        let proxy_port = spawn_proxy(engine_port).await;

        for path in [
            "/torrents".to_string(),
            format!("/torrents/{HASH}"),
            "/torrents/not-a-hash/stream/0".to_string(),
            format!("/torrents/{HASH}/stream/-1"),
            format!("/torrents/{HASH}/stream/0/../../delete"),
        ] {
            let res = reqwest::get(format!("http://127.0.0.1:{proxy_port}{path}"))
                .await
                .unwrap();
            assert_eq!(res.status(), StatusCode::NOT_FOUND, "{path}");
        }
        assert_eq!(requests.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn rejects_methods_other_than_get_and_head_without_contacting_the_engine() {
        let (engine_port, requests) = spawn_mock_engine(vec![0; 16]).await;
        let proxy_port = spawn_proxy(engine_port).await;

        let res = reqwest::Client::new()
            .post(stream_url(proxy_port))
            .send()
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(requests.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn answers_service_unavailable_while_the_engine_is_not_running() {
        let proxy_port = spawn_proxy_with(Arc::new(|| None)).await;

        let res = reqwest::get(stream_url(proxy_port)).await.unwrap();

        assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn answers_bad_gateway_when_the_engine_is_unreachable() {
        let closed_port = TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let proxy_port = spawn_proxy(closed_port).await;

        let res = reqwest::get(stream_url(proxy_port)).await.unwrap();

        assert_eq!(res.status(), StatusCode::BAD_GATEWAY);
    }
}
