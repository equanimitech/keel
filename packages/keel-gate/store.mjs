// @ts-check
// keel-gate store — the only I/O. Config + state repository over ~/.keel, plus stdin.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mergeTarget, emptyState } from "./core.mjs";

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
