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
