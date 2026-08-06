# keel as attention control plane (the "bridge")

- Define an attention policy **once** in keel; keel compiles + pushes it to every enforcement surface — instead of hand-typing `youtube.com` into NextDNS + browser seed + Screen Time separately.
- keel already owns the two hard ends of the loop; enforcement is commodity: **SENSE** (behavior log — dwell/binge/video) → **DECIDE** (propose a blocklist from evidence, user rules on it) → enact across surfaces.
- Shape: a keel **Intent** = a `watch`/retreat (declared intention + timebox + policy) with actuator **ports**:
  - `BrowserDrogue` — DNR seed (keel already owns this)
  - `DnsResolver` — NextDNS / Cloudflare Gateway / AdGuard / Pi-hole (all have APIs). **NextDNS (`api.nextdns.io`, key-auth, manages denylist/allowlist) is the natural FIRST actuator — hosted, no hardware; ship the bridge before the Pi.** AdGuard Home API = the sovereign actuator later.
  - `LocalNetwork` — macOS pf / hosts
- Caveat 1 — **Apple is closed.** No public Screen Time API on a personal device; the YouTube-*app* hole stays a manual checklist item keel *surfaces* but can't *set*. The bridge spans everything except Apple.
- Caveat 2 — centralizing enforcement makes the equanimitech guardrails **load-bearing, not optional**: PROPOSE-not-auto-apply (user decides from the log, like the chess call), a compassionate override (`keel pass youtube 10m`, deliberate + logged) — correct shape is **delay, not instant skip** (the delay IS the stimulus→reaction gap); for *reading* sources (HN/NYT/Substack) the best override is **capture-not-consume** — a read-later queue surfaced post-retreat, honoring the interest without opening the wall, and bounded / fade-by-design. The [equanimitech diagnostic] four-move spec IS the guardrail set.
- This is **P5** — interventions returning as a separate module built on accumulated baselines (see [[keel-observability-first]]). Genuinely keel-shaped because the sense+decide loop is the part no NextDNS/Screen Time has.
- Trigger: 2026-07-06, the DRY pain of hand-configuring a content retreat across NextDNS + browser seed + Screen Time.

- Questions:
  - Is the `watch` the right home for a policy-carrying Intent, or does a retreat want its own type? (see tide-vs-watch)
  - Per-provider DnsResolver adapters — how many before it's worth it? Start with just NextDNS?
  - Where do resolver API credentials live under local-first ownership?
  - Does the override (`keel pass`) belong at the control plane or per-actuator?

Don't shape yet. Next if pursued: /shaping or /leverage-points on the actuator-port layer.

---

## Primary affordance: `keel retreat` (the front door)

The user-facing culmination of the control plane — one gesture that enacts a full content-disconnect. **This whole 2026-07-06 session was a manual dry-run of this button** (seed + NextDNS + tiers + override, done by hand).

- **Shape:** a first-class *bounded* Intent (a `watch` carrying a full-disconnect policy) that fans out to every actuator in one act — `BrowserDrogue` + `DnsResolver` (API) + surfaces the Screen Time checklist keel can't automate.
- **Timeboxed + deliberate-to-lift** — the friction lives in *entering thoughtfully and exiting deliberately*, not in the plumbing. Honors Bounded Experiences + Fade.
- **Override baked in:** the delay / capture-for-later valve (reading sources → read-later queue, not instant skip).

**Repeatable + visual (the "how long has it been" ask, 2026-07-06):**
- *Repeatable* = good (Bounded Experiences): `keel retreat` is re-invocable; keel stores each retreat (start / end / policy) → a history to reflect on. Deliberate re-entry is the practice.
- *Visual* = **gamification trap, handle with care.** A retreat streak / duration counter that *rewards continuation* is the washing pattern — "you cannot gamify non-reactivity." Loss-aversion streaks manufacture reactivity around the very state the retreat is meant to quiet.
- Equanimitech-safe forms:
  - **Calm bounded state, not a meter** — "retreat · day 4 of 7" (the *of 7* gives it a natural end; an open-ended streak rewards indefinite continuation = the trap). Factual, no celebration.
  - **After-the-fact reflection** — the before→during content-dwell drop, straight from the same `~/.keel` browser log used to build the blocklist. The retreat report writes itself from the jsonl. Self-knowledge (Awareness layer), reviewed deliberately — not a live dopamine gauge.
  - Home: the e-ink / tray surface (glanceable, non-pulling). See [[keel-eink-ambient-surface]].

Open design questions (for the brainstorm → shaping pass, deliberately deferred to post-retreat):
- **Content vs comms** — WhatsApp was the single biggest signal this session but it's comms, not content. "Disconnect completely" needs a content/comms split or levels, or a retreat becomes silence.
- **Button vs dial** — one "full retreat" or a depth dial (light content-diet → full disconnect)? Resurfaces the `_archived-appetite` shape.
- Cross-device reality: browser + DNS auto-enact; Screen Time stays a surfaced manual step.

Process note: this deserves `superpowers:brainstorming` → `shaping`, NOT a mid-retreat build. Captured now, shaped when the retreat is over.

---

## Setup runbook — Pi attention-firewall + Themia monitoring (when the kit lands)

Hardware: Kubii Pi 4 (2GB) kit. The Themia jobs (7–8) are what make it genuine business hardware; the firewall (4–6) is the side-tenant.

1. **Flash Pi OS Lite (64-bit), headless.** Raspberry Pi Imager → Pi OS Lite (64-bit). In advanced options (Ctrl+Shift+X): set hostname `keel-pi`, enable SSH with your **public key** (`~/.ssh/id_ed25519.pub`), locale. Wire it to the router by Ethernet, boot.
2. **First SSH + harden.** `ssh <user>@keel-pi.local` → `sudo apt update && sudo apt full-upgrade -y`. Confirm `PasswordAuthentication no` in sshd_config (key-only). `sudo apt install unattended-upgrades -y && sudo dpkg-reconfigure -plow unattended-upgrades`.
3. **Docker.** `curl -fsSL https://get.docker.com | sh` + add user to `docker` group. Run the services below as containers (config lives in named volumes → back these up).
4. **AdGuard Home** (`adguard/adguardhome`). Web setup at `http://keel-pi.local:3000` → admin creds → upstreams (Quad9/Cloudflare DoT). Add the retreat domains + an adult-content blocklist URL (the phone-reachable version of the browser seed). Enable its DoH server.
5. **Tailscale** (`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`). In the Tailscale admin → set tailnet **DNS to the Pi's Tailscale IP** ("Override local DNS"). Now every tailnet device filters through AdGuard — **no public exposure, no `.mobileconfig` needed.**
6. **Point the phone.** Install Tailscale on the phone, join the tailnet. It now resolves through AdGuard everywhere. (This *supersedes* NextDNS — don't bother setting NextDNS up.)
7. **Uptime Kuma** (`louislam/uptime-kuma`) — **the Themia job.** Monitors: `app.themia.pro`, staging, the MCP endpoints, Stripe/webhook health → notify (email/Slack). This is the real always-on business function.
8. **Scheduled Themia jobs** (optional, the other legit job): cron/systemd timers for veille scans, `restic` backups, health pings.
9. **Reliability:** set a fallback resolver on devices so a dead Pi doesn't strand DNS; boot-from-SSD later; back up the Docker volumes.

Security recap: no public ports (Tailscale-only), SSH keys, auto-updates, never an open resolver.
