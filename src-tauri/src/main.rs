#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The desktop shell is a thin window over the bundled Next.js server: spawn
/// it from the app resources, wait until it answers, point the webview at it,
/// and kill it on exit. In dev, `tauri dev` runs `next dev` instead and this
/// binary only opens the window.

struct ServerProcess(Mutex<Option<Child>>);

fn port() -> u16 {
    std::env::var("HEALCHA_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4823)
}

fn reachable(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(300),
    )
    .is_ok()
}

fn spawn_server(app: &tauri::AppHandle, port: u16) -> Option<Child> {
    if reachable(port) {
        return None; // another instance already serves this port
    }
    let server_dir = app
        .path()
        .resource_dir()
        .expect("no resource dir")
        .join("server");
    let data_dir = app.path().app_data_dir().expect("no app data dir");
    std::fs::create_dir_all(&data_dir).ok();

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", "node server.js"]);
        c
    } else {
        // Login shell so Homebrew/nvm/asdf installs of node are on PATH —
        // double-clicked apps don't inherit the user's shell environment.
        let shell = if cfg!(target_os = "macos") { "/bin/zsh" } else { "/bin/sh" };
        let mut c = Command::new(shell);
        c.args(["-lc", "exec node server.js"]);
        c
    };
    let child = cmd
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("HEALCHA_DATA_DIR", &data_dir)
        .spawn()
        .expect("could not launch the bundled server — is Node.js installed?");
    Some(child)
}

fn main() {
    let port = port();
    tauri::Builder::default()
        .setup(move |app| {
            if !tauri::is_dev() {
                let child = spawn_server(app.handle(), port);
                app.manage(ServerProcess(Mutex::new(child)));
                let deadline = Instant::now() + Duration::from_secs(60);
                while !reachable(port) {
                    assert!(Instant::now() < deadline, "server did not come up on :{port}");
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
                .title("healcha")
                .inner_size(1360.0, 900.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(server) = app.try_state::<ServerProcess>() {
                    if let Some(mut child) = server.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
