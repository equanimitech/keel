// @ts-check
// keel agent core — pure domain. No I/O. The piece that later lifts into @keel/domain.

/** @typedef {"day"|"wind_down"|"lockdown"} Phase */
/** @typedef {"hide"|"dim"|"delay"|"blur"|"block"} Notch */
/** @typedef {"immediate"|"breakpoint"} Arming */
/** @typedef {number} Friction  0..1 */
/** @typedef {{ kind?: string, windDown: string, hardStop: string, reset: string, backstop?: string }} Driver */
/** @typedef {{ notch: Notch, engagesAt: Friction, arming?: Arming, maxGraceMin?: number, tools: string[], allowPaths?: string[] }} Rule */
/** @typedef {{ perMonth: number, cap: number }} SkipBudget */
/** @typedef {{ bellAfterMin: number, sessionGapMin: number }} Orient */
/** @typedef {{ windDown: string, lockdown: string }} Granularity */
/** @typedef {{ windDownNudge: string, lockdown: string, substitution: string, consequence: string, identity: string, signoffNudge: string, reflection: string, morningNudge: string, weeklyNudge: string, granularity: Granularity }} Voice */
/** @typedef {{ from: string, to: string }} ViceWindow */
/** @typedef {{ windows: ViceWindow[], reassertEveryMin: number }} Vice */
/** @typedef {{ driver: Driver, rules: Rule[], orient: Orient, skipBudget: SkipBudget, voice: Voice, vice: Vice }} Target */
/** @typedef {{ observed?: boolean, skipped?: boolean }} Night */
/** @typedef {{ credits: number, creditsMonth: string, skipUntilTs: number, parkAtTs: number, viceUntilTs: number, viceSkipUntilTs: number, sessionStartTs: number, lastPromptTs: number, turnLockedTs: number, lastRitualNudge: string, inferNudgedTs: number, intention: string, intentionDay: string, appetite: string, appetiteDay: string, lastRuleHash: string, consentShownTs: number, nights: Record<string, Night> }} State */

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
  skipBudget: { perMonth: 4, cap: 6 },
  voice: {
    windDownNudge: "Wind-down window — a good moment to land open work.",
    lockdown: "Coding tools are paused until {reset} — your own schedule. Spend a skip if it matters: `keel skip` ({credits} left).",
    substitution: "",
    consequence: "",
    identity: "",
    signoffNudge: "",
    reflection: "[keel] {held} of the last {n} session night(s) closed on schedule. {credits} skip credit(s) this month.",
    morningNudge: "",
    weeklyNudge: "",
    granularity: {
      windDown: "Keep it high-level — summaries and next steps, not deep multi-file dives.",
      lockdown: "Coarsest only — one-line status + tomorrow's first step; no detail.",
    },
  },
  // Scheduled vice block. Empty windows → derived from the coding night (driver windDown→reset).
  vice: { windows: [], reassertEveryMin: 5 },
};

/** @returns {State} */
export const emptyState = () => ({
  credits: 0, creditsMonth: "", skipUntilTs: 0, parkAtTs: 0, viceUntilTs: 0, viceSkipUntilTs: 0,
  sessionStartTs: 0, lastPromptTs: 0, turnLockedTs: 0, lastRitualNudge: "", inferNudgedTs: 0,
  intention: "", intentionDay: "", appetite: "", appetiteDay: "", lastRuleHash: "", consentShownTs: 0, nights: {},
});

/** Merge a partial target config over the defaults. @param {any} t @returns {Target} */
export function mergeTarget(t = {}) {
  return {
    driver: { ...DEFAULT_TARGET.driver, ...t.driver },
    rules: t.rules ?? DEFAULT_TARGET.rules,
    orient: { ...DEFAULT_TARGET.orient, ...t.orient },
    skipBudget: { ...DEFAULT_TARGET.skipBudget, ...t.skipBudget },
    voice: { ...DEFAULT_TARGET.voice, ...t.voice },
    vice: { ...DEFAULT_TARGET.vice, ...t.vice },
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
export const skipActive = (/** @type {State} */ s, now) => now < (s.skipUntilTs ?? 0);

/** Reset instant of the current keel-night (epoch ms). @param {number} now @param {Driver} driver */
export function nextResetTs(now, driver) {
  const r = toMin(driver.reset);
  const cand = new Date(now); cand.setHours(0, 0, 0, 0); cand.setMinutes(r);
  if (now >= cand.getTime()) cand.setDate(cand.getDate() + 1);
  return cand.getTime();
}
export const nightKey = (now, /** @type {Driver} */ driver) =>
  new Date(nextResetTs(now, driver)).toISOString().slice(0, 10);

// ── Self-imposed park (a one-shot hard stop you set now) ─────────

/** Parse a park argument into an absolute instant (epoch ms), or null.
 * Accepts a wall-clock "HH:MM" (today, or tomorrow if already past) or a
 * relative duration "90", "15m", "1h", "1h30m". @param {string} arg @param {number} now */
export function parseParkTarget(arg, now) {
  const s = String(arg ?? "").trim().toLowerCase();
  if (!s) return null;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]), m = Number(hhmm[2]);
    if (h > 23 || m > 59) return null;
    const cand = new Date(now); cand.setHours(h, m, 0, 0);
    if (cand.getTime() <= now) cand.setDate(cand.getDate() + 1);
    return cand.getTime();
  }
  const dur = s.match(/^(?:(\d+)h)?(?:(\d+)m)?$|^(\d+)$/);
  if (dur) {
    const mins = dur[3] != null ? Number(dur[3]) : (Number(dur[1] || 0) * 60 + Number(dur[2] || 0));
    if (mins > 0) return now + mins * 60_000;
  }
  return null;
}

/** Is a self-imposed park currently biting? Active from parkAtTs until that
 * park's following reset (same lifecycle as a normal lockdown night).
 * @param {State} state @param {number} now @param {Driver} driver */
export function parkActive(state, now, driver) {
  const p = state.parkAtTs ?? 0;
  if (!p || now < p) return false;
  return now < nextResetTs(p, driver);
}

/** The late safety net: an un-signed-off night still hard-locks from `backstop`
 * until reset. No `backstop` configured ⇒ no clock-driven lockdown ever (pure
 * sovereign). @param {number} now @param {Driver} driver */
export function backstopActive(now, driver) {
  if (!driver.backstop) return false;
  return inWindow(nowMinOf(now), toMin(driver.backstop), toMin(driver.reset));
}

/** Whether coding is in hard lockdown right now — a SOVEREIGN state, not the clock:
 * set by sign-off / park, or the late `backstop`. The wall-clock ramp does NOT lock.
 * @param {Target} target @param {State} state @param {number} now */
export function lockedDown(target, state, now) {
  return parkActive(state, now, target.driver) || backstopActive(now, target.driver);
}

/** Effective friction. The clock ramps wind-down PRESSURE but is capped below the
 * lockdown threshold (WIND_DOWN_CEIL) — it nudges, never hard-locks. Full lockdown
 * (1.0) comes only from a sovereign lockdown state (sign-off / park / backstop).
 * @param {Target} target @param {State} state @param {number} now */
export function frictionNow(target, state, now) {
  if (lockedDown(target, state, now)) return 1;
  return Math.min(frictionAt(nowMinOf(now), target.driver), WIND_DOWN_CEIL);
}

// ── Vice block (scheduled hosts block; on-demand Ulysses pact; root daemon enforces) ──

/** The vice-block windows. Explicit config if any, else derived from the coding
 * night (driver windDown→reset). @param {Target} target @returns {ViceWindow[]} */
export function viceWindows(target) {
  const w = target.vice?.windows;
  if (Array.isArray(w) && w.length) return w;
  return [{ from: target.driver.windDown, to: target.driver.reset }];
}

/** Is now inside any scheduled vice window? @param {number} nowMin @param {Target} target */
export function viceScheduledAt(nowMin, target) {
  return viceWindows(target).some((win) => inWindow(nowMin, toMin(win.from), toMin(win.to)));
}

/** A spent skip is currently suppressing the block (lifted until reset). @param {State} s @param {number} now */
export const viceSkipActive = (s, now) => now < (s.viceSkipUntilTs ?? 0);

/** A manual pact (vice on / signoff) is holding the block up. @param {State} s @param {number} now */
export const vicePactActive = (s, now) => now < (s.viceUntilTs ?? 0);

/** Desired hosts state right now: should vices be blocked? A spent skip wins over
 * everything; else a manual pact or a scheduled window raises it.
 * @param {Target} target @param {State} state @param {number} now */
export function viceShouldBlock(target, state, now) {
  if (viceSkipActive(state, now)) return false;
  if (vicePactActive(state, now)) return true;
  return viceScheduledAt(nowMinOf(now), target);
}

/** Raise a manual pact: hold the block until this night's reset.
 * @param {State} state @param {number} now @param {Driver} driver @returns {State} */
export function setVicePact(state, now, driver) {
  return { ...state, viceUntilTs: nextResetTs(now, driver) };
}

/** Spend a skip credit to lift vices until reset (shares the coding credit pool).
 * Clears any manual pact so it can't re-raise. @param {State} state @param {number} viceSkipUntilTs */
export function spendViceSkip(state, viceSkipUntilTs) {
  if ((state.credits ?? 0) <= 0) return { spent: false, state };
  return { spent: true, state: { ...state, credits: state.credits - 1, viceSkipUntilTs, viceUntilTs: 0 } };
}

// ── Credits + session ───────────────────────────────────────────

/** Carry over leftover credits, add perMonth, cap at `cap`, on a month change.
 * @param {State} state @param {Target} target @param {string} mk @returns {State} */
export function refillCredits(state, target, mk) {
  if (state.creditsMonth === mk) return state;
  const { perMonth, cap } = target.skipBudget;
  const credits = Math.min(cap, (state.creditsMonth ? state.credits ?? 0 : 0) + perMonth);
  return { ...state, credits, creditsMonth: mk };
}

/** @param {State} state @param {number} skipUntilTs */
export function spendSkip(state, skipUntilTs) {
  if ((state.credits ?? 0) <= 0) return { spent: false, state };
  return { spent: true, state: { ...state, credits: state.credits - 1, skipUntilTs } };
}

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
  if (skipActive(state, now)) return null;
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

// ── Nightly outcomes + reflection ───────────────────────────────

/** @param {State} state @param {number} now @param {Driver} driver @param {Night} patch @returns {State} */
export function recordNight(state, now, driver, patch) {
  const key = nightKey(now, driver);
  const nights = { ...(state.nights || {}) };
  nights[key] = { ...(nights[key] || {}), ...patch };
  return { ...state, nights };
}

/** Last-N *observed* late nights (you were up coding past wind-down); held = no skip spent.
 * @param {State} state @param {Driver} driver @param {number} now @param {number} n */
export function lastNNights(state, driver, now, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const rec = state.nights?.[nightKey(now - i * 86_400_000, driver)];
    if (rec?.observed) out.push({ held: !rec.skipped });
  }
  return out;
}

// ── Presentation (pure) ─────────────────────────────────────────

/** @param {string} s @param {Target} target @param {State} state */
export const fill = (s, target, state) =>
  String(s).replaceAll("{reset}", target.driver.reset).replaceAll("{credits}", String(state.credits ?? 0));

/** The PreToolUse deny reason. @param {Target} target @param {State} state */
export const denyReason = (target, state) =>
  fill(target.voice.lockdown, target, state) +
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
  const body = phase === "lockdown" && !skipActive(state, now)
    ? denyReason(target, state)
    : target.voice.windDownNudge;
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

/** Set the day's session intention (the focus the chat is guardrailed to).
 * Day-scoped — auto-stales at the next dayKey. @param {State} state @param {string} text @param {number} now */
export function setIntention(state, text, now) {
  return { ...state, intention: String(text ?? "").trim(), intentionDay: dayKey(now) };
}

/** The active intention for *today*, or "" if none / stale (set on an earlier day).
 * @param {State} state @param {number} now */
export function activeIntention(state, now) {
  return state.intentionDay === dayKey(now) ? (state.intention || "") : "";
}

/** The per-turn guardrail line — keeps the chat anchored to today's declared focus.
 * Empty when no active intention. @param {State} state @param {number} now @returns {string} */
export function intentionLine(state, now) {
  const i = activeIntention(state, now);
  return i ? `[keel] ◎ intention: ${i} — capture drift (idea/pain), hold the thread.` : "";
}

/** Session appetite levels → the depth/granularity contract each implies. */
export const APPETITE_LEVELS = {
  tiny:   "coarsest only — handles + one-liners, no exploration.",
  small:  "light — quick exploration, stay shallow.",
  normal: "systemic — full analysis at normal depth.",
  deep:   "deep dive — exhaustive, multi-file, detailed.",
};

/** Normalize a raw appetite arg to a canonical level, or "" if unrecognized. @param {string} raw */
export function normalizeAppetite(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "tiny") return "tiny";
  if (s === "small" || s === "light") return "small";
  if (s === "normal" || s === "systemic" || s === "medium") return "normal";
  if (s === "deep" || s === "deepwork" || s === "deepdive") return "deep";
  return "";
}

/** Set the day's session appetite (the depth dial). Day-scoped. @param {State} state @param {string} level @param {number} now */
export function setAppetite(state, level, now) {
  return { ...state, appetite: level, appetiteDay: dayKey(now) };
}

/** Active appetite for today, or "" if none / stale. @param {State} state @param {number} now */
export function activeAppetite(state, now) {
  return state.appetiteDay === dayKey(now) ? (state.appetite || "") : "";
}

/** Per-turn depth-contract line — sets the granularity budget and prompts scope-drift flagging.
 * Empty when no active appetite. @param {State} state @param {number} now @returns {string} */
export function appetiteLine(state, now) {
  const a = activeAppetite(state, now);
  return a && APPETITE_LEVELS[a] ? `[keel] ▤ appetite: ${a} — ${APPETITE_LEVELS[a]} Flag if scope drifts past it.` : "";
}

/** The SessionStart reflection (empty until there are observed nights).
 * @param {State} state @param {Target} target @param {number} now @returns {string} */
export function reflectionLine(state, target, now) {
  const tpl = target.voice.reflection;
  if (!tpl) return "";
  const last = lastNNights(state, target.driver, now, 7);
  if (!last.length) return "";
  const held = last.filter((x) => x.held).length;
  return fill(tpl, target, state)
    .replaceAll("{held}", String(held)).replaceAll("{n}", String(last.length));
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
  lines.push(`skipBudget (${src("skipBudget")}): ${t.skipBudget.perMonth}/month, cap ${t.skipBudget.cap}`);
  lines.push(`orient (${src("orient")}): bell after ${t.orient.bellAfterMin}m · session gap ${t.orient.sessionGapMin}m`);
  lines.push(`vice (${src("vice")}): ${t.vice.windows.length ? t.vice.windows.map((w) => `${w.from}→${w.to}`).join(", ") : "derived from driver night"}`);
  const setVoice = Object.entries(t.voice).filter(([, v]) => typeof v === "string" && v).map(([k]) => k);
  lines.push(`voice (${src("voice")}): ${setVoice.join(", ") || "(all silent)"}`);
  lines.push(`edit: ~/.keel/config.json — changes apply at the next hook fire, no reload.`);
  return lines.join("\n");
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
