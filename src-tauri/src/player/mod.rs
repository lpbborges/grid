//! Native playback through one in-process libmpv instance (Linux and Windows).
//!
//! `model` holds what every platform shares: the types the frontend receives,
//! track parsing, and the input validation that gates every load.

pub mod model;

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
