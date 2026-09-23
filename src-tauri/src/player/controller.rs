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
//!
//! ## Attributing events to the load that started them
//!
//! Two loads can race: `load` B can be called while `load` A is still
//! waiting on mpv. mpv's own playlist entry id (returned by `loadfile`
//! itself, see [`loadfile_with_entry_id`]) is the only thing that reliably
//! tells A's events apart from B's, because mpv's event queue can still
//! deliver a stale `StartFile`/`EndFile` for A *after* B has already
//! installed its own sink (A's `StartFile` was already queued when B
//! replaced the sink). Without checking the entry id, that stale event would
//! either wrongly promote B's sink or - worse - forward A's `EndFile` as
//! B's "the file closed before it loaded". Every raw mpv event the event
//! thread sees is decoded with its entry id attached (`RawEvent`), and
//! `route` drops anything whose id doesn't match the sink it would apply to.

use crate::player::model::{parse_tracks, Playback, PlayerEvent, TimeThrottle};
use libmpv2::{Format, Mpv};
use std::ffi::CString;
use std::sync::{Arc, Mutex, PoisonError};
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
    // Each OS constructs only its own variant; `options_for`'s tests cover both.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    RenderApi,
    /// Windows: mpv creates its own child of this HWND (`wid`).
    #[cfg_attr(not(windows), allow(dead_code))]
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

/// A property's value, decoded from a `PROPERTY_CHANGE` event. Only the two
/// formats this controller observes (`time-pos`/`duration` as `Double`,
/// `pause` as `Flag`) are meaningful; anything else is `Other`.
#[derive(Debug, Clone, PartialEq)]
enum PropertyValue {
    Double(f64),
    Flag(bool),
    Other,
}

/// One mpv event, decoded from the raw C struct into what this controller
/// needs, notably the playlist entry id on `StartFile`/`EndFile` (see the
/// module docs on attributing events to the load that started them).
#[derive(Debug, Clone, PartialEq)]
enum RawEvent {
    StartFile {
        entry: i64,
    },
    EndFile {
        entry: i64,
        error: Option<String>,
    },
    FileLoaded,
    PlaybackRestart,
    Shutdown,
    Property {
        name: String,
        value: PropertyValue,
    },
    /// Anything this controller does not act on (reconfigs, seeks, the
    /// initial `MPV_EVENT_NONE` some timeouts produce, ...).
    Other,
}

/// Decodes one raw mpv event into the shape this controller understands.
///
/// # Safety
/// `event` must be a valid `mpv_event` as returned by `mpv_wait_event` on a
/// live handle: its `data` pointer, when non-null, must point to the struct
/// `client.h` documents for `event.event_id` (`mpv_event_start_file`,
/// `mpv_event_end_file`, or `mpv_event_property`), and that data must remain
/// valid for the duration of this call. `mpv_wait_event`'s contract keeps it
/// valid until the next call on the same handle, and the caller here never
/// retains it past this call.
unsafe fn decode(event: &libmpv2_sys::mpv_event) -> RawEvent {
    use libmpv2_sys::{
        mpv_end_file_reason_MPV_END_FILE_REASON_ERROR as REASON_ERROR, mpv_event_end_file,
        mpv_event_id_MPV_EVENT_END_FILE as END_FILE,
        mpv_event_id_MPV_EVENT_FILE_LOADED as FILE_LOADED,
        mpv_event_id_MPV_EVENT_PLAYBACK_RESTART as PLAYBACK_RESTART,
        mpv_event_id_MPV_EVENT_PROPERTY_CHANGE as PROPERTY_CHANGE,
        mpv_event_id_MPV_EVENT_SHUTDOWN as SHUTDOWN,
        mpv_event_id_MPV_EVENT_START_FILE as START_FILE, mpv_event_property, mpv_event_start_file,
        mpv_format_MPV_FORMAT_DOUBLE as FORMAT_DOUBLE, mpv_format_MPV_FORMAT_FLAG as FORMAT_FLAG,
        mpv_format_MPV_FORMAT_NONE as FORMAT_NONE,
    };

    match event.event_id {
        SHUTDOWN => RawEvent::Shutdown,
        FILE_LOADED => RawEvent::FileLoaded,
        PLAYBACK_RESTART => RawEvent::PlaybackRestart,
        START_FILE => {
            if event.data.is_null() {
                return RawEvent::Other;
            }
            // SAFETY: event_id says `data` points to a live mpv_event_start_file.
            let start = unsafe { &*(event.data as *const mpv_event_start_file) };
            RawEvent::StartFile {
                entry: start.playlist_entry_id,
            }
        }
        END_FILE => {
            if event.data.is_null() {
                return RawEvent::Other;
            }
            // SAFETY: event_id says `data` points to a live mpv_event_end_file.
            let end = unsafe { &*(event.data as *const mpv_event_end_file) };
            let error = (end.reason == REASON_ERROR)
                .then(|| describe_error(&libmpv2::Error::Raw(end.error)));
            RawEvent::EndFile {
                entry: end.playlist_entry_id,
                error,
            }
        }
        PROPERTY_CHANGE => {
            if event.data.is_null() {
                return RawEvent::Other;
            }
            // SAFETY: event_id says `data` points to a live mpv_event_property.
            let property = unsafe { &*(event.data as *const mpv_event_property) };
            if property.name.is_null() {
                return RawEvent::Other;
            }
            // SAFETY: mpv guarantees a NUL-terminated name for the event's
            // lifetime, which this call does not outlive.
            let name = unsafe { std::ffi::CStr::from_ptr(property.name) }
                .to_string_lossy()
                .into_owned();
            // `data` should be non-null whenever `format` isn't NONE, but is
            // checked before every dereference below defensively.
            let value = match property.format {
                // Unavailable or errored: nothing meaningful to report.
                FORMAT_NONE => return RawEvent::Other,
                FORMAT_DOUBLE if !property.data.is_null() => {
                    // SAFETY: just checked non-null; format says `data`
                    // points to a live f64.
                    PropertyValue::Double(unsafe { *(property.data as *const f64) })
                }
                FORMAT_FLAG if !property.data.is_null() => {
                    // SAFETY: just checked non-null; format says `data`
                    // points to a live C int used as a bool.
                    PropertyValue::Flag(
                        unsafe { *(property.data as *const std::os::raw::c_int) } != 0,
                    )
                }
                _ => PropertyValue::Other,
            };
            RawEvent::Property { name, value }
        }
        _ => RawEvent::Other,
    }
}

/// Translates one decoded libmpv event into what the frontend is told, if
/// anything. Entry-id matching (whether this event even belongs to the
/// current load) is `route`'s job, not this function's - `map_event` only
/// answers "what would this mean if it applies".
fn map_event(event: &RawEvent, throttle: &mut TimeThrottle, now: Instant) -> Option<PlayerEvent> {
    match event {
        RawEvent::FileLoaded => Some(PlayerEvent::Loaded),
        RawEvent::PlaybackRestart => Some(PlayerEvent::Presenting),
        RawEvent::EndFile {
            error: Some(detail),
            ..
        } => Some(PlayerEvent::Failed(detail.clone())),
        RawEvent::EndFile { error: None, .. } | RawEvent::Shutdown => Some(PlayerEvent::Ended),
        RawEvent::Property {
            name,
            value: PropertyValue::Double(seconds),
        } if name == "time-pos" => throttle.accept(now).then_some(PlayerEvent::Time(*seconds)),
        // Not throttled: a dropped pause change leaves the button showing the wrong icon.
        RawEvent::Property {
            name,
            value: PropertyValue::Flag(paused),
        } if name == "pause" => Some(PlayerEvent::Paused(*paused)),
        // Not throttled: it fires once or twice per file, and dropping it pins the seek bar at zero.
        RawEvent::Property {
            name,
            value: PropertyValue::Double(seconds),
        } if name == "duration" => Some(PlayerEvent::Duration(*seconds)),
        _ => None,
    }
}

/// Where the event thread sends what it maps, tagged with the mpv playlist
/// entry id it belongs to so a stale event from a superseded load can never
/// be mistaken for the current one's.
#[derive(Default)]
enum Sink {
    #[default]
    Idle,
    AwaitingStart {
        entry: i64,
        tx: mpsc::UnboundedSender<PlayerEvent>,
    },
    Forwarding {
        entry: i64,
        tx: mpsc::UnboundedSender<PlayerEvent>,
    },
}

fn route(sink: &mut Sink, event: &RawEvent, mapped: Option<PlayerEvent>) {
    match sink {
        Sink::Idle => {}
        Sink::AwaitingStart { entry, tx } => {
            if let RawEvent::StartFile { entry: started } = event {
                if started == entry {
                    *sink = Sink::Forwarding {
                        entry: *entry,
                        tx: tx.clone(),
                    };
                }
            }
        }
        Sink::Forwarding { entry, tx } => {
            // A `StartFile`/`EndFile` for a different, already-superseded
            // entry must never reach this load - see the module docs.
            let stale = match event {
                RawEvent::StartFile { entry: e } | RawEvent::EndFile { entry: e, .. } => e != entry,
                _ => false,
            };
            if stale {
                return;
            }
            if let Some(event) = mapped {
                if tx.send(event).is_err() {
                    *sink = Sink::Idle;
                }
            }
        }
    }
}

/// Runs for the life of the process. Never panics: it is not joined, and a
/// panic here would silently stop every event.
///
/// Only ever holds `routing` briefly, to call `route` - never while blocked
/// inside `mpv_wait_event`. `Controller::load` relies on that: it holds the
/// same lock across issuing `loadfile` and installing the sink, and that is
/// only safe to do (without deadlocking this thread or stalling every other
/// load's events) because this thread never needs the lock while waiting for
/// the next event, only after it already has one.
fn run_events(mpv: &'static Mpv, routing: Arc<Mutex<Sink>>) {
    let mut throttle = TimeThrottle::new();
    loop {
        // SAFETY: `mpv.ctx` is a valid, live handle for the whole process.
        // `mpv_wait_event` returns a pointer to an `mpv_event` owned by mpv,
        // valid until the next call on this handle - as long as this
        // iteration holds onto it - but it can be null (e.g. the handle is
        // being torn down), so it's checked before dereferencing.
        let event_ptr = unsafe { libmpv2_sys::mpv_wait_event(mpv.ctx.as_ptr(), -1.0) };
        if event_ptr.is_null() {
            continue;
        }
        // SAFETY: just checked non-null above; the pointer is valid per the
        // comment on the call.
        let event = unsafe { &*event_ptr };
        if event.event_id == libmpv2_sys::mpv_event_id_MPV_EVENT_NONE {
            // Only possible with a finite timeout; -1.0 blocks until a real
            // event, but there is no reason to trust that absolutely.
            continue;
        }
        // SAFETY: `event` was just produced by `mpv_wait_event` above and is
        // not retained past this call.
        let raw = unsafe { decode(event) };
        let mapped = map_event(&raw, &mut throttle, Instant::now());
        let is_shutdown = matches!(raw, RawEvent::Shutdown);

        let mut sink = routing.lock().unwrap_or_else(PoisonError::into_inner);
        route(&mut sink, &raw, mapped);
        drop(sink);

        if is_shutdown {
            break;
        }
    }
}

fn track_value(id: Option<i64>) -> String {
    // `no` is how mpv disables a track; it is not the same as track 0.
    id.map_or_else(|| "no".to_string(), |id| id.to_string())
}

/// Issues `loadfile` through `mpv_command_ret` and returns the playlist entry
/// id mpv assigned to it, read back from the command's own
/// `MPV_FORMAT_NODE_MAP` reply (documented since mpv 0.33). Reading the id
/// from the command's own reply - rather than, say, `playlist-current-pos`
/// afterward - is what makes this safe to call from multiple threads at
/// once: each call gets back the exact id mpv assigned to *that* call,
/// whatever order the calls and mpv's processing of them interleave in.
///
/// # Safety
/// `mpv` must be a valid, live `Mpv` handle.
unsafe fn loadfile_with_entry_id(mpv: &Mpv, url: &str, start_seconds: f64) -> Result<i64, String> {
    let start = format!("start={start_seconds}");
    let args = ["loadfile", url, "replace", "-1", start.as_str()];
    let cstrings: Vec<CString> = args
        .iter()
        .map(|a| CString::new(*a))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("mpv could not load the stream: {e}"))?;
    let mut ptrs: Vec<*const std::os::raw::c_char> = cstrings.iter().map(|c| c.as_ptr()).collect();
    ptrs.push(std::ptr::null());

    let mut node: libmpv2_sys::mpv_node = unsafe { std::mem::zeroed() };
    // SAFETY: `mpv.ctx` is valid; `ptrs` is a NUL-terminated array of valid
    // C strings kept alive (via `cstrings`) for this call; `mpv_command_ret`
    // only writes to `node` on success.
    let err =
        unsafe { libmpv2_sys::mpv_command_ret(mpv.ctx.as_ptr(), ptrs.as_mut_ptr(), &mut node) };
    if err < 0 {
        return Err(format!(
            "mpv could not load the stream: {}",
            describe_error(&libmpv2::Error::Raw(err))
        ));
    }

    // SAFETY: `mpv_command_ret` returned success, so `node` is a valid,
    // populated node this call now owns and must free below.
    let entry = unsafe { find_playlist_entry_id(&node) };
    // SAFETY: `node` was populated by the successful call above and not
    // freed yet.
    unsafe { libmpv2_sys::mpv_free_node_contents(&mut node) };

    entry.ok_or_else(|| {
        "mpv could not load the stream: loadfile's reply had no playlist_entry_id".to_string()
    })
}

/// Reads the `playlist_entry_id` key out of `loadfile`'s `MPV_FORMAT_NODE_MAP`
/// reply.
///
/// # Safety
/// `node` must be a valid, populated `mpv_node` (as `mpv_command_ret` leaves
/// it on success) that has not been freed yet.
unsafe fn find_playlist_entry_id(node: &libmpv2_sys::mpv_node) -> Option<i64> {
    if node.format != libmpv2_sys::mpv_format_MPV_FORMAT_NODE_MAP {
        return None;
    }
    // SAFETY: format is NODE_MAP, so reading the `list` union member itself
    // is valid; the pointer it holds is still checked for null below before
    // any dereference, defensively.
    let list_ptr = unsafe { node.u.list };
    if list_ptr.is_null() {
        return None;
    }
    // SAFETY: just checked non-null above; format NODE_MAP guarantees a
    // valid, populated `mpv_node_list` otherwise.
    let list = unsafe { &*list_ptr };
    for i in 0..list.num {
        // SAFETY: `i` is within `0..list.num`, which `mpv_node_list` guarantees
        // indexes valid `keys` and `values` entries.
        let key_ptr = unsafe { *list.keys.offset(i as isize) };
        if key_ptr.is_null() {
            continue;
        }
        // SAFETY: mpv guarantees NUL-terminated keys.
        let key = unsafe { std::ffi::CStr::from_ptr(key_ptr) };
        if key.to_bytes() != b"playlist_entry_id" {
            continue;
        }
        // SAFETY: same bound as `keys` above.
        let value = unsafe { &*list.values.offset(i as isize) };
        if value.format == libmpv2_sys::mpv_format_MPV_FORMAT_INT64 {
            // SAFETY: format says `u.int64` is the active union member.
            return Some(unsafe { value.u.int64 });
        }
    }
    None
}

#[derive(Clone)]
pub struct Controller {
    mpv: &'static Mpv,
    routing: Arc<Mutex<Sink>>,
    /// Serializes each `load`'s pause+loadfile+install-sink sequence, and
    /// each `stop`/`abandon`'s check-and-clear+stop-command sequence,
    /// against one another. Never held across an `.await`. Without it, one
    /// call's steps could interleave with another's - e.g. a stale `abandon`
    /// clearing a `load` that has since taken over the sink, or issuing
    /// mpv's `stop` command after a newer `load` has already started a
    /// different file.
    command_lock: Arc<Mutex<()>>,
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

        let routing = Arc::new(Mutex::new(Sink::default()));
        let thread_routing = routing.clone();
        std::thread::Builder::new()
            .name("mpv-events".into())
            .spawn(move || run_events(mpv, thread_routing))
            .map_err(|e| format!("could not start the mpv event thread: {e}"))?;

        Ok(Self {
            mpv,
            routing,
            command_lock: Arc::new(Mutex::new(())),
        })
    }

    pub fn mpv(&self) -> &'static Mpv {
        self.mpv
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
        // A weak reference: it must not keep this load's own sender alive, or
        // a superseded load would sit on the closed-channel detection below
        // for the full `LOAD_TIMEOUT` instead of failing as soon as the
        // channel closes.
        let own_tx = tx.downgrade();

        {
            // Held only across these synchronous FFI calls - never across
            // the `.await` below. See `command_lock`'s doc comment.
            let _command_guard = self
                .command_lock
                .lock()
                .unwrap_or_else(PoisonError::into_inner);

            // Paused so track preferences apply before the first frame;
            // native_player_set_tracks unpauses.
            self.mpv
                .set_property("pause", true)
                .map_err(|e| format!("mpv could not load the stream: {}", describe_error(&e)))?;

            // Held across `loadfile_with_entry_id` and the sink install
            // below, so the event thread cannot route this entry's
            // `StartFile`/`FileLoaded` (or an immediate `EndFile` for a bad
            // URL) against the old sink in the gap between mpv assigning the
            // entry and this sink existing to catch it. This is safe to do
            // without deadlocking or stalling other loads' events: mpv's
            // core never blocks a command on a client draining its event
            // queue, and `run_events` only ever takes this same lock briefly
            // to route an already-received event - never while blocked
            // inside `mpv_wait_event` waiting for the next one (see
            // `run_events`'s doc comment).
            let mut routing = self.routing.lock().unwrap_or_else(PoisonError::into_inner);

            // SAFETY: `self.mpv` is a valid, live handle for the whole process.
            let entry = unsafe { loadfile_with_entry_id(self.mpv, url, start_seconds) }?;

            *routing = Sink::AwaitingStart { entry, tx };
        }

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
                .map_err(|e| {
                    self.abandon(&own_tx);
                    format!("mpv could not add a subtitle: {}", describe_error(&e))
                })?;
        }

        let playback = self.playback().inspect_err(|_| self.abandon(&own_tx))?;

        Ok((playback, rx))
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
        let _command_guard = self
            .command_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        {
            let mut routing = self.routing.lock().unwrap_or_else(PoisonError::into_inner);
            *routing = Sink::Idle;
        }
        let _ = self.mpv.command("stop", &[]);
    }

    /// Cleans up after a load that failed or was itself superseded before it
    /// finished. A superseded load's own sender is no longer the one
    /// installed in `self.routing` - a newer `load` already replaced it - so
    /// this only clears the sink and tells mpv to stop when `own` is still
    /// current. Without this check, a stale load's cleanup would clear the
    /// newer load's sink and drop its event channel out from under it.
    ///
    /// The ownership check and the clear happen under one guard of the
    /// routing lock, so nothing can install a new sink between "this is
    /// still mine" and actually clearing it.
    fn abandon(&self, own: &mpsc::WeakUnboundedSender<PlayerEvent>) {
        let _command_guard = self
            .command_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let cleared = {
            let mut routing = self.routing.lock().unwrap_or_else(PoisonError::into_inner);
            let is_current = match own.upgrade() {
                // No strong sender for our channel remains anywhere,
                // including in the sink: definitely not current.
                None => false,
                Some(own_upgraded) => match &*routing {
                    Sink::Idle => false,
                    Sink::AwaitingStart { tx, .. } | Sink::Forwarding { tx, .. } => {
                        tx.same_channel(&own_upgraded)
                    }
                },
            };
            if is_current {
                *routing = Sink::Idle;
            }
            is_current
        };
        if cleared {
            let _ = self.mpv.command("stop", &[]);
        }
    }

    /// A failure mpv cannot see (the Linux GL render call). Reaches the
    /// frontend as `native-player-error` if something is playing.
    pub fn report_failure(&self, detail: String) {
        let mut routing = self.routing.lock().unwrap_or_else(PoisonError::into_inner);
        if let Sink::Forwarding { tx, .. } = &*routing {
            if tx.send(PlayerEvent::Failed(detail)).is_err() {
                *routing = Sink::Idle;
            }
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
    use std::time::{Duration, Instant};

    const GLOBAL_OPTIONS: [(&str, &str); 14] = [
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
    ];

    fn has(options: &[(&'static str, String)], key: &str, value: &str) -> bool {
        options.iter().any(|(k, v)| *k == key && v == value)
    }

    #[test]
    fn every_output_sets_every_global_option() {
        for output in [
            VideoOutput::Null,
            VideoOutput::RenderApi,
            VideoOutput::Window(42),
        ] {
            let options = options_for(output);
            for (key, value) in GLOBAL_OPTIONS {
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
            map_event(&RawEvent::FileLoaded, &mut throttle, now),
            Some(PlayerEvent::Loaded)
        );
        assert_eq!(
            map_event(&RawEvent::PlaybackRestart, &mut throttle, now),
            Some(PlayerEvent::Presenting)
        );
        assert_eq!(
            map_event(
                &RawEvent::EndFile {
                    entry: 1,
                    error: None
                },
                &mut throttle,
                now
            ),
            Some(PlayerEvent::Ended)
        );
        assert_eq!(
            map_event(
                &RawEvent::EndFile {
                    entry: 1,
                    error: Some("loading failed".to_string())
                },
                &mut throttle,
                now
            ),
            Some(PlayerEvent::Failed("loading failed".to_string()))
        );
        assert_eq!(
            map_event(&RawEvent::Shutdown, &mut throttle, now),
            Some(PlayerEvent::Ended)
        );
        assert_eq!(
            map_event(&RawEvent::StartFile { entry: 1 }, &mut throttle, now),
            None
        );
    }

    #[test]
    fn maps_observed_properties() {
        let mut throttle = TimeThrottle::new();
        let now = Instant::now();
        let pause = RawEvent::Property {
            name: "pause".to_string(),
            value: PropertyValue::Flag(true),
        };
        let duration = RawEvent::Property {
            name: "duration".to_string(),
            value: PropertyValue::Double(90.5),
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
        let time = |s| RawEvent::Property {
            name: "time-pos".to_string(),
            value: PropertyValue::Double(s),
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
        let mut sink = Sink::AwaitingStart { entry: 2, tx };
        // the old file's (entry 1) end-file must not leak through
        route(
            &mut sink,
            &RawEvent::EndFile {
                entry: 1,
                error: None,
            },
            Some(PlayerEvent::Ended),
        );
        // start-file of the new one (entry 2)
        route(&mut sink, &RawEvent::StartFile { entry: 2 }, None);
        route(&mut sink, &RawEvent::FileLoaded, Some(PlayerEvent::Loaded));
        assert_eq!(rx.try_recv(), Ok(PlayerEvent::Loaded));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn idle_sink_drops_everything() {
        let mut sink = Sink::Idle;
        route(
            &mut sink,
            &RawEvent::StartFile { entry: 1 },
            Some(PlayerEvent::Loaded),
        );
        assert!(matches!(sink, Sink::Idle));
    }

    #[test]
    fn forwarding_sink_goes_idle_when_the_receiver_is_gone() {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        drop(rx);
        let mut sink = Sink::Forwarding { entry: 1, tx };
        route(
            &mut sink,
            &RawEvent::Property {
                name: "time-pos".to_string(),
                value: PropertyValue::Double(1.0),
            },
            Some(PlayerEvent::Time(1.0)),
        );
        assert!(matches!(sink, Sink::Idle));
    }

    #[test]
    fn a_start_file_for_another_entry_does_not_promote_awaiting_start() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let mut sink = Sink::AwaitingStart { entry: 2, tx };
        route(&mut sink, &RawEvent::StartFile { entry: 1 }, None);
        assert!(matches!(sink, Sink::AwaitingStart { entry: 2, .. }));
        // Still waiting, not forwarding: an event that would otherwise map to
        // something must not reach the receiver either.
        route(&mut sink, &RawEvent::FileLoaded, Some(PlayerEvent::Loaded));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn an_end_file_for_another_entry_is_not_forwarded_from_forwarding() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let mut sink = Sink::Forwarding { entry: 2, tx };
        route(
            &mut sink,
            &RawEvent::EndFile {
                entry: 1,
                error: None,
            },
            Some(PlayerEvent::Ended),
        );
        assert!(rx.try_recv().is_err());
        assert!(matches!(sink, Sink::Forwarding { entry: 2, .. }));
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

    /// A TCP listener that accepts a connection and then never answers.
    /// mpv's network demuxer will connect and then block reading a response
    /// that never comes, which keeps a `load` genuinely, deterministically
    /// mid-load for as long as the test needs - no sleep-based timing
    /// guesses about when mpv "should" have started.
    async fn spawn_stuck_listener() -> (u16, Arc<tokio::sync::Notify>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accepted = Arc::new(tokio::sync::Notify::new());
        let accepted_task = accepted.clone();
        tokio::spawn(async move {
            if let Ok((socket, _)) = listener.accept().await {
                accepted_task.notify_one();
                // Never close it: forgetting (rather than dropping) leaks the
                // fd instead of closing it, so mpv's read stays blocked.
                std::mem::forget(socket);
            }
        });
        (port, accepted)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_second_load_supersedes_the_first() {
        let (port, accepted) = spawn_stuck_listener().await;

        let player = Controller::new(VideoOutput::Null).unwrap();
        let first = player.clone();
        let stuck_url = format!("http://127.0.0.1:{port}/a.mkv");
        let first_load =
            tokio::spawn(async move { first.load(&stuck_url, 0.0, &[]).await.map(|(p, _)| p) });

        // Proof load A is genuinely mid-load: mpv's demuxer has connected
        // and is now stuck reading a response that will never arrive.
        tokio::time::timeout(Duration::from_secs(10), accepted.notified())
            .await
            .expect("mpv never connected to the stuck listener");

        let second = player.load(&fixture_mkv(), 0.0, &[]).await;
        assert!(
            second.is_ok(),
            "the newer load must play: {:?}",
            second.err()
        );

        let first = tokio::time::timeout(Duration::from_secs(10), first_load)
            .await
            .expect("the superseded load hung")
            .expect("the spawned task panicked");
        assert!(
            first.is_err(),
            "the superseded load must fail cleanly, not succeed: {first:?}"
        );
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
