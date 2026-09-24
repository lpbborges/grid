//! Linux: libmpv draws through its render API into a GtkGLArea that sits
//! *under* the transparent WebKitGTK webview, so Grid's Svelte controls
//! composite on top. GTK composites both in-process, which is why this works on
//! Wayland where `--wid` cannot.
//!
//! Tauri builds `window -> vbox -> webview`. This replaces the vbox with
//! `window -> overlay -> [GLArea, webview]`. The overlay must be the window's
//! *direct* child: tauri-runtime-wry's undecorated-resize handler unwraps
//! `webview.parent().parent()` as a gtk::Window on every button press and
//! aborts the process otherwise.
//!
//! Nothing in a GTK signal handler or libmpv callback may panic: neither can
//! unwind, so a panic aborts Grid.

use super::controller::Controller;
use gtk::glib;
use gtk::prelude::*;
use libmpv2::render::{OpenGLInitParams, RenderContext, RenderParam, RenderParamApiType};
use std::cell::RefCell;
use std::ffi::{c_char, c_void, CString};
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tokio::sync::oneshot;

// Process-global on purpose: `attach` runs exactly once per app run
// (guaranteed by `NativePlayerState`), so there is only ever one
// GLArea/render context to coalesce frames or latch a render failure for.
/// Coalesces mpv's "new frame" callbacks into one queued redraw.
static FRAME_QUEUED: AtomicBool = AtomicBool::new(false);
/// A failing render call is reported to the frontend once per playback, not
/// per frame. Re-armed by [`rearm_render_failure`] when a new load starts.
static RENDER_FAILED: AtomicBool = AtomicBool::new(false);
/// The first frame mpv draws is logged once, with its size and framebuffer:
/// the one sign in a log that video reaches the window at all.
static FIRST_FRAME_LOGGED: AtomicBool = AtomicBool::new(false);

/// Lets the next playback report its own render failure.
///
/// Called by `start_native_player` right after it stops the previous file
/// and before it loads the next one: the latch then covers exactly one
/// playback. Re-arming later (after `load` returns) would drop a failure
/// raised while the new file was still loading; never re-arming would
/// silence every playback after the first failed one.
pub fn rearm_render_failure() {
    RENDER_FAILED.store(false, Ordering::Release);
}

thread_local! {
    // Main-thread only. The update callback runs on an mpv thread and reaches
    // the area through MainContext::invoke, which runs here.
    static AREA: RefCell<Option<gtk::GLArea>> = const { RefCell::new(None) };
    static RENDER: RefCell<Option<RenderContext<'static>>> = const { RefCell::new(None) };
}

type EglGetProcAddress = unsafe extern "C" fn(*const c_char) -> *mut c_void;
static EGL_GET_PROC: OnceLock<Option<EglGetProcAddress>> = OnceLock::new();

fn egl_get_proc() -> Option<EglGetProcAddress> {
    *EGL_GET_PROC.get_or_init(|| unsafe {
        let lib = libc::dlopen(c"libEGL.so.1".as_ptr(), libc::RTLD_LAZY | libc::RTLD_GLOBAL);
        if lib.is_null() {
            return None;
        }
        let sym = libc::dlsym(lib, c"eglGetProcAddress".as_ptr());
        (!sym.is_null()).then(|| std::mem::transmute::<*mut c_void, EglGetProcAddress>(sym))
    })
}

/// GDK uses EGL on Wayland and usually on X11; the dlsym fallback covers a GLX
/// context, whose core entry points libGL exports directly.
fn get_proc_address(_ctx: &(), name: &str) -> *mut c_void {
    let Ok(name) = CString::new(name) else {
        return std::ptr::null_mut();
    };
    unsafe {
        if let Some(egl) = egl_get_proc() {
            let found = egl(name.as_ptr());
            if !found.is_null() {
                return found;
            }
        }
        libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr())
    }
}

type GetIntegerv = unsafe extern "C" fn(u32, *mut i32);
/// Resolved once: the lookup is a dlsym/eglGetProcAddress round trip, and
/// `current_framebuffer` runs on every frame.
static GL_GET_INTEGERV: OnceLock<Option<GetIntegerv>> = OnceLock::new();

fn gl_get_integerv() -> Option<GetIntegerv> {
    *GL_GET_INTEGERV.get_or_init(|| {
        let found = get_proc_address(&(), "glGetIntegerv");
        if found.is_null() {
            // Logged once, here, rather than per frame below.
            eprintln!(
                "Native player: glGetIntegerv is unavailable; drawing into framebuffer 0, \
                 where GtkGLArea may not show the video"
            );
            return None;
        }
        // SAFETY: `found` is the non-null address of glGetIntegerv, whose C
        // signature is `void (GLenum, GLint *)`.
        Some(unsafe { std::mem::transmute::<*mut c_void, GetIntegerv>(found) })
    })
}

/// GtkGLArea renders into its own framebuffer, not 0.
fn current_framebuffer() -> i32 {
    const GL_FRAMEBUFFER_BINDING: u32 = 0x8CA6;
    let Some(get_integerv) = gl_get_integerv() else {
        return 0;
    };
    let mut framebuffer = 0;
    // SAFETY: called from the render callback, where GTK has made the
    // area's GL context current; `framebuffer` is a live GLint to write to.
    unsafe { get_integerv(GL_FRAMEBUFFER_BINDING, &mut framebuffer) };
    framebuffer
}

/// Checks Tauri's layout before touching it, so a Tauri upgrade that moves the
/// webview fails here with a readable error instead of aborting on a click.
fn take_over_layout(webview: &webkit2gtk::WebView) -> Result<(gtk::Window, gtk::Box), String> {
    let parent = webview.parent().ok_or("the webview has no parent widget")?;
    let vbox = parent.downcast::<gtk::Box>().map_err(|w| {
        format!(
            "expected the webview inside a GtkBox, found {}",
            w.type_().name()
        )
    })?;
    let grandparent = vbox
        .parent()
        .ok_or("the webview's GtkBox has no parent widget")?;
    let window = grandparent.downcast::<gtk::Window>().map_err(|w| {
        format!(
            "expected the GtkBox directly inside the GtkWindow, found {}",
            w.type_().name()
        )
    })?;
    Ok((window, vbox))
}

pub async fn attach(window: &tauri::WebviewWindow, controller: Controller) -> Result<(), String> {
    let (done, ready) = oneshot::channel::<Result<(), String>>();
    window
        .with_webview(move |platform| build(platform.inner(), controller, done))
        .map_err(|e| format!("could not reach the webview: {e}"))?;
    ready
        .await
        .map_err(|_| "the video surface was never created".to_string())?
}

/// Runs on the GTK main thread.
fn build(
    webview: webkit2gtk::WebView,
    controller: Controller,
    done: oneshot::Sender<Result<(), String>>,
) {
    // Resolves `attach` exactly once, from whichever path finishes first.
    let done = RefCell::new(Some(done));
    let finish: Rc<dyn Fn(Result<(), String>)> = Rc::new(move |result| {
        if let Ok(mut slot) = done.try_borrow_mut() {
            if let Some(done) = slot.take() {
                let _ = done.send(result);
            }
        }
    });

    let (window, vbox) = match take_over_layout(&webview) {
        Ok(found) => found,
        Err(error) => {
            eprintln!("Native player surface: {error}");
            finish(Err(error));
            return;
        }
    };

    let area = gtk::GLArea::new();
    area.set_auto_render(false);
    let overlay = gtk::Overlay::new();

    // Connect before showing: realize fires synchronously when the window is
    // already mapped, and a handler connected afterwards never runs.
    {
        let controller = controller.clone();
        let finish = finish.clone();
        area.connect_realize(move |area| {
            area.make_current();
            if let Some(error) = area.error() {
                finish(Err(format!("OpenGL is not available: {error}")));
                return;
            }
            let created = controller.mpv().create_render_context([
                RenderParam::ApiType(RenderParamApiType::OpenGl),
                RenderParam::InitParams(OpenGLInitParams {
                    get_proc_address,
                    ctx: (),
                }),
            ]);
            match created {
                Ok(mut context) => {
                    context.set_update_callback(|| {
                        if !FRAME_QUEUED.swap(true, Ordering::AcqRel) {
                            glib::MainContext::default().invoke(|| {
                                FRAME_QUEUED.store(false, Ordering::Release);
                                AREA.with(|slot| {
                                    if let Ok(slot) = slot.try_borrow() {
                                        if let Some(area) = slot.as_ref() {
                                            area.queue_render();
                                        }
                                    }
                                });
                            });
                        }
                    });
                    RENDER.with(|slot| {
                        if let Ok(mut slot) = slot.try_borrow_mut() {
                            *slot = Some(context);
                        }
                    });
                    finish(Ok(()));
                }
                Err(e) => finish(Err(format!(
                    "mpv could not draw into the window: {}",
                    super::controller::describe_error(&e)
                ))),
            }
        });
    }

    area.connect_unrealize(|area| {
        // The render context must be freed with its GL context current.
        area.make_current();
        RENDER.with(|slot| {
            if let Ok(mut slot) = slot.try_borrow_mut() {
                slot.take();
            }
        });
    });

    {
        let controller = controller.clone();
        area.connect_render(move |area, _gl| {
            RENDER.with(|slot| {
                let Ok(slot) = slot.try_borrow() else { return };
                let Some(context) = slot.as_ref() else { return };
                let scale = area.scale_factor();
                let (width, height) = (area.allocated_width() * scale, area.allocated_height() * scale);
                let framebuffer = current_framebuffer();
                let rendered = context.render::<()>(framebuffer, width, height, true);
                if rendered.is_ok() && !FIRST_FRAME_LOGGED.swap(true, Ordering::AcqRel) {
                    eprintln!(
                        "Native player surface: first frame drawn ({width}x{height}, framebuffer {framebuffer})"
                    );
                }
                if let Err(e) = rendered {
                    if !RENDER_FAILED.swap(true, Ordering::AcqRel) {
                        let detail = super::controller::describe_error(&e);
                        eprintln!("Native player render failed: {detail}");
                        controller.report_failure(format!("mpv could not draw a frame: {detail}"));
                    }
                }
            });
            glib::Propagation::Stop
        });
    }

    AREA.with(|slot| {
        if let Ok(mut slot) = slot.try_borrow_mut() {
            *slot = Some(area.clone());
        }
    });

    vbox.remove(&webview);
    window.remove(&vbox);
    overlay.add(&area);
    overlay.add_overlay(&webview);
    window.add(&overlay);
    overlay.show_all();
    webview.grab_focus();
}
