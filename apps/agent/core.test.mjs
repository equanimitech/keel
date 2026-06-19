import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, phaseOf, updateSession, unbrokenMin,
  denyingRule, renderOrient,
  mergeTarget, emptyState, frictionNow, backstopActive,
  normalizeGranularity, activeGranularity, setGranularity, DEFAULT_GRANULARITY,
  setIntention, activeIntention, rollIntentionDay, focusDayKey,
} from "./core.mjs";

const driver = { windDown: "23:30", hardStop: "01:00", reset: "05:00" };
const near = (a, b) => Math.abs(a - b) < 0.02;

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

test("intention: day-scoped, trims, stamps the waking-day it was set on", () => {
  assert.equal(activeIntention(emptyState()), "");
  assert.equal(activeIntention(setIntention(emptyState(), "  ship export  ")), "ship export");
  const noon = Date.parse("2026-06-19T12:00:00");
  assert.equal(setIntention(emptyState(), "x", noon).intentionDay, "2026-06-19");
  // Set without `now` leaves the stamp untouched (CLI path always passes now).
  assert.equal(setIntention({ intentionDay: "2026-06-18" }, "x").intentionDay, "2026-06-18");
});

test("focusDayKey: the day flips at 04:00, not midnight", () => {
  assert.equal(focusDayKey(Date.parse("2026-06-19T03:59:00")), "2026-06-18"); // pre-dawn → prior day
  assert.equal(focusDayKey(Date.parse("2026-06-19T04:00:00")), "2026-06-19"); // boundary → new day
  assert.equal(focusDayKey(Date.parse("2026-06-19T23:30:00")), "2026-06-19");
});

test("rollIntentionDay: keeps within a waking-day, clears across the 04:00 boundary", () => {
  const lateNight = Date.parse("2026-06-19T01:00:00");   // still 2026-06-18's day
  const setLastEve = setIntention(emptyState(), "ship export", Date.parse("2026-06-18T20:00:00"));
  // 01:00 the "next" calendar morning is the same waking-day → intention survives.
  assert.equal(activeIntention(rollIntentionDay(setLastEve, lateNight)), "ship export");
  // Past 04:00 → new waking-day → cleared.
  const nextMorning = Date.parse("2026-06-19T09:00:00");
  assert.equal(activeIntention(rollIntentionDay(setLastEve, nextMorning)), "");
});

test("toMin parses HH:MM", () => {
  assert.equal(toMin("23:30"), 1410);
  assert.equal(toMin("01:00"), 60);
});

test("frictionAt across the wrapping night", () => {
  assert.equal(frictionAt(toMin("12:00"), driver), 0);
  assert.equal(frictionAt(toMin("23:20"), driver), 0);
  assert.ok(near(frictionAt(toMin("23:30"), driver), 0));
  assert.ok(near(frictionAt(toMin("00:30"), driver), 0.667));
  assert.equal(frictionAt(toMin("01:00"), driver), 1);
  assert.equal(frictionAt(toMin("03:00"), driver), 1);
  assert.equal(frictionAt(toMin("05:00"), driver), 0);
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

const now = 1_000_000_000_000;
const bpTarget = {
  driver, rules: [{ notch: "block", engagesAt: 1, arming: "breakpoint", maxGraceMin: 10, tools: ["Edit", "Bash"] }],
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
  const t = { driver, rules: [{ notch: "block", engagesAt: 1, arming: "immediate", tools: ["Edit"] }] };
  assert.ok(denyingRule(t, 1, "Edit", { skipUntilTs: 0, turnLockedTs: 0, lastPromptTs: now }, now));
});

test("frictionNow: calm afternoon is 0; only the late backstop forces full lockdown", () => {
  const t = mergeTarget({ driver: { ...driver, backstop: "03:00" } });
  const noon = new Date("2026-06-05T14:00:00").getTime();
  assert.equal(frictionNow(t, emptyState(), noon), 0);                          // day → no friction
  assert.equal(backstopActive(new Date("2026-06-06T02:30:00").getTime(), t.driver), false);
  assert.equal(frictionNow(t, emptyState(), new Date("2026-06-06T03:30:00").getTime()), 1); // past backstop → lockdown
});

test("renderOrient: silent by day, voiced otherwise", () => {
  const t = mergeTarget({});
  assert.equal(renderOrient(t, "day", emptyState(), now), "");
  const wd = renderOrient(t, "wind_down", { ...emptyState(), lastPromptTs: now, sessionStartTs: now }, now);
  assert.match(wd, /\[keel\].*wind-down|land(ing)? open work/i);
  assert.match(wd, /high-level/); // wind-down granularity nudge
  const locked = renderOrient(t, "lockdown", { ...emptyState(), skipUntilTs: 0, lastPromptTs: now }, now);
  assert.match(locked, /paused until 05:00/);
  assert.match(locked, /Coarsest only/); // lockdown granularity nudge
});
