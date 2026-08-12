#!/usr/bin/env node
// Is the desktop writer's Screen Recording grant actually in effect?
//
// `tail -f` cannot answer this and the menu cannot either: without the grant,
// x-win still returns Ok and CGWindowList simply reports every window title as
// "". The writer looks healthy, events keep landing, and every title is empty —
// the failure the tray README calls silent degradation.
//
// Prints counts only. Window titles are private; they are inspected here and
// never echoed.
//
// Usage:  node scripts/tray-title-health.mjs [minutes=10]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(process.env.KAIROS_HOME || join(homedir(), ".kairos"), "keel", "log");
const now = new Date();
const p = (n) => String(n).padStart(2, "0");
const file = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.desktop.jsonl`;

const windowMin = Number(process.argv[2] ?? 10);
const cutoff = Date.now() - windowMin * 60_000;

let lines;
try {
  lines = readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean);
} catch {
  console.log(`no desktop log for today (${file}) — the tray has written nothing`);
  process.exit(2);
}

const kinds = {};
let switches = 0;
let titled = 0;
let lastTs = 0;
for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (!(e.ts >= cutoff)) continue;
  kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  lastTs = Math.max(lastTs, e.ts ?? 0);
  if (e.kind !== "app_switched") continue;
  switches++;
  if ((e.payload?.window_title ?? "") !== "") titled++;
}

const kindLine = Object.entries(kinds).map(([k, n]) => `${k}=${n}`).join(" ") || "(none)";
console.log(`last ${windowMin}min: ${kindLine}`);
console.log(`app_switched: ${switches} · with a title: ${titled} · blank: ${switches - titled}`);
console.log(lastTs ? `most recent event: ${Math.round((Date.now() - lastTs) / 1000)}s ago` : "no events in window");

if (switches === 0) {
  console.log("VERDICT: no app switches in the window — switch apps a few times and re-run");
  process.exit(3);
}
if (titled === 0) {
  console.log("VERDICT: every title blank — the Screen Recording grant is NOT in effect");
  process.exit(1);
}
console.log("VERDICT: titles are flowing — the grant is live");
