//! keel tray writer — the only file I/O. Append-only JSONL over `~/.keel/log/`.
//!
//! Fail-open everywhere: any I/O error drops the event and returns `false`;
//! the logger must never crash or block the tray.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// `~/.keel/log` — same substrate directory as the agent surface.
pub fn log_dir() -> PathBuf {
    match std::env::var_os("HOME") {
        Some(home) => PathBuf::from(home).join(".keel").join("log"),
        None => PathBuf::from(".keel").join("log"),
    }
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

/// Count events (non-empty lines) in one day file. Missing/unreadable → 0.
pub fn count_lines(path: &Path) -> u64 {
    match fs::read_to_string(path) {
        Ok(contents) => contents.lines().filter(|l| !l.trim().is_empty()).count() as u64,
        Err(_) => 0,
    }
}
