use crate::media_patch;
use crate::stream_proxy;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::process::{Child, Command};

const ONLY_FILES_REGEX: &str = r"(?i)\.(mp4|mkv|webm|srt|vtt)$";

static ENGINE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap()
}

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixtures_dir() -> PathBuf {
    manifest_dir().join("..").join("tests").join("fixtures")
}

fn media_dir(fixture: &str) -> PathBuf {
    fixtures_dir().join("media").join(fixture)
}

fn snapshot_path(name: &str) -> PathBuf {
    fixtures_dir().join("rqbit").join(format!("{name}.json"))
}

fn sidecar_path() -> PathBuf {
    let triple = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc.exe",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        (os, arch) => panic!("no rqbit sidecar for {os}/{arch}"),
    };
    manifest_dir().join("bin").join(format!("rqbit-{triple}"))
}

/// Ports from `bind(0)` come from the ephemeral range outgoing connections
/// also use, so one could be taken before rqbit binds it. These sit below it.
fn free_port() -> u16 {
    use std::sync::atomic::{AtomicU16, Ordering};
    static NEXT: AtomicU16 = AtomicU16::new(0);
    let base = 20_000 + (std::process::id() % 1_000) as u16 * 10;
    loop {
        let port = base + NEXT.fetch_add(1, Ordering::Relaxed) % 2_000;
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
            && std::net::UdpSocket::bind(("127.0.0.1", port)).is_ok()
        {
            return port;
        }
    }
}

async fn spawn_tracker(peer_ports: &[u16]) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let peers: Vec<u8> = peer_ports
        .iter()
        .flat_map(|peer_port| {
            let [high, low] = peer_port.to_be_bytes();
            [127, 0, 0, 1, high, low]
        })
        .collect();
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let peers = peers.clone();
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                let _ = socket.read(&mut buf).await;
                let mut body = format!("d8:intervali5e5:peers{}:", peers.len()).into_bytes();
                body.extend_from_slice(&peers);
                body.push(b'e');
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(head.as_bytes()).await;
                let _ = socket.write_all(&body).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    format!("http://127.0.0.1:{port}/announce")
}

async fn spawn_stalling_peer(target_port: u16) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let mut stalled = Vec::new();
        while let Ok((socket, _)) = listener.accept().await {
            if stalled.is_empty() {
                stalled.push(socket);
                continue;
            }
            tokio::spawn(async move {
                let mut socket = socket;
                if let Ok(mut target) =
                    tokio::net::TcpStream::connect(("127.0.0.1", target_port)).await
                {
                    let _ = tokio::io::copy_bidirectional(&mut socket, &mut target).await;
                }
            });
        }
    });
    port
}

const SWARM_PROCESSES: [&str; 2] = ["seeder", "engine"];
const LOG_TAIL_LINES: usize = 40;

fn rqbit(log: &Path) -> Command {
    let log = std::fs::File::create(log).expect("rqbit log file is created");
    let mut command = Command::new(sidecar_path());
    command
        .env("RQBIT_DHT_DISABLE", "true")
        .env("RQBIT_LSD_DISABLE", "true")
        .env("RQBIT_UPNP_PORT_FORWARD_DISABLE", "true")
        .stdout(Stdio::from(
            log.try_clone().expect("rqbit log file is cloned"),
        ))
        .stderr(Stdio::from(log))
        .kill_on_drop(true);
    command
}

fn log_path(temp: &Path, process: &str) -> PathBuf {
    temp.join(format!("{process}.log"))
}

fn log_tail(path: &Path) -> String {
    let log = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = log.lines().collect();
    lines[lines.len().saturating_sub(LOG_TAIL_LINES)..].join("\n")
}

struct Swarm {
    engine_port: u16,
    info_hash: String,
    temp: PathBuf,
    seeder: Child,
    engine: Child,
}

impl Drop for Swarm {
    fn drop(&mut self) {
        if std::thread::panicking() {
            for (process, child) in SWARM_PROCESSES
                .into_iter()
                .zip([&mut self.seeder, &mut self.engine])
            {
                eprintln!(
                    "---- rqbit {process} (exit status: {:?}) ----\n{}",
                    child.try_wait(),
                    log_tail(&log_path(&self.temp, process))
                );
            }
        }
        let _ = self.seeder.start_kill();
        let _ = self.engine.start_kill();
        let _ = std::fs::remove_dir_all(&self.temp);
    }
}

async fn get_json(port: u16, path: &str) -> Option<Value> {
    let response = http()
        .get(format!("http://127.0.0.1:{port}{path}"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json().await.ok()
}

async fn post(port: u16, path: &str, content_type: &str, body: String) -> reqwest::Response {
    http()
        .post(format!("http://127.0.0.1:{port}{path}"))
        .header("Content-Type", content_type)
        .body(body)
        .send()
        .await
        .unwrap()
}

async fn wait_for_json(port: u16, path: &str, ready: impl Fn(&Value) -> bool) -> Value {
    for _ in 0..200 {
        if let Some(value) = get_json(port, path).await {
            if ready(&value) {
                return value;
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("timed out waiting for {path} on port {port}");
}

#[derive(Clone, Copy)]
enum EnginePeers {
    Seeder,
    StallFirstConnection,
}

async fn start_swarm(fixture: &str, peers: EnginePeers) -> Swarm {
    let seeder_peer_port = free_port();
    let seeder_api_port = free_port();
    let engine_port = free_port();
    let engine_listen_port = free_port();
    let temp = std::env::temp_dir().join(format!(
        "grid-engine-test-{}-{engine_port}",
        std::process::id()
    ));
    std::fs::create_dir_all(&temp).unwrap();
    let engine_peer_port = match peers {
        EnginePeers::Seeder => seeder_peer_port,
        EnginePeers::StallFirstConnection => spawn_stalling_peer(seeder_peer_port).await,
    };
    let seeder_tracker = spawn_tracker(&[]).await;
    let engine_tracker = spawn_tracker(&[engine_peer_port]).await;
    let trackers_file = temp.join("trackers.txt");
    std::fs::write(&trackers_file, format!("{engine_tracker}\n")).unwrap();

    let seeder = rqbit(&log_path(&temp, "seeder"))
        .arg("--http-api-listen-addr")
        .arg(format!("127.0.0.1:{seeder_api_port}"))
        .arg("--listen-port")
        .arg(seeder_peer_port.to_string())
        .arg("share")
        .arg(media_dir(fixture))
        .arg(&seeder_tracker)
        .spawn()
        .expect("seeder starts");
    let engine = rqbit(&log_path(&temp, "engine"))
        .envs(crate::engine_environment())
        .env("RQBIT_TRACKERS_FILENAME", &trackers_file)
        .arg("--disable-dht-persistence")
        .arg("--http-api-listen-addr")
        .arg(format!("127.0.0.1:{engine_port}"))
        .arg("--listen-port")
        .arg(engine_listen_port.to_string())
        .arg("server")
        .arg("start")
        .arg("--disable-persistence")
        .arg(temp.join("downloads"))
        .spawn()
        .expect("engine starts");

    let mut swarm = Swarm {
        engine_port,
        info_hash: String::new(),
        temp,
        seeder,
        engine,
    };

    let seeded = wait_for_json(seeder_api_port, "/torrents", |value| {
        value["torrents"].as_array().is_some_and(|t| !t.is_empty())
    })
    .await;
    swarm.info_hash = seeded["torrents"][0]["info_hash"]
        .as_str()
        .unwrap()
        .to_string();
    wait_for_json(engine_port, "/torrents", |_| true).await;

    swarm
}

fn add_torrent_request(client: &reqwest::Client, swarm: &Swarm) -> reqwest::RequestBuilder {
    let url = reqwest::Url::parse_with_params(
        &format!("http://127.0.0.1:{}/torrents", swarm.engine_port),
        &[
            ("overwrite", "true"),
            ("sub_folder", swarm.info_hash.as_str()),
            ("only_files_regex", ONLY_FILES_REGEX),
        ],
    )
    .unwrap();
    client
        .post(url)
        .header("Content-Type", "text/plain")
        .body(format!(
            "magnet:?xt=urn:btih:{}&dn=Fixture",
            swarm.info_hash
        ))
}

/// rqbit tries each source once while resolving a magnet, so a source that
/// never answers hangs `POST /torrents` (see `addTorrent` in `torrent.ts`).
/// A timed-out add is sent again, like the app does.
async fn add_torrent(swarm: &Swarm) -> Value {
    const ATTEMPTS: u32 = 3;
    const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(20);

    let client = reqwest::Client::builder()
        .timeout(ATTEMPT_TIMEOUT)
        .build()
        .unwrap();
    let mut attempt = 1;
    let response = loop {
        match add_torrent_request(&client, swarm).send().await {
            Err(error) if error.is_timeout() && attempt < ATTEMPTS => {
                eprintln!(
                    "adding the torrent timed out (attempt {attempt} of {ATTEMPTS}), retrying"
                );
                attempt += 1;
            }
            result => break result.unwrap(),
        }
    };
    assert!(
        response.status().is_success(),
        "adding the torrent failed: {}",
        response.status()
    );
    response.json().await.unwrap()
}

async fn wait_until_finished(swarm: &Swarm) -> Value {
    let path = format!("/torrents/{}/stats/v1", swarm.info_hash);
    wait_for_json(swarm.engine_port, &path, |value| {
        value["state"] == "live" && value["finished"] == true
    })
    .await
}

fn file_index(details: &Value, extension: &str) -> usize {
    details["files"]
        .as_array()
        .unwrap()
        .iter()
        .position(|file| {
            file["name"]
                .as_str()
                .unwrap()
                .to_lowercase()
                .ends_with(extension)
        })
        .unwrap_or_else(|| panic!("no {extension} file in torrent"))
}

fn sanitize(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if key == "output_folder" {
                    *child = Value::String("/downloads/fixture".to_string());
                } else {
                    sanitize(child);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(sanitize),
        _ => {}
    }
}

fn same_shape(actual: &Value, snapshot: &Value, path: &str, mismatches: &mut Vec<String>) {
    match (actual, snapshot) {
        (Value::Null, _) | (_, Value::Null) => {}
        (Value::Object(actual), Value::Object(snapshot)) => {
            for (key, expected) in snapshot {
                match actual.get(key) {
                    Some(value) => {
                        same_shape(value, expected, &format!("{path}.{key}"), mismatches)
                    }
                    None => mismatches.push(format!("{path}.{key} is missing")),
                }
            }
            for key in actual.keys().filter(|key| !snapshot.contains_key(*key)) {
                mismatches.push(format!("{path}.{key} is new"));
            }
        }
        (Value::Array(actual), Value::Array(snapshot)) => {
            if let (Some(first), Some(expected)) = (actual.first(), snapshot.first()) {
                same_shape(first, expected, &format!("{path}[0]"), mismatches);
            }
        }
        (Value::Bool(_), Value::Bool(_))
        | (Value::Number(_), Value::Number(_))
        | (Value::String(_), Value::String(_)) => {}
        _ => mismatches.push(format!("{path} changed type")),
    }
}

fn check_snapshot(name: &str, mut actual: Value) {
    sanitize(&mut actual);
    let path = snapshot_path(name);
    if std::env::var_os("UPDATE_RQBIT_SNAPSHOTS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, serde_json::to_string_pretty(&actual).unwrap() + "\n").unwrap();
        return;
    }
    let recorded = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "missing {}; run UPDATE_RQBIT_SNAPSHOTS=1 cargo test playback_engine_tests",
            path.display()
        )
    });
    let snapshot: Value = serde_json::from_str(&recorded).unwrap();
    let mut mismatches = Vec::new();
    same_shape(&actual, &snapshot, name, &mut mismatches);
    assert!(
        mismatches.is_empty(),
        "rqbit response shape changed; refresh tests/fixtures/rqbit and src/lib/engine/__fixtures__/fakeRqbit.ts:\n{}",
        mismatches.join("\n")
    );
}

#[tokio::test]
async fn rqbit_http_api_matches_the_recorded_contract() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    let swarm = start_swarm("movie-mkv", EnginePeers::Seeder).await;
    let port = swarm.engine_port;
    let hash = swarm.info_hash.clone();

    let added = add_torrent(&swarm).await;
    check_snapshot("post-torrents", added.clone());
    check_snapshot("stats-v1", wait_until_finished(&swarm).await);
    check_snapshot(
        "stats",
        get_json(port, &format!("/torrents/{hash}/stats"))
            .await
            .unwrap(),
    );
    check_snapshot("torrents", get_json(port, "/torrents").await.unwrap());
    check_snapshot(
        "torrent-details",
        get_json(port, &format!("/torrents/{hash}")).await.unwrap(),
    );

    let video_idx = file_index(&added["details"], ".mkv");
    let updated = post(
        port,
        &format!("/torrents/{hash}/update_only_files"),
        "application/json",
        format!("{{\"only_files\":[{video_idx}]}}"),
    )
    .await;
    assert!(updated.status().is_success());
    check_snapshot("update-only-files", updated.json().await.unwrap());
}

#[tokio::test]
async fn engine_accepts_requests_from_the_app_webview_on_every_platform() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    let swarm = start_swarm("movie-mkv", EnginePeers::Seeder).await;

    for (origin, allowed) in [
        ("tauri://localhost", Some("tauri://localhost")),
        ("http://tauri.localhost", Some("http://tauri.localhost")),
        ("http://tauri.localhost.example.com", None),
        ("http://example.com", None),
    ] {
        let response = http()
            .get(format!("http://127.0.0.1:{}/torrents", swarm.engine_port))
            .header("Origin", origin)
            .send()
            .await
            .unwrap();
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            allowed,
            "{origin}"
        );
    }
}

async fn spawn_proxy(engine_port: u16) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(stream_proxy::serve(
        listener,
        Arc::new(move || Some(engine_port)),
    ));
    port
}

async fn proxy_get(
    proxy_port: u16,
    info_hash: &str,
    file_idx: usize,
    range: &str,
) -> (reqwest::StatusCode, Option<String>, Vec<u8>) {
    let response = http()
        .get(format!(
            "http://127.0.0.1:{proxy_port}/torrents/{info_hash}/stream/{file_idx}"
        ))
        .header("Range", range)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let content_range = response
        .headers()
        .get("content-range")
        .map(|value| value.to_str().unwrap().to_string());
    (
        status,
        content_range,
        response.bytes().await.unwrap().to_vec(),
    )
}

async fn assert_streams_fixture_with_subtitles_hidden(
    fixture: &str,
    file_name: &str,
    extension: &str,
) {
    let original = std::fs::read(media_dir(fixture).join(file_name)).unwrap();
    assert!(
        media_patch::resolve(&original).0.is_some(),
        "{file_name} must carry an embedded subtitle track"
    );
    let expected = media_patch::patched(&original);
    assert_eq!(expected.len(), original.len());

    let swarm = start_swarm(fixture, EnginePeers::Seeder).await;
    let added = add_torrent(&swarm).await;
    wait_until_finished(&swarm).await;
    let file_idx = file_index(&added["details"], extension);
    let proxy_port = spawn_proxy(swarm.engine_port).await;

    let len = original.len();
    let middle = len / 2;
    for (range, start, end) in [
        ("bytes=0-".to_string(), 0, len - 1),
        (
            format!("bytes={middle}-{}", middle + 999),
            middle,
            middle + 999,
        ),
        (format!("bytes={}-", len - 500), len - 500, len - 1),
    ] {
        let (status, content_range, body) =
            proxy_get(proxy_port, &swarm.info_hash, file_idx, &range).await;
        assert_eq!(status, reqwest::StatusCode::PARTIAL_CONTENT, "{range}");
        assert_eq!(
            content_range.as_deref(),
            Some(format!("bytes {start}-{end}/{len}").as_str()),
            "{range}"
        );
        assert!(
            body == expected[start..=end],
            "{file_name} bytes differ for {range}"
        );
    }

    let (_, _, whole) = proxy_get(proxy_port, &swarm.info_hash, file_idx, "bytes=0-").await;
    assert_eq!(
        media_patch::resolve(&whole).0,
        None,
        "{file_name} is still served with a visible subtitle track"
    );

    let (past_end, _, _) = proxy_get(
        proxy_port,
        &swarm.info_hash,
        file_idx,
        &format!("bytes={}-", len + 10),
    )
    .await;
    assert!(
        !past_end.is_success(),
        "a range past the end must not succeed"
    );
}

#[tokio::test]
async fn streams_the_mkv_fixture_through_the_proxy_with_subtitles_hidden() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    assert_streams_fixture_with_subtitles_hidden(
        "movie-mkv",
        "Grid.Fixture.2026.1080p.mkv",
        ".mkv",
    )
    .await;
}

#[tokio::test]
async fn streams_the_mp4_fixture_through_the_proxy_with_subtitles_hidden() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    assert_streams_fixture_with_subtitles_hidden(
        "movie-mp4",
        "Grid.Fixture.2026.1080p.mp4",
        ".mp4",
    )
    .await;
}

#[tokio::test]
async fn forgotten_torrents_resume_from_disk_and_deleted_ones_are_removed() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    let swarm = start_swarm("movie-mkv", EnginePeers::Seeder).await;
    let port = swarm.engine_port;
    let hash = swarm.info_hash.clone();
    let video = swarm
        .temp
        .join("downloads")
        .join(&hash)
        .join("Grid.Fixture.2026.1080p.mkv");

    add_torrent(&swarm).await;
    wait_until_finished(&swarm).await;
    assert!(post(
        port,
        &format!("/torrents/{hash}/forget"),
        "text/plain",
        String::new()
    )
    .await
    .status()
    .is_success());
    assert!(video.exists(), "forget must keep the cached file");

    tokio::time::sleep(Duration::from_secs(3)).await;

    add_torrent(&swarm).await;
    let resumed = wait_until_finished(&swarm).await;
    assert_eq!(resumed["progress_bytes"], resumed["total_bytes"]);

    assert!(post(
        port,
        &format!("/torrents/{hash}/delete"),
        "text/plain",
        String::new()
    )
    .await
    .status()
    .is_success());
    for _ in 0..50 {
        if !video.exists() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("delete must remove the downloaded file");
}

#[tokio::test]
async fn a_magnet_add_stalled_by_a_silent_source_succeeds_when_added_again() {
    let _engine_test_guard = ENGINE_TEST_LOCK.lock().await;
    let swarm = start_swarm("movie-mkv", EnginePeers::StallFirstConnection).await;

    let impatient = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap();
    let stalled = add_torrent_request(&impatient, &swarm).send().await;
    assert!(
        stalled.as_ref().is_err_and(|error| error.is_timeout()),
        "the first add should hang on the silent source, got {stalled:?}"
    );

    add_torrent(&swarm).await;
    let finished = wait_until_finished(&swarm).await;
    assert_eq!(finished["progress_bytes"], finished["total_bytes"]);

    let loaded = get_json(swarm.engine_port, "/torrents").await.unwrap();
    assert_eq!(loaded["torrents"].as_array().map(Vec::len), Some(1));
}
