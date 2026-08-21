// @ts-check
// The inference port and its ollama adapter.
//
// The point of this file: exactly ONE test below knows what an ollama request
// body looks like. Every other test — and every caller in the repo — speaks the
// port. If a second adapter is ever written, only that one test has a sibling.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ollamaProvider, createProvider, OLLAMA_GENERATE, OLLAMA_TAGS,
} from "./inference.mjs";

/** A fetch stub that replays canned ollama responses and records every call. */
function stubFetch(payloads) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const p = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    return { ok: true, json: async () => ({ response: JSON.stringify(p) }) };
  };
  fn.calls = calls;
  return fn;
}

const SCHEMA = {
  type: "object",
  properties: { kind: { type: "string", enum: ["a", "b"] } },
  required: ["kind"],
};

// ── the port ──────────────────────────────────────────────────

test("a provider answers the four port members and nothing more", () => {
  const p = ollamaProvider({ model: "m", fetchImpl: async () => ({ ok: true }) });
  assert.deepEqual(Object.keys(p).sort(), ["available", "complete", "modelId", "release"]);
});

test("complete returns the decoded answer, not the provider's envelope", async () => {
  const f = stubFetch([{ kind: "a" }]);
  const p = ollamaProvider({ model: "m", fetchImpl: f });
  const answer = await p.complete({ prompt: "hi", schema: SCHEMA });
  assert.deepEqual(answer, { kind: "a" });
});

test("complete carries prompt, schema, temperature and context cap through the port", async () => {
  const seen = [];
  /** @type {any} */
  const fake = {
    modelId: "fake",
    complete: async (req) => { seen.push(req); return { kind: "b" }; },
    available: async () => true,
    release: async () => {},
  };
  const answer = await fake.complete({
    prompt: "some note", schema: SCHEMA, temperature: 0.8, maxContextTokens: 2048,
  });
  assert.deepEqual(answer, { kind: "b" });
  assert.deepEqual(seen[0].schema, SCHEMA);
  assert.equal(seen[0].maxContextTokens, 2048);
});

test("complete rejects with `<provider> <status>` when the server errors", async () => {
  const p = ollamaProvider({ model: "m", fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(() => p.complete({ prompt: "x", schema: SCHEMA }), /ollama 500/);
});

test("complete rejects when the answer is not the JSON the schema asked for", async () => {
  const p = ollamaProvider({ model: "m", fetchImpl: async () => ({ ok: true, json: async () => ({ response: "not json" }) }) });
  await assert.rejects(() => p.complete({ prompt: "x", schema: SCHEMA }));
});

test("available reports reachability without throwing", async () => {
  assert.equal(await ollamaProvider({ model: "m", fetchImpl: async () => ({ ok: true }) }).available(), true);
  assert.equal(await ollamaProvider({ model: "m", fetchImpl: async () => ({ ok: false }) }).available(), false);
  assert.equal(
    await ollamaProvider({ model: "m", fetchImpl: async () => { throw new Error("ECONNREFUSED"); } }).available(),
    false,
  );
});

test("modelId names the model the provider will answer with", () => {
  assert.equal(ollamaProvider({ model: "qwen3.6:35b", fetchImpl: fetch }).modelId, "qwen3.6:35b");
});

// ── the factory: the one seam where a kind becomes an implementation ──

test("createProvider defaults to the local ollama adapter", () => {
  const p = createProvider({ model: "m" });
  assert.equal(typeof p.complete, "function");
  assert.equal(typeof p.available, "function");
});

test("a provider cannot be built without naming a model", () => {
  assert.throws(() => createProvider(), /model id/);
});

test("createProvider passes adapter options through", () => {
  assert.equal(createProvider({ kind: "ollama", model: "tiny" }).modelId, "tiny");
});

test("createProvider refuses a kind nobody has written yet", () => {
  assert.throws(() => createProvider({ kind: "somewhere-else" }), /not implemented/);
});

// ── the ollama wire format — the ONLY test that knows it ──────

test("the ollama adapter speaks ollama's own request shape", async () => {
  const f = stubFetch([{ kind: "a" }]);
  const p = ollamaProvider({ model: "m", keepAlive: "5m", fetchImpl: f });
  await p.complete({
    prompt: "some note", schema: SCHEMA, temperature: 0.8, maxContextTokens: 2048,
  });
  const { url, body } = f.calls[0];
  assert.equal(url, OLLAMA_GENERATE);
  assert.equal(body.model, "m");
  assert.equal(body.prompt, "some note");
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.keep_alive, "5m");
  assert.equal(body.options.num_ctx, 2048);
  assert.equal(body.options.temperature, 0.8);
  assert.deepEqual(body.format, SCHEMA);
});

test("the ollama adapter checks reachability against the tags endpoint", async () => {
  const f = stubFetch([{}]);
  await ollamaProvider({ model: "m", fetchImpl: f }).available();
  assert.equal(f.calls[0].url, OLLAMA_TAGS);
});

test("release drops the model from ollama's memory immediately", async () => {
  const f = stubFetch([{}]);
  await ollamaProvider({ model: "m", fetchImpl: f }).release();
  assert.equal(f.calls[0].url, OLLAMA_GENERATE);
  assert.equal(f.calls[0].body.model, "m");
  assert.equal(f.calls[0].body.keep_alive, 0);
});
