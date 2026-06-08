import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeTarget, phaseOf, frictionNow, backstopActive, lockedDown, denyingRule,
  emptyState, WIND_DOWN_CEIL, isAllowedPath,
} from "./core.mjs";

const HOME = "/Users/rafa";
const ALLOW = ["~/journals", "~/.keel"];

// Sovereign lockdown model: the clock only ramps wind-down PRESSURE; the hard
// lockdown engages from sign-off / park, or the late backstop — never the clock alone.
const target = mergeTarget({ driver: { windDown: "23:00", hardStop: "01:00", reset: "05:00", backstop: "03:00" } });
const at = (h, m = 0) => new Date(2026, 5, 8, h, m, 0, 0).getTime();
const bpRule = [{ notch: "block", engagesAt: 1, arming: "immediate", tools: ["Edit", "Bash"] }];
const lockTarget = { ...target, rules: bpRule };

test("clock past hardStop does NOT hard-lock (the bug): friction capped below 1", () => {
  // 01:30 — past hardStop, NOT signed off, before backstop → wind-down pressure, not lockdown.
  const f = frictionNow(target, emptyState(), at(1, 30));
  assert.ok(f <= WIND_DOWN_CEIL && f < 1, `expected < 1, got ${f}`);
  assert.equal(phaseOf(f), "wind_down");
  // the deny rule must NOT fire on the clock alone
  assert.equal(denyingRule(lockTarget, f, "Edit", { ...emptyState(), lastPromptTs: at(1, 30) }, at(1, 30)), null);
});

test("sign-off / park engages full lockdown immediately, even by day", () => {
  const parked = { ...emptyState(), parkAtTs: at(14, 0) };       // signoff sets parkAtTs=now
  const f = frictionNow(target, parked, at(14, 30));
  assert.equal(f, 1);
  assert.equal(phaseOf(f), "lockdown");
  assert.ok(denyingRule(lockTarget, f, "Edit", { ...parked, turnLockedTs: at(14, 30), lastPromptTs: at(14, 30) }, at(14, 30)));
});

test("backstop is the late safety net: locks an un-signed-off night from 03:00", () => {
  assert.equal(backstopActive(at(2, 30), target.driver), false);  // before backstop → still just wind-down
  assert.equal(backstopActive(at(3, 30), target.driver), true);   // after backstop → locked
  assert.equal(backstopActive(at(5, 30), target.driver), false);  // past reset → released
  assert.equal(frictionNow(target, emptyState(), at(2, 30)) < 1, true);
  assert.equal(frictionNow(target, emptyState(), at(3, 30)), 1);
  assert.equal(lockedDown(target, emptyState(), at(3, 30)), true);
});

test("no backstop configured ⇒ pure sovereign (clock never locks)", () => {
  const t = mergeTarget({ driver: { windDown: "23:00", hardStop: "01:00", reset: "05:00", backstop: "" } });
  assert.equal(backstopActive(at(3, 30), t.driver), false);
  assert.ok(frictionNow(t, emptyState(), at(3, 30)) < 1);          // 03:30 un-signed-off → still only wind-down
});

test("day is silent: no pressure, no lock", () => {
  assert.equal(frictionNow(target, emptyState(), at(14, 0)), 0);
  assert.equal(phaseOf(frictionNow(target, emptyState(), at(14, 0))), "day");
});

test("isAllowedPath: journal + ritual writes are exempt, code writes are not", () => {
  // the journal the sign-off / wind-down / log skills write to
  assert.equal(isAllowedPath("/Users/rafa/journals/2026-06-08.md", ALLOW, HOME), true);
  assert.equal(isAllowedPath("/Users/rafa/.keel/state.json", ALLOW, HOME), true);
  assert.equal(isAllowedPath("/Users/rafa/journals", ALLOW, HOME), true);     // the dir itself
  // a repo code file is NOT exempt — lockdown still bites
  assert.equal(isAllowedPath("/Users/rafa/Developer/themia/minerva/x.ts", ALLOW, HOME), false);
  // prefix-spoof guard: ~/journals-evil must not match ~/journals
  assert.equal(isAllowedPath("/Users/rafa/journals-evil/x.md", ALLOW, HOME), false);
  // no path (e.g. a Bash command) or empty allow-list → not exempt
  assert.equal(isAllowedPath(undefined, ALLOW, HOME), false);
  assert.equal(isAllowedPath("/Users/rafa/journals/x.md", [], HOME), false);
});
