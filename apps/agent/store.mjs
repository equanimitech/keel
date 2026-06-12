// @ts-check
// keel agent store — the only I/O. Config + state repository over ~/.keel, plus stdin.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mergeTarget, mergeWatchlist, emptyState, logFileName, eventLine } from "./core.mjs";

export const KEEL_DIR = join(homedir(), ".keel");
export const TARGET_ID = "claude-code";
const CONFIG_PATH = join(KEEL_DIR, "config.json");
const STATE_PATH = join(KEEL_DIR, "state.json");

/** @returns {import("./core.mjs").Target} */
export function loadTarget(id = TARGET_ID) {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { /* defaults */ }
  return mergeTarget(cfg?.targets?.[id]);
}

/** The raw (unmerged) user config for one target — provenance for `keel rules`.
 * @returns {any} */
export function loadRawTarget(id = TARGET_ID) {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8"))?.targets?.[id] ?? {}; }
  catch { return {}; }
}

/** The watchlist (config spine) — top-level in config.json, cross-target.
 * @returns {import("./core.mjs").Watchlist} */
export function loadWatchlist() {
  try { return mergeWatchlist(JSON.parse(readFileSync(CONFIG_PATH, "utf8"))?.watchlist); }
  catch { return mergeWatchlist(); }
}

/** @returns {import("./core.mjs").State} */
export function loadState() {
  try { return { ...emptyState(), ...JSON.parse(readFileSync(STATE_PATH, "utf8")) }; }
  catch { return emptyState(); }
}

/** @param {import("./core.mjs").State} s */
export function saveState(s) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

/** @returns {Promise<any>} parsed stdin JSON, or null */
export function readStdin() {
  return new Promise((res) => {
    if (process.stdin.isTTY) return res(null);
    let d = "";
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
  });
}

// ── Activity log (append-only JSONL, one file/day/surface) ──────
export const LOG_DIR = join(KEEL_DIR, "log");

/** Append one event. Fail-open: logging must never break the gate.
 * Single-write append of a small line — atomic under concurrent sessions.
 * @param {string} dir @param {import("./core.mjs").ActivityEvent} e */
export function appendEvent(dir, e) {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, logFileName(e.ts)), eventLine(e));
    return true;
  } catch { return false; }
}

/** Read one day's events; missing/corrupt file → []. Skips torn/foreign lines.
 * @param {string} dir @param {number} ts
 * @returns {import("./core.mjs").ActivityEvent[]} */
export function readEvents(dir, ts) {
  try {
    return readFileSync(join(dir, logFileName(ts)), "utf8")
      .split("\n").filter(Boolean)
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  } catch { return []; }
}
