import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeTarget, phaseOf, frictionNow, denyingRule,
  emptyState, isAllowedPath,
} from "./core.mjs";

const HOME = "/Users/operator";
const ALLOW = ["~/journals", "~/.keel"];

// Unified lockdown model (decision 2026-06-17): the one hard lock is the `night` watch.
// The wind-down lead ramps PRESSURE before night (nudges, f<1); night itself is the wall.
const target = mergeTarget({
  watches: { morning: "07:00", afternoon: "13:00", evening: "19:00", night: "01:00" },
  windDown: "120m",   // ramp 23:00 → 01:00; lock (night) 01:00 → 07:00
});
const at = (h, m = 0) => new Date(2026, 5, 8, h, m, 0, 0).getTime();
const bpRule = [{ notch: "block", engagesAt: 1, arming: "immediate", tools: ["Edit", "Bash"] }];
const lockTarget = { ...target, rules: bpRule };

test("wind-down lead ramps pressure but does NOT lock (f<1 before night)", () => {
  const f = frictionNow(target, at(0, 0));   // 00:00 — inside the 120m lead
  assert.ok(f > 0 && f < 1, `expected ramp, got ${f}`);
  assert.equal(phaseOf(f), "wind_down");
  // the deny rule must NOT fire before night
  assert.equal(denyingRule(lockTarget, f, "Edit", { ...emptyState(), lastPromptTs: at(0, 0) }, at(0, 0)), null);
});

test("the night watch engages full lockdown; deny fires at the breakpoint", () => {
  const f = frictionNow(target, at(3, 0));   // 03:00 — inside night
  assert.equal(f, 1);
  assert.equal(phaseOf(f), "lockdown");
  assert.ok(denyingRule(lockTarget, f, "Edit", { ...emptyState(), turnLockedTs: at(3, 0), lastPromptTs: at(3, 0) }, at(3, 0)));
});

test("night is the lock window: from its start until reset (the morning watch)", () => {
  assert.ok(frictionNow(target, at(0, 30)) < 1);   // 00:30 — still ramping
  assert.equal(frictionNow(target, at(1, 0)), 1);  // 01:00 — night begins → lock
  assert.equal(frictionNow(target, at(6, 0)), 1);  // 06:00 — still night
  assert.equal(frictionNow(target, at(7, 0)), 0);  // 07:00 — morning → reset, released
});

test("no `night` watch ⇒ pure-soft (never locks, no ramp)", () => {
  const t = mergeTarget({ watches: { morning: "07:00", afternoon: "13:00", evening: "19:00" }, windDown: "120m" });
  assert.equal(frictionNow(t, at(3, 0)), 0);   // 03:00 — no night → no lock
  assert.equal(frictionNow(t, at(0, 0)), 0);   // 00:00 — no night → no ramp either
});

test("day is silent: no pressure, no lock", () => {
  assert.equal(frictionNow(target, at(14, 0)), 0);
  assert.equal(phaseOf(frictionNow(target, at(14, 0))), "day");
});

test("isAllowedPath: journal + ritual writes are exempt, code writes are not", () => {
  // the journal the sign-off / wind-down / log skills write to
  assert.equal(isAllowedPath("/Users/operator/journals/2026-06-08.md", ALLOW, HOME), true);
  assert.equal(isAllowedPath("/Users/operator/.keel/state.json", ALLOW, HOME), true);
  assert.equal(isAllowedPath("/Users/operator/journals", ALLOW, HOME), true);     // the dir itself
  // a repo code file is NOT exempt — lockdown still bites
  assert.equal(isAllowedPath("/Users/operator/Developer/themia/minerva/x.ts", ALLOW, HOME), false);
  // prefix-spoof guard: ~/journals-evil must not match ~/journals
  assert.equal(isAllowedPath("/Users/operator/journals-evil/x.md", ALLOW, HOME), false);
  // no path (e.g. a Bash command) or empty allow-list → not exempt
  assert.equal(isAllowedPath(undefined, ALLOW, HOME), false);
  assert.equal(isAllowedPath("/Users/operator/journals/x.md", [], HOME), false);
});
