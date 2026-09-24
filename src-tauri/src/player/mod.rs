//! Native playback through one in-process libmpv instance (Linux and Windows).
//!
//! `model` holds what every platform shares: the types the frontend receives,
//! track parsing, and the input validation that gates every load.

pub mod model;

use model::PlayerEvent;
use tokio::sync::mpsc::UnboundedReceiver;

#[cfg(any(target_os = "linux", windows))]
pub mod controller;

#[cfg(target_os = "linux")]
pub mod surface_linux;

#[cfg(windows)]
pub mod surface_windows;

// macOS has no libmpv (it keeps the `<video>` element), but the command list
// is the frontend's contract and stays identical on every platform. An
// uninhabited stand-in lets `lib.rs` name the controller everywhere without a
// cfg per command; nothing can ever construct one.
#[cfg(not(any(target_os = "linux", windows)))]
mod unavailable;

#[cfg(any(target_os = "linux", windows))]
pub use controller::Controller;
#[cfg(not(any(target_os = "linux", windows)))]
pub use unavailable::Controller;

#[cfg(any(target_os = "linux", windows))]
use controller::VideoOutput;

/// The app's single player, created on the first playback (spec L5).
///
/// A creation failure is kept, not retried: with no `<video>` fallback (L3),
/// every later Play shows the same error instead of re-running GTK surgery.
/// Empty where there is no libmpv: every call then reports it unavailable.
#[derive(Default)]
pub struct NativePlayerState {
    #[cfg(any(target_os = "linux", windows))]
    controller: tokio::sync::OnceCell<Result<Controller, String>>,
    /// The loaded playback's events, held until the frontend is listening.
    ///
    /// Tauri drops an event nobody listens to, and `useMpvBackend` attaches
    /// its listeners only after `start_native_player` resolves. Pumping from
    /// `start_native_player` could therefore emit `native-player-presenting`
    /// into the void and leave the UI waiting for a frame forever. The
    /// channel is unbounded, so mpv's events simply queue here until
    /// `native_player_set_tracks` - which the frontend calls only after every
    /// listener is attached - takes the receiver and starts the pump.
    pending_events: std::sync::Mutex<Option<UnboundedReceiver<PlayerEvent>>>,
}

impl NativePlayerState {
    /// Keeps a freshly loaded playback's events until someone listens,
    /// replacing (and so dropping) any previous playback's unpumped ones.
    pub fn hold_events(&self, events: UnboundedReceiver<PlayerEvent>) {
        *self.pending_slot() = Some(events);
    }

    /// Hands over the held events, once.
    pub fn take_events(&self) -> Option<UnboundedReceiver<PlayerEvent>> {
        self.pending_slot().take()
    }

    /// Drops events nobody will pump because their playback ended.
    pub fn discard_events(&self) {
        self.pending_slot().take();
    }

    fn pending_slot(&self) -> std::sync::MutexGuard<'_, Option<UnboundedReceiver<PlayerEvent>>> {
        self.pending_events
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

#[cfg(any(target_os = "linux", windows))]
impl NativePlayerState {
    pub async fn controller(&self, window: &tauri::WebviewWindow) -> Result<Controller, String> {
        self.controller.get_or_init(|| create(window)).await.clone()
    }

    /// The player, if one was created successfully.
    pub fn running(&self) -> Option<Controller> {
        self.controller
            .get()
            .and_then(|created| created.as_ref().ok())
            .cloned()
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
impl NativePlayerState {
    pub async fn controller(&self, _window: &tauri::WebviewWindow) -> Result<Controller, String> {
        Err("Native playback is not available on this platform".to_string())
    }

    pub fn running(&self) -> Option<Controller> {
        None
    }
}

/// `GRID_E2E` runs mpv without video or audio output, except when
/// `GRID_E2E_RENDER` asks for the real surface (the Linux render smoke test).
#[cfg(any(target_os = "linux", windows))]
pub fn is_headless() -> bool {
    std::env::var_os("GRID_E2E").is_some() && std::env::var_os("GRID_E2E_RENDER").is_none()
}

#[cfg(any(target_os = "linux", windows))]
#[cfg_attr(target_os = "linux", allow(unused_variables))]
fn video_output(window: &tauri::WebviewWindow) -> Result<VideoOutput, String> {
    if is_headless() {
        return Ok(VideoOutput::Null);
    }
    #[cfg(target_os = "linux")]
    return Ok(VideoOutput::RenderApi);
    #[cfg(windows)]
    return Ok(VideoOutput::Window(
        surface_windows::parent_handle(window)? as i64
    ));
}

#[cfg(any(target_os = "linux", windows))]
async fn create(window: &tauri::WebviewWindow) -> Result<Controller, String> {
    let output = video_output(window)?;
    let controller = Controller::new(output)?;
    #[cfg(target_os = "linux")]
    if output == VideoOutput::RenderApi {
        surface_linux::attach(window, controller.clone()).await?;
    }
    Ok(controller)
}

#[cfg(all(test, any(target_os = "linux", windows)))]
mod tests {
    #[test]
    fn libmpv_links_and_initialises_headless() {
        let mpv = libmpv2::Mpv::with_initializer(|init| {
            init.set_option("vo", "null")?;
            init.set_option("ao", "null")?;
            Ok(())
        })
        .expect("libmpv initialises");
        let version: String = mpv.get_property("mpv-version").expect("mpv-version");
        assert!(
            version.starts_with("mpv "),
            "unexpected version string {version}"
        );
    }
}

#[cfg(test)]
mod state_tests {
    use super::{NativePlayerState, PlayerEvent};

    #[test]
    fn held_events_are_handed_over_once_with_what_queued_meanwhile() {
        let state = NativePlayerState::default();
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        state.hold_events(rx);
        // Emitted before anyone listens: must still be there for the pump.
        tx.send(PlayerEvent::Presenting).unwrap();

        let mut events = state.take_events().expect("held events");
        assert_eq!(events.try_recv(), Ok(PlayerEvent::Presenting));
        assert!(state.take_events().is_none());
    }

    #[test]
    fn a_new_playback_replaces_and_stop_discards_unpumped_events() {
        let state = NativePlayerState::default();
        let (old_tx, old_rx) = tokio::sync::mpsc::unbounded_channel::<PlayerEvent>();
        let (new_tx, new_rx) = tokio::sync::mpsc::unbounded_channel::<PlayerEvent>();
        state.hold_events(old_rx);
        state.hold_events(new_rx);
        assert!(old_tx.is_closed(), "the replaced receiver was dropped");

        state.discard_events();
        assert!(new_tx.is_closed(), "stop dropped the unpumped receiver");
        assert!(state.take_events().is_none());
    }
}
