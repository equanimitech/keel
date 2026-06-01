// @ts-check
// keel-gate core — pure domain. No I/O. The piece that later lifts into @keel/domain.

/** @typedef {"day"|"wind_down"|"lockdown"} Phase */
/** @typedef {"hide"|"dim"|"delay"|"blur"|"block"} Notch */
/** @typedef {"immediate"|"breakpoint"} Arming */
/** @typedef {number} Friction  0..1 */
/** @typedef {{ kind?: string, windDown: string, hardStop: string, reset: string }} Driver */
/** @typedef {{ notch: Notch, engagesAt: Friction, arming?: Arming, maxGraceMin?: number, tools: string[] }} Rule */
/** @typedef {{ perMonth: number, cap: number }} SkipBudget */
/** @typedef {{ bellAfterMin: number, sessionGapMin: number }} Orient */
/** @typedef {{ windDownNudge: string, lockdown: string, substitution: string, consequence: string, identity: string }} Voice */
/** @typedef {{ driver: Driver, rules: Rule[], orient: Orient, skipBudget: SkipBudget, voice: Voice }} Target */
/** @typedef {{ observed?: boolean, skipped?: boolean }} Night */
/** @typedef {{ credits: number, creditsMonth: string, skipUntilTs: number, sessionStartTs: number, lastPromptTs: number, turnLockedTs: number, nights: Record<string, Night> }} State */

/** @type {Target} */
export const DEFAULT_TARGET = {
  driver: { kind: "wind-down", windDown: "22:30", hardStop: "00:00", reset: "05:00" },
  rules: [{ notch: "block", engagesAt: 1.0, arming: "breakpoint", maxGraceMin: 10,
            tools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"] }],
  orient: { bellAfterMin: 120, sessionGapMin: 30 },
  skipBudget: { perMonth: 2, cap: 3 },
  voice: {
    windDownNudge: "Winding down — favor landing open work over starting something big.",
    lockdown: "Coding's parked until {reset}. Conversation's fine; spend a skip if it's truly worth it: `node ~/.keel/keel.mjs skip` ({credits} left).",
    substitution: "Instead: jot tomorrow's first task, then sleep.",
    consequence: "",
    identity: "",
  },
};

/** @returns {State} */
export const emptyState = () => ({
  credits: 0, creditsMonth: "", skipUntilTs: 0,
  sessionStartTs: 0, lastPromptTs: 0, turnLockedTs: 0, nights: {},
});

/** Merge a partial target config over the defaults. @param {any} t @returns {Target} */
export function mergeTarget(t = {}) {
  return {
    driver: { ...DEFAULT_TARGET.driver, ...t.driver },
    rules: t.rules ?? DEFAULT_TARGET.rules,
    orient: { ...DEFAULT_TARGET.orient, ...t.orient },
    skipBudget: { ...DEFAULT_TARGET.skipBudget, ...t.skipBudget },
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
  const extra = [target.voice.consequence, target.voice.identity].filter(Boolean).join(" ");
  const tail = `${bell}${extra ? " " + extra : ""}`;
  const body = phase === "lockdown" && !skipActive(state, now)
    ? denyReason(target, state)
    : target.voice.windDownNudge;
  return `[keel] ${body}${tail}`;
}

/** The SessionStart reflection (empty until there are observed nights).
 * @param {State} state @param {Target} target @param {number} now @returns {string} */
export function reflectionLine(state, target, now) {
  const last = lastNNights(state, target.driver, now, 7);
  if (!last.length) return "";
  const held = last.filter((x) => x.held).length;
  return `[keel] wound down on your own ${held} of the last ${last.length} late night(s). ${state.credits} skip credit(s) this month.`;
}
