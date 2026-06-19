import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, mergeTarget, emptyState, DEFAULT_TARGET,
  ritualNudge, focusDayKey, targetHash, renderRules, consentLines,
  mergeWatchlist, watchlistLines, mergeDesktopSensors, desktopSensorLines,
} from "./core.mjs";

// night@01:00 + 90m lead reproduces a 23:30→01:00 ramp, 01:00→05:00 lock.
const watches = { morning: "05:00", afternoon: "13:00", evening: "19:00", night: "01:00" };
const lead = 90;

// ── characterization: pin the friction curve before defaults move ──

test("characterization: wind-down ramp is linear over the lead, every 10 min", () => {
  const wd = toMin("23:30");   // night(01:00) − 90m lead
  const span = 90;
  for (let dm = 0; dm <= span; dm += 10) {
    const m = (wd + dm) % 1440;
    const expected = Math.min(dm / span, 1);
    const got = frictionAt(m, watches, lead);
    assert.ok(Math.abs(got - expected) < 1e-9, `at +${dm}min expected ${expected}, got ${got}`);
  }
  for (const m of [toMin("05:00"), toMin("12:00"), toMin("23:20")]) {
    assert.equal(frictionAt(m, watches, lead), 0);
  }
  assert.equal(frictionAt(toMin("03:00"), watches, lead), 1); // night (lockdown) plateau
});

test("characterization: mergeTarget fills defaults, replaces watches wholesale, deep-merges voice", () => {
  const t = mergeTarget({ watches: { night: "02:00" }, voice: { lockdown: "custom" } });
  assert.deepEqual(t.watches, { night: "02:00" });            // watches replaced, not deep-merged
  assert.equal(t.windDown, DEFAULT_TARGET.windDown);          // default fills the gap
  assert.equal(t.voice.lockdown, "custom");
  assert.equal(t.voice.windDownNudge, DEFAULT_TARGET.voice.windDownNudge);
});

// ── neutral defaults ───────────────────────────────────────────

test("ritual nudges are silent by default (no foreign slash commands)", () => {
  const tuesdayMorning = new Date(2026, 5, 9, 9, 0).getTime();
  assert.equal(ritualNudge(emptyState(), tuesdayMorning, mergeTarget({}).voice), null);
});

test("ritual nudges fire when configured: weekly on Monday, morning otherwise", () => {
  const voice = mergeTarget({ voice: { morningNudge: "good morning line", weeklyNudge: "weekly line" } }).voice;
  const monday = new Date(2026, 5, 8, 9, 0).getTime();
  const tuesday = new Date(2026, 5, 9, 9, 0).getTime();
  assert.equal(ritualNudge(emptyState(), monday, voice)?.line, "weekly line");
  assert.equal(ritualNudge(emptyState(), tuesday, voice)?.line, "good morning line");
  const night = new Date(2026, 5, 9, 23, 0).getTime();
  assert.equal(ritualNudge(emptyState(), night, voice)?.line, "good morning line"); // no window — persists until signed on
  const signedOn = { ...emptyState(), lastSignOnDay: focusDayKey(night) };
  assert.equal(ritualNudge(signedOn, night, voice), null);     // signed on this waking-day → silent
});

test("default voice carries no prescriptive substitution", () => {
  assert.equal(DEFAULT_TARGET.voice.substitution, "");
});

// ── rules observability: hash + render ─────────────────────────

test("targetHash is stable, key-order-insensitive, value-sensitive", () => {
  const a = mergeTarget({ watches: { morning: "07:00", night: "01:00" }, windDown: "60m" });
  const b = mergeTarget({ windDown: "60m", watches: { night: "01:00", morning: "07:00" } });
  assert.equal(targetHash(a), targetHash(b));
  const c = mergeTarget({ watches: { morning: "07:00", night: "00:00" }, windDown: "60m" });
  assert.notEqual(targetHash(a), targetHash(c));
});

test("renderRules shows effective values and marks custom vs default sections", () => {
  const out = renderRules(mergeTarget({ windDown: "60m" }), { windDown: "60m" });
  assert.match(out, /wind-down.*60m/s);
  assert.match(out, /wind-down.*custom/s);  // overridden section marked
  assert.match(out, /orient.*default/s);    // untouched section marked
  assert.match(out, /Edit/);                 // gated tools visible
});

// ── first-run consent ──────────────────────────────────────────

test("consentLines state the contract: local log, never leaves, how to stop", () => {
  const lines = consentLines().join("\n");
  assert.match(lines, /~\/.keel\/log/);
  assert.match(lines, /never leaves|stays on/i);
  assert.match(lines, /pause|remove|disable/i);
});

// ── watchlist (the config spine, 2026-06-12) ──────────────────

test("mergeWatchlist defaults to empty tiers — keel never ships a list", () => {
  assert.deepEqual(mergeWatchlist(), { observe: [], windowed: [] });
  assert.deepEqual(mergeWatchlist({}), { observe: [], windowed: [] });
  assert.deepEqual(
    mergeWatchlist({ observe: ["youtube.com"] }),
    { observe: ["youtube.com"], windowed: [] }
  );
});

test("watchlistLines prints observe domains but only a COUNT for windowed (privacy)", () => {
  const lines = watchlistLines({
    observe: ["youtube.com", "chess.com"],
    windowed: ["a.example", "b.example", "c.example"],
  }).join("\n");
  assert.match(lines, /youtube\.com/);
  assert.match(lines, /chess\.com/);
  assert.match(lines, /windowed.*3 domain/s);
  assert.doesNotMatch(lines, /a\.example/);
});

test("watchlistLines says so when the list is empty", () => {
  const lines = watchlistLines({ observe: [], windowed: [] }).join("\n");
  assert.match(lines, /watchlist/);
  assert.match(lines, /empty|none/i);
});

test("desktopSensorLines shows the input sensor toggle (default off)", () => {
  assert.match(desktopSensorLines({ inputActivity: false }).join("\n"), /inputActivity.*off/);
  assert.match(desktopSensorLines({ inputActivity: true }).join("\n"), /inputActivity.*ON/);
});

test("mergeDesktopSensors defaults everything off", () => {
  assert.deepEqual(mergeDesktopSensors(), { inputActivity: false });
  assert.deepEqual(mergeDesktopSensors({ inputActivity: true }), { inputActivity: true });
  assert.deepEqual(mergeDesktopSensors({ inputActivity: "yes" }), { inputActivity: false });
});
