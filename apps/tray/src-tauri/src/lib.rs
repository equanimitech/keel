//! keel tray — menubar-only desktop attention logger.
//!
//! No windows, no dock icon. Two sensors (frontmost app via `x-win`, system
//! idle via IOKit `HIDIdleTime` through `user-idle`) feed an append-only JSONL
//! log in `~/.keel/log/`. Pure logic lives in `domain`; file I/O in `writer`;
//! this module wires sensors, tray menu, and state. Everything fails open:
//! a logging error drops the event, a permission error keeps the tray alive.

mod domain;
mod writer;

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Manager, RunEvent, Wry};
use user_idle::UserIdle;
use x_win::get_active_window;

use domain::IdleTransition;

/// Sensor poll cadence (~1–2s, like the desktop app's window tracking).
const POLL_INTERVAL: Duration = Duration::from_millis(1500);

const MACOS_PRIVACY_SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ── Logger (writer orchestration + today counter) ───────────────

struct Logger {
    dir: PathBuf,
    paused: AtomicBool,
    permission_needed: AtomicBool,
    count_today: AtomicU64,
    today_file: Mutex<String>,
}

impl Logger {
    fn new(dir: PathBuf) -> Self {
        let today = domain::local_log_file_name(now_ms());
        let count = writer::count_lines(&dir.join(&today));
        Logger {
            dir,
            paused: AtomicBool::new(false),
            permission_needed: AtomicBool::new(false),
            count_today: AtomicU64::new(count),
            today_file: Mutex::new(today),
        }
    }

    /// Roll the today-counter over a local-midnight boundary (reseeds from disk).
    fn refresh_day(&self) {
        let wall = domain::local_log_file_name(now_ms());
        if let Ok(mut today) = self.today_file.lock() {
            if *today != wall {
                self.count_today
                    .store(writer::count_lines(&self.dir.join(&wall)), Ordering::SeqCst);
                *today = wall;
            }
        }
    }

    /// Build + append one event (fail-open). Returns today's event count.
    fn emit(
        &self,
        kind: &str,
        ts: u64,
        payload: serde_json::Value,
        duration_ms: Option<u64>,
    ) -> u64 {
        self.refresh_day();
        let file = domain::local_log_file_name(ts);
        let event =
            domain::build_event(uuid::Uuid::new_v4().to_string(), kind, ts, payload, duration_ms);
        let written = domain::event_line(&event)
            .map(|line| writer::append_line(&self.dir, &file, &line))
            .unwrap_or(false);
        if written {
            let is_today = self
                .today_file
                .lock()
                .map(|today| *today == file)
                .unwrap_or(false);
            if is_today {
                self.count_today.fetch_add(1, Ordering::SeqCst);
            }
        }
        self.count_today.load(Ordering::SeqCst)
    }
}

// ── Tray menu handles ───────────────────────────────────────────

struct TrayUi {
    menu: Menu<Wry>,
    status: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
    permission: MenuItem<Wry>,
}

fn status_text(events_today: u64) -> String {
    format!("keel — {} events today", events_today)
}

fn set_status(app: &AppHandle, events_today: u64) {
    let ui = app.state::<TrayUi>();
    let _ = ui.status.set_text(status_text(events_today));
}

fn toggle_pause(app: &AppHandle) {
    let logger = app.state::<Logger>();
    let ui = app.state::<TrayUi>();
    let was_paused = logger.paused.fetch_xor(true, Ordering::SeqCst);
    let kind = if was_paused { "logger_resumed" } else { "logger_paused" };
    let count = logger.emit(kind, now_ms(), json!({}), None);
    let _ = ui
        .toggle
        .set_text(if was_paused { "Pause logging" } else { "Resume logging" });
    set_status(app, count);
}

/// x-win failed (most likely missing macOS permission): surface a clickable
/// settings item, keep the tray alive, log nothing.
fn flag_permission_needed(app: &AppHandle) {
    let logger = app.state::<Logger>();
    if !logger.permission_needed.swap(true, Ordering::SeqCst) {
        let ui = app.state::<TrayUi>();
        let _ = ui.menu.insert(&ui.permission, 1);
    }
}

fn clear_permission_needed(app: &AppHandle) {
    let logger = app.state::<Logger>();
    if logger.permission_needed.swap(false, Ordering::SeqCst) {
        let ui = app.state::<TrayUi>();
        let _ = ui.menu.remove(&ui.permission);
    }
}

// ── Sensors ─────────────────────────────────────────────────────

fn spawn_sensors(app: AppHandle) {
    thread::spawn(move || {
        let mut last_focus: Option<(String, String)> = None;
        let mut idle_since: Option<u64> = None;

        loop {
            thread::sleep(POLL_INTERVAL);
            let logger = app.state::<Logger>();
            if logger.paused.load(Ordering::SeqCst) {
                // Drop sensor state so resuming re-emits the current focus
                // and never closes an idle span it didn't observe.
                last_focus = None;
                idle_since = None;
                continue;
            }
            let now = now_ms();

            // Idle (IOKit HIDIdleTime via user-idle).
            if let Ok(idle) = UserIdle::get_time() {
                let idle_ms = idle.as_milliseconds() as u64;
                let (next, transition) =
                    domain::idle_transition(idle_since, now, idle_ms, domain::IDLE_THRESHOLD_MS);
                idle_since = next;
                match transition {
                    Some(IdleTransition::Start { ts }) => {
                        let count = logger.emit(
                            "idle_start",
                            ts,
                            json!({ "thresholdMs": domain::IDLE_THRESHOLD_MS }),
                            None,
                        );
                        set_status(&app, count);
                    }
                    Some(IdleTransition::End { ts, duration_ms }) => {
                        let count = logger.emit("idle_end", ts, json!({}), Some(duration_ms));
                        set_status(&app, count);
                    }
                    None => {}
                }
            }

            // Frontmost app (x-win, same approach as apps/desktop).
            match get_active_window() {
                Ok(active) => {
                    clear_permission_needed(&app);
                    let app_name = active.info.name.clone();
                    let title = domain::cap_title(&active.title, domain::TITLE_CAP);
                    if domain::focus_changed(last_focus.as_ref(), &app_name, &title) {
                        let count = logger.emit(
                            "app_focus",
                            now,
                            domain::app_focus_payload(
                                &app_name,
                                &title,
                                active.position.is_full_screen,
                            ),
                            None,
                        );
                        last_focus = Some((app_name, title));
                        set_status(&app, count);
                    }
                }
                Err(_) => {
                    // Fail-open: no event, tray stays alive, menu offers settings.
                    flag_permission_needed(&app);
                }
            }
        }
    });
}

// ── App ─────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Menubar-only: no dock icon (LSUIElement covers the bundle;
            // this covers `tauri dev`).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let logger = Logger::new(writer::log_dir());
            let count = logger.emit(
                "logger_started",
                now_ms(),
                json!({ "appVersion": env!("CARGO_PKG_VERSION") }),
                None,
            );
            app.manage(logger);

            let status =
                MenuItem::with_id(app, "status", status_text(count), false, None::<&str>)?;
            let toggle =
                MenuItem::with_id(app, "toggle", "Pause logging", true, None::<&str>)?;
            let permission = MenuItem::with_id(
                app,
                "permission",
                "permission needed — click to open settings",
                true,
                None::<&str>,
            )?;
            let open = MenuItem::with_id(app, "open", "Open data folder", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &toggle, &open, &separator, &quit])?;

            let tray = app
                .tray_by_id("main")
                .ok_or("tray icon 'main' missing from tauri.conf.json")?;
            tray.set_menu(Some(menu.clone()))?;
            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "toggle" => toggle_pause(app),
                "open" => {
                    let logger = app.state::<Logger>();
                    let _ = Command::new("open").arg(&logger.dir).spawn();
                }
                "permission" => {
                    let _ = Command::new("open").arg(MACOS_PRIVACY_SETTINGS_URL).spawn();
                }
                "quit" => app.exit(0),
                _ => {}
            });

            app.manage(TrayUi { menu, status, toggle, permission });

            spawn_sensors(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building keel tray")
        .run(|_app, event| {
            // No windows exist; never let an implicit exit request stop the tray.
            if let RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
