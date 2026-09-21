//! Win32 window plumbing for the embedded player.
//!
//! mpv is launched with `--wid=<Grid's HWND>`, so it creates a window of class
//! `mpv` as a direct child of Grid's top-level window, sibling to WebView2's
//! `Chrome_WidgetWin_*`. It has to sit at the bottom of that z-order for the
//! transparent webview to composite over it.
//!
//! One `SetWindowPos(HWND_BOTTOM)` at startup is enough. Measured against a
//! live Windows build: mpv stayed last on every probe while presenting, so
//! nothing re-raises it and no watchdog is needed.
//!
//! `--wid` is a command-line option on the stock `mpv.exe`, so the sidecar
//! stays a separate process over JSON IPC and D7 ("never link `libmpv-2.dll`")
//! holds. Grid's licence does not change.

// This Windows plumbing is unreferenced on Linux and macOS, the same way
// mpv_player.rs keeps its protocol layer compiled everywhere.
#![allow(dead_code)]

/// Which child of Grid's top-level window a class name identifies.
///
/// Both windows are created for us - mpv by the sidecar, the webview by Tauri -
/// so the only handle we get is the parent's. Everything else is found by
/// walking its children.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Child {
    /// mpv's video output window, created by `--wid`.
    Video,
    /// WebView2's render widget, created by Tauri.
    WebView,
    Other,
}

/// Maps a Win32 window class name to the role it plays in the embedded player.
///
/// mpv registers its video window as `mpv`. WebView2 uses Chromium's widget
/// classes, which carry a trailing instance number (`Chrome_WidgetWin_0`,
/// `Chrome_WidgetWin_1`), so the prefix is matched rather than the whole name.
pub fn classify(class_name: &str) -> Child {
    if class_name == "mpv" {
        Child::Video
    } else if class_name.starts_with("Chrome_WidgetWin_") {
        Child::WebView
    } else {
        Child::Other
    }
}

/// The z-order fix to apply once both children exist.
///
/// Returned rather than performed so the decision is testable off-Windows:
/// "compositing does not work" and "we never found the windows to order" look
/// identical from a screenshot, and only this split tells them apart.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ZOrderPlan {
    /// Both windows found: push the video behind the UI.
    PushVideoBehind { video: isize, webview: isize },
    /// mpv has not created its window yet, or `--wid` was ignored.
    VideoMissing,
    /// Tauri's webview is not a child of the handle we were given.
    WebViewMissing,
}

/// Decides what to do with the children found under Grid's top-level window.
pub fn plan_z_order(children: &[(isize, String)]) -> ZOrderPlan {
    let find = |want: Child| {
        children
            .iter()
            .find(|(_, class)| classify(class) == want)
            .map(|(handle, _)| *handle)
    };

    match (find(Child::Video), find(Child::WebView)) {
        (Some(video), Some(webview)) => ZOrderPlan::PushVideoBehind { video, webview },
        (None, _) => ZOrderPlan::VideoMissing,
        (_, None) => ZOrderPlan::WebViewMissing,
    }
}

/// Prefix of the report [`push_video_behind_ui`] returns once the video is
/// ordered. Callers match on this rather than on a literal, so the success
/// wording and the check cannot drift apart.
pub const ORDERED_REPORT_PREFIX: &str = "video pushed behind the UI";

/// Whether a report from [`push_video_behind_ui`] says the video is ordered.
pub fn is_ordered(report: &str) -> bool {
    report.starts_with(ORDERED_REPORT_PREFIX)
}

#[cfg(windows)]
mod win {
    use super::{plan_z_order, ZOrderPlan};
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, TRUE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetClassNameW, SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE,
    };

    /// Collects `(handle, class name)` for every direct child of `parent`.
    unsafe extern "system" fn collect(child: HWND, out: LPARAM) -> BOOL {
        let mut name = [0u16; 256];
        let len = unsafe { GetClassNameW(child, name.as_mut_ptr(), name.len() as i32) };
        let class = String::from_utf16_lossy(&name[..len.max(0) as usize]);
        let found = unsafe { &mut *(out as *mut Vec<(isize, String)>) };
        found.push((child as isize, class));
        TRUE
    }

    pub fn children_of(parent: isize) -> Vec<(isize, String)> {
        let mut found: Vec<(isize, String)> = Vec::new();
        unsafe {
            EnumChildWindows(
                parent as HWND,
                Some(collect),
                &mut found as *mut Vec<(isize, String)> as LPARAM,
            );
        }
        found
    }

    /// Puts mpv's video window underneath Tauri's webview.
    ///
    /// Returns a human-readable report rather than a bare bool: when the screen
    /// is black, "which windows were found" is the first thing to check, and
    /// `start_native_player` logs this verbatim.
    pub fn push_video_behind_ui(parent: isize) -> String {
        let children = children_of(parent);
        let inventory = children
            .iter()
            .map(|(handle, class)| format!("{class} (0x{handle:x})"))
            .collect::<Vec<_>>()
            .join(", ");

        match plan_z_order(&children) {
            ZOrderPlan::PushVideoBehind { video, .. } => {
                let ok = unsafe {
                    SetWindowPos(
                        video as HWND,
                        HWND_BOTTOM,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    )
                };
                if ok == 0 {
                    format!("SetWindowPos failed. children: [{inventory}]")
                } else {
                    format!("{}. children: [{inventory}]", super::ORDERED_REPORT_PREFIX)
                }
            }
            ZOrderPlan::VideoMissing => {
                format!("mpv created no child window - `--wid` ignored? children: [{inventory}]")
            }
            ZOrderPlan::WebViewMissing => {
                format!("no WebView2 child under this handle. children: [{inventory}]")
            }
        }
    }
}

#[cfg(windows)]
pub use win::push_video_behind_ui;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_mpv_and_webview_window_classes() {
        assert_eq!(classify("mpv"), Child::Video);
        // WebView2's widget class carries an instance number.
        assert_eq!(classify("Chrome_WidgetWin_0"), Child::WebView);
        assert_eq!(classify("Chrome_WidgetWin_1"), Child::WebView);
        assert_eq!(classify("Static"), Child::Other);
        // Near-misses must not be mistaken for the video window.
        assert_eq!(classify("mpv-player"), Child::Other);
        assert_eq!(classify("MPV"), Child::Other);
    }

    #[test]
    fn orders_the_video_behind_the_webview_when_both_exist() {
        let children = vec![
            (0x10, "Chrome_WidgetWin_1".to_string()),
            (0x20, "mpv".to_string()),
        ];

        assert_eq!(
            plan_z_order(&children),
            ZOrderPlan::PushVideoBehind {
                video: 0x20,
                webview: 0x10
            }
        );
    }

    #[test]
    fn reports_a_missing_video_window_rather_than_ordering_nothing() {
        // The failure that looks exactly like "compositing is broken" on
        // screen, and the one most needing to be told apart from it.
        let children = vec![(0x10, "Chrome_WidgetWin_1".to_string())];

        assert_eq!(plan_z_order(&children), ZOrderPlan::VideoMissing);
    }

    #[test]
    fn tells_an_ordered_report_from_every_failure() {
        // lib.rs retries until this says yes, so a mismatch between the
        // wording and the check would retry forever or give up immediately.
        assert!(is_ordered(&format!(
            "{ORDERED_REPORT_PREFIX}. children: [mpv (0x1)]"
        )));
        assert!(!is_ordered("SetWindowPos failed. children: [mpv (0x1)]"));
        assert!(!is_ordered(
            "mpv created no child window - `--wid` ignored? children: []"
        ));
        assert!(!is_ordered(
            "no WebView2 child under this handle. children: []"
        ));
    }

    #[test]
    fn reports_a_missing_webview_child() {
        let children = vec![(0x20, "mpv".to_string())];

        assert_eq!(plan_z_order(&children), ZOrderPlan::WebViewMissing);
    }

    #[test]
    fn an_empty_window_reports_the_video_as_missing_first() {
        assert_eq!(plan_z_order(&[]), ZOrderPlan::VideoMissing);
    }
}
