import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJsonAtomic } from "./store.mjs";

test("writeJsonAtomic writes valid JSON and leaves no temp file", () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-"));
  const path = join(dir, "state.json");
  writeJsonAtomic(path, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { a: 1 });
  assert.equal(readdirSync(dir).filter((f) => f.includes(".tmp")).length, 0);
});

// `loadAreas` resolves $KAIROS_HOME at module load, so these re-import with a
// cache-busting query to read a temp vault rather than the real one.
async function loadAreasFrom(dir) {
  process.env.KAIROS_HOME = dir;
  const m = await import(`./store.mjs?areas=${Math.random()}`);
  return m.loadAreas();
}

test("loadAreas filters archived, orders by order, and keeps the shared fields", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-areas-"));
  // Vault shape: keyed by id, with archived entries present rather than removed.
  writeJsonAtomic(join(dir, "areas.json"), {
    b: { id: "b", name: "Beta", emoji: "🌿", color: "#0f0", tags: ["craft"], order: 2 },
    gone: { id: "gone", name: "Retired", order: 1, isArchived: true },
    a: { id: "a", name: "Alpha", order: 0 },
  });
  const areas = await loadAreasFrom(dir);
  assert.deepEqual(areas.map((x) => x.name), ["Alpha", "Beta"]);
  assert.deepEqual(areas[1], {
    id: "b", name: "Beta", emoji: "🌿", color: "#0f0", tags: ["craft"], order: 2,
  });
  // Absent optionals become empty rather than undefined, so readers can render.
  assert.deepEqual(areas[0], { id: "a", name: "Alpha", emoji: "", color: "", tags: [], order: 0 });
});

test("loadAreas accepts the pre-migration array shape and fails soft when absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-areas-"));
  writeJsonAtomic(join(dir, "areas.json"), [{ id: "a", name: "Alpha" }]);
  assert.deepEqual((await loadAreasFrom(dir)).map((x) => x.id), ["a"]);
  assert.deepEqual(await loadAreasFrom(join(dir, "nope")), []);
});

test("projectFriction carries the declared mechanism instead of flattening it", async () => {
  const { projectFriction } = await import("./store.mjs");

  // The regression this guards: a delay has no `.prompt`, and the old projection
  // (`p.frictionType?.prompt ?? default`) turned it into the DEFAULT intention prompt.
  // The author declared a beat and the runtime rendered a question.
  assert.deepEqual(projectFriction({ type: "delay", seconds: 20 }), { type: "delay", seconds: 20 });
  assert.deepEqual(projectFriction({ type: "breath", cycles: 3 }), { type: "breath", cycles: 3 });
  assert.deepEqual(projectFriction({ type: "confirmation" }), { type: "confirmation" });
  assert.deepEqual(projectFriction({ type: "intention", prompt: "Still?" }), {
    type: "intention", prompt: "Still?",
  });
});

test("projectFriction says so when it cannot render what was declared", async () => {
  const { projectFriction } = await import("./store.mjs");

  // Loud, not silent. An unsupported mechanism must not masquerade as a working gate.
  const out = projectFriction({ type: "value_recall", valueRef: { source: "self_storage", key: "v" } });
  assert.equal(out.type, "intention");
  assert.match(out.prompt, /value_recall/);
  assert.match(out.prompt, /cannot render/);

  // A missing declaration keeps the historical default rather than blanking the card.
  assert.deepEqual(projectFriction(undefined), {
    type: "intention", prompt: "Still what you came for?",
  });
});

test("safeRedirect refuses schemes that execute", async () => {
  const { safeRedirect } = await import("./store.mjs");

  // The target lands in window.location.assign inside a content script on every page,
  // so an executing scheme is an injection primitive, not a reroute.
  assert.equal(safeRedirect("javascript:alert(1)"), null);
  assert.equal(safeRedirect("  JavaScript:alert(1)  "), null);
  assert.equal(safeRedirect("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeRedirect("vbscript:msgbox"), null);
  assert.equal(safeRedirect("file:///etc/passwd"), null);
  // Protocol-relative is absolute wearing a relative costume.
  assert.equal(safeRedirect("//evil.test/x"), null);
  assert.equal(safeRedirect(""), null);
  assert.equal(safeRedirect(undefined), null);

  // What a reroute actually looks like.
  assert.equal(safeRedirect("https://example.test/read"), "https://example.test/read");
  assert.equal(safeRedirect("http://localhost:3000/"), "http://localhost:3000/");
  assert.equal(safeRedirect("/feed/"), "/feed/");
});
