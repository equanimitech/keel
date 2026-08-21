import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_KINDS, kindSchema, classifyPrompt, tallyVotes,
} from "./capture.mjs";

test("kindSchema constrains kind to the closed enum plus unclear", () => {
  const s = kindSchema();
  assert.deepEqual(s.properties.kind.enum, [...CAPTURE_KINDS, "unclear"]);
  assert.deepEqual(s.required, ["kind"]);
  assert.equal(s.type, "object");
});

test("classifyPrompt lists every kind with its gloss and the capture", () => {
  const p = classifyPrompt("fix the login bug");
  for (const k of CAPTURE_KINDS) {
    assert.ok(p.includes(k), `prompt should mention ${k}`);
  }
  assert.ok(p.includes("fix the login bug"));
});

test("tallyVotes returns the kind when all samples agree", () => {
  const r = tallyVotes(["agent_command", "agent_command", "agent_command"]);
  assert.equal(r.kind, "agent_command");
  assert.deepEqual(r.distribution, { agent_command: 3 });
});

test("tallyVotes returns unclear on any disagreement, keeping the distribution", () => {
  const r = tallyVotes(["agent_command", "reference", "agent_command"]);
  assert.equal(r.kind, "unclear");
  assert.deepEqual(r.distribution, { agent_command: 2, reference: 1 });
});

test("tallyVotes treats unanimous unclear as unclear", () => {
  const r = tallyVotes(["unclear", "unclear"]);
  assert.equal(r.kind, "unclear");
  assert.deepEqual(r.distribution, { unclear: 2 });
});

test("tallyVotes on no votes is unclear", () => {
  const r = tallyVotes([]);
  assert.equal(r.kind, "unclear");
  assert.deepEqual(r.distribution, {});
});

// ── event shaping + digest ────────────────────────────────────

import { buildClassifiedEvent, renderDigest } from "./capture.mjs";

const classified = (over = {}) => buildClassifiedEvent({
  id: over.id ?? "e1",
  ts: over.ts ?? 1_700_000_000_000,
  captureId: over.captureId ?? "c1",
  title: over.title ?? "sort the area dropdown by name",
  kind: over.kind ?? "agent_command",
  distribution: over.distribution ?? { agent_command: 5 },
  model: over.model ?? "qwen3.6:35b",
});

test("buildClassifiedEvent shapes an agent completion event", () => {
  const e = classified();
  assert.equal(e.surface, "agent");
  assert.equal(e.kind, "capture_classified");
  assert.equal(e.ts, 1_700_000_000_000);
  assert.equal(e.payload.captureId, "c1");
  assert.equal(e.payload.classifiedKind, "agent_command");
  assert.deepEqual(e.payload.votes, { agent_command: 5 });
  assert.equal(e.payload.model, "qwen3.6:35b");
});

test("buildClassifiedEvent caps an oversized title", () => {
  const e = classified({ title: "x".repeat(300) });
  assert.equal(e.payload.title.truncated, true);
  assert.equal(e.payload.title.value.length, 256);
});

test("renderDigest groups by kind and renders an invocation for agent_command", () => {
  const out = renderDigest([
    classified({ id: "e1", title: "sort the dropdown", kind: "agent_command" }),
    classified({ id: "e2", title: "pay the invoice", kind: "personal_action", distribution: { personal_action: 5 } }),
  ], "2026-08-08");
  assert.ok(out.includes("# Captures — 2026-08-08"));
  assert.ok(out.includes("## agent_command (1)"));
  assert.ok(out.includes("## personal_action (1)"));
  assert.ok(out.includes("sort the dropdown"));
  assert.ok(out.includes("claude -p"), "agent_command entries carry an invocation");
  assert.ok(!out.includes('claude -p "pay the invoice"'), "no invocation for non-agent kinds");
});

test("renderDigest ignores unrelated events and reports an empty day", () => {
  const out = renderDigest([{ id: "x", surface: "agent", kind: "prompt", ts: 1, payload: {} }], "2026-08-08");
  assert.ok(out.includes("No captures classified"));
});

test("renderDigest shows the vote distribution for a split", () => {
  const out = renderDigest([
    classified({ kind: "unclear", distribution: { agent_command: 3, reference: 2 } }),
  ], "2026-08-08");
  assert.ok(out.includes("## unclear (1)"));
  assert.ok(out.includes("agent_command 3"));
  assert.ok(out.includes("reference 2"));
});

// ── Things inbox reader + offset ──────────────────────────────

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readInboxSince, loadOffset, saveOffset } from "./capture-store.mjs";

/** Build a throwaway database shaped like the Things schema we read. */
function fixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), "keel-things-"));
  const path = join(dir, "main.sqlite");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE TMTask (uuid TEXT, title TEXT, creationDate REAL,
    type INT, status INT, trashed INT, start INT)`);
  const ins = db.prepare(`INSERT INTO TMTask VALUES (?,?,?,?,?,?,?)`);
  ins.run("a", "older inbox item", 100.0, 0, 0, 0, 0);
  ins.run("b", "newer inbox item", 200.0, 0, 0, 0, 0);
  ins.run("c", "completed inbox item", 300.0, 0, 3, 0, 0);
  ins.run("d", "filed elsewhere", 400.0, 0, 0, 0, 1);
  ins.run("e", "trashed", 500.0, 0, 0, 1, 0);
  ins.run("f", "a project not a task", 600.0, 1, 0, 0, 0);
  db.close();
  return path;
}

test("readInboxSince returns only open, untrashed inbox tasks, oldest first", () => {
  const rows = readInboxSince(fixtureDb(), 0);
  assert.deepEqual(rows.map((r) => r.uuid), ["a", "b"]);
  assert.equal(rows[0].title, "older inbox item");
});

test("readInboxSince respects the offset", () => {
  const rows = readInboxSince(fixtureDb(), 100.0);
  assert.deepEqual(rows.map((r) => r.uuid), ["b"]);
});

test("readInboxSince honours the limit", () => {
  const rows = readInboxSince(fixtureDb(), 0, 1);
  assert.deepEqual(rows.map((r) => r.uuid), ["a"]);
});

test("offset round-trips, and a missing file reads as 0", () => {
  const p = join(mkdtempSync(join(tmpdir(), "keel-off-")), "offset.json");
  assert.equal(loadOffset(p), 0);
  saveOffset(1234.5, p);
  assert.equal(loadOffset(p), 1234.5);
});

test("a corrupt offset file reads as 0 rather than throwing", () => {
  const p = join(mkdtempSync(join(tmpdir(), "keel-off-")), "offset.json");
  writeFileSync(p, "not json");
  assert.equal(loadOffset(p), 0);
});

// ── ollama sampling ───────────────────────────────────────────

import { voteKind, unloadModel, modelUp, MODEL, SAMPLES } from "./capture-store.mjs";

/** A fetch stub that replays canned kinds and records every request body. */
function stubFetch(kinds) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const kind = kinds[Math.min(i, kinds.length - 1)];
    i += 1;
    return { ok: true, json: async () => ({ response: JSON.stringify({ kind }) }) };
  };
  fn.calls = calls;
  return fn;
}

test("voteKind samples the model N times and returns every vote", async () => {
  const f = stubFetch(["agent_command", "agent_command", "reference"]);
  const votes = await voteKind("do a thing", { samples: 3, fetchImpl: f });
  assert.deepEqual(votes, ["agent_command", "agent_command", "reference"]);
  assert.equal(f.calls.length, 3);
});

test("voteKind sends the load-bearing ollama options", async () => {
  const f = stubFetch(["reference"]);
  await voteKind("some note", { samples: 1, fetchImpl: f });
  const b = f.calls[0].body;
  assert.equal(b.model, MODEL);
  assert.equal(b.stream, false);
  assert.equal(b.think, false);
  assert.equal(b.keep_alive, "5m");
  assert.equal(b.options.num_ctx, 2048);
  assert.equal(b.options.temperature, 0.8);
  assert.equal(b.format.properties.kind.type, "string");
  assert.ok(b.prompt.includes("some note"));
});

test("voteKind throws when ollama returns an error status", async () => {
  const f = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => voteKind("x", { samples: 1, fetchImpl: f }), /ollama 500/);
});

test("voteKind throws when the response is not the expected JSON", async () => {
  const f = async () => ({ ok: true, json: async () => ({ response: "not json" }) });
  await assert.rejects(() => voteKind("x", { samples: 1, fetchImpl: f }));
});

test("unloadModel asks ollama to drop the model immediately", async () => {
  const f = stubFetch(["reference"]);
  await unloadModel({ fetchImpl: f });
  assert.equal(f.calls[0].body.keep_alive, 0);
  assert.equal(f.calls[0].body.model, MODEL);
});

// ── the same calls, through the port ──────────────────────────
//
// The point of D: these three functions no longer know what an ollama request
// looks like. Hand them anything that answers the port and they work — which is
// what "harvest without a local 35B model" needs.

test("voteKind runs on any provider answering the port, with no HTTP in sight", async () => {
  const seen = [];
  const provider = {
    modelId: "somewhere-else",
    complete: async (req) => { seen.push(req); return { kind: "reference" }; },
    available: async () => true,
    release: async () => {},
  };
  const votes = await voteKind("a note", {
    samples: 2, provider,
    fetchImpl: () => { throw new Error("the port must not reach for fetch"); },
  });
  assert.deepEqual(votes, ["reference", "reference"]);
  assert.equal(seen.length, 2);
  assert.ok(seen[0].prompt.includes("a note"));
  assert.equal(seen[0].schema.properties.kind.type, "string");
  assert.equal(seen[0].temperature, 0.8);
  assert.equal(seen[0].maxContextTokens, 2048);
  // Nothing ollama-shaped crossed the seam.
  assert.deepEqual(
    Object.keys(seen[0]).sort(),
    ["maxContextTokens", "prompt", "schema", "temperature"],
  );
});

test("modelUp and unloadModel defer to the injected provider too", async () => {
  let released = 0;
  const provider = {
    modelId: "somewhere-else",
    complete: async () => ({ kind: "reference" }),
    available: async () => false,
    release: async () => { released += 1; },
  };
  assert.equal(await modelUp({ provider }), false);
  await unloadModel({ provider });
  assert.equal(released, 1);
});

test("SAMPLES is the measured five-vote gate", () => {
  assert.equal(SAMPLES, 5);
});

test("modelUp is true when the server answers", async () => {
  const { modelUp } = await import("./capture-store.mjs");
  assert.equal(await modelUp({ fetchImpl: async () => ({ ok: true }) }), true);
});

test("modelUp is false when the server is down or erroring", async () => {
  const { modelUp } = await import("./capture-store.mjs");
  assert.equal(await modelUp({ fetchImpl: async () => { throw new Error("ECONNREFUSED"); } }), false);
  assert.equal(await modelUp({ fetchImpl: async () => ({ ok: false }) }), false);
});

// ── the classify run ──────────────────────────────────────────

import { classifyCaptures } from "./capture.mjs";

const caps = [
  { uuid: "c1", title: "sort the dropdown", creationDate: 100 },
  { uuid: "c2", title: "pay the invoice", creationDate: 200 },
];

function harness(voteFn) {
  const events = [];
  const offsets = [];
  let n = 0;
  return {
    events, offsets,
    run: (captures) => classifyCaptures({
      captures,
      vote: voteFn,
      appendEvent: (e) => { events.push(e); },
      saveOffset: (o) => { offsets.push(o); },
      now: () => 1_700_000_000_000,
      newId: () => `id-${(n += 1)}`,
    }),
  };
}

test("classifyCaptures writes one event per capture with the tallied kind", async () => {
  const h = harness(async () => ["agent_command", "agent_command", "agent_command", "agent_command", "agent_command"]);
  const r = await h.run(caps);
  assert.equal(r.classified, 2);
  assert.equal(r.failed, 0);
  assert.equal(h.events.length, 2);
  assert.equal(h.events[0].payload.classifiedKind, "agent_command");
  assert.equal(h.events[0].payload.captureId, "c1");
});

test("classifyCaptures advances the offset before writing the event", async () => {
  const order = [];
  await classifyCaptures({
    captures: [caps[0]],
    vote: async () => ["reference"],
    appendEvent: () => { order.push("event"); },
    saveOffset: () => { order.push("offset"); },
    now: () => 1, newId: () => "x",
  });
  assert.deepEqual(order, ["offset", "event"],
    "a crash must skip a capture, never double-classify it");
});

test("classifyCaptures records a split as unclear", async () => {
  const h = harness(async () => ["agent_command", "reference", "agent_command", "reference", "reference"]);
  await h.run([caps[0]]);
  assert.equal(h.events[0].payload.classifiedKind, "unclear");
  assert.deepEqual(h.events[0].payload.votes, { agent_command: 2, reference: 3 });
});

test("classifyCaptures survives a model failure and keeps going", async () => {
  let call = 0;
  const events = [];
  const r = await classifyCaptures({
    captures: caps,
    vote: async () => {
      call += 1;
      if (call === 1) {
        throw new Error("ollama down");
      }
      return ["reference", "reference", "reference", "reference", "reference"];
    },
    appendEvent: (e) => { events.push(e); },
    saveOffset: () => {},
    now: () => 1, newId: () => "x",
  });
  assert.equal(r.failed, 1);
  assert.equal(r.classified, 1);
  assert.equal(events.length, 1, "the failed capture produces no event");
});

test("classifyCaptures on an empty list does nothing", async () => {
  const h = harness(async () => ["reference"]);
  const r = await h.run([]);
  assert.deepEqual(r, { classified: 0, failed: 0 });
  assert.equal(h.offsets.length, 0);
});
