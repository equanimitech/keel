// @ts-check
// keel agent core — pure domain. No I/O. The piece that later lifts into @keel/domain.

/** @typedef {"MORNING"|"AFTERNOON"|"EVENING"|"NIGHT"|""} Band  a kairos phase band (kernel-owned) */
/** @typedef {{ phase: string, startHour: number, endHour: number }} PhaseConfig */
/** @typedef {{ bellAfterMin: number, sessionGapMin: number }} Orient */
/** @typedef {{ consequence: string, identity: string, signoffNudge: string }} Voice */
/** @typedef {{ orient: Orient, voice: Voice }} Target */
/** @typedef {{ level: string, ts: number }} GranularitySeen  the ceiling a session was last told, and when */
/** @typedef {{ sessionStartTs: number, lastPromptTs: number, inferNudgedTs: number, granularity: string, granularityDay: string, focus: boolean, focusTs: number, lastRuleHash: string, consentShownTs: number, lastMomentId: string, granularitySeen?: Record<string, GranularitySeen> }} State */

/** @type {Target} */
export const DEFAULT_TARGET = {
  orient: { bellAfterMin: 120, sessionGapMin: 30 },
  voice: { consequence: "", identity: "", signoffNudge: "" },
};

/** @returns {State} */
export const emptyState = () => ({
  sessionStartTs: 0, lastPromptTs: 0, inferNudgedTs: 0,
  granularity: "", granularityDay: "", focus: false, focusTs: 0,
  lastRuleHash: "", consentShownTs: 0, lastMomentId: "", granularitySeen: {},
});

/** Merge a partial target config over the defaults. @param {any} t @returns {Target} */
export function mergeTarget(t = {}) {
  return {
    orient: { ...DEFAULT_TARGET.orient, ...t.orient },
    voice: { ...DEFAULT_TARGET.voice, ...t.voice },
  };
}

// ── Time + phase bands ──────────────────────────

/** nowMin in half-open [start,end), wrapping midnight if start > end. */
export function inWindow(nowMin, start, end) {
  return start > end ? nowMin >= start || nowMin < end : nowMin >= start && nowMin < end;
}

export const nowMinOf = (now) => { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); };

// The bands are the kernel's, not keel's. zenborg owns `$KAIROS_HOME/phaseConfigs.json`
// (MORNING/AFTERNOON/EVENING/NIGHT, each a [startHour, endHour) arc) and keel READS them,
// exactly as it reads areas.json and moments.json — same seam, same direction.
//
// keel used to declare its own `watches`: private morning/afternoon/evening/night start
// times, which were also the spine of the night lock. That was a second source of truth for
// the same question and the two had already drifted — keel said evening@19:00, night@00:30
// while zenborg said EVENING 20→03 and NIGHT 03→09. Moments already sit on a (day, phase)
// band, so keel depended on zenborg's answer anyway; carrying a private one only let them
// disagree. Retired with the gates on 2026-08-18.

/** Which kairos band `nowMin` falls in. Total, and fails soft to "": an absent or garbled
 * phaseConfigs must leave events untagged, never throw inside a hook. Visibility is a UI
 * concern, so a hidden band (NIGHT) still answers here.
 * @param {number} nowMin @param {PhaseConfig[]|null|undefined} phaseConfigs @returns {Band} */
export function bandAt(nowMin, phaseConfigs) {
  if (!Array.isArray(phaseConfigs)) return "";
  for (const p of phaseConfigs) {
    const start = Number(p?.startHour) * 60;
    const end = Number(p?.endHour) * 60;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) continue;
    if (inWindow(nowMin, start, end)) return /** @type {Band} */ (String(p?.phase ?? ""));
  }
  return "";
}

/** The band right now. @param {PhaseConfig[]|null|undefined} phaseConfigs @param {number} now @returns {Band} */
export const bandNow = (phaseConfigs, now) => bandAt(nowMinOf(now), phaseConfigs);

// ── Session ─────────────────────────────────────────────────────

/** @param {State} state @param {number} nowTs @param {Orient} orient @returns {State} */
export function updateSession(state, nowTs, orient) {
  const gapMs = orient.sessionGapMin * 60_000;
  const fresh = !state.lastPromptTs || nowTs - state.lastPromptTs > gapMs;
  return { ...state, sessionStartTs: fresh ? nowTs : state.sessionStartTs, lastPromptTs: nowTs };
}
// ── Presentation (pure) ─────────────────────────────────────────

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

/** The session-start line — names the habit being tended, or says plainly that none is.
 *
 * A moment is not something you plant. The habit is the perennial already in the ground;
 * the moment is the watering. So the verb here is *tend*, and the absent case is a dry
 * bed rather than an empty one.
 *
 * ponytail: that absent case returned "" until 2026-08-20, so the one session worth
 * speaking to — the one opening with nothing being tended — was the one that opened in
 * silence. The silence was deliberate once: the day-open nudge was cut on 2026-08-07
 * because the day-note gate carried the same intent "with teeth". The gate was retired on
 * 2026-08-18 and nothing refilled the hole. A line you can ignore is weaker than a gate,
 * and that is the trade shadow mode requires — zenborg's migration is at step 2, where the
 * loop runs and nothing acts on it.
 * @param {ActiveMoment|null} moment @returns {string} */
export function intentionLine(moment) {
  if (!moment) return "[keel] ◌ nothing is being tended — no habit is getting water this session.";
  const where = moment.area ? ` (${moment.area})` : "";
  return `[keel] ◎ tending: ${moment.name}${where} — capture drift (idea/pain), hold the thread.`;
}

/** The once-per-session nudge, fired while nothing is being tended: the agent infers what
 * the session is actually doing, proposes the habit closest to it, and sets it in zenborg
 * on the user's yes. keel can't set it itself — it's a reader, and the writer lives outside
 * the box it opens.
 *
 * The cwd is the strongest hint available about which area the work belongs to, and it is
 * the same seam a later gate would read. Naming it here makes the proposal specific now,
 * and makes the cwd→area mapping observable well before anything is gated on it.
 * @param {{name: string}[]} candidates @param {string} [cwd] @returns {string} */
export function intentionNudge(candidates, cwd) {
  const garden = candidates.length
    ? `Today's garden: ${candidates.map((m) => `"${m.name}"`).join(", ")}.`
    : "Today's garden is bare.";
  const dir = String(cwd ?? "").trim();
  const where = dir ? ` Working in ${dir}.` : "";
  return `<keel: nothing is being tended — no habit is getting water this session. ${garden}${where}` +
    " Infer what this session is actually doing, propose the closest habit to tend (or a new" +
    " 1–3 word moment) in one short line, and on the user's yes set it active in zenborg via" +
    " the zenborg MCP. Never set it unasked; if you genuinely cannot infer it, say nothing.>";
}

/** Response-granularity levels → the depth contract each implies (maps to semantic-zoom). */
export const GRANULARITY_LEVELS = {
  sentence: "L1 — one sentence, claim only.",
  tldr:     "L2 — one paragraph, claim + mechanism.",
  page:     "L3 — ~a page: claim + mechanism + worked example, scannable.",
  essay:    "L4 — ~800-1500 words: the claim in tension with the alternatives it beats.",
  report:   "L5 — multi-section, citations, edge cases. Defensible.",
};

/** Levels in ascending depth. The order is the whole comparison — `min` over this index
 * is how every ceiling composes. */
export const GRANULARITY_ORDER = ["sentence", "tldr", "page", "essay", "report"];

/** The ceiling in force when none is set for the day. Deliberately `page`, not `tldr`:
 * a `tldr` default is a floor by another name, and a floor is a constant — which is
 * exactly why the dial never moved. `page` is the usable level and a neutral cap. */
export const DEFAULT_GRANULARITY = "page";

/** Normalize a raw granularity arg to a canonical level, or "" if unrecognized. @param {string} raw */
export function normalizeGranularity(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_;-]+/g, "");
  if (s === "sentence" || s === "1" || s === "l1" || s === "oneliner" || s === "line") return "sentence";
  if (s === "tldr" || s === "2" || s === "l2" || s === "paragraph" || s === "brief" || s === "summary") return "tldr";
  if (s === "page" || s === "3" || s === "l3" || s === "usable") return "page";
  if (s === "essay" || s === "4" || s === "l4" || s === "argue" || s === "blogpost" || s === "post") return "essay";
  if (s === "report" || s === "5" || s === "l5" || s === "full" || s === "detailed" || s === "deep") return "report";
  return "";
}

/** Set the granularity ceiling (the response-depth dial). **Day-scoped**, not
 * session-scoped: it is stamped with the waking-day and survives a fresh session, so a
 * dial set once in the morning still governs the terminal you open after lunch. A
 * session-scoped dial resets to the default every time and can therefore never vary,
 * which is the bug this replaces.
 * @param {State} state @param {string} level @param {number} [now] */
export function setGranularity(state, level, now = Date.now()) {
  return { ...state, granularity: level, granularityDay: focusDayKey(now) };
}

/** The active granularity ceiling — the level set this waking-day, or the default when
 * unset, invalid, or stamped with an earlier day. Never empty: a contract is always in
 * force. @param {State} state @param {number} [now] */
export function activeGranularity(state, now = Date.now()) {
  const fresh = state.granularityDay === focusDayKey(now);
  return fresh && state.granularity && GRANULARITY_LEVELS[state.granularity]
    ? state.granularity
    : DEFAULT_GRANULARITY;
}

/** The depth actually owed this turn: the shallower of what the ask deserves and the
 * day's ceiling. The resting state is the ask, not a pinned level — that is the whole
 * difference between a ceiling and a floor. An unrecognized `want` defers to the ceiling.
 * @param {string} want @param {State} state @param {number} [now] @returns {string} */
export function effectiveGranularity(want, state, now = Date.now()) {
  const ceiling = activeGranularity(state, now);
  const asked = GRANULARITY_LEVELS[want] ? want : ceiling;
  return GRANULARITY_ORDER.indexOf(asked) <= GRANULARITY_ORDER.indexOf(ceiling) ? asked : ceiling;
}

/** Does this ask outrun the day's ceiling? The guard against a ceiling's failure mode,
 * which is silent under-delivery: the caller surfaces the fork — "this wants a page and
 * today's ceiling is tldr" — rather than quietly shrinking the answer. At the ceiling is
 * not over it. @param {string} want @param {State} state @param {number} [now] */
export function exceedsCeiling(want, state, now = Date.now()) {
  if (!GRANULARITY_LEVELS[want]) return false;
  return GRANULARITY_ORDER.indexOf(want) > GRANULARITY_ORDER.indexOf(activeGranularity(state, now));
}

/** The granularity contract line — surfaced at session-start and in the HUD. Always renders,
 * because a ceiling is always in force. @param {State} state @param {number} [now] @returns {string} */
export function granularityLine(state, now = Date.now()) {
  const g = activeGranularity(state, now);
  return `[keel] ▤ granularity ceiling: ${g} — ${GRANULARITY_LEVELS[g]} Below it, fit the answer to the ask. Per-response signal still overrides ("page it", "in a sentence").`;
}

// ── Re-asserting the ceiling when it moves ──────────────────────
//
// The ceiling used to reach the agent exactly once, at session-start, and live
// afterwards only in the statusline HUD — ambient by design, on the assumption
// that a day-scoped dial changes rarely enough for one telling to hold.
//
// The tray submenu (2026-08-12) broke that assumption: the dial is now a click
// away, so it moves mid-session, and every move after session-start was
// invisible to the agent. It kept answering to the level it was told at open,
// which is indistinguishable from ignoring the dial — and was, in fact, first
// noticed as "the responses aren't governed by this at all".
//
// So: still silent on an unchanged turn (no per-turn noise), but re-surfaced
// the first time a session sees a level it has not been told. Per session, not
// global — with several sessions open, telling one and silencing the rest would
// leave most of them steering by a stale contract.

/** How long a session's "already told" mark survives. A day outlives the
 * longest plausible session and keeps the map from growing without bound. */
export const GRANULARITY_SEEN_TTL_MS = 24 * 3600_000;

/** Hard cap on tracked sessions, newest kept. Belt to the TTL's braces: many
 * short sessions in one day must not turn this into an unbounded ledger. */
export const GRANULARITY_SEEN_MAX = 64;

/** Drop marks past the TTL, then keep the newest `GRANULARITY_SEEN_MAX`.
 * @param {Record<string, {level: string, ts: number}>} seen @param {number} now */
export function pruneGranularitySeen(seen, now = Date.now()) {
  const fresh = Object.entries(seen ?? {})
    .filter(([, v]) => v && now - (v.ts ?? 0) < GRANULARITY_SEEN_TTL_MS)
    .sort((a, b) => (b[1].ts ?? 0) - (a[1].ts ?? 0))
    .slice(0, GRANULARITY_SEEN_MAX);
  return Object.fromEntries(fresh);
}

/** The ceiling line owed to THIS session this turn, and the state that records
 * having told it. Empty line whenever the session already holds the level in
 * force, so an unchanged turn stays silent.
 *
 * A session with no id (the CLI, an unidentified hook) shares one bucket: it
 * still gets told on a change, it just cannot be distinguished from its peers.
 *
 * Concurrent writers race on the state file, last write wins, and the worst
 * outcome is a session being told twice — which is why this is a notice and not
 * a gate.
 *
 * @param {State} state @param {string|undefined} sessionId @param {number} [now]
 * @returns {{ line: string, state: State }} */
export function granularityNotice(state, sessionId, now = Date.now()) {
  const key = sessionId || "";
  const level = activeGranularity(state, now);
  const seen = state.granularitySeen ?? {};
  if (seen[key]?.level === level) return { line: "", state };
  return {
    line: granularityLine(state, now),
    state: {
      ...state,
      granularitySeen: pruneGranularitySeen({ ...seen, [key]: { level, ts: now } }, now),
    },
  };
}

// ── Focus marker (self-invoked, non-blocking) ────────────
// Focus is the deep gear of `intention`, not a second concept: the active moment already
// names the stream and `keel focus` flips this flag over it.
//
// It used to also hold you to ONE stream — tool calls in any session but the focus owner
// were denied. That wall went on 2026-08-18 with the night lock and the day-note gate; what
// remains is the half that carried signal rather than refusal: a breath on the AI-wait gap,
// a ◉ in the HUD, and focus_on/focus_off in the log so the read-side EDA can segment focus
// periods. Nothing here denies anything.

/** Set the focus marker. `focusTs` stamps when it engaged (HUD/"since"). Survives session
 * restarts and clears only on explicit `keel focus off`, never on idle.
 * @param {State} state @param {boolean} on @param {number} now */
export function setFocus(state, on, now) {
  return { ...state, focus: !!on, focusTs: on ? now : 0 };
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

/** The per-turn focus line: a breath on the AI-wait gap. Empty unless focus is on.
 * Scoreless by design (a streak would be engagement, not equanimity); the capture
 * machinery is intention's, this only adds the breath. @param {State} state @returns {string} */
export function focusLine(state) {
  if (!state.focus) return "";
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
 * The bands are printed as (kairos) rather than custom/default on purpose: they are not
 * keel's to default, and a reader who wants them changed must be sent to zenborg.
 * @param {Target} t @param {any} configured raw (unmerged) user config for provenance
 * @param {PhaseConfig[]|null|undefined} phaseConfigs the kernel's bands */
export function renderRules(t, configured = {}, phaseConfigs = null) {
  const src = (k) => (configured && configured[k] !== undefined ? "custom" : "default");
  const bands = Array.isArray(phaseConfigs) && phaseConfigs.length
    ? phaseConfigs.map((b) => `${b.phase}@${b.startHour}→${b.endHour}`).join(", ")
    : "(unreadable — events log with no band)";
  const lines = [
    `keel rules — effective target (hash ${targetHash(t)})`,
    `phase bands (kairos): ${bands}`,
    `gates: none — keel denies nothing. The night lock, the day-note gate and the focus lock were retired 2026-08-18.`,
  ];
  lines.push(`orient (${src("orient")}): bell after ${t.orient.bellAfterMin}m · session gap ${t.orient.sessionGapMin}m`);
  const setVoice = Object.entries(t.voice).filter(([, v]) => typeof v === "string" && v).map(([k]) => k);
  lines.push(`voice (${src("voice")}): ${setVoice.join(", ") || "(all silent)"}`);
  lines.push(`edit: ~/.kairos/keel/config.json — changes apply at the next hook fire, no reload.`);
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
    return ["watchlist: empty — self-authored; add domains in ~/.kairos/keel/config.json (tiers: observe, windowed)"];
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
    "[keel] · keel logs your Claude Code session events (prompts, tool calls, timings) to ~/.kairos/keel/log/ — plain JSONL you own.",
    "[keel] · Everything stays on this machine. Nothing is sent anywhere, ever.",
    "[keel] · Pause or remove anytime: disable the plugin (or delete the hooks block); your data stays yours.",
    "[keel] · See your rules: `keel rules` · see your data: `keel log status`.",
  ];
}
