import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toMin, frictionAt, mergeTarget, emptyState, DEFAULT_TARGET,
  reflectionLine, ritualNudge, targetHash, renderRules, consentLines,
  mergeWatchlist, watchlistLines, mergeDesktopSensors, desktopSensorLines,
} from "./core.mjs";

const driver = { windDown: "23:30", hardStop: "01:00", reset: "05:00" };

// ── characterization: pin the friction curve before defaults move ──

test("characterization: wind-down ramp is linear windDown→hardStop, every 10 min", () => {
  const wd = toMin("23:30");
  const span = 90; // 23:30 → 01:00
  for (let dm = 0; dm <= span; dm += 10) {
    const m = (wd + dm) % 1440;
    const expected = Math.min(dm / span, 1);
    const got = frictionAt(m, driver);
    assert.ok(Math.abs(got - expected) < 1e-9, `at +${dm}min expected ${expected}, got ${got}`);
  }
  for (const m of [toMin("05:00"), toMin("12:00"), toMin("23:20")]) {
    assert.equal(frictionAt(m, driver), 0);
  }
  assert.equal(frictionAt(toMin("03:00"), driver), 1); // lockdown plateau
});

test("characterization: mergeTarget preserves unknown driver kind and deep-merges voice", () => {
  const t = mergeTarget({ driver: { kind: "pomodoro" }, voice: { lockdown: "custom" } });
  assert.equal(t.driver.kind, "pomodoro");          // preserved, not rejected
  assert.equal(t.driver.reset, DEFAULT_TARGET.driver.reset); // defaults fill gaps
  assert.equal(t.voice.lockdown, "custom");
  assert.equal(t.voice.windDownNudge, DEFAULT_TARGET.voice.windDownNudge);
});

// ── neutral defaults ───────────────────────────────────────────

test("default reflection is factual, not shaming, and templated", () => {
  const state = { ...emptyState(), credits: 2, nights: { "2026-06-10": { observed: true } } };
  const line = reflectionLine(state, mergeTarget({}), new Date(2026, 5, 11, 12, 0).getTime());
  assert.ok(line.length > 0);
  assert.ok(!/wound down on your own/.test(line)); // Rafa's copy moved to his config
  assert.ok(!/late night/.test(line));             // sleep framing out of the domain
  assert.match(line, /1 of the last 1/);           // counts still surface
});

test("reflection template is voice-configurable with {held}/{n}/{credits}", () => {
  const target = mergeTarget({ voice: { reflection: "held {held}/{n}, {credits} credits" } });
  const state = { ...emptyState(), credits: 3, nights: { "2026-06-10": { observed: true } } };
  const line = reflectionLine(state, target, new Date(2026, 5, 11, 12, 0).getTime());
  assert.equal(line, "held 1/1, 3 credits");
});

test("empty reflection template silences the reflection entirely", () => {
  const target = mergeTarget({ voice: { reflection: "" } });
  const state = { ...emptyState(), credits: 3, nights: { "2026-06-10": { observed: true } } };
  assert.equal(reflectionLine(state, target, new Date(2026, 5, 11, 12, 0).getTime()), "");
});

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
  assert.equal(ritualNudge(emptyState(), night, voice), null); // window still respected
});

test("default skip budget is generous (users tighten, defaults never coerce)", () => {
  assert.ok(DEFAULT_TARGET.skipBudget.perMonth >= 4);
  assert.ok(DEFAULT_TARGET.skipBudget.cap >= DEFAULT_TARGET.skipBudget.perMonth);
});

test("default voice carries no prescriptive substitution", () => {
  assert.equal(DEFAULT_TARGET.voice.substitution, "");
});

// ── rules observability: hash + render ─────────────────────────

test("targetHash is stable, key-order-insensitive, value-sensitive", () => {
  const a = mergeTarget({ driver: { windDown: "23:00", hardStop: "01:00" } });
  const b = mergeTarget({ driver: { hardStop: "01:00", windDown: "23:00" } });
  assert.equal(targetHash(a), targetHash(b));
  const c = mergeTarget({ driver: { windDown: "22:00", hardStop: "01:00" } });
  assert.notEqual(targetHash(a), targetHash(c));
});

test("renderRules shows effective values and marks custom vs default sections", () => {
  const out = renderRules(mergeTarget({ driver: { windDown: "23:00" } }), { driver: { windDown: "23:00" } });
  assert.match(out, /windDown.*23:00/s);
  assert.match(out, /driver.*custom/s);     // overridden section marked
  assert.match(out, /skipBudget.*default/s); // untouched section marked
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
