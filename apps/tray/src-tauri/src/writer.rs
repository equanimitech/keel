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
    let vault = match std::env::var_os("KAIROS_HOME") {
        Some(vault) => PathBuf::from(vault),
        None => match std::env::var_os("HOME") {
            Some(home) => PathBuf::from(home).join(".kairos"),
            None => PathBuf::from(".kairos"),
        },
    };
    vault.join("keel")
}

/// `~/.kairos/keel/log` — same substrate directory as the agent surface.
pub fn log_dir() -> PathBuf {
    keel_dir().join("log")
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

