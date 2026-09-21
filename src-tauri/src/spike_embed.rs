//! SPIKE (`spike/windows-mpv-wid-overlay`): does Grid's Svelte UI composite on
//! top of an embedded mpv video surface inside a single Tauri window?
//!
//! This module exists to answer one question and then be deleted or promoted.
//! It is not wired into the real playback path: `lib.rs` exposes it as
//! `spike_*` commands that only the `/spike` route calls.
//!
//! # The question
//!
//! `.backlog/PLAN-windows-playback-mpv.md` D2 rejected embedding because the
//! compositing behaviour was considered undebuggable. Stremio ships exactly
//! this arrangement (`Stremio/stremio-shell-ng`, `stremio_player/player.rs`
//! sets mpv's `wid` to the main window and puts a transparent WebView2 over
//! it), so it is achievable in principle. What is unknown is whether it works
//! through *Tauri's* window management rather than hand-rolled Win32.
//!
//! Concretely: mpv's `--wid` child window and WebView2's child window are
//! siblings under Grid's top-level HWND. For the video to be visible at all,
//! WebView2 must render transparently *and* composite against its sibling
//! rather than against the window background. That is the spike.
//!
//! # Why this keeps Grid MIT
//!
//! `--wid` is a command-line option on the stock `mpv.exe`, so the sidecar
//! stays a separate process over JSON IPC. D7 ("never `libmpv-2.dll`") is
//! untouched and no LGPL mpv build is required. Only D2 and D4 are in question.

// The spike's Windows plumbing is unreferenced on Linux and macOS, the same way
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

/// Maps a Win32 window class name to the role it plays in the spike.
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
/// Returned rather than performed so the decision is testable off-Windows: the
/// spike has to distinguish "compositing does not work" from "we never found
/// the windows to order", and those look identical from a screenshot.
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
    /// Returns a human-readable report: the spike is run by a person looking at
    /// a screen, and "which windows were found" is the first thing to check
    /// when nothing is visible.
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
                    format!("video pushed behind the UI. children: [{inventory}]")
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
        // screen, and the one the spike most needs told apart from it.
        let children = vec![(0x10, "Chrome_WidgetWin_1".to_string())];

        assert_eq!(plan_z_order(&children), ZOrderPlan::VideoMissing);
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
