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
use std::sync::atomic::{AtomicBool, Ordering};
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

/// Input-activity sensor: 2 polls per 3s bin, 20 polls per 30s rollup.
const INPUT_POLLS_PER_BIN: usize = 2;
const INPUT_POLLS_PER_ROLLUP: usize = 20;
const INPUT_BIN_MS: u64 = 3_000;

// ── CoreGraphics HID event counters (counts only — the API cannot
// expose keycodes or content; verified to read without the Input
// Monitoring permission, macOS 15, 2026-06-12 spike) ────────────────
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceCounterForEventType(state_id: u32, event_type: u32) -> u32;
    // Screen Recording: CGWindowList degrades SILENTLY (empty window
    // titles) without the grant — x-win still returns Ok. Preflight is
    // the only honest check; request is what registers the app in the
    // Settings list and shows the one-time system prompt.
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

const HID_SYSTEM_STATE: u32 = 1; // kCGEventSourceStateHIDSystemState
const ET_LEFT_MOUSE_DOWN: u32 = 1; // kCGEventLeftMouseDown
const ET_MOUSE_MOVED: u32 = 5; // kCGEventMouseMoved
const ET_KEY_DOWN: u32 = 10; // kCGEventKeyDown
const ET_SCROLL_WHEEL: u32 = 22; // kCGEventScrollWheel

/// `[keyDown, mouseDown, scroll, mouseMoved]` counters since boot.
fn read_input_counters() -> [u32; 4] {
    unsafe {
        [
            CGEventSourceCounterForEventType(HID_SYSTEM_STATE, ET_KEY_DOWN),
            CGEventSourceCounterForEventType(HID_SYSTEM_STATE, ET_LEFT_MOUSE_DOWN),
            CGEventSourceCounterForEventType(HID_SYSTEM_STATE, ET_SCROLL_WHEEL),
            CGEventSourceCounterForEventType(HID_SYSTEM_STATE, ET_MOUSE_MOVED),
        ]
    }
}

/// Explicit opt-in, re-read once per rollup so a config flip applies
/// without restarting the tray. Missing file/key = off.
fn input_sensor_opted_in() -> bool {
    let path = dirs_home().join(".keel").join("config.json");
    std::fs::read_to_string(path)
        .map(|s| domain::input_sensor_enabled(&s))
        .unwrap_or(false)
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

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
}

impl Logger {
    fn new(dir: PathBuf) -> Self {
        Logger {
            dir,
            paused: AtomicBool::new(false),
            permission_needed: AtomicBool::new(false),
        }
    }

    /// Build + append one event (fail-open). The menubar shows STATE,
    /// never counts — magnitude is cognition for nothing in ambient UI;
    /// numbers live where you ask for them (`keel log status`, export).
    fn emit(
        &self,
        kind: &str,
        ts: u64,
        payload: serde_json::Value,
        duration_ms: Option<u64>,
    ) {
        let file = domain::local_log_file_name(ts);
        let event =
            domain::build_event(uuid::Uuid::new_v4().to_string(), kind, ts, payload, duration_ms);
        if let Some(line) = domain::event_line(&event) {
            let _ = writer::append_line(&self.dir, &file, &line);
        }
    }
}

// ── Tray menu handles ───────────────────────────────────────────

struct TrayUi {
    menu: Menu<Wry>,
    status: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
    permission: MenuItem<Wry>,
}

/// Ambient status carries STATE only — alive or paused, no numbers.
fn status_text(paused: bool) -> &'static str {
    if paused { "keel — paused" } else { "keel — observing" }
}

fn set_status(app: &AppHandle, paused: bool) {
    let ui = app.state::<TrayUi>();
    let _ = ui.status.set_text(status_text(paused));
}

fn toggle_pause(app: &AppHandle) {
    let logger = app.state::<Logger>();
    let ui = app.state::<TrayUi>();
    let was_paused = logger.paused.fetch_xor(true, Ordering::SeqCst);
    let kind = if was_paused { "writer_resumed" } else { "writer_paused" };
    logger.emit(kind, now_ms(), json!({}), None);
    let _ = ui
        .toggle
        .set_text(if was_paused { "Pause logging" } else { "Resume logging" });
    set_status(app, !was_paused);
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
        let mut focus_since: Option<u64> = None;
        let mut idle_since: Option<u64> = None;
        let mut input_enabled = input_sensor_opted_in();
        let mut input_prev: Option<[u32; 4]> = None;
        let mut input_deltas: Vec<[u64; 4]> = Vec::new();
        let mut ticks: usize = 0;

        loop {
            thread::sleep(POLL_INTERVAL);
            let logger = app.state::<Logger>();
            if logger.paused.load(Ordering::SeqCst) {
                // Drop sensor state so resuming re-emits the current focus
                // and never closes a span (focus or idle) it didn't observe;
                // input bins are discarded, never emitted across a pause.
                last_focus = None;
                focus_since = None;
                idle_since = None;
                input_prev = None;
                input_deltas.clear();
                continue;
            }
            let now = now_ms();
            ticks = ticks.wrapping_add(1);

            // Input activity (counts only, default-off). The opt-in is
            // re-read once per rollup so config flips apply live.
            if ticks % INPUT_POLLS_PER_ROLLUP == 0 {
                input_enabled = input_sensor_opted_in();
            }
            if input_enabled {
                let counters = read_input_counters();
                if let Some(prev) = input_prev {
                    input_deltas.push([
                        domain::counter_delta(prev[0], counters[0]),
                        domain::counter_delta(prev[1], counters[1]),
                        domain::counter_delta(prev[2], counters[2]),
                        domain::counter_delta(prev[3], counters[3]),
                    ]);
                }
                input_prev = Some(counters);
                if input_deltas.len() >= INPUT_POLLS_PER_ROLLUP {
                    let window_ms = input_deltas.len() as u64 * POLL_INTERVAL.as_millis() as u64;
                    let bins = domain::fold_into_bins(&input_deltas, INPUT_POLLS_PER_BIN);
                    if let Some(payload) = domain::input_rollup(&bins, INPUT_BIN_MS) {
                        logger.emit("input_activity", now, payload, Some(window_ms));
                    }
                    input_deltas.clear();
                }
            } else {
                input_prev = None;
                input_deltas.clear();
            }

            // Idle (IOKit HIDIdleTime via user-idle).
            if let Ok(idle) = UserIdle::get_time() {
                let idle_ms = idle.as_milliseconds() as u64;
                let (next, transition) =
                    domain::idle_transition(idle_since, now, idle_ms, domain::IDLE_THRESHOLD_MS);
                idle_since = next;
                match transition {
                    Some(IdleTransition::Start { ts }) => {
                        logger.emit(
                            "idle_start",
                            ts,
                            json!({ "thresholdMs": domain::IDLE_THRESHOLD_MS }),
                            None,
                        );
                    }
                    Some(IdleTransition::End { ts, duration_ms }) => {
                        logger.emit("idle_end", ts, json!({}), Some(duration_ms));
                    }
                    None => {}
                }
            }

            // Frontmost app (x-win, same approach as apps/desktop).
            match get_active_window() {
                Ok(active) => {
                    // Ok(...) alone doesn't prove the grant (titles fail
                    // silently) — only clear on a passing preflight.
                    if unsafe { CGPreflightScreenCaptureAccess() } {
                        clear_permission_needed(&app);
                    }
                    let app_name = active.info.name.clone();
                    let title = domain::cap_title(&active.title, domain::TITLE_CAP);
                    if domain::focus_changed(last_focus.as_ref(), &app_name, &title) {
                        logger.emit(
                            "app_switched",
                            now,
                            domain::app_switch_payload(
                                &app_name,
                                &title,
                                active.position.is_full_screen,
                            ),
                            // durationMs closes the previous focus span —
                            // absent on the first sample after start/pause.
                            domain::switch_duration(focus_since, now),
                        );
                        last_focus = Some((app_name, title));
                        focus_since = Some(now);
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
        // One writer per machine: a second launch exits immediately
        // instead of duplicating every event in the log.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            // Menubar-only: no dock icon (LSUIElement covers the bundle;
            // this covers `tauri dev`).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let logger = Logger::new(writer::log_dir());
            // Writer epoch marker — same kind as the browser surface.
            logger.emit(
                "writer_started",
                now_ms(),
                json!({ "appVersion": env!("CARGO_PKG_VERSION") }),
                None,
            );
            app.manage(logger);

            let status =
                MenuItem::with_id(app, "status", status_text(false), false, None::<&str>)?;
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

            // Without Screen Recording, titles log as "" forever and no
            // prompt ever appears (the API never errors). Ask explicitly.
            if !unsafe { CGPreflightScreenCaptureAccess() } {
                unsafe { CGRequestScreenCaptureAccess() };
                flag_permission_needed(app.handle());
            }

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
