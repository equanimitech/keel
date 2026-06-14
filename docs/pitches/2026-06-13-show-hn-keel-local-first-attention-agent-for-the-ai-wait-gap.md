---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:0a60bbc96db2b0ce2cc687da205e76c6bb579642a879280d02925ba94e27f370
  signedAt: 2026-06-13T21:23:33.415626Z
  signature: ed25519:VKXX3a8Vucl31UCCAaGTNOESf92KbZpvSfAbsaSWTVEQVflg/ytZX6h3ZVG9JJmeYwj4Mn5tpVQUgef7AEXQAA==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:0a60bbc96db2b0ce2cc687da205e76c6bb579642a879280d02925ba94e27f370
  docFilename: 2026-06-13-show-hn-keel-local-first-attention-agent-for-the-ai-wait-gap.md
  stampedAt: 2026-06-13T21:24:49.702753Z
  signature: ed25519:+GK1u9QzpZY+EZc1TcrFOTw6GuvjU5mdpOKf+AWBLtHhQUeJnWEVd3T1j1idhZN9L2mvxNsdr1Xwp8rparuIAg==
---
A draft "Show HN" post for Hacker News, aimed at Claude Code users. Status: drafted 2026-06-13, **not yet posted**. Save for later.

## Chosen title

> Show HN: keel – local-first attention agent for the AI-wait gap

## The post

I hit Enter on a Claude Code task and the instant it starts thinking, my hand is already on ⌘T → youtube.com. The agent works for two minutes; I "just check one thing"; twenty minutes later the task is done and I'm six Shorts deep. The agent handed me back focus time and I spent it scrolling.

The better these agents get, the more of these little waits I have — and every one is a doomscroll trigger. keel is my attempt to fix that for myself.

**What it actually does today (observe-first, all local):**

- A **Claude Code plugin** — a focus gate + an activity-log writer. It already knows when an agent is running, because it *is* a hook.
- A **Chrome extension** that quietly logs where your attention goes (coarse events + opt-in per-site sensors), so the AI-wait scroll shows up plainly in your own data.
- A **"drogue"** — a user-owned blocklist that adds friction to the sites that pull hardest. Drag, not a wall: it slows you, you can always choose.

Everything is local. No account, no server, and the extension makes **zero network calls** — events sit in local IndexedDB until *you* export them. It's permission-minimal by construction (`declarativeNetRequest`, no `host_permissions`, no `webRequest`) so it structurally *cannot* read your pages.

**Where it's going (not built yet — calling it out so I don't oversell):**

Observation is step one. The goal is a JITAI — a just-in-time intervention built from *your own* data. Once keel learns your currents (you reach for YouTube ~90s after firing a long task), it catches that exact breakpoint and offers a self-authored alternative — a 2-minute breath instead of Shorts — and titrates *down* as you stop needing it. Interventions generated for you, from your data, by you. Not a vendor deciding when to nag you.

It's designed to **fade**. If you internalize the impulse and uninstall in six months, that's the win — there's no screen-time metric to protect, because there's nothing to sell.

**The honest open question I'd love HN's take on:** does an observer + blocker actually *build the skill*, or is it just a crutch? That's the whole reason the roadmap is "intervene at the teachable moment," not "block more." I don't have proof it works yet.

Stack: Claude Code hook is plain Node (no daemon, fail-open); browser is WXT/MV3 + TypeScript (pure-function core + vitest); macOS tray is Tauri/Rust; the watchlist seeder is stdlib-only Python that reads a copy of your history and ranks the domains you compulsively return to (quick-return rate, binge runs, recency drift).

Named for the keel of a boat — the part that keeps you steady in the gusts and lets you hold a heading. Repo + install: [github.com/equanimitech/keel]

Happy to go deep on the privacy model, the hook API, or the crutch-vs-capacity question. What would make you actually trust an "attention agent" on your machine?

## Alternate titles

- Show HN: keel – an attention agent for the gap while Claude Code works
- Show HN: keel – I doomscroll the second I hit Enter on Claude Code, so I built this

## Before posting

- **Make it try-able.** Show HN expects people to run it: repo public + working install (plugin installable, extension loadable). Packages are currently `private` and the store listing is "coming soon."
- **Keep the shipped/vision line explicit.** The "not built yet" paragraph is the armor — don't blur the JITAI roadmap into present tense.
- **Be ready for two threads:** (1) privacy — lead with zero-egress / permission-minimal; (2) "just another blocker?" — answer is JITAI-from-your-own-data + fade-by-design.
- Optional: pre-draft a first comment for the privacy thread.
