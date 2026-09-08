// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct EngineState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
    port: Mutex<Option<u16>>,
}

#[tauri::command]
async fn start_torrent_engine(
    app: tauri::AppHandle,
    state: State<'_, EngineState>,
) -> Result<String, String> {
    let mut child_guard = state.child.lock().unwrap();
    let mut port_guard = state.port.lock().unwrap();
    if child_guard.is_some() {
        if let Some(p) = *port_guard {
            return Ok(format!("http://127.0.0.1:{}", p));
        }
        return Ok("Engine already running".to_string());
    }

    // Kill any orphaned rqbit processes to prevent memory/disk leaks across crashes
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let mut killed_any = false;
    for process in sys.processes().values() {
        if process.name().to_string_lossy().contains("rqbit") {
            process.kill();
            killed_any = true;
        }
    }
    // Wait for orphaned processes to fully release their ports
    if killed_any {
        for _ in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            sys.refresh_all();
            let still_alive = sys
                .processes()
                .values()
                .any(|p| p.name().to_string_lossy().contains("rqbit"));
            if !still_alive {
                break;
            }
        }
    }

    let output_folder = std::env::temp_dir().join("grid-play-downloads");
    let _ = std::fs::remove_dir_all(&output_folder); // cleanup previous sessions
    let _ = std::fs::create_dir_all(&output_folder);

    // Find a free ephemeral port for the HTTP API
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| e.to_string())?
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let sidecar_command = app
        .shell()
        .sidecar("rqbit")
        .map_err(|e| {
            println!("Sidecar builder error: {}", e);
            e.to_string()
        })?
        .arg("--http-api-listen-addr")
        .arg(format!("127.0.0.1:{}", port))
        .arg("--listen-port")
        .arg("0")
        .arg("server")
        .arg("start")
        .arg(output_folder);

    let (mut rx, child) = sidecar_command.spawn().map_err(|e| {
        println!("Sidecar spawn error: {}", e);
        e.to_string()
    })?;

    *child_guard = Some(child);
    *port_guard = Some(port);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("rqbit: {:?}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("rqbit: {:?}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });

    Ok(format!("http://127.0.0.1:{}", port))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState {
            child: Mutex::new(None),
            port: Mutex::new(None),
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
            port: Mutex::new(None),
        };
        assert!(state.child.lock().unwrap().is_none());
    }
}
