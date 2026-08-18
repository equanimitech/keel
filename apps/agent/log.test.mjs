import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  buildEvent, eventLine, logFileName, capValue, summarizeEvents, matchDispatch,
} from "./core.mjs";
import { appendEvent } from "./store.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const KEEL_MJS = join(HERE, "keel.mjs");

const evt = (over = {}) => buildEvent({
  id: over.id ?? "id-1", kind: over.kind ?? "prompt", ts: over.ts ?? 1_000_000,
  sessionId: over.sessionId ?? "s1", payload: over.payload ?? {},
  durationMs: over.durationMs,
});

// ── pure: event shaping ───────────────────────────────────────

test("buildEvent shapes an agent event with required fields", () => {
  const e = buildEvent({ id: "abc", kind: "prompt", ts: 123, sessionId: "s1", payload: { prompt: "hi" } });
  assert.equal(e.id, "abc");
  assert.equal(e.surface, "agent");
  assert.equal(e.kind, "prompt");
  assert.equal(e.ts, 123);
  assert.equal(e.sessionId, "s1");
  assert.deepEqual(e.payload, { prompt: "hi" });
  assert.ok(!("durationMs" in e)); // omitted when absent
});

test("buildEvent carries durationMs when given", () => {
  assert.equal(evt({ durationMs: 42 }).durationMs, 42);
});

test("capValue passes small values through untouched", () => {
  assert.equal(capValue("short", 100), "short");
  assert.deepEqual(capValue({ a: 1 }, 100), { a: 1 });
});

test("capValue truncates oversized strings and records original size", () => {
  const big = "x".repeat(5000);
  const capped = capValue(big, 1000);
  assert.equal(capped.truncated, true);
  assert.equal(capped.bytes, 5000);
  assert.ok(capped.value.length <= 1000);
});

test("capValue truncates oversized nested objects by serialized size", () => {
  const big = { blob: "y".repeat(5000) };
  const capped = capValue(big, 1000);
  assert.equal(capped.truncated, true);
  assert.ok(capped.bytes >= 5000);
  assert.ok(typeof capped.value === "string" && capped.value.length <= 1000);
});

test("eventLine is single-line JSON terminated by newline", () => {
  const line = eventLine(evt({ payload: { prompt: "a\nb" } }));
  assert.ok(line.endsWith("\n"));
  assert.equal(line.slice(0, -1).includes("\n"), false);
  assert.equal(JSON.parse(line).payload.prompt, "a\nb");
});

test("logFileName buckets by local date for the agent surface", () => {
  const ts = new Date(2026, 5, 12, 15, 0).getTime(); // local 2026-06-12
  assert.equal(logFileName(ts), "2026-06-12.agent.jsonl");
});

// ── pure: read-side helpers for `keel log status` ─────────────

test("summarizeEvents counts kinds, sessions, and active sessions", () => {
  const now = 10 * 60_000; // t=10min
  const events = [
    evt({ id: "1", kind: "session_start", sessionId: "s1", ts: 0 }),
    evt({ id: "2", kind: "prompt", sessionId: "s1", ts: 1 * 60_000 }),
    evt({ id: "3", kind: "prompt", sessionId: "s2", ts: 9 * 60_000 }),
  ];
  const s = summarizeEvents(events, now, 5 * 60_000); // 5-min active window
  assert.equal(s.byKind.prompt, 2);
  assert.equal(s.byKind.session_start, 1);
  assert.equal(s.sessions, 2);
  assert.equal(s.activeSessions, 1); // only s2 has events in the last 5 min
});

test("matchDispatch pairs a completion with the latest unmatched dispatch", () => {
  const events = [
    evt({ id: "d1", kind: "tool_dispatched", sessionId: "s1", ts: 1000, payload: { tool_name: "Bash" } }),
    evt({ id: "d2", kind: "tool_dispatched", sessionId: "s1", ts: 2000, payload: { tool_name: "Edit" } }),
    evt({ id: "c2", kind: "tool_completed", sessionId: "s1", ts: 2500, payload: { tool_name: "Edit" } }),
  ];
  const m = matchDispatch(events, { sessionId: "s1", ts: 4000, payload: { tool_name: "Bash" } });
  assert.equal(m.id, "d1");
});

test("matchDispatch prefers tool_use_id correlation when present", () => {
  const events = [
    evt({ id: "d1", kind: "tool_dispatched", sessionId: "s1", ts: 1000, payload: { tool_name: "Bash", tool_use_id: "tu-A" } }),
    evt({ id: "d2", kind: "tool_dispatched", sessionId: "s1", ts: 2000, payload: { tool_name: "Bash", tool_use_id: "tu-B" } }),
  ];
  const m = matchDispatch(events, { sessionId: "s1", ts: 3000, payload: { tool_name: "Bash", tool_use_id: "tu-A" } });
  assert.equal(m.id, "d1");
});

test("matchDispatch returns null when nothing matches", () => {
  assert.equal(matchDispatch([], { sessionId: "s1", ts: 1, payload: { tool_name: "Bash" } }), null);
});

// ── I/O: append-only writer, fail-open ────────────────────────

test("appendEvent creates the log dir and appends one parseable line per call", () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-log-"));
  const logDir = join(dir, "log");
  assert.equal(appendEvent(logDir, evt({ id: "1" })), true);
  assert.equal(appendEvent(logDir, evt({ id: "2" })), true);
  const lines = readFileSync(join(logDir, logFileName(1_000_000)), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => JSON.parse(l).id), ["1", "2"]);
});

test("appendEvent is fail-open: unwritable destination returns false, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-log-"));
  const blocker = join(dir, "not-a-dir");
  writeFileSync(blocker, "i am a file");
  assert.equal(appendEvent(join(blocker, "log"), evt()), false); // dir path under a file
});

test("concurrent appends from two processes produce no torn lines", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-log-"));
  const logDir = join(dir, "log");
  const child = (tag) => execFileP(process.execPath, ["-e", `
    import("${pathToImport(HERE)}/store.mjs").then(async ({ appendEvent }) => {
      const { buildEvent } = await import("${pathToImport(HERE)}/core.mjs");
      for (let i = 0; i < 50; i++) {
        appendEvent(${JSON.stringify(logDir)}, buildEvent({
          id: "${"$"}{i}-" + ${JSON.stringify(tag)}, kind: "prompt", ts: 1000000,
          sessionId: ${JSON.stringify(tag)}, payload: { i, pad: "p".repeat(500) },
        }));
      }
    });
  `]);
  await Promise.all([child("a"), child("b")]);
  const lines = readFileSync(join(logDir, logFileName(1_000_000)), "utf8").trim().split("\n");
  assert.equal(lines.length, 100);
  for (const l of lines) JSON.parse(l); // every line parses → no tearing
});

const pathToImport = (p) => p.split("\\").join("/");

// ── end-to-end: hook subprocess writes events under $HOME/.kairos/keel/log ──

function runHook(home, sub, stdinObj) {
  return execFileSync(process.execPath, [KEEL_MJS, "hook", sub], {
    env: { ...process.env, HOME: home },
    input: JSON.stringify(stdinObj),
    encoding: "utf8",
  });
}

test("hook user-submit logs a prompt event with sessionId from stdin", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "user-submit", { session_id: "sess-42", prompt: "hello keel" });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  assert.ok(existsSync(file));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const prompt = events.find((e) => e.kind === "prompt");
  assert.equal(prompt.sessionId, "sess-42");
  assert.equal(prompt.surface, "agent");
  assert.equal(prompt.payload.prompt, "hello keel");
  assert.ok(prompt.id.length > 0);
});

test("hook stop logs a turn_stop event", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "stop", { session_id: "sess-43", stop_hook_active: false });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events.filter((e) => e.kind === "turn_stop" && e.sessionId === "sess-43").length, 1);
});

test("hook pre-tool records the dispatch with its kairos band, and denies nothing", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  mkdirSync(join(home, ".kairos"), { recursive: true });
  // One band covering the whole clock, so the assertion holds whatever hour the suite runs at.
  writeFileSync(join(home, ".kairos", "phaseConfigs.json"), JSON.stringify({
    "id-1": { phase: "MORNING", startHour: 0, endHour: 24, order: 0 },
  }));
  const out = runHook(home, "pre-tool", { session_id: "sess-47", tool_name: "Bash", tool_input: {} });
  assert.equal(out.trim(), "");   // no hookSpecificOutput at all — the gate is gone, not merely open
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const d = events.find((e) => e.kind === "tool_dispatched");
  assert.equal(d.payload.keel_band, "MORNING");
  // The retired vocabulary must not reappear under a new writer.
  for (const dead of ["keel_denied", "keel_friction", "keel_phase", "keel_rule_notch",
                      "keel_focus_block", "keel_signon_block"]) {
    assert.equal(dead in d.payload, false, `${dead} should be gone from the payload`);
  }
});

test("hook pre-tool still records the dispatch when the kernel's bands are unreadable", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  const out = runHook(home, "pre-tool", { session_id: "sess-48", tool_name: "Bash", tool_input: {} });
  assert.equal(out.trim(), "");
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const d = events.find((e) => e.kind === "tool_dispatched");
  assert.ok(d);                                  // the event lands regardless
  assert.equal("keel_band" in d.payload, false); // untagged rather than guessed
});

test("hook post-tool derives durationMs from the matching dispatch", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "pre-tool", { session_id: "sess-44", tool_name: "Glob", tool_input: { pattern: "*" } });
  runHook(home, "post-tool", { session_id: "sess-44", tool_name: "Glob", tool_response: { ok: true } });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const done = events.find((e) => e.kind === "tool_completed");
  assert.equal(done.payload.tool_name, "Glob");
  assert.equal(typeof done.durationMs, "number");
  assert.ok(done.durationMs >= 0);
});

test("hook session-end logs session_end (full-capture hook set)", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "session-end", { session_id: "sess-45", reason: "exit" });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events.filter((e) => e.kind === "session_end").length, 1);
});

test("oversized stdin fields are capped in the logged payload", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "user-submit", { session_id: "sess-46", prompt: "z".repeat(40_000) });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const prompt = events.find((e) => e.kind === "prompt");
  assert.equal(prompt.payload.prompt.truncated, true);
  assert.equal(prompt.payload.prompt.bytes, 40_000);
  assert.ok(eventLine(prompt).length < 8192); // stays under the atomic-append bound
});

// ── first-run consent + rule_changed (slices 1–3 wiring) ──────

test("first session-start shows the consent contract once, then never again", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  const first = runHook(home, "session-start", { session_id: "s-c1" });
  assert.match(first, /First run — the contract/);
  assert.match(first, /Nothing is sent anywhere/);
  const second = runHook(home, "session-start", { session_id: "s-c2" });
  assert.equal(/First run — the contract/.test(second), false);
});

test("session-start logs rule_changed when the effective rules hash moves", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  runHook(home, "session-start", { session_id: "s-r1" });
  const cfgPath = join(home, ".kairos", "keel","config.json");
  writeFileSync(cfgPath, JSON.stringify({ targets: { "claude-code": { orient: { bellAfterMin: 60, sessionGapMin: 30 } } } }));
  runHook(home, "session-start", { session_id: "s-r2" });
  const file = join(home, ".kairos", "keel","log", logFileName(Date.now()));
  const events = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const changes = events.filter((e) => e.kind === "rule_changed");
  assert.equal(changes.length, 2); // baseline snapshot + the edit
  assert.notEqual(changes[0].payload.keel_rule_hash, changes[1].payload.keel_rule_hash);
  assert.equal(changes[1].payload.keel_prev_hash, changes[0].payload.keel_rule_hash);
});

test("keel log status yesterday reads the prior day's file", async () => {
  const home = mkdtempSync(join(tmpdir(), "keel-home-"));
  const logDir = join(home, ".kairos", "keel","log");
  const y = Date.now() - 86_400_000;
  appendEvent(logDir, buildEvent({ id: "y1", kind: "prompt", ts: y, sessionId: "ys" }));
  const out = execFileSync(process.execPath, [KEEL_MJS, "log", "status", "yesterday"],
    { env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.match(out, /1 events.*prompt=1/s);
  const today = execFileSync(process.execPath, [KEEL_MJS, "log", "status"],
    { env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.match(today, /no events today/);
});
