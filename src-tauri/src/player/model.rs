//! What every native-playback platform shares: the shapes handed to the
//! frontend, `track-list` parsing, and the checks that gate every load.
// Most of this is produced only by the libmpv controller, which macOS lacks.
#![cfg_attr(not(any(target_os = "linux", windows)), allow(dead_code))]

use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};

/// mpv reports `time-pos` roughly per frame. There is no seek bar on the Grid
/// side to feed - only `progressStore` - so anything faster than this is waste.
pub const TIME_EVENT_INTERVAL: Duration = Duration::from_secs(1);

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
    /// mpv began painting. Fires after loading and after every seek; the UI
    /// latches it, because until the first frame is on screen there is
    /// nothing behind the webview to composite against.
    Presenting,
    /// mpv finished parsing the file. Only now do `track-list` and `duration`
    /// hold anything: before it, a streamed file reports no tracks and no
    /// length at all.
    Loaded,
    /// mpv's `duration` property changed. A stream usually reports none at
    /// first and learns it once enough of the file has been demuxed.
    Duration(f64),
    Ended,
    Failed(String),
}

/// Returns the canonical form of `raw_url` if it is this app's local stream
/// proxy, and `None` for anything else.
///
/// mpv bypasses the frontend fetch layer entirely, so `playbackBoundary.ts`
/// and `endpoints.ts` give no protection here - this is the only check. Mirrors
/// `is_allowed_subtitle_url` in `subtitles.rs`.
///
/// The caller must hand mpv the returned string, never `raw_url`: that way
/// mpv loads exactly what was checked. `\`, `@` and ASCII whitespace are
/// refused outright rather than normalised, because they are where URL
/// parsers disagree - WHATWG parsing (this check) reads `\` as `/` and drops
/// tabs and newlines, while FFmpeg's URL handling inside mpv need not. A
/// stream URL Grid builds itself never contains any of them.
pub fn local_stream_url(raw_url: &str, proxy_port: u16) -> Option<String> {
    if raw_url
        .chars()
        .any(|c| c == '\\' || c == '@' || c.is_ascii_whitespace())
    {
        return None;
    }
    let parsed = reqwest::Url::parse(raw_url).ok()?;
    let local = parsed.scheme() == "http"
        && parsed.host_str() == Some("127.0.0.1")
        && parsed.port() == Some(proxy_port)
        // Credentials in the authority would let a crafted URL point the
        // request somewhere else while still reading as localhost.
        && parsed.username().is_empty()
        && parsed.password().is_none();
    local.then(|| parsed.into())
}

/// Rate-limits `time-pos` updates to one per [`TIME_EVENT_INTERVAL`].
pub struct TimeThrottle {
    last: Option<Instant>,
}

impl TimeThrottle {
    pub fn new() -> Self {
        Self { last: None }
    }

    pub fn accept(&mut self, now: Instant) -> bool {
        let ready = self
            .last
            .is_none_or(|last| now.duration_since(last) >= TIME_EVENT_INTERVAL);
        if ready {
            self.last = Some(now);
        }
        ready
    }
}

impl Default for TimeThrottle {
    fn default() -> Self {
        Self::new()
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

#[cfg(test)]
mod tests {
    use super::*;

    const PROXY_PORT: u16 = 45_000;

    fn stream_url(port: u16) -> String {
        format!(
            "http://127.0.0.1:{port}/torrents/{}/stream/0?raw=1",
            "a".repeat(40)
        )
    }

    fn is_local_stream_url(raw_url: &str, proxy_port: u16) -> bool {
        local_stream_url(raw_url, proxy_port).is_some()
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
    fn rejects_characters_parsers_disagree_on() {
        // WHATWG parsing reads `\` as `/` and strips tabs, newlines and outer
        // spaces, so these would pass the host check - while FFmpeg's own URL
        // handling inside mpv may read the authority differently.
        for raw in [
            "http://127.0.0.1:45000\\@evil.com/",
            "http://127.0.0.1:45000/torrents/x@evil.com/stream/0",
            "http://127.0.0.1:45000/torrents/x/stream/0 ",
            " http://127.0.0.1:45000/torrents/x/stream/0",
            "http://127.0.0.1:45000/torrents/x/stre\tam/0",
            "http://127.0.0.1:45000/torrents/x/stre\nam/0",
            "http://127.0.0.1:45000/torrents/x/stream/0\r",
        ] {
            assert_eq!(local_stream_url(raw, PROXY_PORT), None, "{raw:?}");
        }
    }

    #[test]
    fn hands_mpv_the_canonical_form_of_an_accepted_url() {
        assert_eq!(
            local_stream_url(
                "HTTP://127.0.0.1:45000/torrents/x/stream/0?raw=1",
                PROXY_PORT
            )
            .as_deref(),
            Some("http://127.0.0.1:45000/torrents/x/stream/0?raw=1")
        );
    }

    #[test]
    fn maps_mpv_tracks_including_the_flags_the_dom_never_exposes() {
        let tracks = parse_tracks(&serde_json::json!([
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
        let tracks = parse_tracks(&serde_json::json!([
            { "type": "audio" },
            { "id": 2 },
            { "id": 3, "type": "audio" },
        ]));
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].id, 3);
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
