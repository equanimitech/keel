import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandAt, updateSession,
  mergeTarget, emptyState,
  normalizeGranularity, activeGranularity, setGranularity, DEFAULT_GRANULARITY,
  effectiveGranularity, exceedsCeiling, granularityLine,
  granularityNotice, pruneGranularitySeen, GRANULARITY_SEEN_MAX, GRANULARITY_SEEN_TTL_MS,
  resolveActiveMoment, todaysMoments, intentionLine, intentionNudge, focusDayKey,
  setFocus, focusLine,
  seedAllowFromRefs, momentFrictionAt, intentionSwitch,
} from "./core.mjs";

// zenborg's real bands, as `list_phase_configs` returns them (NIGHT wraps past midnight).
const BANDS = [
  { phase: "MORNING", startHour: 9, endHour: 13, order: 0 },
  { phase: "AFTERNOON", startHour: 13, endHour: 20, order: 1 },
  { phase: "EVENING", startHour: 20, endHour: 3, order: 2 },
  { phase: "NIGHT", startHour: 3, endHour: 9, order: 3 },
];

test("granularity: a level set on one waking-day does not survive into the next", () => {
  const mon = Date.parse("2026-08-10T10:00:00");
  const tue = Date.parse("2026-08-11T10:00:00");
  const set = setGranularity(emptyState(), "report", mon);
  assert.equal(activeGranularity(set, mon), "report");     // holds all day
  assert.notEqual(activeGranularity(set, tue), "report");  // gone at the roll
});

test("granularity: the day's level caps the ask rather than pinning it", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const light = setGranularity(emptyState(), "tldr", now);
  // Below the ceiling the ask decides — this is what a floor could never do.
  assert.equal(effectiveGranularity("sentence", light, now), "sentence");
  // Above it, the ceiling bites.
  assert.equal(effectiveGranularity("report", light, now), "tldr");
});

test("granularity: essay (L4) sits between page and report in the order", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  // The array index IS the comparison, so L4's position is the whole contract.
  const essay = setGranularity(emptyState(), "essay", now);
  assert.equal(effectiveGranularity("page", essay, now), "page");      // below → the ask decides
  assert.equal(effectiveGranularity("report", essay, now), "essay");   // above → the ceiling bites
  const page = setGranularity(emptyState(), "page", now);
  assert.equal(effectiveGranularity("essay", page, now), "page");      // essay is deeper than page
});

test("granularity: with nothing set the ceiling is page, not the old tldr floor", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  assert.equal(activeGranularity(emptyState(), now), "page");
  assert.equal(effectiveGranularity("report", emptyState(), now), "page");
  assert.equal(effectiveGranularity("sentence", emptyState(), now), "sentence");
});

test("granularityLine: names a ceiling and the resting rule, never a floor", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const line = granularityLine(emptyState(), now);
  assert.match(line, /ceiling/);
  assert.match(line, /fit the answer to the ask/);
  // The old copy sold tldr as "the resting floor" — the thing that made it a constant.
  assert.doesNotMatch(granularityLine(setGranularity(emptyState(), "tldr", now), now), /floor/);
  // And it tracks the day's setting, so the line can be watched for movement.
  assert.match(granularityLine(setGranularity(emptyState(), "sentence", now), now), /sentence/);
});

test("granularityNotice: tells a session that has been told nothing", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const { line, state } = granularityNotice(emptyState(), "s1", now);
  assert.match(line, /granularity ceiling/);
  assert.equal(state.granularitySeen.s1.level, DEFAULT_GRANULARITY);
});

test("granularityNotice: silent while the session already holds the level", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const first = granularityNotice(emptyState(), "s1", now);
  const second = granularityNotice(first.state, "s1", now + 60_000);
  assert.equal(second.line, "");
  // And it does not churn the state on a quiet turn.
  assert.equal(second.state, first.state);
});

test("granularityNotice: re-tells when the dial moves mid-session", () => {
  // The bug this exists for: the tray moves the ceiling, the agent never hears.
  const now = Date.parse("2026-08-10T10:00:00");
  const told = granularityNotice(emptyState(), "s1", now).state;
  const moved = setGranularity(told, "sentence", now + 60_000);
  const { line } = granularityNotice(moved, "s1", now + 61_000);
  assert.match(line, /sentence/);
});

test("granularityNotice: every session is told, not just the first one", () => {
  // With several sessions open, telling one and silencing the rest would leave
  // most of them answering to a stale contract.
  const now = Date.parse("2026-08-10T10:00:00");
  const moved = setGranularity(emptyState(), "tldr", now);
  const a = granularityNotice(moved, "s1", now);
  const b = granularityNotice(a.state, "s2", now);
  const c = granularityNotice(b.state, "s3", now);
  assert.match(a.line, /tldr/);
  assert.match(b.line, /tldr/);
  assert.match(c.line, /tldr/);
});

test("granularityNotice: the 04:00 lapse back to the default is itself a change", () => {
  const mon = Date.parse("2026-08-10T10:00:00");
  const told = granularityNotice(setGranularity(emptyState(), "sentence", mon), "s1", mon).state;
  // Next waking-day: the stamp lapsed, so the ceiling is the default again.
  const tue = Date.parse("2026-08-11T10:00:00");
  const { line } = granularityNotice(told, "s1", tue);
  assert.match(line, new RegExp(DEFAULT_GRANULARITY));
});

test("granularityNotice: an unidentified session still gets told on a change", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const first = granularityNotice(emptyState(), undefined, now);
  assert.match(first.line, /granularity ceiling/);
  assert.equal(granularityNotice(first.state, "", now).line, "");
  const moved = setGranularity(first.state, "report", now);
  assert.match(granularityNotice(moved, undefined, now).line, /report/);
});

test("pruneGranularitySeen: bounded by age and by count", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const stale = { old: { level: "page", ts: now - GRANULARITY_SEEN_TTL_MS - 1 }, live: { level: "page", ts: now } };
  assert.deepEqual(Object.keys(pruneGranularitySeen(stale, now)), ["live"]);

  const many = Object.fromEntries(
    Array.from({ length: GRANULARITY_SEEN_MAX + 20 }, (_, i) => [`s${i}`, { level: "page", ts: now - i * 1000 }]),
  );
  const kept = pruneGranularitySeen(many, now);
  assert.equal(Object.keys(kept).length, GRANULARITY_SEEN_MAX);
  assert.ok(kept.s0, "the newest mark survives");
  assert.ok(!kept[`s${GRANULARITY_SEEN_MAX + 10}`], "the oldest are dropped");
});

test("exceedsCeiling: true only when the ask outruns the day", () => {
  const now = Date.parse("2026-08-10T10:00:00");
  const light = setGranularity(emptyState(), "tldr", now);
  assert.equal(exceedsCeiling("report", light, now), true);
  assert.equal(exceedsCeiling("sentence", light, now), false);
  assert.equal(exceedsCeiling("tldr", light, now), false);   // at the ceiling is not over it
  assert.equal(exceedsCeiling("garbage", light, now), false); // unrecognized asks nothing
});

test("granularity: parses aliases, falls back to the floor, never empty", () => {
  assert.equal(normalizeGranularity("tl;dr"), "tldr");
  assert.equal(normalizeGranularity("L3"), "page");
  assert.equal(normalizeGranularity("essay"), "essay");
  assert.equal(normalizeGranularity("L4"), "essay");
  assert.equal(normalizeGranularity("blog post"), "essay"); // v1 called L4 "blog post"
  assert.equal(normalizeGranularity("detailed"), "report");
  assert.equal(normalizeGranularity("garbage"), "");        // unrecognized → caller keeps current
  // The floor: unset or invalid state still yields a contract, never "".
  assert.equal(activeGranularity(emptyState()), DEFAULT_GRANULARITY);
  assert.equal(activeGranularity({ granularity: "nonsense" }), DEFAULT_GRANULARITY);
  // A set level survives within the session.
  assert.equal(activeGranularity(setGranularity(emptyState(), "page")), "page");
});

test("resolveActiveMoment: resolves the pointer, names the area, degrades to null", () => {
  const noon = Date.parse("2026-06-19T12:00:00");
  const areas = [{ id: "a1", name: "Themia" }];
  const moments = {
    m1: { id: "m1", name: "  staging release  ", areaId: "a1", day: "2026-06-19", order: 1, emoji: "🛠️" },
    old: { id: "old", name: "yesterday's thing", areaId: "a1", day: "2026-06-18", order: 0 },
    noArea: { id: "noArea", name: "gym", areaId: "gone", day: "2026-06-19", order: 0 },
  };
  const at = (id) => resolveActiveMoment({ momentId: id }, moments, areas, noon);

  assert.deepEqual(at("m1"), { id: "m1", name: "staging release", area: "Themia", emoji: "🛠️" });
  // An area the vault no longer lists still yields the moment — the name is what carries.
  assert.equal(at("noArea")?.area, "");
  // Staleness retires itself at the 04:00 roll: yesterday's pointer stops resolving.
  assert.equal(at("old"), null);
  // Every unusable input degrades to "no intention", never to a wrong one.
  assert.equal(at("missing"), null);
  assert.equal(resolveActiveMoment(null, moments, areas, noon), null);
  assert.equal(resolveActiveMoment({}, moments, areas, noon), null);
  assert.equal(resolveActiveMoment({ momentId: "  " }, moments, areas, noon), null);
  assert.equal(resolveActiveMoment({ momentId: "m1" }, null, areas, noon), null);
  // Phase is deliberately not matched — an afternoon moment is still yours at 23:00.
  assert.equal(resolveActiveMoment({ momentId: "m1" }, moments, areas, Date.parse("2026-06-19T23:00:00"))?.name, "staging release");

  assert.equal(intentionLine(at("m1")), "[keel] ◎ tending: staging release (Themia) — capture drift (idea/pain), hold the thread.");
  // The absent case speaks. It returned "" until 2026-08-20, which made the session that
  // most needed the line the only one that never got it.
  assert.equal(intentionLine(null), "[keel] ◌ nothing is being tended — no habit is getting water this session.");
});

test("intentionNudge: names the garden, the cwd, and never sets anything itself", () => {
  const withCwd = intentionNudge([{ name: "staging release" }, { name: "gym" }], "/Users/rafa/Developer/themia");
  assert.match(withCwd, /nothing is being tended/);
  assert.match(withCwd, /Today's garden: "staging release", "gym"\./);
  assert.match(withCwd, /Working in \/Users\/rafa\/Developer\/themia\./);
  // keel reads; zenborg writes. The nudge must never imply keel can set the moment.
  assert.match(withCwd, /set it active in zenborg via the zenborg MCP/);
  assert.match(withCwd, /Never set it unasked/);

  // A bare garden is still a garden — the line must not collapse to silence.
  assert.match(intentionNudge([], ""), /Today's garden is bare\./);
  // No cwd, no clause — never the string "undefined".
  assert.doesNotMatch(intentionNudge([], undefined), /Working in/);
  assert.doesNotMatch(intentionNudge([], undefined), /undefined/);
  assert.doesNotMatch(intentionNudge([], "   "), /Working in/);
});

test("todaysMoments: today's board only, in order", () => {
  const noon = Date.parse("2026-06-19T12:00:00");
  const moments = {
    b: { name: "gym", day: "2026-06-19", order: 2 },
    a: { name: "staging release", day: "2026-06-19", order: 1 },
    old: { name: "stale", day: "2026-06-18", order: 0 },
    junk: { name: "   ", day: "2026-06-19", order: 0 },
  };
  assert.deepEqual(todaysMoments(moments, noon).map((m) => m.name), ["staging release", "gym"]);
  assert.deepEqual(todaysMoments(null, noon), []);
  // Pre-04:00 still belongs to the prior waking-day, so that day's board is what shows.
  assert.deepEqual(todaysMoments(moments, Date.parse("2026-06-19T02:00:00")).map((m) => m.name), ["stale"]);
});

test("focusDayKey: the day flips at 04:00, not midnight", () => {
  assert.equal(focusDayKey(Date.parse("2026-06-19T03:59:00")), "2026-06-18"); // pre-dawn → prior day
  assert.equal(focusDayKey(Date.parse("2026-06-19T04:00:00")), "2026-06-19"); // boundary → new day
  assert.equal(focusDayKey(Date.parse("2026-06-19T23:30:00")), "2026-06-19");
});

test("updateSession continues within gap, resets after gap", () => {
  const orient = { sessionGapMin: 30 };
  let s = updateSession({ sessionStartTs: 0, lastPromptTs: 0 }, 1_000_000, orient);
  assert.equal(s.sessionStartTs, 1_000_000);
  const ten = 1_000_000 + 10 * 60_000;
  s = updateSession(s, ten, orient);
  assert.equal(s.sessionStartTs, 1_000_000);
  const big = ten + 40 * 60_000;
  s = updateSession(s, big, orient);
  assert.equal(s.sessionStartTs, big);
});

test("focus: a marker, not a lock — the flag flips and the breath line follows it", () => {
  let s = setFocus(emptyState(), true, 1000);
  assert.equal(s.focus, true);
  assert.equal(s.focusTs, 1000);
  assert.match(focusLine(s), /breathe the AI gap/);
  s = setFocus(s, false, 2000);
  assert.equal(s.focus, false);
  assert.equal(s.focusTs, 0);
  assert.equal(focusLine(s), "");
});

test("focus carries no session ownership — nothing to claim, nothing held", () => {
  const s = setFocus(emptyState(), true, 0);
  assert.equal("focusSession" in s, false);
});

test("bandAt: every hour of the day resolves to exactly one kairos band", () => {
  assert.equal(bandAt(9 * 60, BANDS), "MORNING");
  assert.equal(bandAt(12 * 60 + 59, BANDS), "MORNING");
  assert.equal(bandAt(13 * 60, BANDS), "AFTERNOON");     // half-open: the boundary belongs to the later band
  assert.equal(bandAt(19 * 60 + 59, BANDS), "AFTERNOON");
  assert.equal(bandAt(20 * 60, BANDS), "EVENING");
  assert.equal(bandAt(23 * 60, BANDS), "EVENING");
  assert.equal(bandAt(0, BANDS), "EVENING");             // EVENING wraps past midnight to 03:00
  assert.equal(bandAt(2 * 60 + 59, BANDS), "EVENING");
  assert.equal(bandAt(3 * 60, BANDS), "NIGHT");
  assert.equal(bandAt(8 * 60 + 59, BANDS), "NIGHT");
});

test("bandAt: fails soft to \"\" rather than throwing inside a hook", () => {
  assert.equal(bandAt(600, null), "");
  assert.equal(bandAt(600, undefined), "");
  assert.equal(bandAt(600, []), "");
  assert.equal(bandAt(600, [{ phase: "BROKEN" }]), "");                       // no hours
  assert.equal(bandAt(600, [{ phase: "X", startHour: 5, endHour: 5 }]), "");  // empty arc
});

// ── Moment friction (refs → allow list) ─────────────────────────

test("seedAllowFromRefs: hostnames only, normalized, deduped", () => {
  assert.deepEqual(
    seedAllowFromRefs([
      "https://linear.app/acme/issue/ABC-1",
      "https://linear.app/acme/issue/ABC-2",   // same host → one entry
      "https://WWW.GitHub.com/acme/keel/pull/9",
    ]),
    ["linear.app", "github.com"],
  );
});

test("seedAllowFromRefs: skips what it cannot parse, never throws, never widens", () => {
  // A malformed ref is dropped. It must not throw, and it must not turn the
  // list into "everything" — the surviving refs still scope the moment.
  assert.deepEqual(
    seedAllowFromRefs(["not a url", "https://linear.app/x", "", "example.com"]),
    ["linear.app"],
  );
  // Nothing parseable at all → an empty list, which reads as "ask the area".
  assert.deepEqual(seedAllowFromRefs(["not a url", 42, null]), []);
  assert.deepEqual(seedAllowFromRefs(undefined), []);
  assert.deepEqual(seedAllowFromRefs("https://linear.app"), []);  // not an array
});

test("seedAllowFromRefs: a hostless scheme contributes nothing", () => {
  // things:///show?id=… is a legitimate ref and a legitimate no-op here:
  // there is no host to allow, so it scopes nothing.
  assert.deepEqual(seedAllowFromRefs(["things:///show?id=abc"]), []);
  assert.deepEqual(
    seedAllowFromRefs(["things:///show?id=abc", "https://linear.app/x"]),
    ["linear.app"],
  );
});

// Fixtures below carry the real vault shape: a moment sits on a (day, phase)
// band with an order — there is no startTime and no durationMin on any of the
// 901 moments in the vault, and never has been. Which moment is active comes
// from the pointer, not from the clock.
const momentBoard = {
  build: {
    id: "build", name: "ship refs", areaId: "a1", day: "2026-08-07",
    phase: "AFTERNOON", order: 0, emoji: "🛠️", tags: [],
    refs: ["https://linear.app/acme/issue/ABC-1", "nonsense"],
  },
  sit: {
    id: "sit", name: "sit", areaId: "a2", day: "2026-08-07",
    phase: "MORNING", order: 1, emoji: "🧘", tags: [],
  },
  yesterday: {
    id: "yesterday", name: "old thing", areaId: "a1", day: "2026-08-06",
    phase: "EVENING", order: 0, emoji: "", tags: [],
  },
};
const boardAreas = [{ id: "a1", name: "Themia" }, { id: "a2", name: "Body" }];

test("momentFrictionAt: allow seeded from the active moment's refs, deny carried empty", () => {
  const noon = Date.parse("2026-08-07T12:00:00");
  assert.deepEqual(
    momentFrictionAt({ momentId: "build" }, momentBoard, boardAreas, noon),
    { allow: ["linear.app"], deny: [] },
  );
});

test("momentFrictionAt: an active moment without refs imposes nothing", () => {
  // The meditation case, and today's normal case — no moment in the vault
  // carries refs yet. Two empty lists, which `momentVerdict` reads as "ask the
  // area": not a block, and not permission for everything.
  const noon = Date.parse("2026-08-07T12:00:00");
  assert.deepEqual(
    momentFrictionAt({ momentId: "sit" }, momentBoard, boardAreas, noon),
    { allow: [], deny: [] },
  );
});

test("momentFrictionAt: nothing active → null, by every route there is", () => {
  const noon = Date.parse("2026-08-07T12:00:00");
  const at = (pointer, moments = momentBoard) =>
    momentFrictionAt(pointer, moments, boardAreas, noon);
  assert.equal(at(null), null);                      // no pointer file on disk (the normal case today)
  assert.equal(at({}), null);                        // garbled pointer
  assert.equal(at({ momentId: "gone" }), null);      // id the board no longer holds
  assert.equal(at({ momentId: "yesterday" }), null); // retired at the 04:00 roll
  assert.equal(at({ momentId: "build" }, null), null); // unreadable moments.json
});

test("momentFrictionAt: the moment stays active across the whole day, not for an hour", () => {
  // A moment has no clock window. Once it is the pointer's, it holds until
  // zenborg names another — an AFTERNOON moment is still yours at 23:00.
  const late = Date.parse("2026-08-07T23:00:00");
  assert.deepEqual(
    momentFrictionAt({ momentId: "build" }, momentBoard, boardAreas, late),
    { allow: ["linear.app"], deny: [] },
  );
  // And it retires itself past the 04:00 roll rather than needing a clearing pass.
  const tomorrow = Date.parse("2026-08-08T09:00:00");
  assert.equal(momentFrictionAt({ momentId: "build" }, momentBoard, boardAreas, tomorrow), null);
});

// ── intentionSwitch: the pointer keeps no history, so keel has to notice ──

test("intentionSwitch: fires on a change, stays silent on a repeat", () => {
  const pointer = { momentId: "build", at: "2026-08-07T09:12:00.000Z" };
  const moment = { id: "build", name: "ship drift", area: "craft", emoji: "" };

  const first = intentionSwitch(pointer, moment, { lastMomentId: "" });
  assert.equal(first?.lastMomentId, "build");
  assert.equal(first?.extra.keel_moment_id, "build");
  assert.equal(first?.extra.keel_prev_moment_id, "");
  // ts is when a hook noticed; declared_at is when it was actually declared.
  assert.equal(first?.extra.keel_declared_at, Date.parse("2026-08-07T09:12:00.000Z"));
  assert.equal(first?.extra.keel_moment_name, "ship drift");
  assert.equal(first?.extra.keel_moment_area, "craft");

  // Every subsequent hook sees the same pointer — exactly one event per switch.
  assert.equal(intentionSwitch(pointer, moment, { lastMomentId: "build" }), null);
});

test("intentionSwitch: the edge is the raw pointer, so the 04:00 roll is not a switch", () => {
  // resolveActiveMoment returns null for yesterday's moment, but the pointer is untouched.
  // Edging on the resolved moment would emit a spurious 'switched to nothing' every morning.
  const stale = { momentId: "build", at: "2026-08-06T09:12:00.000Z" };
  assert.equal(intentionSwitch(stale, null, { lastMomentId: "build" }), null);
});

test("intentionSwitch: records the switch even when the moment no longer resolves", () => {
  // delete_cycle cascades into its moments, so an id alone can dangle. The switch is still
  // recorded — just without the label that would have made it readable later.
  const p = { momentId: "gone", at: "2026-08-07T11:00:00.000Z" };
  const sw = intentionSwitch(p, null, { lastMomentId: "build" });
  assert.equal(sw?.extra.keel_moment_id, "gone");
  assert.equal(sw?.extra.keel_prev_moment_id, "build");
  assert.equal(sw?.extra.keel_moment_name, undefined);
});

test("intentionSwitch: clearing the pointer is a switch to nothing", () => {
  const sw = intentionSwitch(null, null, { lastMomentId: "build" });
  assert.equal(sw?.lastMomentId, "");
  assert.equal(sw?.extra.keel_moment_id, "");
  assert.equal(sw?.extra.keel_prev_moment_id, "build");
  // ...but a vault that never had a pointer must not emit one on every hook forever.
  assert.equal(intentionSwitch(null, null, {}), null);
  assert.equal(intentionSwitch({}, null, { lastMomentId: "" }), null);
});

test("intentionSwitch: an unparseable declaration time is omitted, never faked", () => {
  const sw = intentionSwitch({ momentId: "build", at: "not-a-date" }, null, { lastMomentId: "" });
  assert.equal("keel_declared_at" in (sw?.extra ?? {}), false);
});
