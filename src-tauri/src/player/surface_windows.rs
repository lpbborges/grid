//! Windows: libmpv creates its own `mpv`-class child of Grid's HWND (`wid`,
//! see `VideoOutput::Window`), which must sit beneath WebView2 for the
//! transparent webview to composite over it. `window_embed` does the ordering.

#![allow(dead_code)] // Wired into the Tauri commands in Task 6.

use crate::window_embed;

/// Tauri hands back the `windows` crate's HWND newtype; mpv and window_embed
/// take the raw value.
pub fn parent_handle(window: &tauri::WebviewWindow) -> Result<isize, String> {
    Ok(window.hwnd().map_err(|e| e.to_string())?.0 as isize)
}

/// Pushes mpv's window to the bottom of the child z-order.
///
/// Retried rather than done once: mpv creates the `wid` child at VO reconfig,
/// which can trail `file-loaded`, so the window may not exist on the first look.
/// Losing this is not cosmetic - mpv stays above WebView2 and covers the whole
/// UI, with no controls and no way out. Nothing re-raises it once ordered.
pub async fn order_video_behind_ui(parent: isize) {
    const ATTEMPTS: u32 = 40;
    const INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);

    let mut report = String::new();
    for attempt in 0..ATTEMPTS {
        report = window_embed::push_video_behind_ui(parent);
        if window_embed::is_ordered(&report) {
            return;
        }
        if attempt + 1 < ATTEMPTS {
            tokio::time::sleep(INTERVAL).await;
        }
    }
    // Playback works, but the UI is behind the video: loud in the log.
    eprintln!("Embedded player z-order failed after retrying: {report}");
}
