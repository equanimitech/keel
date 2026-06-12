---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:af3edebac29318f98990fd6f347300940a135c4b770933eff6f826f17c354fa1
  signedAt: 2026-06-12T14:11:07.927263Z
  signature: ed25519:k+IHaPzWj8Llz5N7VVkLSGShWRiM5tb/bWJrDgGil8umVwgbEqFCx4UTzRwWs/4U6d9F2ZqNdZ8CmxsrvXZmDA==
appetite: small
slice_id: A
source: docs/2026-06-12-observability-roadmap.md (slice A)
status: draft
tag: pitch
type: pitch
---

# Pitch — Event-log substrate + keel agent writer

**Bet:** ship the `ActivityEvent` log substrate and instrument keel agent (née keel-gate) as its first writer — every Claude session appends session/prompt/tool/stop events to `~/.keel/log/`, append-only, fail-open.

**Why it matters:** starts the 21-day data clock the roadmap and the launch gate on, and captures the dataset nobody has published — AI-wait gaps in agentic coding. The same hooks that keep Claude facing the right direction become the instrument that records where attention actually went.

---

## Boundaries

**JBTD:** As keel's first user, when I work in Claude Code I want every attention-relevant event persisted automatically so that baselines and models can be built on real data later. Baseline today: `state.json` stores single overwritten timestamps (`lastPromptTs`) — history is destroyed every turn.

**Out:**
- No aggregation, metrics, or models — raw events only (read-side = slice E).
- No derived facts and no bi-temporal envelope yet — slice E carries `{ validFrom, validTo?, learnedAt, invalidatedAt?, sourceEventIds }`. Slice A only guarantees what that envelope will need: stable event ids.
- No browser or tray writers (slices B/C). No new UI. No keystroke/mouse capture.

## Elements

- **`ActivityEvent` in `@keel/domain`** (`packages/domain/src/activity.ts`, new). `{ id, surface: "agent"|"desktop"|"browser", kind, ts, durationMs?, payload }`, readonly, factory-built. `id` is stable and unique — the provenance anchor future derived facts cite as `sourceEventIds` (the Graphiti episode pattern). keel agent mirrors the type as a JSDoc typedef (deploys standalone, no TS import).
- **Append-only writer in store** (`packages/keel-gate/store.mjs:28` overwrites today). `appendEvent(e)` → `appendFileSync` to `~/.keel/log/YYYY-MM-DD.agent.jsonl`, try/catch-wrapped — logging must never break the gate (fail-open, `keel.mjs:4`).
- **Instrument three live hooks, add two** (`keel.mjs:281-284` dispatch). session-start / user-submit / pre-tool emit events; new `hook post-tool` (tool name + duration → AI-wait derivable) and `hook stop` (turn boundary). Register PostToolUse + Stop in `~/.claude/settings.json` beside the existing keel entries.
- **`keel log status`** — today's per-kind counts + "no events this session" warning. The P1 data-quality seed.

## Risks

**🐇 Rabbit holes:** perfect taxonomy up front — start with 6 kinds (session_start, prompt, tool_dispatched, tool_completed, turn_stop, intention_set), let the rest accrete. Hook payload spelunking — log what stdin carries, don't chase fields.
**🏴 Off-sides:** lifting `Notch` into domain (separate idea, parked); any reading surface beyond `log status`; renaming the keel-gate package (decision: deferred).
**🧪 Domain knowledge:** verify Stop-hook stdin payload shape; confirm PostToolUse does not fire for denied tool calls.

## Acceptance

1. After one real Claude session, `~/.keel/log/<today>.agent.jsonl` holds ≥1 session_start, ≥1 prompt, paired tool_dispatched/tool_completed with `durationMs`, and a turn_stop — one JSON object per line, append-only, every event carrying a unique `id`.
2. A test proves a corrupted/unwritable log dir never blocks a tool call.
3. `keel log status` prints per-kind counts for today.
4. `node --test` and `pnpm typecheck` green; new hooks registered and deployed to `~/.keel/`.

---

_Supersedes: conversation draft 2026-06-12 (v1). Drafted by Claude (scribe)._