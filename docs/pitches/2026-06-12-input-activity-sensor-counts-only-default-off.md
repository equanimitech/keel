---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:5f963559037ca0f8031ec960251ecf39d03d35be09b955e618847334337983f0
  signedAt: 2026-06-12T17:07:32.910285Z
  signature: ed25519:QPgfusLmNTqT7hnAw4nk+41J1TmIy3A6LwhUnXunlRGEwDXUx/LoaQhBsGi/W+keyJvEVrFpuMdX6rZ17Z0oAQ==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:5f963559037ca0f8031ec960251ecf39d03d35be09b955e618847334337983f0
  docFilename: 2026-06-12-input-activity-sensor-counts-only-default-off.md
  stampedAt: 2026-06-12T17:18:19.952192Z
  signature: ed25519:fuc6ske/idErqyCftt6RqT0DN+imnXK9OrvQgnBHo/8Xj6gUBfKztP2Puj9kXDZxfB6EcNpnUs6FEmY1gJbABg==
---

# Pitch — Input-activity sensor: counts only, default-off

**Bet:** the tray grows an input-activity sensor — keyboard/mouse/scroll event *counts* and timing aggregates per bin, never content — shipped default-off behind an explicit config toggle.

**Why it matters:** it is the strongest cheap signal in the literature (Fogarty's Easy-to-Build set ~78–79%; interaction data beats biometrics for developers, Züger CHI 2018) and the missing endpoint for resumption lag and engaged-vs-idle — and personal-baseline stress proxies only work if raw logging starts weeks before any model.

---

## Boundaries

**JBTD:** As the future model layer, I want input activity in the desktop log so that engagement, resumption lag, and stress anomalies become derivable. Baseline today: the tray sees only idle≥120s and app switches — it cannot distinguish active-in-hidden-window from paused, and resumption lag has no endpoint.

**Out:**
- No keycodes, no content, no per-key timing — counts and interval aggregates only.
- No models, no baselines (slice E+); no browser/agent equivalents.
- Never on by default: ships off; the user opts in.

## Elements

- **Counter polling** — `CGEventSourceCounterForEventType` (HID system state) for keydown / mouse-down / scroll inside the existing sensor loop (`apps/tray/src-tauri/src/lib.rs:154-193`); per-poll deltas accumulate into bins.
- **Pure bin logic** (`domain.rs`) — bin aggregation and event building: one `input_activity` event per 30s rollup carrying ten 3s-bin count arrays + inter-event interval mean/var per bin. Cargo TDD first.
- **Consent + dial** — config toggle (default off) surfaced by `keel rules`; flips emit `rule_changed`; off = zero input events, test-verified.

## Risks

**🐇 Rabbit holes:**
- Volume: per-3s-bin events would be ~28k/day; the 30s rollup caps the sensor at ~2.9k/day. If that still bloats day files, widen the rollup — don't build compression.

**🧪 Domain knowledge:**
- Spike first (15 min): verify `CGEventSourceCounterForEventType` ticks without Input Monitoring permission on macOS 14+; if counters read zero without the grant, surface a menu flag like the Screen Recording one (`lib.rs:144`).
- Confirm counter behavior across sleep; reset deltas on wake if not monotonic.

## Acceptance

1. Default state logs zero input events (test-verified).
2. Enabled: `input_activity` events carry counts + aggregates only — no field can contain content; cargo test green.
3. Daily event volume from this sensor ≤ ~3k at sustained typing (documented + asserted in a test fixture).
4. `keel rules` shows the toggle; enabling/disabling emits `rule_changed`.

---

_Drafted by Claude (scribe)._