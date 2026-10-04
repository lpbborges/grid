mod cache;
mod cache_commands;
mod engine_lifecycle;
mod engine_process;
mod media_patch;
#[cfg(test)]
mod playback_engine_tests;
mod player;
mod player_commands;
mod stream_proxy;
mod subtitle_fetch;
mod subtitles;
mod trailer;
mod window_embed;

use engine_lifecycle::EngineState;
use player_commands::StreamProxyState;
use std::sync::Mutex;
use subtitle_fetch::SubtitleRateLimit;
use tauri::Manager;

/// Locks `mutex`, carrying on with the data of a poisoned one.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so it can intercept before other plugins
        // initialize (required by the plugin's own contract). Prevents two
        // app instances from ever running past startup, which is the direct
        // fix for "two instances' cleanup logic kills each other's engines".
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(EngineState {
            child: Mutex::new(None),
            pid: Mutex::new(None),
            port: Mutex::new(None),
        })
        .manage(SubtitleRateLimit::default())
        .manage(player::NativePlayerState::default())
        .manage(StreamProxyState {
            port: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            engine_lifecycle::start_torrent_engine,
            player_commands::get_stream_proxy_url,
            subtitle_fetch::fetch_torrent_subtitle,
            subtitle_fetch::fetch_external_subtitle,
            cache_commands::get_cache_manifest,
            cache_commands::upsert_cache_entry,
            cache_commands::evict_for_space,
            cache_commands::clear_cache,
            trailer::open_trailer,
            player_commands::start_native_player,
            player_commands::native_player_set_tracks,
            player_commands::native_player_set_paused,
            player_commands::native_player_seek,
            player_commands::native_player_set_volume,
            player_commands::native_player_select_audio,
            player_commands::native_player_select_subtitle,
            player_commands::native_player_set_subtitle_position,
            player_commands::native_player_set_subtitle_scale,
            player_commands::stop_native_player,
            player_commands::cache_native_subtitles
        ])
        .setup(|app| {
            // libmpv refuses to initialise unless LC_NUMERIC is "C", and GTK has
            // just set it from the environment (pt_BR and de_DE use a comma).
            // GTK initialises before `setup`, so this cannot move into `run()`.
            #[cfg(target_os = "linux")]
            // SAFETY: a static C string; nothing else in Grid changes the
            // locale, and libmpv, which reads it, is created on the first Play.
            unsafe {
                libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
            }
            match player_commands::start_stream_proxy(app.handle()) {
                Ok(port) => *lock(&app.state::<StreamProxyState>().port) = Some(port),
                Err(e) => eprintln!("Failed to bind the stream proxy: {}", e),
            }
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                        // Graceful shutdown: kill the sidecar and remove the
                        // PID file here rather than relying on Drop, since
                        // Drop on EngineState is not guaranteed to run on
                        // Tauri's close/force-quit paths.
                        let state = app_handle.state::<EngineState>();
                        if let Some(mut child) = lock(&state.child).take() {
                            let _ = child.kill();
                        }
                        *lock(&state.pid) = None;
                        *lock(&state.port) = None;
                        if let Ok(app_cache_dir) = app_handle.path().app_cache_dir() {
                            engine_lifecycle::remove_pid_file(&engine_lifecycle::pid_file_path(
                                &app_cache_dir,
                            ));
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_carries_on_with_a_poisoned_mutex() {
        let mutex = std::sync::Arc::new(Mutex::new(5));
        let poisoner = mutex.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.lock().unwrap();
            panic!("poison it");
        })
        .join();

        assert_eq!(*lock(&mutex), 5);
    }

    fn csp_directive_sources(directive: &str) -> Vec<String> {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is valid JSON");
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("app.security.csp is a string");
        csp.split(';')
            .map(str::split_whitespace)
            .find_map(|mut parts| {
                (parts.next() == Some(directive)).then(|| parts.map(String::from).collect())
            })
            .unwrap_or_default()
    }

    #[test]
    fn main_window_may_use_the_custom_titlebar_controls() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("capabilities/default.json is valid JSON");
        assert!(capability["windows"]
            .as_array()
            .expect("windows is an array")
            .contains(&serde_json::json!("main")));
        let permissions = capability["permissions"]
            .as_array()
            .expect("permissions is an array");
        for permission in [
            "core:window:allow-minimize",
            "core:window:allow-toggle-maximize",
            "core:window:allow-close",
            "core:window:allow-start-dragging",
        ] {
            assert!(
                permissions.contains(&serde_json::json!(permission)),
                "missing {permission}"
            );
        }
    }

    #[test]
    fn csp_allows_blob_media_for_subtitle_tracks() {
        // Subtitles are rendered as <track src="blob:..."> (getTorrentSubtitles /
        // getExternalSubtitles). WebKit checks <track> URLs against media-src, so
        // without blob: every subtitle silently fails to load.
        assert!(csp_directive_sources("media-src").contains(&"blob:".to_string()));
    }

    #[test]
    fn csp_still_allows_local_engine_stream_media() {
        assert!(csp_directive_sources("media-src").contains(&"http://127.0.0.1:*".to_string()));
    }

    #[test]
    fn csp_does_not_repeat_hosts_the_strem_wildcard_covers() {
        let sources = csp_directive_sources("connect-src");

        assert!(sources.contains(&"https://*.strem.io".to_string()));
        let repeated: Vec<_> = sources
            .iter()
            .filter(|source| source.ends_with(".strem.io") && !source.contains('*'))
            .collect();
        assert!(repeated.is_empty(), "{repeated:?}");
    }

    #[test]
    fn csp_allows_wikidata_for_localized_title_search() {
        assert!(
            csp_directive_sources("connect-src").contains(&"https://www.wikidata.org".to_string())
        );
    }
}
