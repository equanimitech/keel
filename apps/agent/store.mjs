// @ts-check
// keel agent store — the only I/O. Config + state repository over ~/.kairos/keel, plus stdin.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mergeTarget, mergeWatchlist, mergeDesktopSensors, emptyState, logFileName, browserLogFileName, eventLine, momentFrictionAt } from "./core.mjs";

// The kairos vault is the shared home, so keel's own files live INSIDE it as a subtree
// keel owns: `$KAIROS_HOME/keel/`. The one-way seam is unchanged and worth stating
// precisely — keel never writes the kernel's collections (areas, moments, activeMoment,
// dayNotes, all at the vault root); it writes only its own subtree. One knob moves both:
// point `KAIROS_HOME` at `~/.kairos-dev` and the log follows the dev vault.
//
// `KEEL_HOME` still overrides the subtree outright, and matches what garmin_sync.py
// already honours. Without it the hook handlers can only ever be exercised against the
// real log, which makes an end-to-end test indistinguishable from corrupting the record.
//
// Migrated 2026-08-07 from `~/.keel`, which is now a symlink to this path so any call
// site still saying `~/.keel` keeps working.
export const KAIROS_DIR = process.env.KAIROS_HOME || join(homedir(), ".kairos");
export const KEEL_DIR = process.env.KEEL_HOME || join(KAIROS_DIR, "keel");
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

// ── Rules (the `fences` collection) ────────────────────────────────────
//
// MIGRATION STEP 5, "flip the readers". `~/.kairos/keel/rules/*.json` was the
// rule store: one RuleSpec per file, authored by keel's MCP, read by the tray
// and pushed to the extension. It is retired. Every rule this surface reads now
// comes from `fences.json` at the vault root — the kernel record collection
// `kairos/kernel/substrate.md` registers, written by zenborg and nobody else.
//
// Why the retirement had to wait for a writer: slice E shipped the armed record
// reading BOTH stores merged, and said plainly why. zenborg's only fence writer
// was `sessionFenceRule`, which produces `scope.surface: "session"` rules that
// reach no browser, so a fences-only read would have shipped an inert feature.
// zenborg now has `declareHostBlock`, `declareBrowserGate` and `seedHostBlocks`,
// all of them browser-scoped, so the second store has nothing left to carry.
//
// What this costs, stated rather than discovered: a rule still sitting in the
// old directory does nothing at all. Migrating those records into `fences` is a
// deliberate act taken through zenborg's tools, not something this reader should
// do quietly on the principal's behalf — a reader that adopted files it found
// would be a second writer of a single-writer collection.

/** Every rule in force, from the one store.
 *
 * Ordered by id for stability, where the directory reader ordered by filename.
 * @returns {any[]} */
export function loadRuleSpecs() {
  return Object.entries(loadFences())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, rule]) => rule)
    .filter((r) => r !== null && typeof r === "object");
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
// keel's own domain→area map stays keel's business — it now sits in keel's subtree of
// the vault rather than in a separate dotdir, but the ownership is the same as ever.
// `KAIROS_DIR` is defined at the top of this file, where `KEEL_DIR` derives from it.
export const AREAS_PATH = join(KAIROS_DIR, "areas.json");
export const ACTIVE_MOMENT_PATH = join(KAIROS_DIR, "activeMoment.json");
export const MOMENTS_PATH = join(KAIROS_DIR, "moments.json");
export const PHASE_CONFIGS_PATH = join(KAIROS_DIR, "phaseConfigs.json");
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

/** Phase bands from the kernel — when MORNING/AFTERNOON/EVENING/NIGHT start and end.
 *
 * Zenborg is the only writer; keel reads them exactly as it reads areas.json. This
 * replaced keel's own `watches` on 2026-08-18: two declarations of the same day carved
 * into the same four names had already drifted apart, and only one of them was the one
 * moments are actually placed against.
 *
 * The vault keys collections by id, so an object is unwrapped to its values; a plain
 * array is accepted too, matching `loadAreas`. Ordered by `order` so `bandAt` scans the
 * day in sequence rather than in whatever order the file happens to hold.
 *
 * Fails soft to `[]` — an unreadable vault leaves events untagged, never throws in a hook.
 * @returns {{phase: string, startHour: number, endHour: number}[]} */
export function loadPhaseConfigs() {
  /** @type {any} */
  let raw;
  try { raw = JSON.parse(readFileSync(PHASE_CONFIGS_PATH, "utf8")); } catch { return []; }
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return list
    .filter((b) => b && typeof b.phase === "string"
      && Number.isFinite(Number(b.startHour)) && Number.isFinite(Number(b.endHour)))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((b) => ({ phase: String(b.phase), startHour: Number(b.startHour), endHour: Number(b.endHour) }));
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
  // `RuleScope` first, because a rule that carries one has said which surface it
  // is for and that answer is not negotiable. A session or desktop scope reaches
  // no browser and yields nothing — falling through to the flat shape would let
  // a fence declared for a filesystem path block a domain it happens to name.
  const scope = rule?.scope;
  if (scope && typeof scope === "object" && "surface" in scope) {
    if (scope.surface !== "browser") return [];
    const domain = typeof scope.domain === "string" ? scope.domain.trim() : "";
    return domain ? [domain] : [];
  }

  // The flat shape: keel's own rules named `domains` directly and `areas` for
  // membership resolved at serve time, so a rule stays correct as the map grows.
  // Kept because records written before `RuleScope` may still be in `fences`.
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
  for (const rule of loadRuleSpecs()) {
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

/** The gate's declared friction, projected whole instead of flattened to a prompt.
 *
 * This used to be `p.frictionType?.prompt ?? "Still what you came for?"`, which meant a
 * gate declaring `{type: "delay", seconds: 20}` — having no `.prompt` — was shipped as
 * the DEFAULT intention prompt and rendered as an intention gate. The author's mechanism
 * was not merely unimplemented; it was discarded and silently replaced with a different
 * one. Same failure as a selector that matches nothing: the rule reads as one thing and
 * the runtime does another, with no error anywhere.
 *
 * An unrecognised type is now surfaced IN the prompt rather than swallowed. Loud beats
 * silent — the whole point of this projection.
 * @param {any} frictionType @returns {any} */
/** A redirect target, or `null` if it is not one keel will navigate to.
 *
 * Only absolute http(s) and site-relative paths. `javascript:` and `data:` are the
 * reason this exists: the target ends up in `window.location.assign` inside a content
 * script on every page, so a scheme that executes is an injection primitive rather than
 * a reroute. Rules are local files today, but they arrive over the relay and are edited
 * by hand, and neither of those is a trust boundary worth resting a script execution on.
 *
 * Validated here AND at the page (`gate/arm.ts`). The host stops a bad rule from ever
 * shipping; the page stops a stale mirror that predates this check.
 * @param {unknown} to @returns {string|null} */
export function safeRedirect(to) {
  if (typeof to !== "string" || !to.trim()) return null;
  const url = to.trim();
  // Site-relative. No scheme to smuggle, and `//host` is excluded because a
  // protocol-relative URL is an absolute one wearing a relative costume.
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function projectFriction(frictionType) {
  const t = frictionType?.type;
  if (t === "delay") return { type: "delay", seconds: Number(frictionType.seconds) || 0 };
  if (t === "breath") return { type: "breath", cycles: Number(frictionType.cycles) || 3 };
  if (t === "confirmation") return { type: "confirmation" };
  if (t === "intention") {
    return { type: "intention", prompt: frictionType.prompt || "Still what you came for?" };
  }
  if (t) {
    return { type: "intention", prompt: `keel declared "${t}" here and cannot render it yet.` };
  }
  return { type: "intention", prompt: "Still what you came for?" };
}

/** DOM transforms declared by enabled rules — the `transform` primitive, which was
 * typed in 2026-06 and left uninterpreted until now.
 *
 * Projected as data the content script can act on without the full RuleSpec, the same
 * bargain the armed projection makes: domains travel with the transform so the page can
 * self-select, and the rule stays host-side.
 *
 * `replace` is not projected. It needs the template registry, which is its own
 * contract; an unknown replacement degrades to `hide` rather than being dropped,
 * because a rule that says "get this out of my way" is better served by hiding the
 * thing than by silently doing nothing.
 * @returns {{ruleId: string, domains: string[], targets: {primary: string, fallbacks: string[]}, replacement: any}[]} */
export function loadTransforms() {
  const out = [];
  for (const rule of loadRuleSpecs()) {
    if (rule?.defaultEnabled === false) continue;
    for (const p of rule?.primitives ?? []) {
      if (p?.kind !== "transform") continue;
      const primary = typeof p?.targets?.primary === "string" ? p.targets.primary.trim() : "";
      if (!primary) continue;
      const fallbacks = (p.targets.fallbacks ?? [])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim());
      const style = p.replacement?.style;
      out.push({
        ruleId: rule.id,
        domains: resolveRuleDomains(rule),
        targets: { primary, fallbacks },
        replacement:
          p.replacement?.type === "restyle" && style && typeof style === "object"
            ? { type: "restyle", style }
            : { type: "hide" },
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

// ── The armed record (the `fences` collection) ──────────────────────────
//
// What is in force right now, projected into the shape the browser extension
// can actuate from. `kairos/kernel/substrate.md` records why this exists as a
// PUSH rather than a read: the extension has no filesystem access and never
// will, so a process that can read the vault hands it the collection. No copy
// on disk, so the one-writer rule still holds.
//
// ONE SOURCE, as of migration step 5. It was two: `fences.json` at the vault
// root, and keel's own `~/.kairos/keel/rules/*.json`, merged, because the second
// was where the shields actually lived and the first had no browser-scoped
// writer. zenborg has one now, so the merge is gone and the readers are flipped.
// The design document calls this collection `armed.json`; `substrate.md` renamed
// it `fences` on 2026-08-20 — a garden is tended and it is fenced — and the
// contract is more recent than the spec, so the code follows the contract.
//
// The projection deliberately INVENTS NO EXIT. A cooldown with no `unlockPath`
// or a gate with no `proceedAffordance` is shipped without one, and the
// extension refuses it loudly — invariant 6 says a block with no visible exit
// is a bug, and a host that quietly supplied a default would hide the bug
// instead of surfacing it.

export const FENCES_PATH = join(KAIROS_DIR, "fences.json");

/** The `fences` collection, records keyed by rule id. Fail-open: {} when the
 * file is missing or garbled — a reader must tolerate an absent collection,
 * and this one is rebuildable besides.
 * @returns {Record<string, any>} */
export function loadFences() {
  try {
    const raw = JSON.parse(readFileSync(FENCES_PATH, "utf8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** A cooldown's unlock path as the extension's one exit shape, or null when the
 * rule declared none. Null is the invariant-6 refusal, passed through on
 * purpose. */
function projectUnlock(unlockPath) {
  const t = unlockPath?.type;
  if (t === "wait") return { label: "Wait it out", action: { type: "wait" } };
  if (t === "unlock_with_intention" && unlockPath.prompt) {
    return { label: "Unlock", action: { type: "intention", prompt: unlockPath.prompt } };
  }
  if (t === "unlock_with_delay" && Number.isFinite(Number(unlockPath.seconds))) {
    return { label: "Unlock", action: { type: "delay", seconds: Number(unlockPath.seconds) } };
  }
  if (t === "out_of_band" && unlockPath.note) {
    return { label: "Lift it", action: { type: "out_of_band", note: unlockPath.note } };
  }
  return null;
}

/** A gate's proceed affordance in the same shape. Null when undeclared. */
function projectProceed(proceedAffordance) {
  const label = proceedAffordance?.label;
  const action = proceedAffordance?.action;
  if (!label || !action?.type) return null;
  if (action.type === "redirect") {
    const to = safeRedirect(action.to);
    return to ? { label, action: { type: "redirect", to } } : null;
  }
  if (action.type === "abort") return { label, action: { type: "abort" } };
  return { label, action: { type: "continue" } };
}

/** Every browser-actuable primitive of one rule, as armed entries.
 * @returns {{kind: string, entry: any}[]} */
function armedEntriesFor(rule) {
  const domains = resolveRuleDomains(rule);
  if (domains.length === 0) return [];
  const out = [];
  for (const p of rule?.primitives ?? []) {
    if (p?.kind === "cooldown") {
      const at = p.enforcement?.at ?? "browser";
      out.push({
        kind: "cooldown",
        entry: {
          domains,
          primitive: {
            kind: "cooldown",
            enforcement: at,
            standing: Boolean(p.duration && "standing" in p.duration) || p.duration?.type === "standing",
          },
          proceed: projectUnlock(p.unlockPath),
        },
      });
    } else if (p?.kind === "gate" && p?.trigger?.type === "dwell") {
      out.push({
        kind: "gate",
        entry: {
          domains,
          primitive: {
            kind: "gate",
            everyMinutes: p.trigger.everyMinutes,
            friction: projectFriction(p.frictionType),
          },
          proceed: projectProceed(p.proceedAffordance),
          abort: { label: p.abortAffordance?.label || "Close the tab" },
        },
      });
    }
  }
  return out;
}

/** The armed record the extension caches and actuates from.
 *
 * Keyed by entry id: the rule's own id when it has one browser-actuable
 * primitive, `<ruleId>#<kind>` when it has several — so a delivery event names
 * exactly what was delivered rather than only which rule declared it.
 * @returns {Record<string, any>} */
export function loadArmed() {
  const rules = loadRuleSpecs();
  /** @type {Record<string, any>} */
  const armed = {};
  for (const rule of rules) {
    if (!rule?.id || rule?.defaultEnabled === false) continue;
    const entries = armedEntriesFor(rule);
    for (const { kind, entry } of entries) {
      const id = entries.length === 1 ? rule.id : `${rule.id}#${kind}`;
      armed[id] = {
        ...entry,
        ruleId: id,
        label: rule.name || rule.id,
        deliveryProbability: Number.isFinite(Number(rule.deliveryProbability))
          ? Number(rule.deliveryProbability)
          : 1,
      };
    }
  }
  return armed;
}
