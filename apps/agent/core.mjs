// @ts-check
// keel agent core — pure domain. No I/O. The piece that later lifts into @keel/domain.

/** @typedef {"day"|"wind_down"|"lockdown"} Phase */
/** @typedef {"hide"|"dim"|"delay"|"blur"|"block"} Notch */
/** @typedef {"immediate"|"breakpoint"} Arming */
/** @typedef {number} Friction  0..1 */
/** @typedef {{ kind?: string, windDown: string, hardStop: string, reset: string, backstop?: string }} Driver */
/** @typedef {{ notch: Notch, engagesAt: Friction, arming?: Arming, maxGraceMin?: number, tools: string[], allowPaths?: string[] }} Rule */
/** @typedef {{ bellAfterMin: number, sessionGapMin: number }} Orient */
/** @typedef {{ windDown: string, lockdown: string }} Granularity */
/** @typedef {{ windDownNudge: string, lockdown: string, substitution: string, consequence: string, identity: string, signoffNudge: string, morningNudge: string, weeklyNudge: string, granularity: Granularity }} Voice */
/** @typedef {{ driver: Driver, rules: Rule[], orient: Orient, voice: Voice }} Target */
/** @typedef {{ sessionStartTs: number, lastPromptTs: number, turnLockedTs: number, lastRitualNudge: string, inferNudgedTs: number, intention: string, intentionDay: string, granularity: string, lastRuleHash: string, consentShownTs: number }} State */

/** Clock pressure is capped strictly below the full-lockdown threshold (1.0): the
 * wall-clock ramp escalates wind-down nudges but NEVER hard-locks coding on its own.
 * Lockdown engages from a sovereign act (sign-off / park) or the late `backstop`. */
export const WIND_DOWN_CEIL = 0.99;

/** @type {Target} */
export const DEFAULT_TARGET = {
  driver: { kind: "wind-down", windDown: "22:30", hardStop: "00:00", reset: "05:00", backstop: "03:00" },
  rules: [{ notch: "block", engagesAt: 1.0, arming: "breakpoint", maxGraceMin: 10,
            tools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"],
            allowPaths: ["~/journals", "~/.keel"] }],
  orient: { bellAfterMin: 120, sessionGapMin: 30 },
  voice: {
    windDownNudge: "Wind-down window — a good moment to land open work.",
    lockdown: "Coding tools are paused until {reset} — the late backstop, the one wall keel keeps. Past here your judgment isn't yours to trust; sleep is the move.",
    substitution: "",
    consequence: "",
    identity: "",
    signoffNudge: "",
    morningNudge: "",
    weeklyNudge: "",
    granularity: {
      windDown: "Keep it high-level — summaries and next steps, not deep multi-file dives.",
      lockdown: "Coarsest only — one-line status + tomorrow's first step; no detail.",
    },
  },
};

/** @returns {State} */
export const emptyState = () => ({
  sessionStartTs: 0, lastPromptTs: 0, turnLockedTs: 0, lastRitualNudge: "", inferNudgedTs: 0,
  intention: "", intentionDay: "", granularity: "", lastRuleHash: "", consentShownTs: 0,
});

/** Merge a partial target config over the defaults. @param {any} t @returns {Target} */
export function mergeTarget(t = {}) {
  return {
    driver: { ...DEFAULT_TARGET.driver, ...t.driver },
    rules: t.rules ?? DEFAULT_TARGET.rules,
    orient: { ...DEFAULT_TARGET.orient, ...t.orient },
    voice: { ...DEFAULT_TARGET.voice, ...t.voice },
  };
}

// ── Time + friction ─────────────────────────────────────────────

/** @param {string} hhmm */
export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/** nowMin in half-open [start,end), wrapping midnight if start > end. */
export function inWindow(nowMin, start, end) {
  return start > end ? nowMin >= start || nowMin < end : nowMin >= start && nowMin < end;
}

/** wind-down driver → f ∈ [0,1]: 0 day · linear ramp windDown→hardStop · 1 lockdown.
 * @param {number} nowMin @param {Driver} driver @returns {Friction} */
export function frictionAt(nowMin, driver) {
  const w = toMin(driver.windDown), h = toMin(driver.hardStop), r = toMin(driver.reset);
  if (!inWindow(nowMin, w, r)) return 0;
  if (inWindow(nowMin, h, r)) return 1;
  const span = ((h - w + 1440) % 1440) || 1;
  const into = (nowMin - w + 1440) % 1440;
  return Math.max(0, Math.min(1, into / span));
}

/** @param {Friction} f @returns {Phase} */
export function phaseOf(f) {
  if (f <= 0) return "day";
  if (f >= 1) return "lockdown";
  return "wind_down";
}

export const nowMinOf = (now) => { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); };
export const monthKey = (now) => new Date(now).toISOString().slice(0, 7);
/** The late safety net: an un-signed-off night still hard-locks from `backstop`
 * until reset. No `backstop` configured ⇒ no clock-driven lockdown ever (pure
 * sovereign). @param {number} now @param {Driver} driver */
export function backstopActive(now, driver) {
  if (!driver.backstop) return false;
  return inWindow(nowMinOf(now), toMin(driver.backstop), toMin(driver.reset));
}

/** Effective friction. The clock ramps wind-down PRESSURE but is capped below the
 * lockdown threshold (WIND_DOWN_CEIL) — it nudges, never hard-locks. Full lockdown
 * (1.0) comes only from the late `backstop` — the one wall keel keeps.
 * @param {Target} target @param {State} state @param {number} now */
export function frictionNow(target, state, now) {
  if (backstopActive(now, target.driver)) return 1;
  return Math.min(frictionAt(nowMinOf(now), target.driver), WIND_DOWN_CEIL);
}

// ── Session ─────────────────────────────────────────────────────

/** @param {State} state @param {number} nowTs @param {Orient} orient @returns {State} */
export function updateSession(state, nowTs, orient) {
  const gapMs = orient.sessionGapMin * 60_000;
  const fresh = !state.lastPromptTs || nowTs - state.lastPromptTs > gapMs;
  return { ...state, sessionStartTs: fresh ? nowTs : state.sessionStartTs, lastPromptTs: nowTs };
}
export const unbrokenMin = (/** @type {State} */ s, nowTs) =>
  s.sessionStartTs ? Math.floor((nowTs - s.sessionStartTs) / 60_000) : 0;

// ── Friction rule application (breakpoint-armed via the turn boundary) ──

/** Which rule denies this tool now? null = allow.
 * @param {Target} target @param {Friction} f @param {string|undefined} tool @param {State} state @param {number} now @returns {Rule|null} */
export function denyingRule(target, f, tool, state, now) {
  const rule = target.rules.find((r) =>
    r.notch === "block" && f >= r.engagesAt && (r.tools ?? []).includes(tool ?? "")) ?? null;
  if (!rule) return null;
  if ((rule.arming ?? "breakpoint") === "immediate") return rule;
  const turnOpenedLocked = !!state.turnLockedTs && state.turnLockedTs === state.lastPromptTs;
  const graceExceeded = !!state.lastPromptTs && now - state.lastPromptTs > (rule.maxGraceMin ?? 10) * 60_000;
  return turnOpenedLocked || graceExceeded ? rule : null;
}

/** Is this write target on the rule's allow-list (e.g. the journal / ritual artifacts),
 * so it's exempt from the block even under lockdown? Closing the day must never be blocked.
 * Pure: caller supplies `home` to expand a leading `~/`. Matches a path or any descendant.
 * @param {string|undefined} filePath @param {string[]|undefined} allowPaths @param {string} home */
export function isAllowedPath(filePath, allowPaths, home) {
  if (!filePath || !allowPaths?.length) return false;
  const expand = (p) => (p.startsWith("~/") ? home + p.slice(1) : p);
  return allowPaths.some((raw) => {
    const base = expand(raw).replace(/\/+$/, "");
    return filePath === base || filePath.startsWith(base + "/");
  });
}

// ── Presentation (pure) ─────────────────────────────────────────

/** @param {string} s @param {Target} target */
export const fill = (s, target) =>
  String(s).replaceAll("{reset}", target.driver.reset);

/** The PreToolUse deny reason. @param {Target} target */
export const denyReason = (target) =>
  fill(target.voice.lockdown, target) +
  (target.voice.substitution ? " " + target.voice.substitution : "");

/** The UserPromptSubmit orient line (empty during `day`).
 * @param {Target} target @param {Phase} phase @param {State} state @param {number} now @returns {string} */
export function renderOrient(target, phase, state, now) {
  if (phase === "day") return "";
  const dur = unbrokenMin(state, now);
  const bell = dur >= target.orient.bellAfterMin
    ? ` You've been at it ${Math.floor(dur / 60)}h unbroken — worth landing the current thread.` : "";
  // Adaptive-granularity nudge (Compass-orient): coarser as the night deepens. Applies even on a skipped night.
  const gran = phase === "lockdown" ? target.voice.granularity?.lockdown : target.voice.granularity?.windDown;
  const extra = [gran, target.voice.signoffNudge, target.voice.consequence, target.voice.identity].filter(Boolean).join(" ");
  const tail = `${bell}${extra ? " " + extra : ""}`;
  const body = phase === "lockdown" ? denyReason(target) : target.voice.windDownNudge;
  return `[keel] ${body}${tail}`;
}

/** Local calendar day, YYYY-MM-DD (not UTC — the nudge is wall-clock). @param {number} now */
export const dayKey = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** An ambient, once-per-calendar-day ritual suggestion, fired in the morning window.
 * Monday → weekly-review; any other day → morning. A fading nudge, not a nag:
 * at most one per day, only between 04:00 and 14:00 local. Returns { line, mark }
 * to emit (mark = the dayKey to persist as lastRitualNudge) or null to stay silent.
 * Pure — caller persists the mark. @param {State} state @param {number} now */
export function ritualNudge(state, now, voice) {
  const dk = dayKey(now);
  if (state.lastRitualNudge === dk) return null;           // already nudged today
  const h = new Date(now).getHours();
  if (h < 4 || h >= 14) return null;                        // morning-ish window only
  const line = new Date(now).getDay() === 1 ? (voice?.weeklyNudge || "") : (voice?.morningNudge || "");
  if (!line) return null;                                   // silent unless the user configured rituals
  return { line, mark: dk };
}

/** The waking-day boundary in hours — the logical day flips at 04:00, not midnight,
 * matching the morning ritual window. A 02:00 session still belongs to the prior day. */
export const DAY_START_HOUR = 4;

/** A logical "day" key for focus that rolls at DAY_START_HOUR, not midnight. Distinct from
 * dayKey (calendar, used by the ritual nudge) so late-night work isn't a new day. @param {number} now */
export const focusDayKey = (now) => dayKey(now - DAY_START_HOUR * 3600_000);

/** Set the day's intention (the focus the chat is guardrailed to).
 * Day-scoped — cleared on waking-day rollover (see rollIntentionDay), not session reset.
 * @param {State} state @param {string} text @param {number} [now] stamps the owning day */
export function setIntention(state, text, now) {
  const intention = String(text ?? "").trim();
  return { ...state, intention, intentionDay: intention && now != null ? focusDayKey(now) : state.intentionDay };
}

/** Clear the intention if it belongs to an earlier waking-day; otherwise keep it.
 * Per-day semantics: survives session restarts/clears within a day, resets at the 04:00 boundary.
 * @param {State} state @param {number} now @returns {State} */
export function rollIntentionDay(state, now) {
  const today = focusDayKey(now);
  if (state.intentionDay === today) return state;
  return { ...state, intention: "", intentionDay: today };
}

/** The active intention for today, or "" if none set. @param {State} state */
export function activeIntention(state) {
  return state.intention || "";
}

/** The per-turn guardrail line — keeps the chat anchored to the day's declared focus.
 * Empty when no active intention. @param {State} state @returns {string} */
export function intentionLine(state) {
  const i = activeIntention(state);
  return i ? `[keel] ◎ intention: ${i} — capture drift (idea/pain), hold the thread.` : "";
}

/** Response-granularity levels → the depth contract each implies (maps to semantic-zoom). */
export const GRANULARITY_LEVELS = {
  sentence: "L1 — one sentence, claim only.",
  tldr:     "L2 — one paragraph, claim + mechanism. The resting floor.",
  page:     "L3 — ~a page: claim + mechanism + worked example, scannable.",
  report:   "L5 — multi-section, citations, edge cases. Defensible.",
};

/** The granularity every session opens at, and the floor whenever none is set. */
export const DEFAULT_GRANULARITY = "tldr";

/** Normalize a raw granularity arg to a canonical level, or "" if unrecognized. @param {string} raw */
export function normalizeGranularity(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_;-]+/g, "");
  if (s === "sentence" || s === "1" || s === "l1" || s === "oneliner" || s === "line") return "sentence";
  if (s === "tldr" || s === "2" || s === "l2" || s === "paragraph" || s === "brief" || s === "summary") return "tldr";
  if (s === "page" || s === "3" || s === "l3" || s === "medium" || s === "usable") return "page";
  if (s === "report" || s === "5" || s === "l5" || s === "full" || s === "detailed" || s === "deep") return "report";
  return "";
}

/** Set the session granularity (the response-depth dial). Session-scoped — a fresh
 * session resets it to the floor at session-start. @param {State} state @param {string} level */
export function setGranularity(state, level) {
  return { ...state, granularity: level };
}

/** The active granularity — the session's set level, or the default floor when unset.
 * Never empty: a granularity contract is always in force. @param {State} state */
export function activeGranularity(state) {
  return state.granularity && GRANULARITY_LEVELS[state.granularity] ? state.granularity : DEFAULT_GRANULARITY;
}

/** The granularity contract line — surfaced at session-start and in the HUD. Always renders,
 * because there is always a floor. @param {State} state @returns {string} */
export function granularityLine(state) {
  const g = activeGranularity(state);
  return `[keel] ▤ granularity: ${g} — ${GRANULARITY_LEVELS[g]} Zoom per-response on signal ("page it", "in a sentence").`;
}

// ── Activity log (observability substrate — slice A) ────────────
// Events mirror @keel/domain ActivityEvent. The log is the product; these
// builders are pure — id generation and file I/O live with the callers.

/** @typedef {{ id: string, surface: "agent", kind: string, ts: number,
 *   sessionId: string, payload: Record<string, unknown>, durationMs?: number }} ActivityEvent */

/** @param {{ id: string, kind: string, ts: number, sessionId?: string,
 *   payload?: Record<string, unknown>, durationMs?: number }} a
 * @returns {ActivityEvent} */
export function buildEvent({ id, kind, ts, sessionId, payload, durationMs }) {
  /** @type {ActivityEvent} */
  const e = { id, surface: "agent", kind, ts, sessionId: sessionId ?? "", payload: payload ?? {} };
  if (durationMs !== undefined) e.durationMs = durationMs;
  return e;
}

/** Cap one payload value by serialized size. Oversized values become
 * `{ truncated, bytes, value }` — the transcript (whose path we log) keeps
 * full fidelity; the event keeps a bounded inline copy.
 * @param {unknown} v @param {number} max */
export function capValue(v, max) {
  if (typeof v === "string") {
    const bytes = Buffer.byteLength(v, "utf8");
    return bytes <= max ? v : { truncated: true, bytes, value: v.slice(0, max) };
  }
  const s = JSON.stringify(v) ?? "";
  const bytes = Buffer.byteLength(s, "utf8");
  return bytes <= max ? v : { truncated: true, bytes, value: s.slice(0, max) };
}

/** Cap every field of a hook stdin payload. Events must stay well under the
 * single-write atomic-append bound, so concurrent sessions never tear lines.
 * @param {Record<string, unknown> | null | undefined} obj @param {number} [maxField] */
export function capPayload(obj, maxField = 2048) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[k] = capValue(v, maxField);
  return out;
}

/** @param {ActivityEvent} e */
export const eventLine = (e) => JSON.stringify(e) + "\n";

/** Local-date daily bucket for the agent surface. @param {number} ts */
export function logFileName(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.agent.jsonl`;
}

/** Local-date daily bucket for the browser surface. @param {number} ts */
export function browserLogFileName(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.browser.jsonl`;
}

/** Read-side rollup for `keel log status`.
 * @param {ActivityEvent[]} events @param {number} now @param {number} [activeWindowMs] */
export function summarizeEvents(events, now, activeWindowMs = 15 * 60_000) {
  /** @type {Record<string, number>} */
  const byKind = {};
  const lastSeen = new Map();
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.sessionId) lastSeen.set(e.sessionId, Math.max(lastSeen.get(e.sessionId) ?? 0, e.ts));
  }
  let activeSessions = 0;
  for (const ts of lastSeen.values()) if (now - ts <= activeWindowMs) activeSessions++;
  return { byKind, sessions: lastSeen.size, activeSessions };
}

/** Pair a tool completion with its dispatch: by tool_use_id when both sides
 * carry one, else latest unconsumed dispatch for the same session + tool
 * (stack semantics — survives concurrent sessions and repeated tools).
 * @param {ActivityEvent[]} events
 * @param {{ sessionId: string, ts: number, payload: Record<string, any> }} completed */
export function matchDispatch(events, completed) {
  const p = completed?.payload ?? {};
  if (p.tool_use_id) {
    const consumed = new Set(events
      .filter((e) => e.kind === "tool_completed" && e.payload?.tool_use_id)
      .map((e) => e.payload.tool_use_id));
    let found = null;
    for (const e of events) {
      if (e.kind === "tool_dispatched" && e.payload?.tool_use_id === p.tool_use_id
        && !consumed.has(p.tool_use_id)) found = e;
    }
    if (found) return found;
  }
  const stack = [];
  for (const e of events) {
    if (e.sessionId !== completed?.sessionId || e.payload?.tool_name !== p.tool_name) continue;
    if (e.kind === "tool_dispatched") stack.push(e);
    else if (e.kind === "tool_completed") stack.pop();
  }
  return stack.length ? stack[stack.length - 1] : null;
}

// ── Rules observability (slice A′) ──────────────────────────────
// The rules are data; these make them inspectable and their changes loggable.

/** Stable hash of any effective-rules value (target, or a composite of
 * target + watchlist + desktop sensors) — key-order-insensitive,
 * value-sensitive. Pure FNV-1a over a canonically sorted JSON encoding.
 * @param {unknown} target */
export function targetHash(target) {
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      /** @type {Record<string, unknown>} */
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = canon(/** @type {any} */ (v)[k]);
      return o;
    }
    return v;
  };
  const s = JSON.stringify(canon(target));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Render the effective rules with provenance: each section marked (custom)
 * when the user's config touches it, (default) otherwise. The discoverability
 * half of modifiability — a rule you don't know you can change is hardcoded.
 * @param {Target} t @param {any} configured raw (unmerged) user config for provenance */
export function renderRules(t, configured = {}) {
  const src = (k) => (configured && configured[k] !== undefined ? "custom" : "default");
  const lines = [
    `keel rules — effective target (hash ${targetHash(t)})`,
    `driver (${src("driver")}): kind=${t.driver.kind ?? "wind-down"} windDown=${t.driver.windDown} hardStop=${t.driver.hardStop} reset=${t.driver.reset}${t.driver.backstop ? ` backstop=${t.driver.backstop}` : ""}`,
  ];
  for (const r of t.rules) {
    lines.push(`rule (${src("rules")}): ${r.notch} at f≥${r.engagesAt} · ${r.arming ?? "immediate"}${r.maxGraceMin ? ` (grace ${r.maxGraceMin}m)` : ""} · tools: ${r.tools.join(", ")}${r.allowPaths?.length ? ` · always-allowed paths: ${r.allowPaths.join(", ")}` : ""}`);
  }
  lines.push(`orient (${src("orient")}): bell after ${t.orient.bellAfterMin}m · session gap ${t.orient.sessionGapMin}m`);
  const setVoice = Object.entries(t.voice).filter(([, v]) => typeof v === "string" && v).map(([k]) => k);
  lines.push(`voice (${src("voice")}): ${setVoice.join(", ") || "(all silent)"}`);
  lines.push(`edit: ~/.keel/config.json — changes apply at the next hook fire, no reload.`);
  return lines.join("\n");
}

// ── Watchlist seeding — verdict merge helpers (2026-06-13) ─────
// Pure functions: no I/O. Callers in store.mjs handle persistence.

/** Apply adjudication verdicts → the new observe list. Only `observe` verdicts
 * enter the list; benign/work do not. Existing entries are preserved; deduped.
 * @param {string[]} currentObserve
 * @param {Record<string, string>} verdicts
 * @returns {string[]} */
export function applyObserveVerdicts(currentObserve, verdicts) {
  const set = new Set(currentObserve);
  for (const [key, verdict] of Object.entries(verdicts)) {
    if (verdict === "observe") set.add(key);
  }
  return [...set];
}

/** Merge new verdicts into the ledger (append/overwrite by key).
 * @param {Record<string, string>} ledger
 * @param {Record<string, string>} verdicts
 * @returns {Record<string, string>} */
export function mergeLedger(ledger, verdicts) {
  return { ...ledger, ...verdicts };
}

// ── Watchlist — the config spine (2026-06-12) ───────────────────
// One self-authored list of domains replaces shield configs, the hosts
// blocklist file, and per-domain sensor choices. Tiers:
//   observe  → deep sensors on the browser surface (key actions)
//   windowed → the vice-block schedule (hosts mechanism)
// Neutral default: empty — keel never ships entries (the drogue's seed
// blocklist is the lone, explicitly-consented exception).

/** @typedef {{ observe: string[], windowed: string[] }} Watchlist */

/** @param {any} [w] @returns {Watchlist} */
export function mergeWatchlist(w = {}) {
  return {
    observe: Array.isArray(w?.observe) ? w.observe : [],
    windowed: Array.isArray(w?.windowed) ? w.windowed : [],
  };
}

/** Render the watchlist for `keel rules`. Observe domains print in full;
 * windowed prints a COUNT only (those domains are sensitive — the list
 * itself lives in the config file the user owns).
 * @param {Watchlist} w @returns {string[]} */
export function watchlistLines(w) {
  if (w.observe.length === 0 && w.windowed.length === 0) {
    return ["watchlist: empty — self-authored; add domains in ~/.keel/config.json (tiers: observe, windowed)"];
  }
  const observe = w.observe.length ? w.observe.join(", ") : "(none)";
  const windowed = `${w.windowed.length} domain(s) under vice windows`;
  return [`watchlist: observe: ${observe} · windowed: ${windowed}`];
}

// ── Desktop sensors (tray) — config-gated, default off ──────────

/** @typedef {{ inputActivity: boolean }} DesktopSensors */

/** @param {any} [d] @returns {DesktopSensors} */
export function mergeDesktopSensors(d = {}) {
  return { inputActivity: d?.inputActivity === true };
}

/** Render the desktop sensor toggles for `keel rules`.
 * @param {DesktopSensors} d @returns {string[]} */
export function desktopSensorLines(d) {
  return [
    `desktop sensors: inputActivity=${d.inputActivity ? "ON (counts per 3s bin, never content)" : "off (default)"}`,
  ];
}

/** The first-run contract, shown once at the first SessionStart. */
export function consentLines() {
  return [
    "[keel] First run — the contract:",
    "[keel] · keel logs your Claude Code session events (prompts, tool calls, timings) to ~/.keel/log/ — plain JSONL you own.",
    "[keel] · Everything stays on this machine. Nothing is sent anywhere, ever.",
    "[keel] · Pause or remove anytime: disable the plugin (or delete the hooks block); your data stays yours.",
    "[keel] · See your rules: `keel rules` · see your data: `keel log status`.",
  ];
}
