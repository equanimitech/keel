# Capture Kind Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify each new Things inbox capture by *kind* using a local model, log one event per capture, and render a daily digest — proposing only, never acting.

**Architecture:** Follows the agent surface's existing split: `capture.mjs` holds pure logic (schema, prompt, vote tally, event shaping, digest rendering) and `capture-store.mjs` holds all I/O (Things SQLite read, offset file, ollama HTTP). A thin entry point `keel-classify.mjs` is what launchd runs. Every model call is injectable so the test suite never starts a model.

**Tech Stack:** Plain `// @ts-check` ESM `.mjs` (no TypeScript imports — this surface deploys standalone), `node:sqlite` (stable in Node 24), `node:test`, global `fetch`, ollama HTTP API.

## Global Constraints

- **No new dependencies.** The agent surface has none beyond dev types; keep it that way. `node:sqlite` is built in.
- **Plain JS with `// @ts-check`.** No `.ts` files, no imports from `@keel/domain`.
- **Never write to Things, Linear, or any repository.** This component proposes only.
- **The Things database is opened `readOnly: true`, always.**
- **Model:** `qwen3.6:35b`. Measured: `lfm2.5` is unanimously wrong on this task.
- **Ollama request options are load-bearing** and must be exactly: `keep_alive` `"5m"` during a batch then `0` to unload, `options.num_ctx: 2048`, `options.temperature: 0.8`, `format` set to the JSON schema, `think: false`.
- **Title cap: 256 bytes**, via the existing `capValue` helper.
- **Event kind is `capture_classified`**, `surface: "agent"` (via `buildEvent`).
- **Use `for...of`, never `forEach`. Always use braces on `if`/`for`.**
- Tests run with `pnpm --filter @keel/agent test` (which is `node --test`).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/agent/capture.mjs` | **Create.** Pure: kinds, glosses, JSON schema, prompt, vote tally, event shaping, digest rendering. No I/O. |
| `apps/agent/capture-store.mjs` | **Create.** All I/O: locate + read Things SQLite, offset load/save, ollama sampling, digest write. |
| `apps/agent/capture.test.mjs` | **Create.** Tests for both, model and database stubbed or fixtured. |
| `apps/agent/keel-classify.mjs` | **Create.** Entry point launchd runs: read → classify → log → digest. |
| `apps/agent/tech.equanimi.keel.classify.plist` | **Create.** launchd template with `WatchPaths`. |
| `apps/agent/package.json` | **Modify.** Add the new files to the `typecheck` script. |

Reused unchanged from the existing surface: `buildEvent`, `capValue` (`core.mjs`); `appendEvent`, `readEvents`, `LOG_DIR`, `KEEL_DIR` (`store.mjs`).

---

### Task 1: Kinds, schema, prompt, and vote tally

**Files:**
- Create: `apps/agent/capture.mjs`
- Create: `apps/agent/capture.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `CAPTURE_KINDS: readonly string[]`, `KIND_GLOSS: Record<string,string>`, `TITLE_CAP: number`, `kindSchema(): object`, `classifyPrompt(title: string): string`, `tallyVotes(votes: string[]): { kind: string, distribution: Record<string, number> }`.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/capture.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: FAIL — `Cannot find module './capture.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/agent/capture.mjs`:

```js
// @ts-check
// Pure capture-kind logic. No I/O — see capture-store.mjs.
//
// Kind is carried by verbs and sentence structure, not by private knowledge
// about people. That is why it is reachable by a local model where routing to
// a life *area* was not — see
// docs/superpowers/specs/2026-08-08-capture-kind-classifier-design.md.

/** The closed set of capture kinds. Each implies a lane, so adding one is a
 * deliberate edit, not an accretion. */
export const CAPTURE_KINDS = ["agent_command", "team_issue", "personal_action", "reference"];

/** @type {Record<string, string>} */
export const KIND_GLOSS = {
  agent_command: "concrete software work an AI coding agent could execute on its own: fix a bug, change code, write a doc, run an analysis",
  team_issue: "work for the product team that belongs in a tracker, but is not something an agent should just go do",
  personal_action: "something only the human can do in the physical or social world: buy, pay, call, message, visit, book",
  reference: "a note, link, book, idea or thought to keep — no action implied",
};

/** Byte cap for the capture title in the log payload. Matches the existing
 * window-title cap — the precedent for content-bearing strings in this log. */
export const TITLE_CAP = 256;

/** JSON schema handed to ollama's `format`. Constrained decoding is what makes
 * a small output reliable; a prompt asking for "JSON only" was measured to be
 * ignored. */
export function kindSchema() {
  return {
    type: "object",
    properties: { kind: { type: "string", enum: [...CAPTURE_KINDS, "unclear"] } },
    required: ["kind"],
  };
}

/** @param {string} title */
export function classifyPrompt(title) {
  const menu = CAPTURE_KINDS.map((k) => `- ${k}: ${KIND_GLOSS[k]}`).join("\n");
  return `Capture kinds:\n${menu}\n\nWhat kind of capture is this? Answer 'unclear' if genuinely ambiguous.\nCapture: ${title}`;
}

/** Unanimity gate. Anything short of full agreement is `unclear`.
 * The distribution is kept either way: on this task a split marks genuine
 * ambiguity, so it is a finding about the capture rather than noise.
 * @param {string[]} votes
 * @returns {{ kind: string, distribution: Record<string, number> }} */
export function tallyVotes(votes) {
  /** @type {Record<string, number>} */
  const distribution = {};
  for (const v of votes) {
    distribution[v] = (distribution[v] ?? 0) + 1;
  }
  const distinct = Object.keys(distribution);
  const unanimous = votes.length > 0 && distinct.length === 1 && distinct[0] !== "unclear";
  return { kind: unanimous ? distinct[0] : "unclear", distribution };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/capture.mjs apps/agent/capture.test.mjs
git commit -m "feat(agent): capture kinds, schema, prompt and unanimity tally"
```

---

### Task 2: Event shaping and digest rendering

**Files:**
- Modify: `apps/agent/capture.mjs` (append)
- Modify: `apps/agent/capture.test.mjs` (append)

**Interfaces:**
- Consumes: `TITLE_CAP`, `CAPTURE_KINDS` from Task 1; `buildEvent`, `capValue` from `./core.mjs`.
- Produces: `buildClassifiedEvent({ id, ts, sessionId?, captureId, title, kind, distribution, model }): ActivityEvent`, `renderDigest(events: ActivityEvent[], date: string): string`.

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/capture.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: FAIL — `buildClassifiedEvent is not a function` (or an import error).

- [ ] **Step 3: Write minimal implementation**

Append to `apps/agent/capture.mjs` — and add `buildEvent`, `capValue` to the imports at the top of the file:

```js
import { buildEvent, capValue } from "./core.mjs";
```

```js
/** One log event per classified capture. Past-tense kind — a *completion*
 * under the event-taxonomy grammar.
 * @param {{ id: string, ts: number, sessionId?: string, captureId: string,
 *   title: string, kind: string, distribution: Record<string, number>,
 *   model: string }} a */
export function buildClassifiedEvent({ id, ts, sessionId = "", captureId, title, kind, distribution, model }) {
  return buildEvent({
    id, kind: "capture_classified", ts, sessionId,
    payload: {
      captureId,
      title: capValue(title, TITLE_CAP),
      classifiedKind: kind,
      votes: distribution,
      model,
    },
  });
}

/** @param {unknown} t — a title payload, possibly capped into an object */
function titleText(t) {
  if (typeof t === "string") {
    return t;
  }
  if (t && typeof t === "object" && typeof (/** @type {any} */ (t).value) === "string") {
    return /** @type {any} */ (t).value;
  }
  return "";
}

/** Render one day's classifications, grouped by kind.
 *
 * `agent_command` entries carry a ready-to-fire invocation. It deliberately
 * does NOT name a repository: inferring the target repo is a second
 * classification problem with the same entity-knowledge weakness that sank
 * area routing. Run it from wherever you already are.
 * @param {any[]} events @param {string} date */
export function renderDigest(events, date) {
  /** @type {Map<string, any[]>} */
  const byKind = new Map();
  for (const e of events) {
    if (e?.kind !== "capture_classified") {
      continue;
    }
    const k = e.payload?.classifiedKind ?? "unclear";
    if (!byKind.has(k)) {
      byKind.set(k, []);
    }
    byKind.get(k).push(e);
  }

  const lines = [`# Captures — ${date}`, ""];
  let total = 0;
  for (const k of [...CAPTURE_KINDS, "unclear"]) {
    const items = byKind.get(k) ?? [];
    if (items.length === 0) {
      continue;
    }
    total += items.length;
    lines.push(`## ${k} (${items.length})`, "");
    for (const e of items) {
      const title = titleText(e.payload?.title);
      const votes = Object.entries(e.payload?.votes ?? {})
        .map(([kk, n]) => `${kk} ${n}`).join(", ");
      lines.push(`- ${title}  _(${votes})_`);
      if (k === "agent_command") {
        lines.push("", "  ```", `  claude -p ${JSON.stringify(title)}`, "  ```", "");
      }
    }
    lines.push("");
  }
  if (total === 0) {
    lines.push("_No captures classified._", "");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: PASS, 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/capture.mjs apps/agent/capture.test.mjs
git commit -m "feat(agent): classified-event shaping and daily digest rendering"
```

---

### Task 3: Things inbox reader and offset

**Files:**
- Create: `apps/agent/capture-store.mjs`
- Modify: `apps/agent/capture.test.mjs` (append)

**Interfaces:**
- Consumes: `KEEL_DIR` from `./store.mjs`.
- Produces: `findThingsDb(home?: string): string | null`, `readInboxSince(dbPath: string, sinceCreation: number, limit?: number): Array<{uuid: string, title: string, creationDate: number}>`, `OFFSET_PATH: string`, `loadOffset(path?: string): number`, `saveOffset(creationDate: number, path?: string): void`.

**Facts verified against the live database** (do not re-derive): an open Inbox
item is `trashed=0 AND type=0 AND status=0 AND start=0`. `creationDate` is a
float of Unix epoch **seconds**. `new DatabaseSync(path, { readOnly: true })`
succeeds against the live WAL database.

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/capture.test.mjs`:

```js
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: FAIL — `Cannot find module './capture-store.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/agent/capture-store.mjs`:

```js
// @ts-check
// Capture classifier I/O: the Things database (read-only), the offset file,
// and the local model. Pure logic lives in capture.mjs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { KEEL_DIR } from "./store.mjs";

const THINGS_GROUP = "Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac";

/** Locate the Things database. The ThingsData-XXXXX directory name varies per
 * install, so it is discovered rather than hardcoded.
 * @param {string} [home] @returns {string | null} */
export function findThingsDb(home = homedir()) {
  const base = join(home, THINGS_GROUP);
  let entries = [];
  try {
    entries = readdirSync(base);
  } catch {
    return null;
  }
  for (const d of entries) {
    if (!d.startsWith("ThingsData-")) {
      continue;
    }
    const p = join(base, d, "Things Database.thingsdatabase", "main.sqlite");
    try {
      statSync(p);
      return p;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Open inbox captures created after `sinceCreation`, oldest first.
 *
 * An open Inbox item is `status=0 AND start=0` (0 = Inbox, 1 = Anytime,
 * 2 = Someday); `type=0` excludes projects and headings. `creationDate` is a
 * float of Unix epoch seconds. Opened read-only, always — we never write here.
 * @param {string} dbPath @param {number} sinceCreation @param {number} [limit]
 * @returns {Array<{uuid: string, title: string, creationDate: number}>} */
export function readInboxSince(dbPath, sinceCreation, limit = 50) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(
      `SELECT uuid, title, creationDate FROM TMTask
       WHERE trashed = 0 AND type = 0 AND status = 0 AND start = 0
         AND title IS NOT NULL AND length(title) > 0
         AND creationDate > ?
       ORDER BY creationDate ASC LIMIT ?`,
    ).all(sinceCreation, limit);
    return /** @type {any} */ (rows);
  } finally {
    db.close();
  }
}

export const OFFSET_PATH = join(KEEL_DIR, "state", "capture-classifier.json");

/** Last-seen creationDate. Missing or corrupt reads as 0 — a fresh run then
 * classifies the whole current inbox, which is correct on first install.
 * @param {string} [path] @returns {number} */
export function loadOffset(path = OFFSET_PATH) {
  try {
    const v = JSON.parse(readFileSync(path, "utf8"))?.lastCreationDate;
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}

/** @param {number} creationDate @param {string} [path] */
export function saveOffset(creationDate, path = OFFSET_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ lastCreationDate: creationDate }) + "\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: PASS, 16 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/capture-store.mjs apps/agent/capture.test.mjs
git commit -m "feat(agent): read-only Things inbox reader and classifier offset"
```

---

### Task 4: Ollama sampling

**Files:**
- Modify: `apps/agent/capture-store.mjs` (append)
- Modify: `apps/agent/capture.test.mjs` (append)

**Interfaces:**
- Consumes: `classifyPrompt`, `kindSchema` from `./capture.mjs`.
- Produces: `MODEL: string`, `SAMPLES: number`, `voteKind(title: string, opts?: { model?, samples?, endpoint?, keepAlive?, fetchImpl? }): Promise<string[]>`, `unloadModel(opts?: { model?, endpoint?, fetchImpl? }): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/capture.test.mjs`:

```js
import { voteKind, unloadModel, MODEL, SAMPLES } from "./capture-store.mjs";

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

test("SAMPLES is the measured five-vote gate", () => {
  assert.equal(SAMPLES, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: FAIL — `voteKind is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/agent/capture-store.mjs`, adding this import at the top of the file:

```js
import { classifyPrompt, kindSchema } from "./capture.mjs";
```

```js
/** Measured: lfm2.5 (2.6B) is *unanimously wrong* on this task — it collapses
 * toward `reference` — so the gate gives no protection at that size. */
export const MODEL = "qwen3.6:35b";
export const SAMPLES = 5;
const ENDPOINT = "http://localhost:11434/api/generate";

/** Sample the local model `samples` times. Temperature must be non-zero or the
 * vote is theatre. `num_ctx` must be capped: uncapped, ollama sizes the context
 * at the model's full window — measured at 41 GB and 47s for one call.
 * @param {string} title
 * @param {{model?: string, samples?: number, endpoint?: string,
 *   keepAlive?: string | number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string[]>} */
export async function voteKind(title, opts = {}) {
  const {
    model = MODEL, samples = SAMPLES, endpoint = ENDPOINT,
    keepAlive = "5m", fetchImpl = fetch,
  } = opts;
  const votes = [];
  for (let i = 0; i < samples; i += 1) {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: classifyPrompt(title),
        stream: false,
        think: false,
        keep_alive: keepAlive,
        options: { num_ctx: 2048, temperature: 0.8 },
        format: kindSchema(),
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama ${res.status}`);
    }
    const body = await res.json();
    votes.push(JSON.parse(body.response).kind);
  }
  return votes;
}

/** Drop the model from memory. Idle draw returns to zero between batches —
 * this is what keeps a 23 GB model compatible with an always-on watcher.
 * @param {{model?: string, endpoint?: string, fetchImpl?: typeof fetch}} [opts] */
export async function unloadModel(opts = {}) {
  const { model = MODEL, endpoint = ENDPOINT, fetchImpl = fetch } = opts;
  await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: PASS, 22 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/capture-store.mjs apps/agent/capture.test.mjs
git commit -m "feat(agent): ollama sampling with the measured request options"
```

---

### Task 5: The classify run

**Files:**
- Modify: `apps/agent/capture.mjs` (append)
- Modify: `apps/agent/capture.test.mjs` (append)

**Interfaces:**
- Consumes: `tallyVotes`, `buildClassifiedEvent` from Task 1–2.
- Produces: `classifyCaptures({ captures, vote, appendEvent, saveOffset, now, newId }): Promise<{ classified: number, failed: number }>`.

This is the orchestration, kept pure-by-injection so it is testable without a
model, a database, or a filesystem.

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/capture.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: FAIL — `classifyCaptures is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/agent/capture.mjs`:

```js
/** Classify a batch of captures, writing one event each.
 *
 * The offset advances *before* the event is written, so a crash mid-capture
 * skips it rather than classifying it twice. A skipped capture is visible in
 * the inbox; a duplicated digest line is silent noise.
 *
 * A model failure is per-capture: it is counted, produces no event, and the
 * run continues. Every failure mode degrades to "this capture is not
 * labelled", which is the status quo before this component exists.
 *
 * @param {{ captures: Array<{uuid: string, title: string, creationDate: number}>,
 *   vote: (title: string) => Promise<string[]>,
 *   appendEvent: (e: any) => void,
 *   saveOffset: (creationDate: number) => void,
 *   now: () => number, newId: () => string, model?: string }} a */
export async function classifyCaptures({ captures, vote, appendEvent, saveOffset, now, newId, model = "qwen3.6:35b" }) {
  let classified = 0;
  let failed = 0;
  for (const c of captures) {
    let votes;
    try {
      votes = await vote(c.title);
    } catch {
      failed += 1;
      continue;
    }
    const { kind, distribution } = tallyVotes(votes);
    saveOffset(c.creationDate);
    appendEvent(buildClassifiedEvent({
      id: newId(), ts: now(), captureId: c.uuid, title: c.title,
      kind, distribution, model,
    }));
    classified += 1;
  }
  return { classified, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keel/agent test capture.test.mjs`
Expected: PASS, 27 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/capture.mjs apps/agent/capture.test.mjs
git commit -m "feat(agent): classify run with offset-before-write and per-capture failure"
```

---

### Task 6: Entry point, digest write, launchd agent

**Files:**
- Create: `apps/agent/keel-classify.mjs`
- Create: `apps/agent/tech.equanimi.keel.classify.plist`
- Modify: `apps/agent/package.json` (the `typecheck` script)

**Interfaces:**
- Consumes: everything from Tasks 1–5, plus `appendEvent`, `readEvents`, `LOG_DIR`, `KEEL_DIR` from `./store.mjs`.
- Produces: an executable entry point. No exports other tasks depend on.

- [ ] **Step 1: Write the entry point**

Create `apps/agent/keel-classify.mjs`:

```js
#!/usr/bin/env node
// @ts-check
// keel capture classifier — run by launchd when the Things database changes.
//
// Reads new inbox captures, classifies each by kind with a local model, writes
// one event per capture, and renders today's digest. Writes nothing to Things,
// Linear, or any repository: this proposes, it does not act.

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyCaptures, renderDigest } from "./capture.mjs";
import {
  findThingsDb, readInboxSince, loadOffset, saveOffset,
  voteKind, unloadModel, MODEL,
} from "./capture-store.mjs";
import { appendEvent, readEvents, LOG_DIR, KEEL_DIR } from "./store.mjs";

/** @param {number} ts */
function dayStamp(ts) {
  const d = new Date(ts);
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const db = findThingsDb();
  if (!db) {
    console.error("keel-classify: no Things database found");
    process.exit(0);
  }

  const captures = readInboxSince(db, loadOffset());
  if (captures.length === 0) {
    process.exit(0);
  }

  const result = await classifyCaptures({
    captures,
    vote: (title) => voteKind(title),
    appendEvent: (e) => { appendEvent(LOG_DIR, e); },
    saveOffset: (o) => { saveOffset(o); },
    now: () => Date.now(),
    newId: () => randomUUID(),
    model: MODEL,
  });

  // Idle draw returns to zero between batches.
  try {
    await unloadModel();
  } catch {
    // ollama already gone; nothing to unload
  }

  const now = Date.now();
  const day = dayStamp(now);
  const dir = join(KEEL_DIR, "digest");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${day}.md`), renderDigest(readEvents(LOG_DIR, now), day));

  console.error(`keel-classify: ${result.classified} classified, ${result.failed} failed`);
}

main().catch((e) => {
  console.error("keel-classify:", e?.message ?? e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it runs safely against the real inbox**

Run: `node apps/agent/keel-classify.mjs`

Expected with an empty inbox: exits silently, code 0, no digest written, no
model loaded. Confirm nothing was loaded:

Run: `ollama ps`
Expected: empty.

Then confirm it is genuinely read-only — the Things database must be unchanged:

Run: `ls -l ~/Library/Group\ Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-*/Things\ Database.thingsdatabase/main.sqlite`
Expected: the modification time is not newer than before the run.

- [ ] **Step 3: Verify it classifies a real capture end to end**

Add one capture to the Things inbox by hand (for example
`test capture: sort the area dropdown by name`), then:

Run: `node apps/agent/keel-classify.mjs`
Expected: `keel-classify: 1 classified, 0 failed` on stderr.

Run: `cat ~/.keel/digest/$(date +%F).md`
Expected: a `## agent_command` section containing the capture and a
`claude -p` invocation.

Run: `ollama ps`
Expected: empty — the model unloaded.

Run it a second time with no new captures:

Run: `node apps/agent/keel-classify.mjs`
Expected: exits silently; the digest is unchanged and no second event is
written for the same capture.

Delete the test capture from Things afterwards.

- [ ] **Step 4: Write the launchd agent**

Create `apps/agent/tech.equanimi.keel.classify.plist`. `ThingsData-851R6` is
this machine's directory — installers must substitute the value that
`findThingsDb` discovers.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>tech.equanimi.keel.classify</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>/Users/rafa/Developer/equanimitech/keel/apps/agent/keel-classify.mjs</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>/Users/rafa/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-851R6/Things Database.thingsdatabase/main.sqlite</string>
    <string>/Users/rafa/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/ThingsData-851R6/Things Database.thingsdatabase/main.sqlite-wal</string>
  </array>
  <key>StandardErrorPath</key><string>/Users/rafa/.keel/log/classify.err</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

Both files are watched because Things is WAL-mode: writes land in `-wal` and
land in `main.sqlite` at checkpoint. There is no `KeepAlive` — this must not be
a resident process.

- [ ] **Step 5: Add the new files to typecheck**

In `apps/agent/package.json`, change the `typecheck` script to include the new
modules:

```json
"typecheck": "tsc --noEmit --checkJs --allowJs --target es2022 --module nodenext --moduleResolution nodenext core.mjs store.mjs keel.mjs capture.mjs capture-store.mjs keel-classify.mjs"
```

Run: `pnpm --filter @keel/agent typecheck`
Expected: no errors.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm --filter @keel/agent test`
Expected: PASS — the pre-existing tests plus the 27 new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/keel-classify.mjs apps/agent/tech.equanimi.keel.classify.plist apps/agent/package.json
git commit -m "feat(agent): keel-classify entry point, digest write and launchd agent"
```

---

## Manual install (not a task — the human does this)

```bash
cp apps/agent/tech.equanimi.keel.classify.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/tech.equanimi.keel.classify.plist
```

To stop it: `launchctl unload ~/Library/LaunchAgents/tech.equanimi.keel.classify.plist`.
Nothing else in keel depends on it, and `/triage` works exactly as before when
it is off.

## Known gap: the `/triage` side

The spec says `/triage` consumes the digest. **That change is not in this
plan**, because the `/triage` skill lives in the user's skills directory, not
in this repository — it is a separate edit to a separate artifact, and this
plan should not reach outside the repo it builds.

The digest stands alone without it: it is a readable markdown file per day. The
`/triage` edit is a one-line addition telling the skill to read
`~/.keel/digest/<today>.md` before working the inbox, and it should be made
only after the digest has run for long enough to be worth reading.

## What this plan deliberately does not build

- **No area classification.** Measured at 37% wrong on real captures; blocked
  on entity knowledge. See the area-routing spec.
- **No execution of `agent_command`.** The digest renders a command; the human
  runs it. No worktrees, branches, or plans are created speculatively.
- **No writes to Things or Linear**, no accept flow, no queue, no retry ladder,
  no resident daemon, no new MCP server.
- **No Things pond for wake.** That is spec A's exporter and belongs on the
  wake side, not in keel.
