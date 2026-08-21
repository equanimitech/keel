import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
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

// Paths resolve at module load, so these re-import against a scratch vault.
// MIGRATION STEP 5: the fixture moved from `keel/rules/*.json` to the vault's
// `fences.json`. Only the store moved — the placeholder projection these two
// tests pin is unchanged, so the assertions below are the ones Rafa wrote.
async function loadTransformsFrom(dir, rule) {
  process.env.KAIROS_HOME = dir;
  process.env.KEEL_HOME = join(dir, "keel");
  writeJsonAtomic(join(dir, "fences.json"), { [rule.id]: rule });
  const m = await import(`./store.mjs?transforms=${Math.random()}`);
  return m.loadTransforms();
}

const textRule = (replacement) => ({
  id: "placeholder",
  domains: ["x.test"],
  defaultEnabled: true,
  primitives: [
    { kind: "transform", targets: { primary: ".a", fallbacks: [] }, replacement },
  ],
});

test("loadTransforms projects a text placeholder with its content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-transforms-"));
  const [t] = await loadTransformsFrom(dir, textRule({ type: "text", content: "the feed is off." }));
  assert.deepEqual(t.replacement, { type: "text", content: "the feed is off." });
});

test("loadTransforms degrades a text placeholder with no content to a plain hide", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-transforms-blank-"));
  // A half-written rule must still suppress the element. Shipping `text` with
  // nothing in it would render an empty box where the content used to be.
  const [blank] = await loadTransformsFrom(dir, textRule({ type: "text", content: "   " }));
  assert.deepEqual(blank.replacement, { type: "hide" });

  const dir2 = mkdtempSync(join(tmpdir(), "keel-transforms-missing-"));
  const [missing] = await loadTransformsFrom(dir2, textRule({ type: "text" }));
  assert.deepEqual(missing.replacement, { type: "hide" });
});

// ── loadArmed: the record the extension caches and actuates from ──────────
//
// Same cache-busting re-import as loadAreas: paths resolve at module load.
async function loadArmedFrom(dir) {
  process.env.KAIROS_HOME = dir;
  process.env.KEEL_HOME = join(dir, "keel");
  const m = await import(`./store.mjs?armed=${Math.random()}`);
  return m.loadArmed();
}

test("loadArmed projects a standing host block with its out-of-band exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    "shield-video": {
      id: "shield-video",
      name: "Video",
      domains: ["youtube.com"],
      deliveryProbability: 1,
      primitives: [
        {
          kind: "cooldown",
          enforcement: { at: "browser" },
          duration: { type: "standing" },
          unlockPath: { type: "out_of_band", note: "edit the fence and restart" },
        },
      ],
    },
  });
  const armed = await loadArmedFrom(dir);
  assert.deepEqual(armed["shield-video"], {
    domains: ["youtube.com"],
    primitive: { kind: "cooldown", enforcement: "browser", standing: true },
    proceed: {
      label: "Lift it",
      action: { type: "out_of_band", note: "edit the fence and restart" },
    },
    ruleId: "shield-video",
    label: "Video",
    deliveryProbability: 1,
  });
});

test("loadArmed invents no exit for a cooldown that declared none", async () => {
  // Invariant 6 is the extension's to enforce; the host's job is to not paper
  // over the omission. A supplied default would hide the bug.
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-noexit-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    r: {
      id: "r",
      domains: ["chess.com"],
      primitives: [{ kind: "cooldown", duration: { type: "standing" } }],
    },
  });
  const armed = await loadArmedFrom(dir);
  assert.equal(armed.r.proceed, null);
});

test("loadArmed skips a session-scoped rule — it reaches no browser", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-scope-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    fence: {
      id: "fence",
      scope: { surface: "session", paths: ["/Users/x/dev"] },
      primitives: [{ kind: "gate", trigger: { type: "dwell", everyMinutes: 5 } }],
    },
  });
  assert.deepEqual(await loadArmedFrom(dir), {});
});

test("loadArmed reads a browser RuleScope's domain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-rulescope-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    g: {
      id: "g",
      name: "Feed",
      scope: { surface: "browser", domain: "linkedin.com", matches: ["*://linkedin.com/*"] },
      primitives: [
        {
          kind: "gate",
          trigger: { type: "dwell", everyMinutes: 20 },
          frictionType: { type: "confirmation" },
          proceedAffordance: { label: "Keep going", action: { type: "continue" } },
        },
      ],
    },
  });
  const armed = await loadArmedFrom(dir);
  assert.deepEqual(armed.g.domains, ["linkedin.com"]);
  assert.deepEqual(armed.g.primitive, {
    kind: "gate",
    everyMinutes: 20,
    friction: { type: "confirmation" },
  });
  assert.deepEqual(armed.g.proceed, { label: "Keep going", action: { type: "continue" } });
});

test("loadArmed splits a rule carrying two actuable primitives", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-split-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    both: {
      id: "both",
      domains: ["chess.com"],
      primitives: [
        {
          kind: "cooldown",
          duration: { type: "standing" },
          unlockPath: { type: "wait" },
        },
        {
          kind: "gate",
          trigger: { type: "dwell", everyMinutes: 10 },
          frictionType: { type: "confirmation" },
          proceedAffordance: { label: "Continue", action: { type: "continue" } },
        },
      ],
    },
  });
  const armed = await loadArmedFrom(dir);
  assert.deepEqual(Object.keys(armed).sort(), ["both#cooldown", "both#gate"]);
  assert.equal(armed["both#gate"].ruleId, "both#gate");
});

test("loadArmed tolerates an absent fences.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-empty-"));
  assert.deepEqual(await loadArmedFrom(dir), {});
});

test("loadArmed skips a disabled rule", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-armed-off-"));
  writeJsonAtomic(join(dir, "fences.json"), {
    off: {
      id: "off",
      defaultEnabled: false,
      domains: ["youtube.com"],
      primitives: [
        { kind: "cooldown", duration: { type: "standing" }, unlockPath: { type: "wait" } },
      ],
    },
  });
  assert.deepEqual(await loadArmedFrom(dir), {});
});

// ── Migration step 5: fences is the single store ──────────────────────────
//
// Slice E shipped the armed record reading two stores merged — `fences.json`
// and keel's own `~/.kairos/keel/rules/*.json` — because zenborg had no
// browser-scoped fence writer and a fences-only read would have reached no
// browser at all. That writer now exists, so the second store is retired and
// these are the tests that hold it retired.

async function storeFrom(dir) {
  process.env.KAIROS_HOME = dir;
  process.env.KEEL_HOME = join(dir, "keel");
  return await import(`./store.mjs?step5=${Math.random()}`);
}

test("the rules directory is no longer a rule store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-step5-"));
  // What used to arm a shield: a RuleSpec sitting in keel's own rules dir.
  mkdirSync(join(dir, "keel", "rules"), { recursive: true });
  writeJsonAtomic(join(dir, "keel", "rules", "legacy-block.json"), {
    id: "legacy-block",
    name: "Legacy",
    domains: ["chess.com"],
    primitives: [
      {
        kind: "cooldown",
        enforcement: { at: "browser" },
        duration: { type: "standing" },
        unlockPath: { type: "wait" },
      },
    ],
  });
  const m = await storeFrom(dir);

  // Nothing reads it any more, and nothing exports a way to.
  assert.equal(m.loadRules, undefined);
  assert.equal(m.RULES_DIR, undefined);
  assert.deepEqual(m.loadArmed(), {});
  assert.deepEqual(m.loadTransforms(), []);
  assert.equal(m.loadBreakTarget(), null);
});

test("the two projections the extension actuates from are retired in favour of one", async () => {
  // `loadArmed` is now the only browser projection. Two more existed because
  // the policy pull and the armed push had different sources; they have the
  // same source now, and a second projection of one store is a second answer
  // waiting to disagree with the first.
  const m = await storeFrom(mkdtempSync(join(tmpdir(), "keel-step5-two-")));
  assert.equal(m.loadBlockDomains, undefined);
  assert.equal(m.loadDwellGates, undefined);
});

test("loadArmed arms a browser fence zenborg wrote, and only that", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-step5-armed-"));
  mkdirSync(join(dir, "keel", "rules"), { recursive: true });
  writeJsonAtomic(join(dir, "keel", "rules", "legacy.json"), {
    id: "legacy",
    domains: ["youtube.com"],
    primitives: [
      { kind: "cooldown", duration: { type: "standing" }, unlockPath: { type: "wait" } },
    ],
  });
  // The shape `hostBlockSeedRules` produces: browser scope, standing cooldown,
  // out-of-band exit.
  writeJsonAtomic(join(dir, "fences.json"), {
    "seed-block-browser-chess.com": {
      id: "seed-block-browser-chess.com",
      name: "chess.com",
      scope: {
        surface: "browser",
        domain: "chess.com",
        matches: ["*://chess.com/*", "*://*.chess.com/*"],
      },
      deliveryProbability: 1,
      primitives: [
        {
          kind: "cooldown",
          enforcement: { at: "browser" },
          duration: { type: "standing" },
          unlockPath: { type: "out_of_band", note: "take it out of the profile" },
        },
      ],
    },
  });
  const m = await storeFrom(dir);
  const armed = m.loadArmed();
  assert.deepEqual(Object.keys(armed), ["seed-block-browser-chess.com"]);
  assert.deepEqual(armed["seed-block-browser-chess.com"].domains, ["chess.com"]);
});

test("resolveRuleDomains reads a browser RuleScope as well as the flat shape", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-step5-scope-"));
  const m = await storeFrom(dir);
  assert.deepEqual(
    m.resolveRuleDomains({
      scope: { surface: "browser", domain: "linkedin.com", matches: [] },
    }),
    ["linkedin.com"]
  );
  // Session and desktop reach no browser and yield nothing, rather than
  // falling through to the flat shape and inventing a domain.
  assert.deepEqual(
    m.resolveRuleDomains({
      scope: { surface: "session", paths: ["/x"] },
      domains: ["linkedin.com"],
    }),
    []
  );
  assert.deepEqual(m.resolveRuleDomains({ domains: ["chess.com"] }), ["chess.com"]);
});

test("loadTransforms and loadBreakTarget read fences, not the rules directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keel-step5-rest-"));
  writeJsonAtomic(join(dir, "areas.json"), {
    a: { id: "a", name: "Leisure", emoji: "🎲", order: 0 },
  });
  writeJsonAtomic(join(dir, "fences.json"), {
    "content-break": {
      id: "content-break",
      scope: { surface: "browser", domain: "youtube.com", matches: ["*://youtube.com/*"] },
      areas: ["a"],
      primitives: [
        {
          kind: "cooldown",
          duration: { type: "seconds", baseSeconds: 3600 },
          unlockPath: { type: "wait" },
        },
      ],
    },
    feed: {
      id: "feed",
      scope: { surface: "browser", domain: "linkedin.com", matches: ["*://linkedin.com/*"] },
      primitives: [
        {
          kind: "transform",
          targets: { primary: ".feed", fallbacks: [] },
          replacement: { type: "hide" },
        },
      ],
    },
  });
  const m = await storeFrom(dir);

  const transforms = m.loadTransforms();
  assert.equal(transforms.length, 1);
  assert.deepEqual(transforms[0].domains, ["linkedin.com"]);

  const target = m.loadBreakTarget();
  assert.deepEqual(target.domains, ["youtube.com"]);
  assert.equal(target.durationMs, 3600 * 1000);
});
