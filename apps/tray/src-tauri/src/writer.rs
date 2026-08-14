//! keel tray writer — the only file I/O. Append-only JSONL over `~/.kairos/keel/log/`.
//!
//! Fail-open everywhere: any I/O error drops the event and returns `false`;
//! the logger must never crash or block the tray.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// keel's own subtree of the kairos vault: `$KAIROS_HOME/keel` (default `~/.kairos/keel`).
/// Resolution mirrors `store.mjs` exactly, so the two writers can never disagree about
/// where the substrate is. `KEEL_HOME` overrides the subtree outright.
///
/// Only ever keel's subtree — the kernel's collections (areas, moments, activeMoment)
/// sit at the vault root and the tray has no business writing there.
pub fn keel_dir() -> PathBuf {
    if let Some(keel) = std::env::var_os("KEEL_HOME") {
        return PathBuf::from(keel);
    }
    vault_dir().join("keel")
}

/// The kairos vault root: `$KAIROS_HOME` (default `~/.kairos`). The kernel's
/// own collections live here. `KEEL_HOME` deliberately does NOT move it — that
/// variable relocates keel's subtree, not the kernel's.
pub fn vault_dir() -> PathBuf {
    match std::env::var_os("KAIROS_HOME") {
        Some(vault) => PathBuf::from(vault),
        None => match std::env::var_os("HOME") {
            Some(home) => PathBuf::from(home).join(".kairos"),
            None => PathBuf::from(".kairos"),
        },
    }
}

/// `~/.kairos/habits.json` — kernel-owned, defined in zenborg. Read-only here:
/// keel never writes the kernel's collections. Fail-open, so a missing vault
/// yields an empty string and the wheel comes back empty rather than erroring.
pub fn read_habits() -> String {
    fs::read_to_string(vault_dir().join("habits.json")).unwrap_or_default()
}

/// `~/.kairos/areas.json` — kernel-owned, same one-way seam as habits: zenborg
/// edits, keel mirrors, never the reverse. Read for the area colour a habit
/// inherits. Fail-open.
pub fn read_areas() -> String {
    fs::read_to_string(vault_dir().join("areas.json")).unwrap_or_default()
}

/// `~/.kairos/keel/log` — same substrate directory as the agent surface.
pub fn log_dir() -> PathBuf {
    keel_dir().join("log")
}

/// `<dir>/state.json` — the agent surface's state document. The tray reads all
/// of it and writes exactly two fields of it (the granularity ceiling and its
/// day stamp), so it must never write a document it did not first read.
pub fn state_path(dir: &Path) -> PathBuf {
    dir.join("state.json")
}

/// The state document as raw JSON. Fail-open: a missing, unreadable, or garbled
/// file reads as an empty object, which every domain reader treats as "unset".
pub fn read_state(dir: &Path) -> serde_json::Value {
    fs::read_to_string(state_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

/// Write the state document atomically (temp + rename), exactly as
/// `store.mjs::writeJsonAtomic` does — a reader never sees a half-written file.
/// The temp name carries the pid so the two writers cannot collide on it.
///
/// This is last-writer-wins against the agent CLI, which is why callers must
/// read → modify → write in one breath rather than caching the document.
/// Fail-open: `false` on any error, never panics.
pub fn write_state(dir: &Path, state: &serde_json::Value) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let Ok(body) = serde_json::to_string_pretty(state) else {
        return false;
    };
    let tmp = dir.join(format!("state.json.{}.tmp", std::process::id()));
    if fs::write(&tmp, body).is_err() {
        return false;
    }
    if fs::rename(&tmp, state_path(dir)).is_err() {
        let _ = fs::remove_file(&tmp);
        return false;
    }
    true
}

/// Append one already-serialized event line. Creates the directory on demand.
/// The whole line goes down in a single `write_all` on an `O_APPEND` handle —
/// atomic for small lines under concurrent writers. Fail-open: `false` on any
/// error, never panics.
pub fn append_line(dir: &Path, file_name: &str, line: &str) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    match OpenOptions::new().append(true).create(true).open(dir.join(file_name)) {
        Ok(mut file) => file.write_all(line.as_bytes()).is_ok(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A scratch directory under the OS temp dir, unique per test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("keel-tray-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn a_missing_state_file_reads_as_an_empty_document() {
        // Fail-open: first run, or a vault that hasn't been written yet.
        assert_eq!(read_state(&scratch("missing")), json!({}));
    }

    #[test]
    fn a_garbled_state_file_reads_as_an_empty_document() {
        let dir = scratch("garbled");
        fs::create_dir_all(&dir).unwrap();
        fs::write(state_path(&dir), "{ not json").unwrap();
        assert_eq!(read_state(&dir), json!({}));
    }

    #[test]
    fn state_round_trips_and_creates_the_directory() {
        let dir = scratch("roundtrip");
        let doc = json!({ "granularity": "tldr", "granularityDay": "2026-08-12", "focus": true });
        assert!(write_state(&dir, &doc));
        assert_eq!(read_state(&dir), doc);
        // Nothing left behind: the temp file was renamed, not copied.
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind");
        let _ = fs::remove_dir_all(&dir);
    }
}

