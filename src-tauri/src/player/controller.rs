//! One in-process libmpv instance for the whole app run (spec L1, L5).
//!
//! Leaked on purpose: the Linux render context and the event thread borrow it
//! for `'static`, and the instance is reused for every playback - `stop` ends a
//! file, it never destroys the player.
//!
//! The command surface is exactly the methods below. mpv's own command set
//! includes `run` and `load-script`; the app injects translated metadata and
//! third-party subtitle text into the DOM, so a generic passthrough would turn
//! any future XSS into code execution.
#![allow(dead_code)] // Wired into the Tauri commands in Task 6.

use crate::player::model::{parse_tracks, Playback, PlayerEvent, TimeThrottle};
use libmpv2::events::{Event, PropertyData};
use libmpv2::{Format, Mpv};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// How long `load` waits for mpv to parse the file (unchanged from the IPC path).
pub const LOAD_TIMEOUT: Duration = Duration::from_secs(60);

const OBSERVE_TIME: u64 = 1;
const OBSERVE_PAUSE: u64 = 2;
const OBSERVE_DURATION: u64 = 3;

/// Where mpv draws.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoOutput {
    /// No video or audio output: the E2E job, where nothing can see mpv anyway.
    Null,
    /// Linux: frames go through the render API into Grid's GtkGLArea.
    RenderApi,
    /// Windows: mpv creates its own child of this HWND (`wid`).
    Window(i64),
}

/// libmpv options, set before initialisation.
///
/// `config=no` and `load-scripts=no` matter more than they look: without them a
/// user's own `mpv.conf` silently reconfigures Grid's player. The cache and
/// timeout values are the ones that survived a 26-second stall when seeking
/// into an undownloaded region.
pub fn options_for(output: VideoOutput) -> Vec<(&'static str, String)> {
    let mut options: Vec<(&'static str, String)> = [
        ("config", "no"),
        ("load-scripts", "no"),
        ("ytdl", "no"),
        ("input-default-bindings", "no"),
        ("input-vo-keyboard", "no"),
        ("input-cursor", "no"),
        ("osc", "no"),
        ("terminal", "no"),
        ("sub-auto", "no"),
        ("keep-open", "no"),
        ("network-timeout", "60"),
        ("cache", "yes"),
        ("cache-secs", "30"),
        ("demuxer-max-bytes", "32MiB"),
    ]
    .into_iter()
    .map(|(key, value)| (key, value.to_string()))
    .collect();

    match output {
        VideoOutput::Null => {
            options.push(("vo", "null".into()));
            options.push(("ao", "null".into()));
        }
        VideoOutput::RenderApi => {
            options.push(("vo", "libmpv".into()));
            options.push(("hwdec", "auto-safe".into()));
        }
        VideoOutput::Window(handle) => {
            options.push(("vo", "gpu".into()));
            options.push(("gpu-api", "d3d11".into()));
            options.push(("hwdec", "auto-safe".into()));
            options.push(("wid", handle.to_string()));
            options.push(("force-window", "no".into()));
        }
    }
    options
}

/// mpv's own wording for an error, e.g. "loading failed".
pub fn describe_error(error: &libmpv2::Error) -> String {
    match error {
        libmpv2::Error::Raw(code) => {
            // SAFETY: mpv_error_string returns a static string for any code.
            let text = unsafe { std::ffi::CStr::from_ptr(libmpv2_sys::mpv_error_string(*code)) };
            text.to_string_lossy().into_owned()
        }
        other => format!("{other:?}"),
    }
}

/// Translates one libmpv event into what the frontend is told, if anything.
pub fn map_event(
    event: &Event<'_>,
    throttle: &mut TimeThrottle,
    now: Instant,
) -> Option<PlayerEvent> {
    match event {
        Event::FileLoaded => Some(PlayerEvent::Loaded),
        Event::PlaybackRestart => Some(PlayerEvent::Presenting),
        // An end-file *with* an error arrives as Err from wait_event instead.
        Event::EndFile(_) | Event::Shutdown => Some(PlayerEvent::Ended),
        Event::PropertyChange {
            name,
            change: PropertyData::Double(seconds),
            ..
        } if *name == "time-pos" => throttle.accept(now).then_some(PlayerEvent::Time(*seconds)),
        // Not throttled: a dropped pause change leaves the button showing the wrong icon.
        Event::PropertyChange {
            name,
            change: PropertyData::Flag(paused),
            ..
        } if *name == "pause" => Some(PlayerEvent::Paused(*paused)),
        // Not throttled: it fires once or twice per file, and dropping it pins the seek bar at zero.
        Event::PropertyChange {
            name,
            change: PropertyData::Double(seconds),
            ..
        } if *name == "duration" => Some(PlayerEvent::Duration(*seconds)),
        _ => None,
    }
}

/// Where the event thread sends what it maps. See the task notes in the plan.
#[derive(Default)]
enum Sink {
    #[default]
    Idle,
    AwaitingStart(mpsc::UnboundedSender<PlayerEvent>),
    Forwarding(mpsc::UnboundedSender<PlayerEvent>),
}

fn route(sink: &mut Sink, is_start_file: bool, event: Option<PlayerEvent>) {
    match sink {
        Sink::Idle => {}
        Sink::AwaitingStart(tx) => {
            if is_start_file {
                *sink = Sink::Forwarding(tx.clone());
            }
        }
        Sink::Forwarding(tx) => {
            if let Some(event) = event {
                if tx.send(event).is_err() {
                    *sink = Sink::Idle;
                }
            }
        }
    }
}

/// Runs for the life of the process. Never panics: it is not joined, and a
/// panic here would silently stop every event.
fn run_events(mpv: &'static Mpv, sink: Arc<Mutex<Sink>>) {
    let mut throttle = TimeThrottle::new();
    loop {
        // None is a timeout or an unavailable observed property; neither matters.
        let Some(result) = mpv.wait_event(-1.0) else {
            continue;
        };
        let (is_start_file, is_shutdown, event) = match &result {
            Ok(event) => (
                matches!(event, Event::StartFile),
                matches!(event, Event::Shutdown),
                map_event(event, &mut throttle, Instant::now()),
            ),
            // The only errors wait_event reports for events we do not request
            // replies to are end-file failures: the stream could not be played.
            Err(error) => (
                false,
                false,
                Some(PlayerEvent::Failed(describe_error(error))),
            ),
        };
        if let Ok(mut sink) = sink.lock() {
            route(&mut sink, is_start_file, event);
        }
        if is_shutdown {
            break;
        }
    }
}

fn track_value(id: Option<i64>) -> String {
    // `no` is how mpv disables a track; it is not the same as track 0.
    id.map_or_else(|| "no".to_string(), |id| id.to_string())
}

#[derive(Clone)]
pub struct Controller {
    mpv: &'static Mpv,
    sink: Arc<Mutex<Sink>>,
}

impl Controller {
    pub fn new(output: VideoOutput) -> Result<Self, String> {
        let options = options_for(output);
        let mpv = Mpv::with_initializer(|init| {
            for (key, value) in &options {
                init.set_option(key, value.as_str())?;
            }
            Ok(())
        })
        .map_err(|e| format!("mpv could not start: {}", describe_error(&e)))?;
        let mpv: &'static Mpv = Box::leak(Box::new(mpv));

        for (name, format, id) in [
            ("time-pos", Format::Double, OBSERVE_TIME),
            ("pause", Format::Flag, OBSERVE_PAUSE),
            ("duration", Format::Double, OBSERVE_DURATION),
        ] {
            mpv.observe_property(name, format, id)
                .map_err(|e| format!("mpv could not observe {name}: {}", describe_error(&e)))?;
        }

        let sink = Arc::new(Mutex::new(Sink::Idle));
        let thread_sink = sink.clone();
        std::thread::Builder::new()
            .name("mpv-events".into())
            .spawn(move || run_events(mpv, thread_sink))
            .map_err(|e| format!("could not start the mpv event thread: {e}"))?;

        Ok(Self { mpv, sink })
    }

    pub fn mpv(&self) -> &'static Mpv {
        self.mpv
    }

    fn set_sink(&self, next: Sink) {
        *self.sink.lock().unwrap() = next;
    }

    /// Loads `url` paused at `start_seconds`, adds `subtitle_files`, and returns
    /// the tracks plus the event stream for this playback.
    ///
    /// Events before `file-loaded` are dropped on purpose: mpv is still paused on
    /// the first frame, so there is no position worth keeping.
    pub async fn load(
        &self,
        url: &str,
        start_seconds: f64,
        subtitle_files: &[String],
    ) -> Result<(Playback, mpsc::UnboundedReceiver<PlayerEvent>), String> {
        let (tx, mut rx) = mpsc::unbounded_channel();
        // Kept to identify this load's sink later: a load that was itself
        // superseded must not clear a newer one's sink when it cleans up.
        // A weak reference: it must not keep this load's own sender alive, or
        // a superseded load would sit on the closed-channel detection below
        // for the full `LOAD_TIMEOUT` instead of failing as soon as the
        // channel closes.
        let own_tx = tx.downgrade();
        self.set_sink(Sink::AwaitingStart(tx));

        // Paused so track preferences apply before the first frame;
        // native_player_set_tracks unpauses.
        self.mpv
            .set_property("pause", true)
            .map_err(|e| format!("mpv could not load the stream: {}", describe_error(&e)))?;
        let start = format!("start={start_seconds}");
        // `replace -1 <options>`: the index argument exists since mpv 0.38.
        self.mpv
            .command("loadfile", &[url, "replace", "-1", start.as_str()])
            .map_err(|e| format!("mpv could not load the stream: {}", describe_error(&e)))?;

        match tokio::time::timeout(LOAD_TIMEOUT, wait_until_loaded(&mut rx)).await {
            Ok(Ok(())) => {}
            Ok(Err(detail)) => {
                self.abandon(&own_tx);
                return Err(format!("mpv could not load the stream: {detail}"));
            }
            Err(_) => {
                self.abandon(&own_tx);
                return Err("mpv did not load the stream in time".to_string());
            }
        }

        for file in subtitle_files {
            // `auto` adds without selecting; preferences pick the track later.
            self.mpv
                .command("sub-add", &[file.as_str(), "auto"])
                .map_err(|e| format!("mpv could not add a subtitle: {}", describe_error(&e)))?;
        }

        Ok((self.playback()?, rx))
    }

    /// Tracks and duration. `track-list` read as a string is mpv's JSON.
    pub fn playback(&self) -> Result<Playback, String> {
        let raw: String = self
            .mpv
            .get_property("track-list")
            .map_err(|e| format!("mpv could not list tracks: {}", describe_error(&e)))?;
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("mpv returned an unreadable track list: {e}"))?;
        // A stream mpv cannot measure reports no duration; progress is then untracked.
        let duration = self.mpv.get_property::<f64>("duration").unwrap_or(0.0);
        Ok(Playback {
            tracks: parse_tracks(&value),
            duration,
        })
    }

    pub fn set_tracks(&self, aid: Option<i64>, sid: Option<i64>) -> Result<(), String> {
        self.set_audio_track(aid)?;
        self.set_subtitle_track(sid)
    }

    pub fn set_paused(&self, paused: bool) -> Result<(), String> {
        self.mpv
            .set_property("pause", paused)
            .map_err(|e| describe_error(&e))
    }

    /// Absolute, not relative: the seek bar reports a target, not a delta.
    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        let target = seconds.to_string();
        self.mpv
            .command("seek", &[target.as_str(), "absolute"])
            .map_err(|e| describe_error(&e))
    }

    /// `percent` is mpv's 0-100 scale; the caller converts from the DOM's 0-1.
    pub fn set_volume(&self, percent: f64) -> Result<(), String> {
        self.mpv
            .set_property("volume", percent)
            .map_err(|e| describe_error(&e))
    }

    pub fn set_audio_track(&self, id: Option<i64>) -> Result<(), String> {
        self.mpv
            .set_property("aid", track_value(id).as_str())
            .map_err(|e| describe_error(&e))
    }

    /// `None` means no subtitles.
    pub fn set_subtitle_track(&self, id: Option<i64>) -> Result<(), String> {
        self.mpv
            .set_property("sid", track_value(id).as_str())
            .map_err(|e| describe_error(&e))
    }

    /// Ends the current file. The sink goes idle first so the resulting
    /// end-file never reaches the frontend as "ended".
    pub fn stop(&self) {
        self.set_sink(Sink::Idle);
        let _ = self.mpv.command("stop", &[]);
    }

    /// Cleans up after a load that failed or was itself superseded before it
    /// finished. A superseded load's own sender is no longer the one
    /// installed in `self.sink` - a newer `load` already replaced it - so
    /// this only calls `stop` when `own` is still the current sink. Without
    /// this check, a stale load's cleanup would clear the newer load's sink
    /// and drop its event channel out from under it.
    fn abandon(&self, own: &mpsc::WeakUnboundedSender<PlayerEvent>) {
        let is_current = match own.upgrade() {
            // No strong sender for our channel remains anywhere, including in
            // the sink: definitely not current.
            None => false,
            Some(own_upgraded) => match &*self.sink.lock().unwrap() {
                Sink::Idle => false,
                Sink::AwaitingStart(tx) | Sink::Forwarding(tx) => tx.same_channel(&own_upgraded),
            },
        };
        if is_current {
            self.stop();
        }
    }

    /// A failure mpv cannot see (the Linux GL render call). Reaches the
    /// frontend as `native-player-error` if something is playing.
    pub fn report_failure(&self, detail: String) {
        if let Ok(mut sink) = self.sink.lock() {
            route(&mut sink, false, Some(PlayerEvent::Failed(detail)));
        }
    }
}

async fn wait_until_loaded(rx: &mut mpsc::UnboundedReceiver<PlayerEvent>) -> Result<(), String> {
    while let Some(event) = rx.recv().await {
        match event {
            PlayerEvent::Loaded => return Ok(()),
            PlayerEvent::Failed(detail) => return Err(detail),
            PlayerEvent::Ended => return Err("mpv closed the file before it loaded".to_string()),
            _ => {}
        }
    }
    // The sender was replaced by a newer load or cleared by stop.
    Err("the player stopped before the file loaded".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::player::model::PlayerEvent;
    use libmpv2::events::{Event, PropertyData};
    use std::time::{Duration, Instant};

    const SECURITY: [(&str, &str); 8] = [
        ("config", "no"),
        ("load-scripts", "no"),
        ("ytdl", "no"),
        ("input-default-bindings", "no"),
        ("input-vo-keyboard", "no"),
        ("osc", "no"),
        ("terminal", "no"),
        ("sub-auto", "no"),
    ];

    fn has(options: &[(&'static str, String)], key: &str, value: &str) -> bool {
        options.iter().any(|(k, v)| *k == key && v == value)
    }

    #[test]
    fn every_output_isolates_mpv_from_user_config_and_input() {
        for output in [
            VideoOutput::Null,
            VideoOutput::RenderApi,
            VideoOutput::Window(42),
        ] {
            let options = options_for(output);
            for (key, value) in SECURITY {
                assert!(
                    has(&options, key, value),
                    "{output:?} is missing {key}={value}"
                );
            }
        }
    }

    #[test]
    fn headless_output_renders_and_plays_nothing() {
        let options = options_for(VideoOutput::Null);
        assert!(has(&options, "vo", "null"));
        assert!(has(&options, "ao", "null"));
    }

    #[test]
    fn render_api_output_hands_frames_to_the_host() {
        let options = options_for(VideoOutput::RenderApi);
        assert!(has(&options, "vo", "libmpv"));
        assert!(has(&options, "hwdec", "auto-safe"));
    }

    #[test]
    fn window_output_draws_into_the_given_parent() {
        let options = options_for(VideoOutput::Window(123456));
        assert!(has(&options, "wid", "123456"));
        assert!(has(&options, "vo", "gpu"));
        assert!(has(&options, "gpu-api", "d3d11"));
    }

    #[test]
    fn maps_lifecycle_events() {
        let mut throttle = TimeThrottle::new();
        let now = Instant::now();
        assert_eq!(
            map_event(&Event::FileLoaded, &mut throttle, now),
            Some(PlayerEvent::Loaded)
        );
        assert_eq!(
            map_event(&Event::PlaybackRestart, &mut throttle, now),
            Some(PlayerEvent::Presenting)
        );
        assert_eq!(
            map_event(&Event::EndFile(0), &mut throttle, now),
            Some(PlayerEvent::Ended)
        );
        assert_eq!(
            map_event(&Event::Shutdown, &mut throttle, now),
            Some(PlayerEvent::Ended)
        );
        assert_eq!(map_event(&Event::StartFile, &mut throttle, now), None);
    }

    #[test]
    fn maps_observed_properties() {
        let mut throttle = TimeThrottle::new();
        let now = Instant::now();
        let pause = Event::PropertyChange {
            name: "pause",
            change: PropertyData::Flag(true),
            reply_userdata: 2,
        };
        let duration = Event::PropertyChange {
            name: "duration",
            change: PropertyData::Double(90.5),
            reply_userdata: 3,
        };
        assert_eq!(
            map_event(&pause, &mut throttle, now),
            Some(PlayerEvent::Paused(true))
        );
        assert_eq!(
            map_event(&duration, &mut throttle, now),
            Some(PlayerEvent::Duration(90.5))
        );
    }

    #[test]
    fn throttles_time_but_not_pause() {
        let mut throttle = TimeThrottle::new();
        let now = Instant::now();
        let time = |s| Event::PropertyChange {
            name: "time-pos",
            change: PropertyData::Double(s),
            reply_userdata: 1,
        };
        assert_eq!(
            map_event(&time(1.0), &mut throttle, now),
            Some(PlayerEvent::Time(1.0))
        );
        assert_eq!(
            map_event(&time(1.1), &mut throttle, now + Duration::from_millis(100)),
            None
        );
        assert_eq!(
            map_event(&time(2.0), &mut throttle, now + Duration::from_secs(1)),
            Some(PlayerEvent::Time(2.0))
        );
    }

    #[test]
    fn awaiting_sink_drops_the_previous_files_events_until_the_new_one_starts() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let mut sink = Sink::AwaitingStart(tx);
        route(&mut sink, false, Some(PlayerEvent::Ended)); // the old file's end-file
        route(&mut sink, true, None); // start-file of the new one
        route(&mut sink, false, Some(PlayerEvent::Loaded));
        assert_eq!(rx.try_recv(), Ok(PlayerEvent::Loaded));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn idle_sink_drops_everything() {
        let mut sink = Sink::Idle;
        route(&mut sink, true, Some(PlayerEvent::Loaded));
        assert!(matches!(sink, Sink::Idle));
    }

    #[test]
    fn forwarding_sink_goes_idle_when_the_receiver_is_gone() {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        drop(rx);
        let mut sink = Sink::Forwarding(tx);
        route(&mut sink, false, Some(PlayerEvent::Time(1.0)));
        assert!(matches!(sink, Sink::Idle));
    }

    #[test]
    fn describes_mpv_error_codes_in_words() {
        // -13 is MPV_ERROR_LOADING_FAILED in client.h.
        assert_eq!(describe_error(&libmpv2::Error::Raw(-13)), "loading failed");
    }

    const FIXTURE_DIR: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/media/movie-mkv"
    );

    fn fixture_mkv() -> String {
        format!("{FIXTURE_DIR}/Grid.Fixture.2026.1080p.mkv")
    }

    fn fixture_srt() -> String {
        format!("{FIXTURE_DIR}/Grid.Fixture.2026.1080p.en.srt")
    }

    async fn next_matching(
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<PlayerEvent>,
        wanted: impl Fn(&PlayerEvent) -> bool,
    ) -> PlayerEvent {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let event = rx.recv().await.expect("event stream open");
                if wanted(&event) {
                    return event;
                }
            }
        })
        .await
        .expect("expected event within 10 s")
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn loads_the_fixture_with_its_embedded_tracks() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (playback, _events) = player.load(&fixture_mkv(), 0.0, &[]).await.unwrap();
        assert!(playback.duration > 9.0, "duration {}", playback.duration);
        let sub = playback
            .tracks
            .iter()
            .find(|t| t.kind == "sub")
            .expect("embedded subtitle");
        assert_eq!(sub.codec.as_deref(), Some("subrip"));
        assert!(!sub.external);
        assert!(playback.tracks.iter().any(|t| t.kind == "audio"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn adds_external_subtitles_as_external_tracks() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (playback, _events) = player
            .load(&fixture_mkv(), 0.0, &[fixture_srt()])
            .await
            .unwrap();
        assert!(playback
            .tracks
            .iter()
            .any(|t| t.kind == "sub" && t.external));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn adds_a_subtitle_whose_path_has_spaces_commas_and_accents() {
        let dir = std::env::temp_dir().join(format!("grid José, Silva {}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("legenda, pt-BR.srt");
        std::fs::copy(fixture_srt(), &path).unwrap();
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (playback, _events) = player
            .load(&fixture_mkv(), 0.0, &[path.to_string_lossy().into_owned()])
            .await
            .unwrap();
        assert!(playback
            .tracks
            .iter()
            .any(|t| t.kind == "sub" && t.external));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unpausing_reports_pause_and_position() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (_playback, mut events) = player.load(&fixture_mkv(), 0.0, &[]).await.unwrap();
        player.set_tracks(Some(1), None).unwrap();
        player.set_paused(false).unwrap();
        next_matching(&mut events, |e| *e == PlayerEvent::Paused(false)).await;
        next_matching(
            &mut events,
            |e| matches!(e, PlayerEvent::Time(t) if *t > 0.0),
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn seeks_to_an_absolute_position() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (_playback, mut events) = player.load(&fixture_mkv(), 0.0, &[]).await.unwrap();
        player.seek(5.0).unwrap();
        player.set_paused(false).unwrap();
        next_matching(
            &mut events,
            |e| matches!(e, PlayerEvent::Time(t) if *t >= 4.5),
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn reports_the_end_of_the_file() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (_playback, mut events) = player.load(&fixture_mkv(), 9.0, &[]).await.unwrap();
        player.set_paused(false).unwrap();
        next_matching(&mut events, |e| *e == PlayerEvent::Ended).await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn resuming_past_the_end_loads_then_ends() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (_playback, mut events) = player.load(&fixture_mkv(), 999.0, &[]).await.unwrap();
        player.set_paused(false).unwrap();
        next_matching(&mut events, |e| *e == PlayerEvent::Ended).await;
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stop_does_not_report_ended_and_the_instance_plays_again() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let (_playback, mut events) = player.load(&fixture_mkv(), 0.0, &[]).await.unwrap();
        player.stop();
        // The sink went idle before `stop`, so no `Ended` reaches the
        // frontend, but mpv's own initial `time-pos` notification (fired the
        // moment the paused file reports a position) can already be queued
        // ahead of the close - drain and ignore that benign leftover, then
        // require the stream to close with nothing else, in particular no
        // `Ended`, behind it.
        let closed = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match events.recv().await {
                    None => return None,
                    Some(PlayerEvent::Ended) => return Some(PlayerEvent::Ended),
                    Some(_) => continue,
                }
            }
        })
        .await;
        assert!(
            matches!(closed, Ok(None)),
            "expected a closed stream, got {closed:?}"
        );
        let (again, _events) = player.load(&fixture_mkv(), 0.0, &[]).await.unwrap();
        assert!(again.duration > 9.0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_second_load_supersedes_the_first() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let first = player.clone();
        let fixture = fixture_mkv();
        let first_load =
            tokio::spawn(async move { first.load(&fixture, 0.0, &[]).await.map(|(p, _)| p) });
        // A single `yield_now` only guarantees this task is *polled again*; on
        // the multi-thread runtime the spawned task can run truly in parallel
        // on another OS thread, so it is not guaranteed to have issued its
        // `loadfile` yet. A short sleep gives it that time deterministically,
        // so "second" really is the later of the two loads.
        tokio::time::sleep(Duration::from_millis(20)).await;
        let second = player.load(&fixture_mkv(), 0.0, &[]).await;
        assert!(
            second.is_ok(),
            "the newer load must play: {:?}",
            second.err()
        );
        // The first either finished before the second began, or was superseded:
        // what it must never do is hang.
        let first = tokio::time::timeout(Duration::from_secs(10), first_load).await;
        assert!(first.is_ok(), "the superseded load hung");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_missing_file_fails_to_load() {
        let player = Controller::new(VideoOutput::Null).unwrap();
        let error = player
            .load("/nonexistent/grid.mkv", 0.0, &[])
            .await
            .unwrap_err();
        assert!(
            error.starts_with("mpv could not load the stream"),
            "{error}"
        );
    }
}
