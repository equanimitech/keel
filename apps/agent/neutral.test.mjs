import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import {
  mergeTarget, emptyState, DEFAULT_TARGET,
  focusDayKey, targetHash, renderRules, consentLines,
  mergeWatchlist, watchlistLines, mergeDesktopSensors, desktopSensorLines,
} from "./core.mjs";

const BANDS = [
  { phase: "MORNING", startHour: 9, endHour: 13, order: 0 },
  { phase: "NIGHT", startHour: 3, endHour: 9, order: 3 },
];

// ── characterization: pin the defaults ─────────────────────────

test("characterization: mergeTarget deep-merges voice and carries no gate config at all", () => {
  const t = mergeTarget({ voice: { signoffNudge: "custom" } });
  assert.equal(t.voice.signoffNudge, "custom");
  assert.equal(t.voice.consequence, DEFAULT_TARGET.voice.consequence);
  assert.deepEqual(Object.keys(t).sort(), ["orient", "voice"]);
});

test("a stale config's retired gate keys are dropped, not honoured", () => {
  // A machine that has not had its config.json cleaned still carries watches/windDown/rules.
  // mergeTarget must ignore them outright: a leftover key must never re-arm a gate.
  const t = mergeTarget({
    watches: { night: "00:30" }, windDown: "90m", signOnGate: true,
    rules: [{ notch: "block", engagesAt: 1, tools: ["Bash"] }],
  });
  assert.equal("watches" in t, false);
  assert.equal("windDown" in t, false);
  assert.equal("rules" in t, false);
  assert.equal("signOnGate" in t, false);
});

// ── neutral defaults ───────────────────────────────────────────

// ── nothing shipped names one person ─────────────────────────
//
// A shipped sample is what a peer copies to `~/.keel/config.json`, so anything
// concrete in one is something the peer starts out doing. keel's whole claim is
// that it says what *you* would say and watches what *you* named; shipping
// someone else's words, clock or paths is the failure mode, not the default.
//
// This is the one place that is a rule rather than a habit: everything else
// ships blank because there is no seeder to misconfigure, but a sample file is
// edited by hand and nothing but a test stops a personal string landing in it.

const SAMPLE = path.join(import.meta.dirname, "config.sample.json");
const readSample = () => JSON.parse(readFileSync(SAMPLE, "utf8"));

/** Every string reachable under a `voice` key, at any depth. */
function voiceStrings(node, insideVoice = false) {
  if (typeof node === "string") return insideVoice ? [node] : [];
  if (node === null || typeof node !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(node)) out.push(...voiceStrings(v, insideVoice || k === "voice"));
  return out;
}

/** Every string anywhere in the document, with the path that reached it. */
function allStrings(node, at = "$") {
  if (typeof node === "string") return [[at, node]];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([k, v]) => allStrings(v, `${at}.${k}`));
}

test("the sample ships no one's voice — every voice string is an empty placeholder", () => {
  const spoken = voiceStrings(readSample()).filter((s) => s.trim() !== "");
  assert.deepEqual(spoken, [], `config.sample.json ships words nobody chose: ${JSON.stringify(spoken)}`);
});

test("the sample's voice keys are exactly the ones mergeTarget honours", () => {
  const voice = readSample().targets?.["claude-code"]?.voice ?? {};
  assert.deepEqual(
    Object.keys(voice).sort(),
    Object.keys(DEFAULT_TARGET.voice).sort(),
    "a sample key mergeTarget drops is a promise the config cannot keep",
  );
});

test("the sample carries no retired gate config — a leftover clock is one person's day", () => {
  const target = readSample().targets?.["claude-code"] ?? {};
  assert.deepEqual(
    Object.keys(target).sort(),
    Object.keys(mergeTarget({})).sort(),
    "the sample declares a key the target no longer has; watches/windDown/rules named one person's hours",
  );
});

test("the sample names no host and no path — those are the peer's to name", () => {
  const named = allStrings(readSample())
    .filter(([, v]) => /^~?\/|\.(com|org|net|io|dev|be|in)\b/.test(v));
  assert.deepEqual(named, [], `config.sample.json names places nobody chose: ${JSON.stringify(named)}`);
});

test("the sample's watchlist tiers ship empty — keel never ships a list", () => {
  const sample = readSample();
  assert.deepEqual(mergeWatchlist(sample.watchlist), { observe: [], windowed: [] });
  assert.deepEqual(mergeDesktopSensors(sample.desktop), { inputActivity: false });
});

// ── rules observability: hash + render ─────────────────────────

test("targetHash is stable, key-order-insensitive, value-sensitive", () => {
  const a = mergeTarget({ orient: { bellAfterMin: 90, sessionGapMin: 20 }, voice: { identity: "x" } });
  const b = mergeTarget({ voice: { identity: "x" }, orient: { sessionGapMin: 20, bellAfterMin: 90 } });
  assert.equal(targetHash(a), targetHash(b));
  const c = mergeTarget({ orient: { bellAfterMin: 91, sessionGapMin: 20 }, voice: { identity: "x" } });
  assert.notEqual(targetHash(a), targetHash(c));
});

test("renderRules names the kernel's bands and states that nothing is gated", () => {
  const out = renderRules(mergeTarget({}), {}, BANDS);
  assert.match(out, /phase bands \(kairos\): MORNING@9→13, NIGHT@3→9/);
  assert.match(out, /gates: none/);
  assert.doesNotMatch(out, /watches|wind-down|f≥/);
});

test("renderRules says so when the kernel's bands cannot be read", () => {
  assert.match(renderRules(mergeTarget({}), {}, null), /phase bands \(kairos\): \(unreadable/);
});

test("renderRules shows effective values and marks custom vs default sections", () => {
  const out = renderRules(mergeTarget({ orient: { bellAfterMin: 60, sessionGapMin: 30 } }),
    { orient: { bellAfterMin: 60 } }, BANDS);
  assert.match(out, /orient.*60m/s);
  assert.match(out, /orient.*custom/s);   // overridden section marked
  assert.match(out, /voice.*default/s);   // untouched section marked
});

// ── first-run consent ──────────────────────────────────────────

test("consentLines state the contract: local log, never leaves, how to stop", () => {
  const lines = consentLines().join("\n");
  assert.match(lines, /~\/\.kairos\/keel\/log/);
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
