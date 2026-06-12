---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:8ddbd340e606760910619fd3099ab6686e339549c7937b38e8d186e85fb8d058
  signedAt: 2026-06-12T17:06:46.668831Z
  signature: ed25519:YwqaXtIRqPUBTVzXLTuSa/v4rwtUjLZ38oKO2i4yqQ8poqLjWEqHyW7aJRPU2K1fAuknrLS/QxPtiES/LoCbCg==
appetite: small
slice_id: taxonomy
source: docs/ideas/2026-06-12-unify-event-taxonomy.md + academic concept-alignment session (2026-06-12)
status: draft
tag: pitch
type: pitch
---

# Pitch — One event grammar for the three writers

**Bet:** ship one event grammar in `@keel/domain` — spans, switches, completions — rename the dialect kinds in the browser and tray writers, and reserve the read-side vocabulary (bout, breakpoint, resumption lag, wait gap, baseline) before anything computes over the log.

**Why it matters:** slice E's distributions must never straddle dialects — and with one day of data logged, this is the cheapest the rename will ever be.

---

## Boundaries

**JBTD:** As the read-side consumer (`keel log report`, future models), I want all three writers speaking one grammar so that any derivation works across surfaces unchanged. Baseline today: three dialects — `browser_idle`/`browser_active` vs `idle_start`/`idle_end`+durationMs; `app_focus` vs `window_focus`/`window_blur`; a fake browser "session" per service-worker lifetime vs real agent session ids.

**Out:**
- No new sensors (input-activity pitch) and no deletions (sensors-restart pitch).
- No read-side implementation — slice E consumes this; reserved names are doc-only.
- No migration beyond a read-side alias map; day-1 files are never rewritten.

## Elements

- **Schema doc** (`packages/domain/docs/event-taxonomy.md`, referenced from `activity.ts:25`). The grammar: spans (`<state>_start`/`<state>_end`, durationMs on the end event), switches (payload = new target), completions (past-tense action ends — the breakpoint candidates, per Adamczyk & Bailey). Per-surface session semantics: agent = real Claude ids; browser = writer epoch, mechanical only; desktop = sessionless — bouts derive read-side. Shared payload keys + caps. Read-side constants: 3s bins, 30s rolling windows, ±10s alignment (OASIS); bout = inactivity-timeout visit; baselines = z-scores over rolling windows; ≤3 attention-state ceiling. Reserved kinds: `probe_shown`/`probe_answered` (ESM), intervention outcomes (`shown`/`dismissed`/…), derivations `wait_gap` and `resumption_lag`. Kinds stay an open set.
- **Browser renames** — `browser_idle`/`browser_active` → `idle_start`/`idle_end` with durationMs pairing; `window_focus`/`window_blur` → `focus_start`/`focus_end` + durationMs (span: browser holds OS focus); `browser_session_start` → `writer_started` (`apps/browser/modules/activity/events.ts:77-98`, `writer.ts:51-111`). Vitest characterization first.
- **Tray rename** — `app_focus` → `app_switched`, emitting durationMs of the span it closes (`apps/tray/src-tauri/src/lib.rs:203`, `domain.rs:79-101`). Cargo characterization first; never emit a duration across a pause (existing rule, `lib.rs:162`).
- **Alias map** — oldKind→newKind table in the schema doc + a tiny pure function in `@keel/domain` so day-1 JSONL stays analyzable without rewrites.

## Risks

**🐇 Rabbit holes:**
- MV3 service-worker death mid-span: idle/focus span starts vanish with worker memory. Persist span-start in `chrome.storage.session` or drop the span (fail-open) — decide in tests; don't build a recovery system.
- Tray span durations across sleep/pause — reuse the existing drop-state-on-pause rule; no spans across gaps.

**🧪 Domain knowledge:**
- `app_switched` over the idea doc's `focus_changed` was settled in the 2026-06-12 alignment session: the literature counts *switches* (fragmentation, Mark CHI 2014). Confirm at stamp.

## Acceptance

1. All three writers emit only grammar-conforming kinds; all suites green (vitest / cargo test / node --test).
2. The schema doc exists in `packages/domain` and enumerates per-surface vocabularies, reserved names, and read-side constants.
3. End events for idle and focus spans carry durationMs on both surfaces.
4. The alias map covers every kind present in existing `~/.keel/log` JSONL and the browser IndexedDB export.

---

_Drafted by Claude (scribe)._