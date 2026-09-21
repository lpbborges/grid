//! Native playback on Windows: the JSON IPC controller for the mpv sidecar.
//!
//! WebView2 cannot decode the codecs torrent releases actually ship (HEVC,
//! AC3/E-AC3) and cannot demux Matroska, so Windows plays through mpv in its
//! own window instead of a `<video>` element. mpv owns its UI and its
//! keybindings; Grid only starts it, applies track preferences once, listens,
//! and stops it.
//!
//! The command surface here is deliberately tiny. mpv's own command set
//! includes `run` (spawn a process) and `load-script`, and the app injects
//! translated metadata and third-party subtitle text into the DOM, so a
//! generic passthrough would turn any future XSS into code execution. Only
//! the calls this module exposes are ever sent.
//!
//! The protocol layer is transport-agnostic (`AsyncRead + AsyncWrite`) so the
//! mock-mpv tests below run on every platform, not just the one that ships it.

// Only the Windows build calls into this module; the Tauri commands that drive
// it are `cfg(windows)`. The protocol layer stays compiled and tested
// everywhere on purpose (see the module docs), so on Linux and macOS most of it
// is legitimately unreferenced.
#![allow(dead_code)]

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

/// mpv reports `time-pos` roughly per frame. There is no seek bar on the Grid
/// side to feed - only `progressStore` - so anything faster than this is waste.
const TIME_EVENT_INTERVAL: Duration = Duration::from_secs(1);

/// A track as the frontend needs it, mapped from mpv's `track-list`.
///
/// `id` is mpv's per-type id: video, audio and subtitle tracks each start at 1.
/// It is *not* an index into the DOM's `audioTracks`, and passing one where the
/// other is expected silently selects the wrong track.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Track {
    pub id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub lang: Option<String>,
    pub title: Option<String>,
    pub codec: Option<String>,
    pub default: bool,
    pub forced: bool,
    pub external: bool,
    pub selected: bool,
    pub original: bool,
    pub hearing_impaired: bool,
}

/// What `start_native_player` hands back once mpv has loaded the file.
///
/// `duration` comes back with the track list rather than as an event because the
/// frontend cannot write progress without it, and mpv is the only thing that
/// knows it. It is 0 when mpv could not determine it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Playback {
    pub tracks: Vec<Track>,
    pub duration: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlayerEvent {
    Time(f64),
    /// mpv's `pause` property changed. Grid's controls are the only thing that
    /// can change it now, but mpv still pauses itself on EOF and on a failed
    /// seek, so the UI follows the property rather than assuming.
    Paused(bool),
    Ended,
    Failed(String),
}

/// Rejects any URL that is not this app's local stream proxy.
///
/// mpv bypasses the frontend fetch layer entirely, so `playbackBoundary.ts`
/// and `endpoints.ts` give no protection here - this is the only check. Mirrors
/// `is_allowed_subtitle_url` in `subtitles.rs`.
pub fn is_local_stream_url(raw_url: &str, proxy_port: u16) -> bool {
    let Ok(parsed) = reqwest::Url::parse(raw_url) else {
        return false;
    };
    if parsed.scheme() != "http" {
        return false;
    }
    if parsed.host_str() != Some("127.0.0.1") {
        return false;
    }
    if parsed.port() != Some(proxy_port) {
        return false;
    }
    // Credentials in the authority would let a crafted URL point the request
    // somewhere else while still reading as localhost.
    parsed.username().is_empty() && parsed.password().is_none()
}

/// A per-launch IPC endpoint name. Never logged: a guessable name would let any
/// process running as the same user connect and issue mpv's `run` command.
pub fn random_endpoint_name() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("the OS RNG is available");
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    if cfg!(windows) {
        format!(r"\\.\pipe\grid-mpv-{hex}")
    } else {
        format!("/tmp/grid-mpv-{hex}.sock")
    }
}

/// Rate-limits `time-pos` updates to one per [`TIME_EVENT_INTERVAL`].
struct TimeThrottle {
    last: Option<Instant>,
}

impl TimeThrottle {
    fn new() -> Self {
        Self { last: None }
    }

    fn accept(&mut self, now: Instant) -> bool {
        let ready = self
            .last
            .is_none_or(|last| now.duration_since(last) >= TIME_EVENT_INTERVAL);
        if ready {
            self.last = Some(now);
        }
        ready
    }
}

pub fn parse_tracks(value: &Value) -> Vec<Track> {
    let Some(entries) = value.as_array() else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|entry| {
            Some(Track {
                id: entry.get("id")?.as_i64()?,
                kind: entry.get("type")?.as_str()?.to_string(),
                lang: string_field(entry, "lang"),
                title: string_field(entry, "title"),
                codec: string_field(entry, "codec"),
                default: bool_field(entry, "default"),
                forced: bool_field(entry, "forced"),
                external: bool_field(entry, "external"),
                selected: bool_field(entry, "selected"),
                original: bool_field(entry, "original"),
                hearing_impaired: bool_field(entry, "hearing-impaired"),
            })
        })
        .collect()
}

fn string_field(entry: &Value, key: &str) -> Option<String> {
    entry.get(key)?.as_str().map(str::to_string)
}

fn bool_field(entry: &Value, key: &str) -> bool {
    entry.get(key).and_then(Value::as_bool).unwrap_or(false)
}

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;

/// Talks to one mpv instance. Cloneable; dropping every clone stops the writer.
#[derive(Clone)]
pub struct Client {
    outgoing: mpsc::UnboundedSender<Vec<u8>>,
    pending: Pending,
    next_id: Arc<AtomicU64>,
    closed: Arc<AtomicBool>,
}

/// Marks the connection dead and fails everyone waiting on a reply.
///
/// `closed` is set *before* the drain so a caller that inserts its request
/// concurrently cannot slip past both: either the drain sees it, or the caller
/// sees the flag on its own re-check. Without that ordering a caller can insert
/// into an already-drained map and wait forever for an mpv that is gone.
fn close_connection(pending: &Pending, closed: &AtomicBool) {
    closed.store(true, Ordering::SeqCst);
    let waiting: Vec<_> = pending.lock().unwrap().drain().collect();
    for (_, reply) in waiting {
        let _ = reply.send(Err(CLOSED.to_string()));
    }
}

const CLOSED: &str = "the mpv connection closed";

impl Client {
    async fn call(&self, command: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (reply, wait) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, reply);

        // Re-check after inserting: the reader may have drained the map while
        // this request was being registered (see close_connection).
        let send = serde_json::to_vec(&json!({ "command": command, "request_id": id }))
            .map_err(|e| e.to_string())
            .and_then(|mut line| {
                line.push(b'\n');
                self.outgoing.send(line).map_err(|_| CLOSED.to_string())
            });
        if send.is_err() || self.closed.load(Ordering::SeqCst) {
            self.pending.lock().unwrap().remove(&id);
            return Err(send.err().unwrap_or_else(|| CLOSED.to_string()));
        }

        wait.await.map_err(|_| CLOSED.to_string())?
    }

    pub async fn get_property(&self, name: &str) -> Result<Value, String> {
        self.call(json!(["get_property", name])).await
    }

    pub async fn tracks(&self) -> Result<Vec<Track>, String> {
        Ok(parse_tracks(&self.get_property("track-list").await?))
    }

    pub async fn playback(&self) -> Result<Playback, String> {
        let tracks = self.tracks().await?;
        // A stream mpv cannot measure reports no duration; that is not an error,
        // it just means progress cannot be tracked for this file.
        let duration = self
            .get_property("duration")
            .await
            .ok()
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        Ok(Playback { tracks, duration })
    }

    /// Applies the preselected tracks. `None` means mpv's `no` sentinel, which
    /// is how a track is disabled - it is not the same as track 0.
    pub async fn set_tracks(&self, aid: Option<i64>, sid: Option<i64>) -> Result<(), String> {
        self.call(json!(["set_property", "aid", track_value(aid)]))
            .await?;
        self.call(json!(["set_property", "sid", track_value(sid)]))
            .await?;
        Ok(())
    }

    pub async fn set_paused(&self, paused: bool) -> Result<(), String> {
        self.call(json!(["set_property", "pause", paused])).await?;
        Ok(())
    }

    /// Seeks to an absolute position in seconds.
    ///
    /// `absolute` rather than `relative`: Grid's seek bar reports a target, not
    /// a delta, and a relative seek would compound rounding on every drag.
    pub async fn seek(&self, seconds: f64) -> Result<(), String> {
        self.call(json!(["seek", seconds, "absolute"])).await?;
        Ok(())
    }

    /// Sets the output volume.
    ///
    /// `percent` is mpv's own 0-100 scale, not the DOM's 0-1. The conversion
    /// belongs to the caller so this stays a thin wrapper over the property.
    pub async fn set_volume(&self, percent: f64) -> Result<(), String> {
        self.call(json!(["set_property", "volume", percent]))
            .await?;
        Ok(())
    }

    /// Selects an audio track, leaving the subtitle track untouched.
    ///
    /// `set_tracks` writes both properties at once, which is right when applying
    /// preferences at startup and wrong for a mid-playback switch: `None` there
    /// means mpv's `no` sentinel and would disable the other track.
    pub async fn set_audio_track(&self, id: Option<i64>) -> Result<(), String> {
        self.call(json!(["set_property", "aid", track_value(id)]))
            .await?;
        Ok(())
    }

    /// Selects a subtitle track, leaving the audio track untouched.
    ///
    /// `None` is meaningful here and means "no subtitles".
    pub async fn set_subtitle_track(&self, id: Option<i64>) -> Result<(), String> {
        self.call(json!(["set_property", "sid", track_value(id)]))
            .await?;
        Ok(())
    }

    /// Asks mpv to push `time-pos` changes instead of polling for them.
    pub async fn observe_time(&self) -> Result<(), String> {
        self.call(json!(["observe_property", 1, "time-pos"]))
            .await?;
        Ok(())
    }

    /// Asks mpv to push `pause` changes instead of polling for them.
    ///
    /// Observer id `2` is deliberate: `observe_time` already uses `1`, and
    /// reusing an id silently replaces the earlier observer.
    pub async fn observe_pause(&self) -> Result<(), String> {
        self.call(json!(["observe_property", 2, "pause"])).await?;
        Ok(())
    }

    pub async fn quit(&self) -> Result<(), String> {
        self.call(json!(["quit"])).await?;
        Ok(())
    }
}

fn track_value(id: Option<i64>) -> Value {
    match id {
        Some(id) => json!(id),
        None => json!("no"),
    }
}

/// Wires a [`Client`] and an event stream onto an open mpv IPC connection.
///
/// Reading and writing run as separate tasks over the split halves rather than
/// sharing one handle. On Windows a named pipe opened without
/// `FILE_FLAG_OVERLAPPED` serializes I/O, so a blocking read there would stall
/// every write - tokio's named pipes are overlapped, and keeping the halves
/// apart means that property cannot be lost by accident later.
pub fn connect<R, W>(reader: R, writer: W) -> (Client, mpsc::UnboundedReceiver<PlayerEvent>)
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let closed = Arc::new(AtomicBool::new(false));
    let (outgoing, mut to_write) = mpsc::unbounded_channel::<Vec<u8>>();
    let (events, event_stream) = mpsc::unbounded_channel::<PlayerEvent>();

    let mut writer = writer;
    let write_pending = pending.clone();
    let write_closed = closed.clone();
    tokio::spawn(async move {
        while let Some(line) = to_write.recv().await {
            if writer.write_all(&line).await.is_err() || writer.flush().await.is_err() {
                break;
            }
        }
        // A failed write means mpv will never answer what is already queued.
        close_connection(&write_pending, &write_closed);
    });

    let read_pending = pending.clone();
    let read_closed = closed.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        let mut throttle = TimeThrottle::new();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if let Some(id) = message.get("request_id").and_then(Value::as_u64) {
                if let Some(reply) = read_pending.lock().unwrap().remove(&id) {
                    let _ = reply.send(response_result(&message));
                }
                continue;
            }
            if let Some(event) = parse_event(&message, &mut throttle) {
                let _ = events.send(event);
            }
        }
        // mpv is gone: fail every caller still waiting rather than hanging.
        close_connection(&read_pending, &read_closed);
    });

    (
        Client {
            outgoing,
            pending,
            next_id: Arc::new(AtomicU64::new(1)),
            closed,
        },
        event_stream,
    )
}

/// The running mpv instance, if there is one.
#[derive(Default)]
pub struct NativePlayerState {
    pub child: Mutex<Option<std::process::Child>>,
    pub client: Mutex<Option<Client>>,
}

impl NativePlayerState {
    /// Takes the current client and child, leaving the state empty.
    ///
    /// Returns them rather than acting on them so the caller can `await` the
    /// quit without holding a lock - a `std::sync::MutexGuard` held across an
    /// await point would make the whole command future non-Send.
    pub fn take(&self) -> (Option<Client>, Option<std::process::Child>) {
        let client = self.client.lock().unwrap().take();
        let child = self.child.lock().unwrap().take();
        (client, child)
    }

    pub fn client(&self) -> Option<Client> {
        self.client.lock().unwrap().clone()
    }
}

/// Everything needed to build mpv's argument list.
pub struct LaunchOptions<'a> {
    pub endpoint: &'a str,
    pub url: &'a str,
    pub start_seconds: f64,
    pub subtitle_files: &'a [String],
    /// `--vo=null --ao=null` for the E2E job: WebDriver cannot see into mpv's
    /// window anyway, and `windows-latest` has no GPU for `--vo=gpu`.
    pub headless: bool,
    /// SPIKE (`spike/windows-mpv-wid-overlay`): the parent window handle to
    /// reparent mpv into, so the video draws inside Grid's own window with the
    /// Svelte UI composited on top, instead of in a separate window (D2).
    ///
    /// `--wid` is an mpv *command-line* option, so this keeps the sidecar a
    /// separate process and leaves D7 (never link `libmpv-2.dll`) untouched.
    /// `None` reproduces the current behaviour exactly.
    pub parent_window: Option<i64>,
    /// SPIKE: forces mpv onto D3D11's WARP software renderer with hardware
    /// decoding off, so the spike can run inside a VM whose virtual GPU has no
    /// usable D3D11 hardware path.
    ///
    /// This separates two failures that otherwise look the same on screen:
    /// "the compositing arrangement does not work" and "this machine cannot
    /// render video at all". It is a diagnostic, never a shipping mode - 4K
    /// HEVC through WARP is a slideshow.
    pub software_gpu: bool,
}

/// mpv's arguments, per plan section 3.2.
///
/// `--no-config` and `--load-scripts=no` matter more than they look: without
/// them a user's own `mpv.conf` silently reconfigures Grid's player and
/// produces bug reports nobody can reproduce. Default keybindings stay on - `#`
/// and `j` are the in-playback track switching (D5).
///
/// The cache and timeout values are the ones that survived a 26-second stall
/// when seeking into an undownloaded region during the Phase 2 spike.
pub fn launch_args(options: &LaunchOptions) -> Vec<String> {
    let mut args = vec![
        format!("--input-ipc-server={}", options.endpoint),
        "--title=Grid".to_string(),
        "--keep-open=no".to_string(),
        // Starts paused so track preferences are applied before the first
        // frame; native_player_set_tracks unpauses.
        "--pause=yes".to_string(),
        "--no-config".to_string(),
        "--load-scripts=no".to_string(),
        "--ytdl=no".to_string(),
        "--no-terminal".to_string(),
        "--sub-auto=no".to_string(),
        "--network-timeout=60".to_string(),
        "--cache=yes".to_string(),
        "--cache-secs=30".to_string(),
        "--demuxer-max-bytes=32MiB".to_string(),
        format!("--start={}", options.start_seconds),
    ];
    if options.headless {
        args.push("--vo=null".to_string());
        args.push("--ao=null".to_string());
        args.push("--fullscreen=no".to_string());
    } else {
        args.push("--vo=gpu".to_string());
        args.push("--gpu-api=d3d11".to_string());
        if options.software_gpu {
            args.push("--d3d11-warp=yes".to_string());
            args.push("--hwdec=no".to_string());
        } else {
            args.push("--hwdec=auto-safe".to_string());
        }
        match options.parent_window {
            // Embedded: mpv fills the parent's client area, so fullscreen would
            // fight the host window. Grid's own UI draws the controls, so mpv's
            // OSC and its cursor handling are off - every click belongs to the
            // webview on top.
            Some(handle) => {
                args.push(format!("--wid={handle}"));
                args.push("--fullscreen=no".to_string());
                args.push("--osc=no".to_string());
                args.push("--input-cursor=no".to_string());
                args.push("--input-vo-keyboard=no".to_string());
            }
            None => args.push("--fullscreen=yes".to_string()),
        }
    }
    for file in options.subtitle_files {
        args.push(format!("--sub-file={file}"));
    }
    // Last, and after `--`, so a URL can never be read as an option.
    args.push("--".to_string());
    args.push(options.url.to_string());
    args
}

/// Accepts only subtitle files this app wrote into its own cache directory.
///
/// The frontend hands over paths, so without this a crafted path could make mpv
/// open an arbitrary file. Rejects traversal rather than resolving it: these
/// paths are ours, and a `..` in one means something is wrong.
pub fn is_cached_subtitle_path(cache_dir: &std::path::Path, path: &str) -> bool {
    let path = std::path::Path::new(path);
    let traverses = path
        .components()
        .any(|c| c == std::path::Component::ParentDir);
    let extension_allowed = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("vtt") || ext.eq_ignore_ascii_case("srt"));

    !traverses && path.starts_with(cache_dir) && extension_allowed
}

/// Where subtitle files handed to mpv live.
///
/// Under `app_cache_dir`, never `std::env::temp_dir()`, which is shared and
/// world-writable on Unix.
pub fn subtitle_cache_dir(app_cache_dir: &std::path::Path) -> std::path::PathBuf {
    app_cache_dir.join("native-subtitles")
}

/// Refuses a subtitle larger than this, mirroring `MAX_SUBTITLE_RESPONSE_BYTES`.
pub const MAX_SUBTITLE_FILE_BYTES: usize = 5 * 1024 * 1024;
/// More external subtitles than any one playback selects.
pub const MAX_SUBTITLE_FILES: usize = 20;

/// Replaces the cached subtitles with `contents`, returning the written paths.
///
/// Filenames are derived from the index, never from anything the caller
/// supplies, so no input can escape the directory or pick its own extension.
pub fn write_subtitles(
    dir: &std::path::Path,
    contents: &[String],
) -> std::io::Result<Vec<std::path::PathBuf>> {
    if contents.len() > MAX_SUBTITLE_FILES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "too many subtitle files",
        ));
    }
    if let Some(oversized) = contents.iter().find(|c| c.len() > MAX_SUBTITLE_FILE_BYTES) {
        let _ = oversized;
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "subtitle file too large",
        ));
    }
    clear_subtitles(dir);
    std::fs::create_dir_all(dir)?;
    contents
        .iter()
        .enumerate()
        .map(|(index, content)| {
            let path = dir.join(format!("sub-{index}.vtt"));
            std::fs::write(&path, content)?;
            Ok(path)
        })
        .collect()
}

/// Removes every cached subtitle. Best effort: a leftover file is harmless and
/// the next write replaces the directory anyway.
pub fn clear_subtitles(dir: &std::path::Path) {
    if dir.exists() {
        let _ = std::fs::remove_dir_all(dir);
    }
}

/// Connects to mpv's IPC endpoint, which only exists once mpv has started.
#[cfg(windows)]
pub async fn connect_endpoint(
    name: &str,
    give_up_after: Duration,
) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeClient> {
    use tokio::net::windows::named_pipe::ClientOptions;
    let deadline = Instant::now() + give_up_after;
    loop {
        match ClientOptions::new().open(name) {
            Ok(client) => return Ok(client),
            Err(error) if Instant::now() >= deadline => return Err(error),
            // The pipe is not there yet, or every instance is momentarily busy.
            Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    }
}

fn response_result(message: &Value) -> Result<Value, String> {
    match message.get("error").and_then(Value::as_str) {
        Some("success") | None => Ok(message.get("data").cloned().unwrap_or(Value::Null)),
        Some(error) => Err(error.to_string()),
    }
}

fn parse_event(message: &Value, throttle: &mut TimeThrottle) -> Option<PlayerEvent> {
    match message.get("event")?.as_str()? {
        "property-change" if message.get("name")?.as_str()? == "time-pos" => {
            let seconds = message.get("data")?.as_f64()?;
            throttle
                .accept(Instant::now())
                .then_some(PlayerEvent::Time(seconds))
        }
        // Deliberately not throttled, unlike `time-pos`: a pause change fires
        // rarely and a dropped one leaves the button showing the wrong icon.
        "property-change" if message.get("name")?.as_str()? == "pause" => {
            Some(PlayerEvent::Paused(message.get("data")?.as_bool()?))
        }
        "end-file" => match message.get("reason").and_then(Value::as_str) {
            Some("error") => {
                let detail = message
                    .get("file_error")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown error");
                Some(PlayerEvent::Failed(detail.to_string()))
            }
            _ => Some(PlayerEvent::Ended),
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{duplex, AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};

    const PROXY_PORT: u16 = 45_000;

    fn stream_url(port: u16) -> String {
        format!(
            "http://127.0.0.1:{port}/torrents/{}/stream/0?raw=1",
            "a".repeat(40)
        )
    }

    /// Stands in for mpv: reads JSON commands, answers them, and can push
    /// events. Mirrors `spawn_mock_engine_server` in playback_engine_tests.rs.
    struct MockMpv {
        reader: BufReader<DuplexStream>,
        writer: DuplexStream,
    }

    impl MockMpv {
        /// Wires a client to a mock mpv over two simplex-used duplex pairs:
        /// one carries Grid -> mpv, the other mpv -> Grid.
        fn connect() -> (Client, mpsc::UnboundedReceiver<PlayerEvent>, MockMpv) {
            let (grid_reads, mpv_writes) = duplex(64 * 1024);
            let (grid_writes, mpv_reads) = duplex(64 * 1024);
            let (client, events) = super::connect(grid_reads, grid_writes);
            (
                client,
                events,
                MockMpv {
                    reader: BufReader::new(mpv_reads),
                    writer: mpv_writes,
                },
            )
        }

        /// Answers one command with `data`, echoing its request_id.
        async fn answer_next(&mut self, data: Value) -> Value {
            let command = self.next_command().await;
            let id = command["request_id"].clone();
            self.push(json!({ "request_id": id, "error": "success", "data": data }))
                .await;
            command
        }

        async fn push(&mut self, message: Value) {
            let mut line = serde_json::to_vec(&message).unwrap();
            line.push(b'\n');
            self.writer.write_all(&line).await.unwrap();
            self.writer.flush().await.unwrap();
        }

        async fn next_command(&mut self) -> Value {
            let mut line = String::new();
            self.reader.read_line(&mut line).await.unwrap();
            serde_json::from_str(&line).unwrap()
        }
    }

    #[test]
    fn accepts_only_the_local_stream_proxy_origin() {
        assert!(is_local_stream_url(&stream_url(PROXY_PORT), PROXY_PORT));

        // Wrong port: the rqbit engine, not the proxy.
        assert!(!is_local_stream_url(&stream_url(3030), PROXY_PORT));
        // Not loopback.
        assert!(!is_local_stream_url(
            "http://example.com/torrents/x/stream/0",
            PROXY_PORT
        ));
        // Loopback by name rather than literal: not what the proxy binds.
        assert!(!is_local_stream_url(
            "http://localhost:45000/torrents/x/stream/0",
            PROXY_PORT
        ));
        // Credentials would let the authority read as localhost while the
        // request goes elsewhere.
        assert!(!is_local_stream_url(
            "http://evil.com@127.0.0.1:45000/x",
            PROXY_PORT
        ));
        assert!(!is_local_stream_url("file:///etc/passwd", PROXY_PORT));
        assert!(!is_local_stream_url("not a url", PROXY_PORT));
    }

    #[test]
    fn endpoint_names_are_unguessable_and_unique() {
        let a = random_endpoint_name();
        let b = random_endpoint_name();
        assert_ne!(a, b);
        assert!(a.len() > 32, "{a}");
        if cfg!(windows) {
            assert!(a.starts_with(r"\\.\pipe\grid-mpv-"), "{a}");
        }
    }

    #[test]
    fn maps_mpv_tracks_including_the_flags_the_dom_never_exposes() {
        let tracks = parse_tracks(&json!([
            { "id": 1, "type": "video", "codec": "hevc", "default": true },
            { "id": 1, "type": "audio", "lang": "en", "codec": "eac3", "original": true },
            { "id": 2, "type": "sub", "lang": "en-US", "title": "SDH",
              "codec": "subrip", "hearing-impaired": true, "external": true },
        ]));

        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].kind, "video");
        assert!(tracks[0].default);
        assert_eq!(tracks[1].lang.as_deref(), Some("en"));
        assert!(tracks[1].original);
        // Audio and subtitle ids both start at 1: per-type, not a flat index.
        assert_eq!(tracks[1].id, 1);
        assert_eq!(tracks[2].id, 2);
        assert_eq!(tracks[2].title.as_deref(), Some("SDH"));
        assert!(tracks[2].hearing_impaired);
        assert!(tracks[2].external);
    }

    #[test]
    fn skips_track_entries_missing_an_id_or_type() {
        let tracks = parse_tracks(&json!([
            { "type": "audio" },
            { "id": 2 },
            { "id": 3, "type": "audio" },
        ]));
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, 3);
    }

    #[tokio::test]
    async fn reads_the_track_list_over_ipc() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let ask = tokio::spawn(async move { client.tracks().await });
        let command = mpv
            .answer_next(json!([
                { "id": 1, "type": "audio", "lang": "en", "codec": "eac3" },
            ]))
            .await;

        assert_eq!(command["command"], json!(["get_property", "track-list"]));
        let tracks = ask.await.unwrap().unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].codec.as_deref(), Some("eac3"));
    }

    #[tokio::test]
    async fn sends_the_no_sentinel_when_a_track_is_disabled() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let set = tokio::spawn(async move { client.set_tracks(Some(2), None).await });
        let aid = mpv.answer_next(Value::Null).await;
        let sid = mpv.answer_next(Value::Null).await;

        assert_eq!(aid["command"], json!(["set_property", "aid", 2]));
        assert_eq!(sid["command"], json!(["set_property", "sid", "no"]));
        set.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn seeks_to_an_absolute_position() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let ask = tokio::spawn(async move { client.seek(42.5).await });
        let command = mpv.answer_next(Value::Null).await;

        assert_eq!(command["command"], json!(["seek", 42.5, "absolute"]));
        ask.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn sets_volume_on_mpvs_own_scale() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let ask = tokio::spawn(async move { client.set_volume(65.0).await });
        let command = mpv.answer_next(Value::Null).await;

        // mpv's `volume` property is 0-100, not the DOM's 0-1. Sending 0.65 here
        // would make every film nearly silent.
        assert_eq!(command["command"], json!(["set_property", "volume", 65.0]));
        ask.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn forwards_pause_changes_as_events() {
        let (_client, mut events, mut mpv) = MockMpv::connect();

        mpv.push(json!({
            "event": "property-change",
            "id": 2,
            "name": "pause",
            "data": true
        }))
        .await;

        assert_eq!(events.recv().await, Some(PlayerEvent::Paused(true)));
    }

    #[tokio::test]
    async fn switching_one_track_leaves_the_other_alone() {
        let (client, _events, mut mpv) = MockMpv::connect();

        // `set_tracks` writes BOTH properties, and track_value(None) is mpv's
        // "no" sentinel - which disables a track. Reusing it for a mid-playback
        // subtitle switch would mute the film as a side effect.
        let ask = tokio::spawn(async move { client.set_subtitle_track(Some(3)).await });
        let command = mpv.answer_next(Value::Null).await;

        assert_eq!(command["command"], json!(["set_property", "sid", 3]));
        ask.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn matches_replies_to_their_own_request_when_they_arrive_out_of_order() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let first = client.clone();
        let second = client.clone();
        let a = tokio::spawn(async move { first.get_property("duration").await });
        let b = tokio::spawn(async move { second.get_property("filename").await });

        // Collect both commands, then answer them in reverse.
        let one = mpv.next_command().await;
        let two = mpv.next_command().await;
        let reply = |command: &Value, data: Value| json!({ "request_id": command["request_id"], "error": "success", "data": data });
        let data_for = |command: &Value| match command["command"][1].as_str() {
            Some("duration") => json!(42.0),
            _ => json!("movie.mkv"),
        };
        mpv.push(reply(&two, data_for(&two))).await;
        mpv.push(reply(&one, data_for(&one))).await;

        assert_eq!(a.await.unwrap().unwrap(), json!(42.0));
        assert_eq!(b.await.unwrap().unwrap(), json!("movie.mkv"));
    }

    #[tokio::test]
    async fn surfaces_an_mpv_error_reply_to_the_caller() {
        let (client, _events, mut mpv) = MockMpv::connect();

        let ask = tokio::spawn(async move { client.get_property("nope").await });
        let command = mpv.next_command().await;
        mpv.push(json!({
            "request_id": command["request_id"],
            "error": "property not found"
        }))
        .await;

        assert_eq!(ask.await.unwrap(), Err("property not found".to_string()));
    }

    #[tokio::test]
    async fn reports_playback_end_and_failure_as_events() {
        let (_client, mut events, mut mpv) = MockMpv::connect();

        mpv.push(json!({ "event": "end-file", "reason": "eof" }))
            .await;
        assert_eq!(events.recv().await, Some(PlayerEvent::Ended));

        mpv.push(json!({
            "event": "end-file", "reason": "error", "file_error": "loading failed"
        }))
        .await;
        assert_eq!(
            events.recv().await,
            Some(PlayerEvent::Failed("loading failed".to_string()))
        );
    }

    #[tokio::test]
    async fn drops_time_updates_faster_than_the_interval() {
        let (_client, mut events, mut mpv) = MockMpv::connect();

        for seconds in [1.0, 1.04, 1.08, 1.12] {
            mpv.push(json!({
                "event": "property-change", "name": "time-pos", "data": seconds
            }))
            .await;
        }
        mpv.push(json!({ "event": "end-file", "reason": "eof" }))
            .await;

        // Only the first of the burst survives; the rest are inside the window.
        assert_eq!(events.recv().await, Some(PlayerEvent::Time(1.0)));
        assert_eq!(events.recv().await, Some(PlayerEvent::Ended));
    }

    #[tokio::test]
    async fn ignores_events_that_are_not_part_of_the_narrow_surface() {
        let (_client, mut events, mut mpv) = MockMpv::connect();

        for noise in ["file-loaded", "playback-restart", "audio-reconfig"] {
            mpv.push(json!({ "event": noise })).await;
        }
        mpv.push(json!({ "event": "end-file", "reason": "eof" }))
            .await;

        assert_eq!(events.recv().await, Some(PlayerEvent::Ended));
    }

    #[tokio::test]
    async fn fails_waiting_callers_when_mpv_disappears() {
        let (client, _events, mpv) = MockMpv::connect();

        let ask = tokio::spawn(async move { client.get_property("duration").await });
        // mpv dies without replying.
        drop(mpv);

        assert!(ask.await.unwrap().is_err());
    }

    fn args_for(subtitles: &[String], headless: bool) -> Vec<String> {
        args_for_parent(subtitles, headless, None)
    }

    fn args_for_parent(
        subtitles: &[String],
        headless: bool,
        parent_window: Option<i64>,
    ) -> Vec<String> {
        launch_args(&LaunchOptions {
            endpoint: "ENDPOINT",
            url: &stream_url(PROXY_PORT),
            start_seconds: 12.5,
            subtitle_files: subtitles,
            headless,
            parent_window,
            software_gpu: false,
        })
    }

    fn args_with_software_gpu() -> Vec<String> {
        launch_args(&LaunchOptions {
            endpoint: "ENDPOINT",
            url: &stream_url(PROXY_PORT),
            start_seconds: 0.0,
            subtitle_files: &[],
            headless: false,
            parent_window: Some(42),
            software_gpu: true,
        })
    }

    #[test]
    fn launches_mpv_isolated_from_the_users_own_config() {
        let args = args_for(&[], false);

        // Without these a user's mpv.conf or scripts silently reconfigure
        // Grid's player and make bug reports unreproducible.
        for required in ["--no-config", "--load-scripts=no", "--ytdl=no"] {
            assert!(args.iter().any(|a| a == required), "missing {required}");
        }
        assert!(args.iter().any(|a| a == "--input-ipc-server=ENDPOINT"));
        // Paused until track preferences are applied.
        assert!(args.iter().any(|a| a == "--pause=yes"));
        assert!(args.iter().any(|a| a == "--start=12.5"));
    }

    #[test]
    fn passes_the_url_last_and_after_a_double_dash() {
        let args = args_for(&[], false);
        assert_eq!(args[args.len() - 1], stream_url(PROXY_PORT));
        assert_eq!(args[args.len() - 2], "--");
    }

    #[test]
    fn passes_one_sub_file_argument_per_external_subtitle() {
        let subtitles = vec![
            "C:\\cache\\a.vtt".to_string(),
            "C:\\cache\\b.vtt".to_string(),
        ];
        let args = args_for(&subtitles, false);

        let files: Vec<_> = args
            .iter()
            .filter_map(|a| a.strip_prefix("--sub-file="))
            .collect();
        assert_eq!(files, vec!["C:\\cache\\a.vtt", "C:\\cache\\b.vtt"]);
        // Grid picks the files; mpv must not go looking for its own.
        assert!(args.iter().any(|a| a == "--sub-auto=no"));
    }

    #[test]
    fn headless_swaps_the_gpu_output_for_null_sinks() {
        let args = args_for(&[], true);
        assert!(args.iter().any(|a| a == "--vo=null"));
        assert!(args.iter().any(|a| a == "--ao=null"));
        assert!(!args.iter().any(|a| a == "--vo=gpu"));
        assert!(!args.iter().any(|a| a == "--hwdec=auto-safe"));

        let windowed = args_for(&[], false);
        assert!(windowed.iter().any(|a| a == "--vo=gpu"));
        assert!(windowed.iter().any(|a| a == "--gpu-api=d3d11"));
        assert!(windowed.iter().any(|a| a == "--hwdec=auto-safe"));
        assert!(windowed.iter().any(|a| a == "--fullscreen=yes"));
    }

    #[test]
    fn a_parent_window_reparents_mpv_instead_of_going_fullscreen() {
        let args = args_for_parent(&[], false, Some(0x001A_2B3C));

        assert!(args.iter().any(|a| a == "--wid=1715004"));
        assert!(args.iter().any(|a| a == "--fullscreen=no"));
        assert!(!args.iter().any(|a| a == "--fullscreen=yes"));
        // Still the real GPU path: embedding must not cost hardware decoding.
        assert!(args.iter().any(|a| a == "--vo=gpu"));
        assert!(args.iter().any(|a| a == "--hwdec=auto-safe"));
    }

    #[test]
    fn an_embedded_mpv_surrenders_its_own_controls_to_the_webview() {
        let args = args_for_parent(&[], false, Some(42));

        // Grid's Svelte overlay owns every control and every click; mpv drawing
        // its own OSC underneath would show through the transparent webview.
        assert!(args.iter().any(|a| a == "--osc=no"));
        assert!(args.iter().any(|a| a == "--input-cursor=no"));
        assert!(args.iter().any(|a| a == "--input-vo-keyboard=no"));
    }

    #[test]
    fn no_parent_window_leaves_the_current_own_window_behaviour_untouched() {
        let args = args_for_parent(&[], false, None);

        assert!(!args.iter().any(|a| a.starts_with("--wid=")));
        assert!(args.iter().any(|a| a == "--fullscreen=yes"));
        assert!(!args.iter().any(|a| a == "--osc=no"));
    }

    #[test]
    fn the_software_gpu_fallback_drops_hardware_decoding_for_warp() {
        let args = args_with_software_gpu();

        assert!(args.iter().any(|a| a == "--d3d11-warp=yes"));
        assert!(args.iter().any(|a| a == "--hwdec=no"));
        assert!(!args.iter().any(|a| a == "--hwdec=auto-safe"));
        // Still the same renderer and the same embedding, so a result here
        // still speaks to the compositing question.
        assert!(args.iter().any(|a| a == "--vo=gpu"));
        assert!(args.iter().any(|a| a == "--gpu-api=d3d11"));
        assert!(args.iter().any(|a| a == "--wid=42"));
    }

    #[test]
    fn headless_ignores_the_parent_window() {
        // The E2E job has no GPU and no window to embed into; `--wid` there
        // would point mpv at a handle that WebDriver never created.
        let args = args_for_parent(&[], true, Some(42));

        assert!(!args.iter().any(|a| a.starts_with("--wid=")));
        assert!(args.iter().any(|a| a == "--vo=null"));
    }

    #[test]
    fn accepts_only_subtitle_files_this_app_cached() {
        let cache = std::path::Path::new("/app/cache");

        assert!(is_cached_subtitle_path(cache, "/app/cache/sub.vtt"));
        assert!(is_cached_subtitle_path(cache, "/app/cache/nested/sub.SRT"));

        // Outside the cache directory.
        assert!(!is_cached_subtitle_path(cache, "/etc/passwd.vtt"));
        assert!(!is_cached_subtitle_path(cache, "/app/cachet/sub.vtt"));
        // Traversal back out of it.
        assert!(!is_cached_subtitle_path(
            cache,
            "/app/cache/../../etc/shadow.vtt"
        ));
        // Not a subtitle: mpv would happily load whatever this is.
        assert!(!is_cached_subtitle_path(cache, "/app/cache/payload.lua"));
        assert!(!is_cached_subtitle_path(cache, "/app/cache/noext"));
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("grid-mpv-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn writes_subtitles_under_a_path_the_player_will_accept() {
        let cache = temp_dir("write");
        let dir = subtitle_cache_dir(&cache);

        let paths = write_subtitles(&dir, &["WEBVTT\n\n".to_string(), "WEBVTT\n2\n".to_string()])
            .expect("subtitles are written");

        assert_eq!(paths.len(), 2);
        for path in &paths {
            // The same check start_native_player applies to what it is handed.
            assert!(
                is_cached_subtitle_path(&cache, path.to_str().unwrap()),
                "{path:?} must pass the command's own validation"
            );
        }
        assert_eq!(std::fs::read_to_string(&paths[1]).unwrap(), "WEBVTT\n2\n");
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn replaces_the_previous_playbacks_subtitles() {
        let cache = temp_dir("replace");
        let dir = subtitle_cache_dir(&cache);

        write_subtitles(&dir, &["a".to_string(), "b".to_string(), "c".to_string()]).unwrap();
        write_subtitles(&dir, &["only".to_string()]).unwrap();

        let left: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().collect();
        assert_eq!(left.len(), 1, "stale subtitles must not survive");
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn clearing_removes_the_directory_and_tolerates_a_missing_one() {
        let cache = temp_dir("clear");
        let dir = subtitle_cache_dir(&cache);
        write_subtitles(&dir, &["a".to_string()]).unwrap();

        clear_subtitles(&dir);
        assert!(!dir.exists());
        // Stopping twice, or before anything played, must not fail.
        clear_subtitles(&dir);
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn refuses_more_or_larger_subtitles_than_a_playback_can_need() {
        let cache = temp_dir("limits");
        let dir = subtitle_cache_dir(&cache);

        let too_many = vec!["x".to_string(); MAX_SUBTITLE_FILES + 1];
        assert!(write_subtitles(&dir, &too_many).is_err());

        let too_large = vec!["x".repeat(MAX_SUBTITLE_FILE_BYTES + 1)];
        assert!(write_subtitles(&dir, &too_large).is_err());
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn throttles_time_updates_to_one_per_interval() {
        let mut throttle = TimeThrottle::new();
        let start = Instant::now();

        assert!(throttle.accept(start), "the first update always passes");
        assert!(!throttle.accept(start + Duration::from_millis(40)));
        assert!(!throttle.accept(start + Duration::from_millis(999)));
        assert!(throttle.accept(start + TIME_EVENT_INTERVAL));
        // The window restarts from the accepted update, not from the start.
        assert!(!throttle.accept(start + TIME_EVENT_INTERVAL + Duration::from_millis(500)));
    }
}
