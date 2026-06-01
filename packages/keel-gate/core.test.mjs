import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, phaseOf, refillCredits, spendSkip, updateSession, unbrokenMin,
  denyingRule, nextResetTs, recordNight, lastNNights, renderOrient, reflectionLine,
  mergeTarget, emptyState, nightKey,
} from "./core.mjs";

const driver = { windDown: "23:30", hardStop: "01:00", reset: "05:00" };
const near = (a, b) => Math.abs(a - b) < 0.02;

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

test("refillCredits carries leftover + perMonth, capped, on month change", () => {
  const t = mergeTarget({ skipBudget: { perMonth: 2, cap: 3 } });
  assert.equal(refillCredits({ credits: 0, creditsMonth: "2026-05" }, t, "2026-06").credits, 2);
  // carryover: 2 left + 2 = 4, capped to 3
  assert.equal(refillCredits({ credits: 2, creditsMonth: "2026-05" }, t, "2026-06").credits, 3);
  // no-op same month
  assert.equal(refillCredits({ credits: 1, creditsMonth: "2026-06" }, t, "2026-06").credits, 1);
});

test("spendSkip decrements + sets skipUntil; refuses at 0", () => {
  const ok = spendSkip({ credits: 2 }, 999);
  assert.equal(ok.spent, true);
  assert.equal(ok.state.credits, 1);
  assert.equal(ok.state.skipUntilTs, 999);
  assert.equal(spendSkip({ credits: 0 }, 999).spent, false);
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
  // skip active → allow
  assert.equal(denyingRule(bpTarget, 1, "Edit", { skipUntilTs: now + 1e6, turnLockedTs: now, lastPromptTs: now }, now), null);
});

test("immediate arming denies regardless of turn", () => {
  const t = { driver, rules: [{ notch: "block", engagesAt: 1, arming: "immediate", tools: ["Edit"] }] };
  assert.ok(denyingRule(t, 1, "Edit", { skipUntilTs: 0, turnLockedTs: 0, lastPromptTs: now }, now));
});

test("nextResetTs is a future 05:00", () => {
  const t = new Date("2026-06-01T23:40:00").getTime();
  const r = new Date(nextResetTs(t, driver));
  assert.equal(r.getHours(), 5);
  assert.ok(r.getTime() > t);
});

test("reflection counts observed nights, held = no skip (honest label)", () => {
  let s = emptyState();
  // three prior nights: one wound-down-early (observed, no skip), one skipped, one not observed
  const n1 = now - 1 * 86_400_000, n2 = now - 2 * 86_400_000;
  s = recordNight(s, n1, driver, { observed: true });             // held
  s = recordNight(s, n2, driver, { observed: true, skipped: true }); // not held
  const last = lastNNights(s, driver, now, 7);
  assert.equal(last.length, 2);
  assert.equal(last.filter((x) => x.held).length, 1);
  assert.match(reflectionLine({ ...s, credits: 2 }, mergeTarget({}), now), /1 of the last 2 late night/);
});

test("renderOrient: silent by day, voiced otherwise", () => {
  const t = mergeTarget({});
  assert.equal(renderOrient(t, "day", emptyState(), now), "");
  const wd = renderOrient(t, "wind_down", { ...emptyState(), lastPromptTs: now, sessionStartTs: now }, now);
  assert.match(wd, /\[keel\].*winding down|landing/i);
  assert.match(wd, /high-level/); // wind-down granularity nudge
  const locked = renderOrient(t, "lockdown", { ...emptyState(), skipUntilTs: 0, lastPromptTs: now }, now);
  assert.match(locked, /parked until 05:00/);
  assert.match(locked, /Instead:/); // substitution included
  assert.match(locked, /Coarsest only/); // lockdown granularity nudge
});
