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
