---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:dba541d7b9c0b7e0e89ac2da0f21156bdb73e904927bf624c423af70e8ada2f1
  signedAt: 2026-06-14T11:06:04.354673Z
  signature: ed25519:0KQzIuoI1s1bJV1yclwIoKZy5BTn/hg6zeZ5wHVTjMxkwuBbeSRhEIfzzDhfK1/RYf2Bl/25WCEsxxTZUrQ1CQ==
type: idea
---
# zoom-as-granularity dial — generative-UI coding experience

Captured 2026-06-07 (late session).

Core: use a physical, tactile gesture — terminal font zoom (cmd +/-) — as the granularity/appetite dial. Literal zoom = semantic zoom. Zoom out → coarser (tiny appetite); zoom in → deeper (deep appetite). Embodied, sovereign, zero UI chrome. Maps onto the keel `appetite` dial (tiny/small/normal/deep ↔ semantic-zoom L0-1/L2/L3-4/L5+).

Constraint (today): keel hooks can't read iTerm font zoom — terminals expose the char grid (tput cols / rows), not font point size. Two routes:
- Proxy via $COLUMNS (only works with a fixed-size window; coarse).
- Real: iTerm2 Python API / AppleScript reads session font size → writes `keel appetite` → keel state. iTerm-specific bridge daemon.

Bigger swing: a Claude Code / opencode *experience* that natively supports this — improved generative UI where granularity is a first-class, gesture-driven control (zoom, not commands). The generative figures/fork-buttons (Glance/Click/Ask, fork-click pitch) + zoom-driven appetite = a coherent calm coding surface. opencode (open TUI) might be the place to prototype since it's hackable, vs iTerm-bridging Claude Code.

Related: keel appetite skill, fork-click buttons pitch (docs/pitches/2026-06-07-fork-click-buttons.md), Glance/Click/Ask vision (docs/vision/2026-06-07-jurimetria-vision.md). Equanimitech: embodied + sovereign + fade-by-design.

Captured via /triage on 2026-06-14 from the Things inbox.