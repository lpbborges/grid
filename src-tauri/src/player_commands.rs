//! Commands for native playback and the local stream proxy.

use crate::engine_lifecycle::EngineState;
use crate::{lock, player, stream_proxy};
use std::sync::Mutex;
use tauri::{Manager, State};

pub(crate) struct StreamProxyState {
    pub(crate) port: Mutex<Option<u16>>,
}

#[tauri::command]
pub async fn get_stream_proxy_url(state: State<'_, StreamProxyState>) -> Result<String, String> {
    let port = lock(&state.port);
    port.map(|p| format!("http://127.0.0.1:{}", p))
        .ok_or_else(|| "Stream proxy not running".to_string())
}

/// Writes the fetched subtitles where mpv can read them, replacing the previous
/// playback's. mpv cannot load the frontend's `blob:` URLs, so the text goes to
/// the app cache; the allowlist and rate limit stay on the fetch path.
#[tauri::command]
pub async fn cache_native_subtitles(
    app: tauri::AppHandle,
    contents: Vec<String>,
) -> Result<Vec<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let dir = player::model::subtitle_cache_dir(&cache_dir);
    let paths = tauri::async_runtime::spawn_blocking(move || {
        player::model::write_subtitles(&dir, &contents)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

/// Starts native playback inside Grid's own window and returns its track list.
///
/// The track list comes back from the call rather than as an event: the
/// frontend needs it before it can apply preferences, and a returned value
/// cannot race the listener being attached.
#[tauri::command]
pub async fn start_native_player(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    proxy: State<'_, StreamProxyState>,
    state: State<'_, player::NativePlayerState>,
    url: String,
    start_seconds: f64,
    subtitle_files: Vec<String>,
) -> Result<player::model::Playback, String> {
    let port = proxy
        .port
        .lock()
        .unwrap()
        .ok_or_else(|| "Stream proxy not running".to_string())?;
    // libmpv never goes through the frontend fetch layer, so this is the only
    // thing keeping it pointed at our own proxy.
    let Some(url) = player::model::local_stream_url(&url, port) else {
        return Err("Refusing to play a URL that is not the local stream proxy".to_string());
    };
    if !start_seconds.is_finite() || start_seconds < 0.0 {
        return Err("Invalid start position".to_string());
    }
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if let Some(bad) = subtitle_files
        .iter()
        .find(|path| !player::model::is_cached_subtitle_path(&cache_dir, path))
    {
        eprintln!("Refusing a subtitle path outside the app cache: {bad}");
        return Err("Refusing to load a subtitle from outside the cache".to_string());
    }

    // Resolved before anything is stopped or loaded, so failing here cannot
    // leave a file loaded that nothing will ever order behind the UI.
    #[cfg(windows)]
    let video_parent = (!player::is_headless())
        .then(|| player::surface_windows::parent_handle(&window))
        .transpose()?;

    let controller = state.controller(&window).await?;
    controller.stop();
    // Whatever the previous playback left unpumped belongs to a stopped file.
    state.discard_events();
    #[cfg(target_os = "linux")]
    player::surface_linux::rearm_render_failure();
    let (playback, events) = controller
        .load(&url, start_seconds, &subtitle_files)
        .await?;

    // mpv creates its `wid` child above WebView2; with no video output there
    // is no window to order.
    #[cfg(windows)]
    if let Some(parent) = video_parent {
        player::surface_windows::order_video_behind_ui(parent).await;
    }

    // Not pumped yet: nothing is listening until this call has returned.
    // `native_player_set_tracks` starts the pump (see `NativePlayerState`).
    state.hold_events(events);
    Ok(playback)
}

fn running_player(state: &player::NativePlayerState) -> Result<player::Controller, String> {
    state
        .running()
        .ok_or_else(|| "No native player is running".to_string())
}

/// Applies the preselected tracks, then starts playback.
///
/// Startup only: it writes both track properties and unpauses as one step.
/// The mid-session controls below are separate for exactly that reason.
///
/// Also where the playback's events start flowing to the frontend.
/// `useMpvBackend.start` awaits every `listen()` before invoking this command,
/// so nothing emitted from here on is dropped for lack of a listener. Pumped
/// before the tracks are applied so a failure below still lets mpv's own
/// events (e.g. an error) reach the UI.
#[tauri::command]
pub async fn native_player_set_tracks(
    app: tauri::AppHandle,
    state: State<'_, player::NativePlayerState>,
    aid: Option<i64>,
    sid: Option<i64>,
) -> Result<(), String> {
    let player = running_player(&state)?;
    if let Some(events) = state.take_events() {
        pump_player_events(app, events);
    }
    player.set_tracks(aid, sid)?;
    player.set_paused(false)
}

/// Pauses or resumes playback.
///
/// Separate from `native_player_set_tracks`, which unpauses as part of
/// starting: that one applies preferences once, this one is the control the
/// user presses.
#[tauri::command]
pub async fn native_player_set_paused(
    state: State<'_, player::NativePlayerState>,
    paused: bool,
) -> Result<(), String> {
    running_player(&state)?.set_paused(paused)
}

/// Seeks to an absolute position in seconds.
#[tauri::command]
pub async fn native_player_seek(
    state: State<'_, player::NativePlayerState>,
    seconds: f64,
) -> Result<(), String> {
    if !seconds.is_finite() || seconds < 0.0 {
        return Err("Invalid seek position".to_string());
    }
    running_player(&state)?.seek(seconds)
}

/// Sets the output volume on mpv's 0-100 scale.
#[tauri::command]
pub async fn native_player_set_volume(
    state: State<'_, player::NativePlayerState>,
    percent: f64,
) -> Result<(), String> {
    if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
        return Err("Invalid volume".to_string());
    }
    running_player(&state)?.set_volume(percent)
}

/// Switches the audio track mid-playback.
///
/// Distinct from `native_player_set_tracks`, which writes both properties and
/// then unpauses. That is right when applying preferences at startup and wrong
/// here twice over: changing the audio while paused must not start the film,
/// and it must not disable the subtitles.
#[tauri::command]
pub async fn native_player_select_audio(
    state: State<'_, player::NativePlayerState>,
    aid: Option<i64>,
) -> Result<(), String> {
    running_player(&state)?.set_audio_track(aid)
}

/// Switches the subtitle track mid-playback. `None` means no subtitles.
#[tauri::command]
pub async fn native_player_select_subtitle(
    state: State<'_, player::NativePlayerState>,
    sid: Option<i64>,
) -> Result<(), String> {
    running_player(&state)?.set_subtitle_track(sid)
}

/// Raises the subtitles above the player controls, on mpv's 0-100 `sub-pos` scale.
#[tauri::command]
pub async fn native_player_set_subtitle_position(
    state: State<'_, player::NativePlayerState>,
    percent: f64,
) -> Result<(), String> {
    if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
        return Err("Invalid subtitle position".to_string());
    }
    running_player(&state)?.set_subtitle_position(percent)
}

const MIN_SUBTITLE_SCALE: f64 = 0.5;
const MAX_SUBTITLE_SCALE: f64 = 3.0;

fn is_valid_subtitle_scale(scale: f64) -> bool {
    scale.is_finite() && (MIN_SUBTITLE_SCALE..=MAX_SUBTITLE_SCALE).contains(&scale)
}

/// Resizes the subtitles, on mpv's `sub-scale` factor (1.0 is the normal size).
#[tauri::command]
pub async fn native_player_set_subtitle_scale(
    state: State<'_, player::NativePlayerState>,
    scale: f64,
) -> Result<(), String> {
    if !is_valid_subtitle_scale(scale) {
        return Err("Invalid subtitle scale".to_string());
    }
    running_player(&state)?.set_subtitle_scale(scale)
}

/// Ends the current file. The player itself lives for the whole app run.
#[tauri::command]
pub async fn stop_native_player(
    app: tauri::AppHandle,
    state: State<'_, player::NativePlayerState>,
) -> Result<(), String> {
    if let Some(player) = state.running() {
        player.stop();
    }
    // A playback stopped before `native_player_set_tracks` was never pumped.
    state.discard_events();
    // Subtitles belong to the playback that just ended.
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        let dir = player::model::subtitle_cache_dir(&cache_dir);
        let _ = tauri::async_runtime::spawn_blocking(move || player::model::clear_subtitles(&dir))
            .await;
    }
    Ok(())
}

/// Forwards one playback's events to the frontend until that playback ends.
///
/// The channel closes only when `stop` or a newer `load` replaces this
/// playback's sink - an in-process player never disappears on its own - so
/// closing is not an "ended": emitting one here would land in the next
/// playback.
fn pump_player_events(
    app: tauri::AppHandle,
    mut events: tokio::sync::mpsc::UnboundedReceiver<player::model::PlayerEvent>,
) {
    use player::model::PlayerEvent;
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            let emitted = match event {
                PlayerEvent::Time(seconds) => app.emit("native-player-time", seconds),
                PlayerEvent::Paused(paused) => app.emit("native-player-paused", paused),
                PlayerEvent::Buffering(starved) => app.emit("native-player-buffering", starved),
                PlayerEvent::Duration(seconds) => app.emit("native-player-duration", seconds),
                // Consumed by `load`; a second one would only mean a reload.
                PlayerEvent::Loaded => Ok(()),
                PlayerEvent::Presenting => app.emit("native-player-presenting", ()),
                PlayerEvent::Ended => app.emit("native-player-ended", ()),
                PlayerEvent::Failed(detail) => app.emit("native-player-error", detail),
            };
            if let Err(e) = emitted {
                eprintln!("Failed to forward a native player event: {e}");
            }
        }
    });
}

pub(crate) fn start_stream_proxy(app: &tauri::AppHandle) -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let engine_app = app.clone();
    let engine_port: stream_proxy::EnginePort =
        std::sync::Arc::new(move || *lock(&engine_app.state::<EngineState>().port));
    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => stream_proxy::serve(listener, engine_port).await,
            Err(e) => eprintln!("Failed to start the stream proxy: {}", e),
        }
    });
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_finite_subtitle_scales_within_bounds() {
        assert!(is_valid_subtitle_scale(0.5));
        assert!(is_valid_subtitle_scale(1.0));
        assert!(is_valid_subtitle_scale(3.0));
        assert!(!is_valid_subtitle_scale(0.49));
        assert!(!is_valid_subtitle_scale(3.01));
        assert!(!is_valid_subtitle_scale(f64::NAN));
        assert!(!is_valid_subtitle_scale(f64::INFINITY));
    }
}
