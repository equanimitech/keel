// @ts-check
// keel agent store — the only I/O. Config + state repository over ~/.keel, plus stdin.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mergeTarget, mergeWatchlist, mergeDesktopSensors, emptyState, logFileName, browserLogFileName, eventLine, momentFrictionAt } from "./core.mjs";

// `KEEL_HOME` mirrors `KAIROS_HOME` below, and matches what garmin_sync.py already honours.
// Without it the hook handlers can only ever be exercised against the real log, which makes
// an end-to-end test indistinguishable from corrupting the record.
export const KEEL_DIR = process.env.KEEL_HOME || join(homedir(), ".keel");
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

/** Desktop (tray) sensor toggles — top-level in config.json.
 * @returns {import("./core.mjs").DesktopSensors} */
export function loadDesktopSensors() {
  try { return mergeDesktopSensors(JSON.parse(readFileSync(CONFIG_PATH, "utf8"))?.desktop); }
  catch { return mergeDesktopSensors(); }
}

/** @returns {import("./core.mjs").State} */
export function loadState() {
  try { return { ...emptyState(), ...JSON.parse(readFileSync(STATE_PATH, "utf8")) }; }
  catch { return emptyState(); }
}

/** Atomic JSON write: temp file in the same dir, then rename. Avoids torn
 * reads when a second reader (native host / agent) reads concurrently. */
export function writeJsonAtomic(path, obj) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}

/** @param {import("./core.mjs").State} s */
export function saveState(s) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(STATE_PATH, s);
}

// ── Watchlist ledger + snapshot (watchlist-seeding bootstrap) ───
export const LEDGER_PATH = join(KEEL_DIR, "watchlist-ledger.json");
export const SNAPSHOT_PATH = join(KEEL_DIR, "watchlist-snapshot.json");

/** @returns {Record<string, string>} */
export function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { return {}; }
}

/** @param {Record<string, string>} led */
export function saveLedger(led) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(LEDGER_PATH, led);
}

/** @returns {Record<string, unknown>} */
export function loadSnapshot() {
  try { return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")); } catch { return {}; }
}

/** @param {Record<string, unknown>} snap */
export function saveSnapshot(snap) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(SNAPSHOT_PATH, snap);
}

// ── Rules (~/.keel/rules/*.json) ────────────────────────────────
// One RuleSpec per file. The source of truth for policy: MCP authors here,
// the tray reads it directly, the extension pulls it over the relay. Replaces
// the three legacy lists (config.watchlist.windowed, the drogue seed, and
// vice-blocklist.txt), which were the same concept in three grammars.
export const RULES_DIR = join(KEEL_DIR, "rules");

/** Every declared rule, newest-name-first for stable ordering.
 * @returns {any[]} */
export function loadRules() {
  try {
    return readdirSync(RULES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => {
        try { return JSON.parse(readFileSync(join(RULES_DIR, f), "utf8")); } catch { return null; }
      })
      .filter((r) => r !== null);
  } catch {
    return []; // No rules dir yet — fail open, never fail closed on policy.
  }
}

/** Domains under enabled rules carrying a browser-enforced cooldown.
 * Standing cooldowns are always on; timed ones are armed per-surface, so this
 * returns the *candidate* set and the arming state decides what actually holds.
 * @returns {{ standing: string[], armable: string[] }} */
export function loadBlockDomains() {
  const standing = new Set();
  const armable = new Set();
  for (const rule of loadRules()) {
    if (rule?.defaultEnabled === false) continue;
    for (const p of rule?.primitives ?? []) {
      if (p?.kind !== "cooldown") continue;
      if ((p.enforcement?.at ?? "browser") !== "browser") continue;
      const target = p.duration && "standing" in p.duration ? standing : armable;
      for (const d of resolveRuleDomains(rule)) target.add(d);
    }
  }
  return { standing: [...standing], armable: [...armable] };
}

// ── Areas (kairos shared kernel) ────────────────────────────────
// Areas are the ONE concept keel shares with the other instruments, so they
// live in the kairos kernel rather than here: `$KAIROS_HOME/areas.json`.
// Contract + schema: equanimitech/kairos/kernel/areas.md.
//
// keel is a READER. Zenborg is the editor — areas are created, renamed and
// archived there, because that is where the garden is tended. keel never
// writes this file; a second writer is how the list forks.
//
// Since 2026-08-06 zenborg's vault root IS `$KAIROS_HOME`, so this file is the
// vault's own `areas.json` rather than a copy of it. The previous arrangement
// seeded a copy here and went stale twelve minutes later; the seeder is gone
// and there is nothing left to re-run. Dev builds of zenborg write
// `~/.kairos-dev`, so point `KAIROS_HOME` there to follow them.
//
// keel's own domain→area map stays keel's business, and stays local.
export const KAIROS_DIR = process.env.KAIROS_HOME || join(homedir(), ".kairos");
export const AREAS_PATH = join(KAIROS_DIR, "areas.json");
export const DAY_NOTES_PATH = join(KAIROS_DIR, "dayNotes.json");
export const ACTIVE_MOMENT_PATH = join(KAIROS_DIR, "activeMoment.json");
export const MOMENTS_PATH = join(KAIROS_DIR, "moments.json");
export const AREA_MAP_PATH = join(KEEL_DIR, "area-map.json");

/** The active-moment pointer — which moment the intention currently is:
 *
 *   { "momentId": "80d0f15a-…", "at": "2026-08-07T13:40:12.222Z" }
 *
 * Zenborg is the only writer (MCP or UI); keel reads it exactly as it reads
 * areas.json. `null` when missing or unparseable — `resolveActiveMoment` treats
 * that as "no intention", never as a wrong one. @returns {any|null} */
export function loadActiveMomentPointer() {
  try {
    const raw = JSON.parse(readFileSync(ACTIVE_MOMENT_PATH, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  } catch { return null; }
}

/** Moments from the kernel, keyed by id — the collection the pointer resolves against,
 * and the board the intention nudge proposes from. Fails soft to `null`.
 * @returns {Record<string, any>|null} */
export function loadMoments() {
  try {
    const raw = JSON.parse(readFileSync(MOMENTS_PATH, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  } catch { return null; }
}

/** Day notes from the kernel, keyed by ISO date:
 *
 *   { "2026-08-07": { date, title, body?, createdAt, updatedAt } }
 *
 * Zenborg is the only writer — keel reads it exactly as it reads areas.json.
 * There is no separate "signed on" flag: naming the day IS opening it, which is
 * one collection instead of two saying the same thing.
 *
 * Returns `null` when the file is missing or unparseable, which `dayIsNamed`
 * treats as fail-open: a vault keel cannot read must never be able to lock the
 * day shut. @returns {Record<string, any>|null} */
export function loadDayNotes() {
  try {
    const raw = JSON.parse(readFileSync(DAY_NOTES_PATH, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  } catch { return null; }
}

/** Areas from the kernel — live, ordered, without the archived ones.
 *
 * The vault keys collections by id. A plain array is still accepted because
 * that is the shape the pre-migration seed wrote, and a machine that has not
 * upgraded zenborg yet may still have one sitting there.
 *
 * Archived areas are filtered HERE rather than at the writer. Zenborg keeps
 * them so a log entry naming a retired area can still resolve to a name; each
 * reader then decides whether it cares. Friction does not.
 *
 * No `attitude` here, on purpose. It looks like the vault's best friction
 * signal — BEGINNING and RETURNING want protection, BEING wants none — but it
 * lives on *habits*, not areas: 0 of 20 areas carry one against 80 of 126
 * habits (measured 2026-08-06). Friction that wants to read attitude needs the
 * habits collection, or the moment that references a habit. It cannot come
 * from here, and a field that is always "" would only imply otherwise.
 *
 * Fails soft to `[]`: keel stays usable for someone who never set areas up.
 * @returns {{id: string, name: string, emoji: string, color: string, tags: string[], order: number}[]} */
export function loadAreas() {
  /** @type {any} */
  let raw;
  try { raw = JSON.parse(readFileSync(AREAS_PATH, "utf8")); } catch { return []; }
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return list
    .filter((a) => a && a.id && a.name && a.isArchived !== true)
    .map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji ?? "",
      color: a.color ?? "",
      tags: a.tags ?? [],
      order: typeof a.order === "number" ? a.order : 0,
    }))
    .sort((x, y) => x.order - y.order || x.name.localeCompare(y.name));
}

/** The allow/deny hostname pair scoped by the active moment, or null when none is.
 *
 * Reads the same three files the intention does, and resolves them through the
 * same `resolveActiveMoment` — there is one answer to "what am I doing right
 * now" and the HUD and the gate must not be able to disagree about it.
 *
 * Hostnames, never the refs themselves: a ref is a full URL and the privacy
 * posture stops URLs at this boundary. What crosses the relay is domains.
 * @param {number} [now] @returns {{allow: string[], deny: string[]}|null} */
export function loadMomentFriction(now = Date.now()) {
  return momentFrictionAt(loadActiveMomentPointer(), loadMoments(), loadAreas(), now);
}

/** Domain (or domain/path) → areaId.
 * @returns {Record<string, string>} */
export function loadAreaMap() {
  try { return JSON.parse(readFileSync(AREA_MAP_PATH, "utf8")); } catch { return {}; }
}

/** @param {Record<string, string>} map */
export function saveAreaMap(map) {
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(AREA_MAP_PATH, map);
}

/** Resolve a rule's areas to the domains currently sitting in them, unioned
 * with any domains it names directly. Area membership is looked up at serve
 * time, so a rule stays correct as the map grows.
 * @param {any} rule @returns {string[]} */
export function resolveRuleDomains(rule) {
  const map = loadAreaMap();
  const out = new Set(rule?.domains ?? []);
  for (const areaId of rule?.areas ?? []) {
    for (const [domain, id] of Object.entries(map)) {
      if (id === areaId) out.add(domain);
    }
  }
  return [...out];
}

/** What the big red button means right now: the areas it pauses and their
 * current domains. Null when no break rule is declared.
 * @returns {{areas: {name: string, emoji: string}[], domains: string[], durationMs: number} | null} */
export function loadBreakTarget() {
  const areas = loadAreas();
  for (const rule of loadRules()) {
    if (rule?.id !== "content-break" || rule?.defaultEnabled === false) continue;
    const cooldown = (rule.primitives ?? []).find((p) => p?.kind === "cooldown");
    if (!cooldown) continue;
    return {
      areas: (rule.areas ?? [])
        .map((id) => areas.find((a) => a.id === id))
        .filter(Boolean)
        .map((a) => ({ name: a.name, emoji: a.emoji, color: a.color ?? "" })),
      domains: resolveRuleDomains(rule),
      durationMs: (cooldown.duration?.baseSeconds ?? 7200) * 1000,
    };
  }
  return null;
}

/**
 * Browser events at or after `sinceTs`, from the day files.
 *
 * The backfill source. The extension's own store was emptied on every ack for
 * 51 days (delete-on-ack, removed 2026-08-06), so its history is gone while
 * the host's is intact — this is how the Areas page gets a dwell number that
 * reflects a life rather than a session.
 *
 * @param {number} sinceTs @returns {any[]}
 */
export function readBrowserEventsSince(sinceTs) {
  const out = [];
  let files;
  try { files = readdirSync(LOG_DIR).filter((f) => f.endsWith(".browser.jsonl")).sort(); }
  catch { return out; }
  for (const f of files) {
    // Skip whole day-files that close before the cutoff, rather than parsing them.
    const dayEnd = new Date(`${f.slice(0, 10)}T23:59:59.999`).getTime();
    if (Number.isFinite(dayEnd) && dayEnd < sinceTs) continue;
    let text;
    try { text = readFileSync(join(LOG_DIR, f), "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        if (e && typeof e.ts === "number" && e.ts >= sinceTs) out.push(e);
      } catch { /* skip a torn line, never fail the backfill */ }
    }
  }
  return out;
}

/** Dwell gates declared by enabled rules — what the extension needs to fire an
 * interstitial every N minutes of attended time.
 * @returns {{ruleId: string, domains: string[], everyMinutes: number, prompt: string}[]} */
export function loadDwellGates() {
  const out = [];
  for (const rule of loadRules()) {
    if (rule?.defaultEnabled === false) continue;
    for (const p of rule?.primitives ?? []) {
      if (p?.kind !== "gate" || p?.trigger?.type !== "dwell") continue;
      out.push({
        ruleId: rule.id,
        domains: resolveRuleDomains(rule),
        everyMinutes: p.trigger.everyMinutes,
        prompt: p.frictionType?.prompt ?? "Still what you came for?",
      });
    }
  }
  return out;
}

/** Atomically set watchlist.observe in config.json, preserving everything else.
 * @param {string[]} observe */
export function writeObserveList(observe) {
  /** @type {any} */
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { cfg = {}; }
  cfg.watchlist = cfg.watchlist || {};
  cfg.watchlist.observe = observe;
  if (!existsSync(KEEL_DIR)) mkdirSync(KEEL_DIR, { recursive: true });
  writeJsonAtomic(CONFIG_PATH, cfg);
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

const MAX_BROWSER_LOG_BYTES = 64 * 1024 * 1024;

/** Append validated browser events to per-day .browser.jsonl files.
 * Atomic per-line appendFileSync. Skips a day-file already at the retention
 * cap (disk guard). Returns the ids written. */
export function appendBrowserEvents(events, maxBytes = MAX_BROWSER_LOG_BYTES) {
  mkdirSync(LOG_DIR, { recursive: true });
  const written = [];
  for (const e of events) {
    try {
      const file = join(LOG_DIR, browserLogFileName(e.ts));
      let size = 0;
      try { size = statSync(file).size; } catch { /* missing → 0 */ }
      if (size >= maxBytes) continue; // retention guard: day-file full
      appendFileSync(file, JSON.stringify(e) + "\n");
      written.push(e.id);
    } catch { /* fail-open: skip this event */ }
  }
  return written;
}
