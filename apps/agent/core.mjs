// @ts-check
// keel agent core — pure domain. No I/O. The piece that later lifts into @keel/domain.

/** @typedef {"day"|"wind_down"|"lockdown"} Phase */
/** @typedef {"hide"|"dim"|"delay"|"blur"|"block"} Notch */
/** @typedef {"immediate"|"breakpoint"} Arming */
/** @typedef {number} Friction  0..1 */
/** @typedef {{ notch: Notch, engagesAt: Friction, arming?: Arming, maxGraceMin?: number, tools: string[], allowPaths?: string[] }} Rule */
/** @typedef {{ bellAfterMin: number, sessionGapMin: number }} Orient */
/** @typedef {{ windDown: string, lockdown: string }} Granularity */
/** @typedef {{ windDownNudge: string, lockdown: string, substitution: string, consequence: string, identity: string, signoffNudge: string, granularity: Granularity }} Voice */
/** @typedef {Record<string, string>} Watches  name → start time "HH:MM" */
/** @typedef {{ rules: Rule[], orient: Orient, voice: Voice, watches: Watches, windDown: string, signOnGate: boolean }} Target */
/** @typedef {{ sessionStartTs: number, lastPromptTs: number, turnLockedTs: number, inferNudgedTs: number, granularity: string, focus: boolean, focusTs: number, focusSession: string, lastRuleHash: string, consentShownTs: number, lastMomentId: string }} State */

/** Named time-of-day watches (intention blocks) → start time. The active watch is the
 * latest start ≤ now, wrapping past midnight to the last watch. The `night` watch is the
 * sleep/lock window — coding locks during it (the one wall keel keeps); its start is the
 * hard stop, its end (next watch) is the wake/reset. Fully configurable. */
export const DEFAULT_WATCHES = { morning: "09:00", afternoon: "13:00", evening: "19:00", night: "01:30" };

/** Default wind-down lead — how long before `night` the friction ramp begins (pressure, not lock). */
export const DEFAULT_WIND_DOWN = "90m";

/** @type {Target} */
export const DEFAULT_TARGET = {
  watches: DEFAULT_WATCHES,
  windDown: DEFAULT_WIND_DOWN,
  // Default OFF: the gate's only key is zenborg's framing screen. Flipping this on
  // without that screen reachable would lock the day shut with no way to open it.
  signOnGate: false,
  rules: [{ notch: "block", engagesAt: 1.0, arming: "breakpoint", maxGraceMin: 10,
            tools: ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"],
            allowPaths: ["~/journals", "~/.keel"] }],
  orient: { bellAfterMin: 120, sessionGapMin: 30 },
  voice: {
    windDownNudge: "Wind-down window — a good moment to land open work.",
    lockdown: "Coding tools are paused until {reset} — your declared night, the one wall keel keeps. Past here your judgment isn't yours to trust; sleep is the move.",
    substitution: "",
    consequence: "",
    identity: "",
    signoffNudge: "",
    granularity: {
      windDown: "Keep it high-level — summaries and next steps, not deep multi-file dives.",
      lockdown: "Coarsest only — one-line status + tomorrow's first step; no detail.",
    },
  },
};

/** @returns {State} */
export const emptyState = () => ({
  sessionStartTs: 0, lastPromptTs: 0, turnLockedTs: 0, inferNudgedTs: 0,
  granularity: "", focus: false, focusTs: 0, focusSession: "",
  lastRuleHash: "", consentShownTs: 0, lastMomentId: "",
});

/** Merge a partial target config over the defaults. @param {any} t @returns {Target} */
export function mergeTarget(t = {}) {
  return {
    rules: t.rules ?? DEFAULT_TARGET.rules,
    orient: { ...DEFAULT_TARGET.orient, ...t.orient },
    voice: { ...DEFAULT_TARGET.voice, ...t.voice },
    watches: (t.watches && Object.keys(t.watches).length) ? t.watches : DEFAULT_WATCHES,
    windDown: t.windDown ?? DEFAULT_TARGET.windDown,
    signOnGate: t.signOnGate ?? DEFAULT_TARGET.signOnGate,
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

/** Parse a duration ("90", "90m", "1h", "1h30m") → minutes; 0 if unparseable. @param {string} s */
export function toDurationMin(s) {
  const str = String(s ?? "").trim().toLowerCase();
  if (/^\d+$/.test(str)) return Number(str);
  const m = str.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  return m && (m[1] || m[2]) ? Number(m[1] || 0) * 60 + Number(m[2] || 0) : 0;
}

/** Minutes-of-day (0..1439) → "HH:MM". @param {number} m */
export const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The night (lock) window derived from the watches + wind-down lead: ramp starts `leadMin`
 * before `night`, the lock runs the whole `night` watch [nightStart, reset), reset = the next
 * watch start after night. null when no `night` watch is set (⇒ pure-soft: no ramp, no lock).
 * @param {Watches} watches @param {number} leadMin */
export function nightWindow(watches, leadMin) {
  if (!watches || !watches.night) return null;
  const nightStart = toMin(watches.night);
  const starts = Object.values(watches).map(toMin).sort((a, b) => a - b);
  const after = starts.find((m) => m > nightStart);
  const reset = after != null ? after : starts[0];
  const windDownStart = (((nightStart - leadMin) % 1440) + 1440) % 1440;
  return { windDownStart, nightStart, reset };
}

/** Wind-down friction f ∈ [0,1], derived from the watches: 0 by day · linear ramp across the
 * wind-down lead · 1 through the `night` watch (the lock). @param {number} nowMin @param {Watches} watches @param {number} leadMin @returns {Friction} */
export function frictionAt(nowMin, watches, leadMin) {
  const w = nightWindow(watches, leadMin);
  if (!w) return 0;
  if (!inWindow(nowMin, w.windDownStart, w.reset)) return 0;   // outside the wind-down → reset arc
  if (inWindow(nowMin, w.nightStart, w.reset)) return 1;       // inside the night watch → lock
  const span = ((w.nightStart - w.windDownStart + 1440) % 1440) || 1;
  const into = (nowMin - w.windDownStart + 1440) % 1440;
  return Math.max(0, Math.min(1, into / span));
}

/** @param {Friction} f @returns {Phase} */
export function phaseOf(f) {
  if (f <= 0) return "day";
  if (f >= 1) return "lockdown";
  return "wind_down";
}

export const nowMinOf = (now) => { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); };

/** Effective friction now — derived entirely from the watches + wind-down lead: the `night`
 * watch is the lock, the lead is the ramp before it. @param {Target} target @param {number} now */
export function frictionNow(target, now) {
  return frictionAt(nowMinOf(now), target.watches, toDurationMin(target.windDown));
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
export const fill = (s, target) => {
  const w = nightWindow(target.watches, toDurationMin(target.windDown));
  return String(s).replaceAll("{reset}", w ? minToHHMM(w.reset) : "wake");
};

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

// ponytail: the day-open *nudge* is gone (2026-08-07). A line that scrolls past at
// session start was a reminder you could ignore; the gate below is the same intent
// with teeth. Nothing to surface — if the day isn't framed, the tools don't move.

/** The waking-day boundary in hours — the logical day flips at 04:00, not midnight,
 * matching the morning ritual window. A 02:00 session still belongs to the prior day. */
export const DAY_START_HOUR = 4;

/** A logical "day" key for focus that rolls at DAY_START_HOUR, not midnight. Distinct from
 * dayKey (calendar, used by the ritual nudge) so late-night work isn't a new day. @param {number} now */
export const focusDayKey = (now) => dayKey(now - DAY_START_HOUR * 3600_000);

/** Which named watch `now` falls in — the latest start ≤ now, wrapping past midnight
 * to the last watch. "" if no watches configured. @param {number} now @param {Watches} [watches] */
export function activeWatch(now, watches = DEFAULT_WATCHES) {
  const entries = Object.entries(watches ?? {})
    .map(([name, t]) => ({ name, m: toMin(t) }))
    .sort((a, b) => a.m - b.m);
  if (!entries.length) return "";
  const nm = nowMinOf(now);
  let cur = entries[entries.length - 1].name;   // before the first start → wrapped from the last watch
  for (const e of entries) { if (nm >= e.m) cur = e.name; }
  return cur;
}

// ── Intention: the active moment (kairos-owned) ─────────────────
//
// The intention is a zenborg *moment*, not a keel string. keel is a READER of
// `$KAIROS_HOME/activeMoment.json` exactly as it reads areas.json and dayNotes.json
// — same seam, same direction, keel never writes it.
//
//   { "momentId": "80d0f15a-…", "at": "2026-08-07T13:40:12.222Z" }
//
// A pointer file rather than a flag on the moment: 900+ moment records never need
// rewriting, and "exactly one is active" is structural instead of an invariant every
// writer has to remember to clear.
//
// This replaced keel's own watch-scoped intention strings (2026-08-07). Two systems
// held the same concept and neither knew about the other, so the HUD line and the
// board drifted apart by construction.

/** @typedef {{ id: string, name: string, area: string, emoji: string }} ActiveMoment */

/** Resolve the active-moment pointer against the vault's collections. Pure — the caller
 * supplies the parsed files.
 *
 * Returns null whenever the intention cannot be established: no pointer, garbled, an
 * unknown id, or a moment belonging to another day. An unreadable vault therefore
 * degrades to "no intention" and never to a wrong one.
 *
 * Staleness needs no clearing pass: the pointer is honoured only while the moment it
 * names sits on the current waking-day (focusDayKey, the 04:00 roll), so yesterday's
 * pointer stops resolving on its own. Phase is deliberately NOT matched — an afternoon
 * moment is still what you're doing at 20:05, until you switch it in zenborg.
 *
 * @param {any} pointer @param {Record<string, any>|null|undefined} moments
 * @param {{id: string, name: string}[]|null|undefined} areas @param {number} now
 * @returns {ActiveMoment|null} */
export function resolveActiveMoment(pointer, moments, areas, now) {
  const id = pointer && typeof pointer === "object" ? pointer.momentId : null;
  if (typeof id !== "string" || !id.trim()) return null;
  if (!moments || typeof moments !== "object") return null;
  const m = moments[id];
  if (!m || typeof m.name !== "string" || !m.name.trim()) return null;
  if (m.day !== focusDayKey(now)) return null;
  const area = (areas ?? []).find((a) => a && a.id === m.areaId);
  return { id, name: m.name.trim(), area: area?.name ?? "", emoji: m.emoji ?? "" };
}

/** Edge-detect a change of the active-moment pointer — the same shape as the rule_changed
 * check, against the vault instead of the config.
 *
 * Why it exists: the pointer holds only the CURRENT intention, so every switch overwrote
 * the last one and left no trace. keel acts on the active moment (the HUD, the friction
 * scope) while never recording when it changed, which makes "does declaring an intention
 * change what follows?" unanswerable after the fact. History only accrues forward.
 *
 * Observed, not authored: zenborg writes the pointer and keel never does, so the event's
 * `ts` is when a hook happened to notice, while `keel_declared_at` carries the pointer's
 * own `at` — the true instant of declaration. Detection is deliberately eventual: nothing
 * depends on noticing promptly, which is why this rides hooks that already write rather
 * than the HUD, whose statusline path re-renders constantly and stays read-only.
 *
 * The edge is taken on the RAW pointer id, never the resolved moment. A pointer stops
 * resolving on its own at the 04:00 roll (see resolveActiveMoment), and treating that as a
 * switch would emit a "switched to nothing" every single morning — noise dressed as signal.
 *
 * @param {any} pointer @param {ActiveMoment|null} moment @param {any} state
 * @returns {{ extra: Record<string, unknown>, lastMomentId: string }|null} */
export function intentionSwitch(pointer, moment, state) {
  const id = pointer && typeof pointer === "object" && typeof pointer.momentId === "string"
    ? pointer.momentId.trim() : "";
  const prev = typeof state?.lastMomentId === "string" ? state.lastMomentId : "";
  if (id === prev) return null;
  /** @type {Record<string, unknown>} */
  const extra = { keel_moment_id: id, keel_prev_moment_id: prev };
  const at = Date.parse(pointer && typeof pointer === "object" ? pointer.at ?? "" : "");
  if (Number.isFinite(at)) extra.keel_declared_at = at;
  // The name and area ride along because moments are deletable — `delete_cycle` cascades —
  // and an id that no longer resolves would leave the event unreadable to a later read.
  if (moment && moment.id === id) {
    extra.keel_moment_name = moment.name;
    if (moment.area) extra.keel_moment_area = moment.area;
  }
  return { extra, lastMomentId: id };
}

/** Today's moments in board order — the candidates the agent proposes from when nothing
 * is active. @param {Record<string, any>|null|undefined} moments @param {number} now
 * @returns {{name: string, emoji: string}[]} */
export function todaysMoments(moments, now) {
  const day = focusDayKey(now);
  return Object.values(moments ?? {})
    .filter((m) => m && m.day === day && typeof m.name === "string" && m.name.trim())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((m) => ({ name: m.name.trim(), emoji: m.emoji ?? "" }));
}

/** The session-start guardrail line — names the active moment and the drift contract.
 * Empty when nothing is active. @param {ActiveMoment|null} moment @returns {string} */
export function intentionLine(moment) {
  if (!moment) return "";
  const where = moment.area ? ` (${moment.area})` : "";
  return `[keel] ◎ intention: ${moment.name}${where} — capture drift (idea/pain), hold the thread.`;
}

/** The once-per-session nudge, fired only while nothing is active: the agent infers what
 * the session is actually doing, proposes the closest moment, and sets it in zenborg on
 * the user's yes. keel can't set it itself — it's a reader, and the writer lives outside
 * the box it opens. @param {{name: string}[]} candidates @returns {string} */
export function intentionNudge(candidates) {
  const board = candidates.length
    ? `Today's board: ${candidates.map((m) => `"${m.name}"`).join(", ")}.`
    : "Today's board is empty.";
  return `<keel: no active moment — the intention is unset. ${board} Infer what this session` +
    " is actually doing, propose the closest moment (or a new 1–3 word one) in one short line," +
    " and on the user's yes set it active in zenborg via the zenborg MCP. Never set it unasked;" +
    " if you genuinely cannot infer it, say nothing.>";
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

// ── Deep-focus mode (single-stream commitment, opt-in, owner-claimed) ──
// Focus is the deep gear of `intention`, not a second concept: the active moment already
// names the stream (holds-the-thread + captures-drift) and `keel focus` flips this flag over
// it. It does two things intention can't: adds a breath on the AI-wait gap, and holds you to
// ONE stream — tool calls in any session other than the focus owner are denied. A standing
// commitment (a user-invoked Ulysses pact): it survives session restarts and clears only on
// explicit `keel focus off`, never on idle. The CLI can't know which session you meant, so the
// owner is whichever session prompts first after enable (claimFocus); others are blocked.

/** Deny reason shown when a non-owner session tries a tool under active focus. */
export const FOCUS_DENY = "◉ keel focus — held to one stream. Focus is active in another session; work there, or `keel focus off` to release. (journal + ~/.keel stay open.)";

/** Set the deep-focus flag. Enabling leaves the owner UNCLAIMED ("") — the next prompting
 * session claims it (claimFocus). Disabling clears owner + stamp. `focusTs` stamps when it
 * engaged (HUD/"since"). @param {State} state @param {boolean} on @param {number} now */
export function setFocus(state, on, now) {
  return { ...state, focus: !!on, focusTs: on ? now : 0, focusSession: "" };
}

/** Claim the focus owner for a session on its first prompt while focus is on and unclaimed.
 * No-op otherwise (idempotent — a claimed owner is never stolen). @param {State} state @param {string} sessionId */
export function claimFocus(state, sessionId) {
  return state.focus && !state.focusSession && sessionId
    ? { ...state, focusSession: sessionId } : state;
}

/** Does active focus block this session's tools? True only when focus is on, an owner is
 * claimed, and this isn't it. Unclaimed focus blocks nothing yet. @param {State} state @param {string|undefined} sessionId */
export function focusBlocks(state, sessionId) {
  return !!(state.focus && state.focusSession && sessionId && sessionId !== state.focusSession);
}

// ── Day-note gate (kairos-owned) ────────────────────────────────
//
// The day opens in zenborg, not here. keel is a READER of `$KAIROS_HOME/dayNotes.json`
// exactly as it reads areas.json — same seam, same direction, keel never writes it.
// The key can't live inside the box it opens: a Claude Code skill that unlocked Claude
// Code would deadlock. Zenborg is outside the lock.
//
// There is no separate sign-on ceremony and no separate flag. Naming the day IS opening
// it: one question, answered in the UI next to that day's moments. keel only asks whether
// today has a name — never what the name says, and never whether the note is any good.

/** Tools the gate holds until the day is named. Reads stay open on purpose: "no work
 * before naming the day", not "no computer" — you can look around, not change things. */
export const SIGNON_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"];

/** Paths that stay writable with the day unnamed, so capture and the day-close are
 * never trapped behind the gate. Mirrors the night rule's allowPaths. */
export const SIGNON_ALLOW = ["~/journals", "~/.keel"];

export const SIGNON_DENY = "⊙ keel — today has no name yet. Name the day in zenborg (its title, and a note if you want one); the tools unlock the moment you do. (reads, journal + ~/.keel stay open.)";

/** Does the gate hold this tool right now? Pure — the caller supplies the kairos
 * collection. Off unless explicitly enabled, and fails OPEN on a missing/garbled file:
 * an unreadable vault must never be able to lock the day shut.
 *
 * Keyed on `focusDayKey` (04:00 roll), not the calendar date, so a 02:00 session still
 * belongs to the day you already named rather than re-locking mid-flow.
 * @param {boolean} gateOn @param {Record<string, unknown>|null|undefined} dayNotes
 * @param {string|undefined} tool @param {number} now @returns {boolean} */
export function signOnBlocks(gateOn, dayNotes, tool, now) {
  if (!gateOn) return false;
  if (!SIGNON_TOOLS.includes(tool ?? "")) return false;
  if (!dayNotes || typeof dayNotes !== "object") return false; // fail-open: no vault, no lock
  const note = /** @type {any} */ (dayNotes[focusDayKey(now)]);
  return !(note && typeof note.title === "string" && note.title.trim() !== "");
}

// ── Moment friction (kairos-owned moments, keel-owned friction) ──
//
// keel reads `$KAIROS_HOME/moments.json` exactly as it reads areas.json: one
// way, never writing. A moment carries `refs` — the URLs it points at, and
// nothing more; zenborg neither knows nor cares that friction exists.
//
// Turning refs into an allow list is keel's derivation, done HERE rather than
// in the extension so that only hostnames ever cross the relay. A ref is a
// full URL (issue number, doc path); the privacy posture says domains and
// timings, so the URL dies on this side of the wire.

/** @typedef {{ allow: string[], deny: string[] }} MomentFriction */

/** Hostnames from a list of ref URLs. Pure and total: a ref that does not
 * parse is skipped, never thrown on, and never widened into "everything".
 *
 * Normalized like `createDomain` in @keel/domain (lowercase, leading `www.`
 * dropped) so the extension compares like with like.
 * @param {unknown} refs @returns {string[]} */
export function seedAllowFromRefs(refs) {
  const out = new Set();
  if (!Array.isArray(refs)) return [];
  for (const ref of refs) {
    if (typeof ref !== "string") continue;
    let host = "";
    try { host = new URL(ref.trim()).hostname; } catch { continue; } // malformed → skip
    if (!host) continue; // schemes like things:/// carry no host — nothing to allow
    out.add(host.toLowerCase().replace(/^www\./, ""));
  }
  return [...out];
}

/** The friction the active moment scopes: two named lists of hostnames.
 *
 * "Which moment is active" is not re-decided here. It is `resolveActiveMoment`
 * above — the same pointer the intention line reads, with the same waking-day
 * rule (a pointer stops resolving at the 04:00 roll). A second answer to "what
 * am I doing right now" would let the HUD and the gate disagree, which is the
 * exact drift that collapsed keel's own intention strings into this pointer.
 *
 * A moment carries no clock window — it sits on a (day, phase) band — so the
 * moment is active until zenborg says otherwise, not until an hour passes.
 *
 * `allow` is seeded from that moment's refs. `deny` has no source in the vault —
 * nothing there expresses "blocked during this moment" — so it rides empty
 * today. It is carried honestly rather than omitted: the interpreter already
 * enforces it (deny wins over allow), so an authored source can land later
 * without reshaping the wire.
 *
 * Refs themselves are new (zenborg, 2026-08-07), so until moments start
 * carrying them this returns an empty pair for an active moment — which reads
 * as "ask the area", the same as no moment at all. Dormant, not broken.
 *
 * Null when nothing is active. Never a hard block: an empty pair means the
 * area's own policy answers, which is what `momentVerdict` does with it.
 * @param {any} pointer @param {Record<string, any>|null|undefined} moments
 * @param {{id: string, name: string}[]|null|undefined} areas @param {number} now
 * @returns {MomentFriction|null} */
export function momentFrictionAt(pointer, moments, areas, now) {
  const active = resolveActiveMoment(pointer, moments, areas, now);
  if (active === null) return null;
  return { allow: seedAllowFromRefs(moments?.[active.id]?.refs), deny: [] };
}

/** The per-turn deep-focus line. In the owner (or not-yet-claimed) session: a breath on the
 * AI gap. In a blocked session: a note that the stream is held elsewhere. Empty unless focus
 * is on. Scoreless by design (a streak would be engagement, not equanimity); the capture
 * machinery is intention's, this only adds the breath. @param {State} state @param {string|undefined} sessionId @returns {string} */
export function focusLine(state, sessionId) {
  if (!state.focus) return "";
  if (focusBlocks(state, sessionId))
    return "[keel] ◉ focus is held in another session — one stream. `keel focus off` to release.";
  return "[keel] ◉ focus — breathe the AI gap; hold this stream, park strays with /idea.";
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
  const w = nightWindow(t.watches, toDurationMin(t.windDown));
  const lines = [
    `keel rules — effective target (hash ${targetHash(t)})`,
    `watches (${src("watches")}): ${Object.entries(t.watches).map(([n, s]) => `${n}@${s}`).join(", ")}`,
    `wind-down (${src("windDown")}): ${t.windDown} lead → ${w ? `ramp ${minToHHMM(w.windDownStart)}→${minToHHMM(w.nightStart)}, lock (night) until ${minToHHMM(w.reset)}` : "no night watch → pure-soft, never locks"}`,
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
//   windowed → INERT since vice was retired (2026-06-17); the curated list is
//              kept for possible reuse but nothing reads it on the agent surface.
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
  const windowed = `${w.windowed.length} domain(s) (tier inert — vice retired)`;
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
