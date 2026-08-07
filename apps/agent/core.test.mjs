import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, phaseOf, updateSession, unbrokenMin,
  denyingRule, renderOrient, signOnBlocks,
  mergeTarget, emptyState, frictionNow,
  normalizeGranularity, activeGranularity, setGranularity, DEFAULT_GRANULARITY,
  setIntention, activeIntention, rollIntentionDay, focusDayKey,
  setFocus, claimFocus, focusBlocks, focusLine,
} from "./core.mjs";

// Watches with night@01:00 + a 90m lead reproduce the old 23:30→01:00 ramp, 01:00→05:00 lock.
const watches = { morning: "05:00", afternoon: "13:00", evening: "19:00", night: "01:00" };
const lead = 90;
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

test("intention: per-watch, trims, stamps the waking-day, no cross-watch bleed", () => {
  const noon = Date.parse("2026-06-19T12:00:00");          // → morning watch (05:00 ≤ noon < 13:00)
  const eve = Date.parse("2026-06-19T20:00:00");           // → evening watch
  assert.equal(activeIntention(emptyState(), noon, watches), "");
  const s = setIntention(emptyState(), "morning", "  ship export  ", noon);
  assert.equal(activeIntention(s, noon, watches), "ship export");   // trimmed, surfaced in its watch
  assert.equal(s.intentionDay, "2026-06-19");
  const s2 = setIntention(s, "evening", "review PRs", noon);
  assert.equal(activeIntention(s2, noon, watches), "ship export");  // morning still active at noon
  assert.equal(activeIntention(s2, eve, watches), "review PRs");    // evening surfaces only in the evening
});

test("signOnBlocks: holds writes until the day is framed in zenborg", () => {
  const friday = Date.parse("2026-06-19T22:00:00");
  const framed = { [focusDayKey(friday)]: { day: focusDayKey(friday), personal: "swim", professional: "ship" } };

  // Gate off (the default) → never blocks, framed or not.
  assert.equal(signOnBlocks(false, {}, "Edit", friday), false);
  // Gate on, day unframed → writes held.
  assert.equal(signOnBlocks(true, {}, "Edit", friday), true);
  assert.equal(signOnBlocks(true, {}, "Bash", friday), true);
  // Reads stay open — "no work before framing", not "no computer".
  assert.equal(signOnBlocks(true, {}, "Read", friday), false);
  assert.equal(signOnBlocks(true, {}, "Grep", friday), false);
  // Framed today → open.
  assert.equal(signOnBlocks(true, framed, "Edit", friday), false);
  // A held-to-skip day opens it too; keel can't tell them apart, by design.
  const skipped = { [focusDayKey(friday)]: { day: focusDayKey(friday), skipped: true } };
  assert.equal(signOnBlocks(true, skipped, "Edit", friday), false);
  // Pre-04:00 next calendar day is still the prior (framed) waking-day → stays open.
  assert.equal(signOnBlocks(true, framed, "Edit", Date.parse("2026-06-20T02:00:00")), false);
  // ...but past the 04:00 roll it's a new, unframed day → held again.
  assert.equal(signOnBlocks(true, framed, "Edit", Date.parse("2026-06-20T09:00:00")), true);
  // Fail-open: an unreadable vault must never be able to lock the day shut.
  assert.equal(signOnBlocks(true, null, "Edit", friday), false);
});

test("focusDayKey: the day flips at 04:00, not midnight", () => {
  assert.equal(focusDayKey(Date.parse("2026-06-19T03:59:00")), "2026-06-18"); // pre-dawn → prior day
  assert.equal(focusDayKey(Date.parse("2026-06-19T04:00:00")), "2026-06-19"); // boundary → new day
  assert.equal(focusDayKey(Date.parse("2026-06-19T23:30:00")), "2026-06-19");
});

test("rollIntentionDay: keeps within a waking-day, clears across the 04:00 boundary", () => {
  const lateNight = Date.parse("2026-06-19T01:00:00");   // still 2026-06-18's day
  const setLastEve = setIntention(emptyState(), "evening", "ship export", Date.parse("2026-06-18T20:00:00"));
  // 01:00 the "next" calendar morning is the same waking-day → intention survives.
  assert.equal(rollIntentionDay(setLastEve, lateNight).watchIntentions.evening, "ship export");
  // Past 04:00 → new waking-day → all watches cleared.
  const nextMorning = Date.parse("2026-06-19T09:00:00");
  assert.deepEqual(rollIntentionDay(setLastEve, nextMorning).watchIntentions, {});
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
