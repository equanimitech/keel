import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeTarget, toMin, viceWindows, viceScheduledAt, viceShouldBlock,
  setVicePact, spendViceSkip, viceSkipActive, vicePactActive,
} from "./core.mjs";

const target = mergeTarget({ driver: { windDown: "23:00", hardStop: "01:00", reset: "05:00" } });
// A fixed wall-clock instant builder (local time), so tests don't depend on "now".
const at = (h, m = 0) => new Date(2026, 5, 8, h, m, 0, 0).getTime();
const base = { credits: 1, viceUntilTs: 0, viceSkipUntilTs: 0 };

test("viceWindows derives from the coding night when unset", () => {
  assert.deepEqual(viceWindows(target), [{ from: "23:00", to: "05:00" }]);
});

test("viceWindows honors explicit config", () => {
  const t = mergeTarget({ vice: { windows: [{ from: "09:00", to: "12:00" }] } });
  assert.deepEqual(viceWindows(t), [{ from: "09:00", to: "12:00" }]);
});

test("viceScheduledAt wraps midnight", () => {
  assert.equal(viceScheduledAt(toMin("23:30"), target), true);
  assert.equal(viceScheduledAt(toMin("02:00"), target), true);
  assert.equal(viceScheduledAt(toMin("04:59"), target), true);
  assert.equal(viceScheduledAt(toMin("05:00"), target), false); // half-open
  assert.equal(viceScheduledAt(toMin("14:00"), target), false);
});

test("viceShouldBlock: schedule alone raises it at night, not by day", () => {
  assert.equal(viceShouldBlock(target, base, at(14)), false);
  assert.equal(viceShouldBlock(target, base, at(23, 30)), true);
});

test("setVicePact holds until reset and bites by day", () => {
  const pacted = setVicePact(base, at(14), target.driver);
  assert.equal(new Date(pacted.viceUntilTs).getHours(), 5);
  assert.equal(vicePactActive(pacted, at(14)), true);
  assert.equal(viceShouldBlock(target, pacted, at(14)), true);
});

test("a spent skip wins over a scheduled window", () => {
  const { spent, state } = spendViceSkip({ ...base, viceUntilTs: at(14) + 1e9 }, at(23, 30) + 6 * 3600e3);
  assert.equal(spent, true);
  assert.equal(state.credits, 0);
  assert.equal(state.viceUntilTs, 0); // pact cleared so it can't re-raise
  assert.equal(viceSkipActive(state, at(23, 30)), true);
  assert.equal(viceShouldBlock(target, state, at(23, 30)), false);
});

test("spendViceSkip refuses at 0 credits", () => {
  const { spent, state } = spendViceSkip({ ...base, credits: 0 }, at(5));
  assert.equal(spent, false);
  assert.equal(state.credits, 0);
});
