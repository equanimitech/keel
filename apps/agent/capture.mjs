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
