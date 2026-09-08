// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct EngineState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[tauri::command]
async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let mut child_guard = state.child.lock().unwrap();
    if child_guard.is_some() {
        return Ok("Engine already running".to_string());
    }

    // Kill any orphaned rqbit processes to prevent memory/disk leaks across crashes
    let _ = std::process::Command::new("pkill")
        .arg("-9")
        .arg("rqbit")
        .status();

    let output_folder = "/tmp/grid-play-downloads";
    let _ = std::fs::remove_dir_all(output_folder); // cleanup previous sessions
    let _ = std::fs::create_dir_all(output_folder);

    let sidecar_command = app
        .shell()
        .sidecar("rqbit")
        .map_err(|e| {
            println!("Sidecar builder error: {}", e);
            e.to_string()
        })?
        .arg("server")
        .arg("start")
        .arg(output_folder);

    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        println!("Sidecar spawn error: {}", e);
        e.to_string()
    })?;

    *child_guard = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                println!("rqbit: {:?}", String::from_utf8_lossy(&line));
            }
        }
    });

    Ok("Engine started".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_torrent_engine])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_state_initialization() {
        let state = EngineState {
            child: Mutex::new(None),
        };
        assert!(state.child.lock().unwrap().is_none());
    }
}
