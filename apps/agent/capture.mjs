// @ts-check
// Pure capture-kind logic. No I/O — see capture-store.mjs.
//
// Kind is carried by verbs and sentence structure, not by private knowledge
// about people. That is why it is reachable by a local model where routing to
// a life *area* was not — see
// docs/superpowers/specs/2026-08-08-capture-kind-classifier-design.md.

import { buildEvent, capValue } from "./core.mjs";

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
