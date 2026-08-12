import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, phaseOf, updateSession, unbrokenMin,
  denyingRule, renderOrient, signOnBlocks,
  mergeTarget, emptyState, frictionNow,
  normalizeGranularity, activeGranularity, setGranularity, DEFAULT_GRANULARITY,
  effectiveGranularity, exceedsCeiling, granularityLine,
  granularityNotice, pruneGranularitySeen, GRANULARITY_SEEN_MAX, GRANULARITY_SEEN_TTL_MS,
  resolveActiveMoment, todaysMoments, intentionLine, focusDayKey,
  setFocus, claimFocus, focusBlocks, focusLine,
  seedAllowFromRefs, momentFrictionAt, intentionSwitch,
} from "./core.mjs";

// Watches with night@01:00 + a 90m lead reproduce the old 23:30→01:00 ramp, 01:00→05:00 lock.
const watches = { morning: "05:00", afternoon: "13:00", evening: "19:00", night: "01:00" };
const lead = 90;
const near = (a, b) => Math.abs(a - b) < 0.02;

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

  assert.equal(intentionLine(at("m1")), "[keel] ◎ intention: staging release (Themia) — capture drift (idea/pain), hold the thread.");
  assert.equal(intentionLine(null), "");
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

test("signOnBlocks: holds writes until the day has a name in zenborg", () => {
  const friday = Date.parse("2026-06-19T22:00:00");
  const key = focusDayKey(friday);
  const named = { [key]: { date: key, title: "Ship export", body: "# plan\n- land the writer" } };

  // Gate off (the default) → never blocks, named or not.
  assert.equal(signOnBlocks(false, {}, "Edit", friday), false);
  // Gate on, day unnamed → writes held.
  assert.equal(signOnBlocks(true, {}, "Edit", friday), true);
  assert.equal(signOnBlocks(true, {}, "Bash", friday), true);
  // Reads stay open — "no work before naming the day", not "no computer".
  assert.equal(signOnBlocks(true, {}, "Read", friday), false);
  assert.equal(signOnBlocks(true, {}, "Grep", friday), false);
  // Named today → open.
  assert.equal(signOnBlocks(true, named, "Edit", friday), false);
  // A title with no body still opens it — the body is optional, the name isn't.
  assert.equal(signOnBlocks(true, { [key]: { date: key, title: "Rest" } }, "Edit", friday), false);
  // A note whose title is empty/whitespace is not a named day.
  assert.equal(signOnBlocks(true, { [key]: { date: key, title: "   " } }, "Edit", friday), true);
  assert.equal(signOnBlocks(true, { [key]: { date: key, body: "notes" } }, "Edit", friday), true);
  // Pre-04:00 next calendar day is still the prior (named) waking-day → stays open.
  assert.equal(signOnBlocks(true, named, "Edit", Date.parse("2026-06-20T02:00:00")), false);
  // ...but past the 04:00 roll it's a new, unnamed day → held again.
  assert.equal(signOnBlocks(true, named, "Edit", Date.parse("2026-06-20T09:00:00")), true);
  // Fail-open: an unreadable vault must never be able to lock the day shut.
  assert.equal(signOnBlocks(true, null, "Edit", friday), false);
});

test("focusDayKey: the day flips at 04:00, not midnight", () => {
  assert.equal(focusDayKey(Date.parse("2026-06-19T03:59:00")), "2026-06-18"); // pre-dawn → prior day
  assert.equal(focusDayKey(Date.parse("2026-06-19T04:00:00")), "2026-06-19"); // boundary → new day
  assert.equal(focusDayKey(Date.parse("2026-06-19T23:30:00")), "2026-06-19");
});

test("toMin parses HH:MM", () => {
  assert.equal(toMin("23:30"), 1410);
  assert.equal(toMin("01:00"), 60);
});

test("frictionAt across the wrapping night (derived from the night watch + lead)", () => {
  assert.equal(frictionAt(toMin("12:00"), watches, lead), 0);
  assert.equal(frictionAt(toMin("23:20"), watches, lead), 0);
  assert.ok(near(frictionAt(toMin("23:30"), watches, lead), 0));      // ramp start = night(01:00) − 90m
  assert.ok(near(frictionAt(toMin("00:30"), watches, lead), 0.667));
  assert.equal(frictionAt(toMin("01:00"), watches, lead), 1);         // night begins → lock
  assert.equal(frictionAt(toMin("03:00"), watches, lead), 1);
  assert.equal(frictionAt(toMin("05:00"), watches, lead), 0);         // morning → reset
});

test("phaseOf maps f to a label", () => {
  assert.equal(phaseOf(0), "day");
  assert.equal(phaseOf(0.5), "wind_down");
  assert.equal(phaseOf(1), "lockdown");
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
  assert.equal(unbrokenMin({ sessionStartTs: big }, big + 90 * 60_000), 90);
});

test("focus: claim-on-first-prompt, owner works, other sessions blocked, off releases", () => {
  let s = setFocus(emptyState(), true, 1000);
  assert.equal(s.focus, true);
  assert.equal(s.focusSession, "");                 // unclaimed on enable
  assert.equal(focusBlocks(s, "B"), false);         // unclaimed → nothing blocked yet
  s = claimFocus(s, "A");                           // first prompt claims the owner
  assert.equal(s.focusSession, "A");
  s = claimFocus(s, "B");                           // a claimed owner is never stolen
  assert.equal(s.focusSession, "A");
  assert.equal(focusBlocks(s, "A"), false);         // owner works freely
  assert.equal(focusBlocks(s, "B"), true);          // other sessions are held
  assert.equal(focusBlocks(s, ""), false);          // no session id → never block
  s = setFocus(s, false, 2000);                     // off clears the flag + owner
  assert.equal(s.focus, false);
  assert.equal(focusBlocks(s, "B"), false);
});

test("focus: breath line for owner, held-note for others, empty when off", () => {
  assert.equal(focusLine(emptyState(), "A"), "");
  const s = claimFocus(setFocus(emptyState(), true, 0), "A");
  assert.match(focusLine(s, "A"), /breathe the AI gap/);
  assert.match(focusLine(s, "B"), /held in another session/);
});

const now = 1_000_000_000_000;
const bpTarget = {
  rules: [{ notch: "block", engagesAt: 1, arming: "breakpoint", maxGraceMin: 10, tools: ["Edit", "Bash"] }],
};

test("denyingRule: breakpoint arming respects the turn boundary", () => {
  // turn opened BEFORE lockdown (turnLockedTs 0), within grace → allow (let it finish)
  assert.equal(denyingRule(bpTarget, 1, "Edit", { skipUntilTs: 0, turnLockedTs: 0, lastPromptTs: now - 1000 }, now), null);
  // turn opened UNDER lockdown → deny
  assert.ok(denyingRule(bpTarget, 1, "Edit", { skipUntilTs: 0, turnLockedTs: now - 1000, lastPromptTs: now - 1000 }, now));
  // straddling turn ran past maxGrace → deny
  assert.ok(denyingRule(bpTarget, 1, "Edit", { skipUntilTs: 0, turnLockedTs: 0, lastPromptTs: now - 20 * 60_000 }, now));
  // non-coding tool → allow
  assert.equal(denyingRule(bpTarget, 1, "Read", { skipUntilTs: 0, turnLockedTs: now, lastPromptTs: now }, now), null);
  // below engagesAt → allow
  assert.equal(denyingRule(bpTarget, 0.6, "Edit", { skipUntilTs: 0, turnLockedTs: now, lastPromptTs: now }, now), null);
});

test("immediate arming denies regardless of turn", () => {
  const t = { rules: [{ notch: "block", engagesAt: 1, arming: "immediate", tools: ["Edit"] }] };
  assert.ok(denyingRule(t, 1, "Edit", { skipUntilTs: 0, turnLockedTs: 0, lastPromptTs: now }, now));
});

test("frictionNow: calm afternoon is 0; ramp before night; night watch forces full lockdown", () => {
  const t = mergeTarget({ watches, windDown: "90m" });
  assert.equal(frictionNow(t, new Date("2026-06-05T14:00:00").getTime()), 0);   // day → no friction
  const ramp = frictionNow(t, new Date("2026-06-06T00:00:00").getTime());       // inside the 90m lead
  assert.ok(ramp > 0 && ramp < 1, `expected ramp, got ${ramp}`);
  assert.equal(frictionNow(t, new Date("2026-06-06T03:00:00").getTime()), 1);   // inside night → lockdown
});

test("renderOrient: silent by day, voiced otherwise", () => {
  const t = mergeTarget({});
  assert.equal(renderOrient(t, "day", emptyState(), now), "");
  const wd = renderOrient(t, "wind_down", { ...emptyState(), lastPromptTs: now, sessionStartTs: now }, now);
  assert.match(wd, /\[keel\].*wind-down|land(ing)? open work/i);
  assert.match(wd, /high-level/); // wind-down granularity nudge
  const locked = renderOrient(t, "lockdown", { ...emptyState(), lastPromptTs: now }, now);
  assert.match(locked, /paused until 09:00/);   // reset = morning watch (default 09:00)
  assert.match(locked, /Coarsest only/); // lockdown granularity nudge
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
