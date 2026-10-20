// Revamper: polls Shift + left mouse button, moves a parked transparent overlay
// under the cursor while a file is dragged, and runs a tray icon + settings window.
// Windows only.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;

use engine::Options;
use serde::Serialize;
use std::{
    os::windows::process::CommandExt,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[repr(C)]
#[derive(Clone, Copy)]
struct Pt {
    x: i32,
    y: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
struct MonitorInfo {
    size: u32,
    monitor: Rect,
    work: Rect,
    flags: u32,
}

#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(p: *mut Pt) -> i32;
    fn GetAsyncKeyState(vk: i32) -> i16;
    fn GetSystemMetrics(n: i32) -> i32;
    fn MonitorFromPoint(pt: Pt, flags: u32) -> isize;
    fn GetMonitorInfoW(mon: isize, info: *mut MonitorInfo) -> i32;
    fn SystemParametersInfoW(action: u32, param: u32, pv: *mut Rect, flags: u32) -> i32;
}

/// Usable screen area (taskbar excluded) of the monitor that contains the point.
fn work_area_at(x: i32, y: i32) -> Option<Rect> {
    unsafe {
        let mon = MonitorFromPoint(Pt { x, y }, 2); // MONITOR_DEFAULTTONEAREST
        let mut mi = MonitorInfo { size: std::mem::size_of::<MonitorInfo>() as u32, monitor: Rect::default(), work: Rect::default(), flags: 0 };
        if GetMonitorInfoW(mon, &mut mi) != 0 {
            Some(mi.work)
        } else {
            None
        }
    }
}

fn primary_work_area() -> Rect {
    let mut r = Rect::default();
    unsafe { SystemParametersInfoW(0x0030, 0, &mut r, 0) }; // SPI_GETWORKAREA
    r
}

const VK_LBUTTON: i32 = 0x01;
const VK_SHIFT: i32 = 0x10;
const POLL_MS: u64 = 25;
const DRAG_START_PX: i32 = 8;
const PARK: i32 = -10000;

fn key_down(vk: i32) -> bool {
    (unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000) != 0
}

fn cursor() -> (i32, i32) {
    let mut p = Pt { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut p) };
    (p.x, p.y)
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()
}

fn park(win: &WebviewWindow) {
    let _ = win.set_position(PhysicalPosition::new(PARK, PARK));
}

#[tauri::command]
fn log(msg: String) {
    println!("[ui   ] {msg}");
}

// ---------- jobs ----------

static QUEUE: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobEvent {
    id: u64,
    action: String,
    state: &'static str,
    name: String,
    index: usize,
    total: usize,
    percent: Option<f64>,
    message: String,
    output: Option<String>,
}

fn show_toast(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("toast") {
        if let Ok(size) = w.outer_size() {
            let r = primary_work_area();
            let m = (16.0 * w.scale_factor().unwrap_or(1.0)) as i32;
            let _ = w.set_position(PhysicalPosition::new(r.right - size.width as i32 - m, r.bottom - size.height as i32 - m));
        }
        let _ = w.show();
    }
}

#[tauri::command]
fn hide_toast(app: AppHandle) {
    if let Some(w) = app.get_webview_window("toast") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn reveal(path: String) {
    let _ = std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path))
        .spawn();
}

#[tauri::command]
fn run_action(app: AppHandle, action: String, paths: Vec<String>, options: Option<Options>) {
    let opts = options.unwrap_or_default();
    let id = now_ms() as u64;
    println!("[job  ] {action} on {} file(s)", paths.len());
    show_toast(&app);
    thread::spawn(move || {
        let _turn = QUEUE.lock().unwrap_or_else(|e| e.into_inner());
        run_job(&app, id, &action, paths, &opts);
    });
}

fn run_job(app: &AppHandle, id: u64, action: &str, paths: Vec<String>, opts: &Options) {
    let send = |state: &'static str, name: &str, index: usize, total: usize, percent: Option<f64>, message: String, output: Option<String>| {
        let _ = app.emit(
            "job-update",
            JobEvent { id, action: action.to_string(), state, name: name.to_string(), index, total, percent, message, output },
        );
    };
    let Some(ff) = engine::find_ffmpeg() else {
        send("error", "", 1, 1, None, "FFmpeg not found. Put it in vendor/ffmpeg/bin (see README).".into(), None);
        return;
    };
    let files: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    if action == "merge" {
        let name = format!("{} files", files.len());
        send("running", &name, 1, 1, None, "Starting".into(), None);
        let mut last = -1.0;
        let res = engine::merge(&ff, &files, opts, &mut |p| {
            let v = p.map(|x| x.floor()).unwrap_or(-2.0);
            if v != last {
                last = v;
                send("running", &name, 1, 1, p, String::new(), None);
            }
        });
        match res {
            Ok(out) => send("done", &name, 1, 1, Some(100.0), "Saved".into(), Some(out.to_string_lossy().to_string())),
            Err(e) => send("error", &name, 1, 1, None, e, None),
        }
        return;
    }
    let total = files.len();
    for (i, f) in files.iter().enumerate() {
        let name = f.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
        let index = i + 1;
        send("running", &name, index, total, None, "Starting".into(), None);
        let mut last = -1.0;
        let res = engine::process(&ff, action, f, opts, &mut |p| {
            let v = p.map(|x| x.floor()).unwrap_or(-2.0);
            if v != last {
                last = v;
                send("running", &name, index, total, p, String::new(), None);
            }
        });
        match res {
            Ok(out) => send("done", &name, index, total, Some(100.0), "Saved".into(), Some(out.to_string_lossy().to_string())),
            Err(e) => {
                println!("[job  ] {action} failed on {name}: {e}");
                send("error", &name, index, total, None, e, None)
            }
        }
    }
}

enum State {
    Idle,
    Pressed(i32, i32),
    Open,
}

fn poll(win: WebviewWindow, app: AppHandle) {
    let size = win.outer_size().unwrap();
    let (hw, hh) = (size.width as i32 / 2, size.height as i32 / 2);
    println!("[rust ] overlay size {}x{} px, polling every {} ms", size.width, size.height, POLL_MS);
    park(&win);
    let mut state = State::Idle;
    loop {
        thread::sleep(Duration::from_millis(POLL_MS));
        let (x, y) = cursor();
        let down = key_down(VK_LBUTTON);
        let shift = key_down(VK_SHIFT);
        match state {
            State::Idle => {
                if down {
                    state = State::Pressed(x, y);
                }
            }
            State::Pressed(sx, sy) => {
                if !down {
                    state = State::Idle;
                } else if shift && ((x - sx).abs() > DRAG_START_PX || (y - sy).abs() > DRAG_START_PX) {
                    let t = Instant::now();
                    let (mut nx, mut ny) = (x - hw, y - hh);
                    if let Some(wa) = work_area_at(x, y) {
                        nx = nx.min(wa.right - hw * 2).max(wa.left);
                        ny = ny.min(wa.bottom - hh * 2).max(wa.top);
                    }
                    let _ = win.set_position(PhysicalPosition::new(nx, ny));
                    let _ = app.emit("menu-open", serde_json::json!({ "ts": now_ms(), "x": x, "y": y }));
                    println!(
                        "[rust ] OPEN at ({x},{y}); ring placed at ({nx},{ny}){}; set_position + emit took {:?}",
                        if nx != x - hw || ny != y - hh { " (shifted to stay on screen)" } else { "" },
                        t.elapsed()
                    );
                    state = State::Open;
                }
            }
            State::Open => {
                if !down {
                    // give the drop event time to arrive before moving the window away
                    thread::sleep(Duration::from_millis(400));
                    let _ = app.emit("menu-close", serde_json::json!({}));
                    park(&win);
                    println!("[rust ] CLOSE (button released)");
                    state = State::Idle;
                }
            }
        }
    }
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Revamper settings")
        .inner_size(1000.0, 720.0)
        .min_inner_size(760.0, 600.0)
        .resizable(true)
        .build();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![log, run_action, hide_toast, reveal])
        .setup(|app| {
            let win = app.get_webview_window("overlay").expect("overlay window missing");
            let handle = app.handle().clone();
            thread::spawn(move || poll(win, handle));

            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Revamper", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Revamper")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => open_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            WebviewWindowBuilder::new(app.handle(), "toast", WebviewUrl::App("toast.html".into()))
                .title("Revamper toast")
                .inner_size(340.0, 96.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .focused(false)
                .visible(false)
                .build()?;
            open_settings(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Revamper");
}
