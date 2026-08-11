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
