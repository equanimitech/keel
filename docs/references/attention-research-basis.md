# Attention Research — design basis for keel

**Date:** 2026-06-01
**Status:** reference. The evidence base keel's strategy is built on. Source: "Restoring Attention in Knowledge Work: Evidence, Mechanisms, and Design" (synthesis of ~15 yrs peer-reviewed work, provided 2026-06-01).
**Use:** every keel mechanism should trace to a graded principle here. Lean on the *strong* rows; hedge or avoid the *weak* ones.

---

## The framing correction (load-bearing)

- **Attention *behavior* is fragmented — strong evidence.** Screen dwell before switching fell 2.5 min (2004) → 47 s (2023); ~1,200 app-toggles/day; task-switch every ~3 min (Mark, 20-yr program).
- **Attention *capacity* decline — unsupported / myth.** The "8-second / goldfish" stat is fabricated (Bradbury 2016). Mark: "our ability to focus isn't lost, the way we focus is changing."
- **keel claim discipline:** keel reduces **fragmentation / drift**. It must **never** claim to restore lost cognitive *capacity*, nor invoke the goldfish myth. Mirrors the equanimitech measurement constraint (structural conditions, not produced states).

## Degradation mechanisms (why late-night coding spirals)

| Mechanism | Finding | Evidence | keel relevance |
|---|---|---|---|
| Interruption recovery | ~23 min to refocus after a meaningful interrupt; 2.8 s interrupt doubles errors | **very strong** (Mark 2008) | **a clock-slammed block IS an interrupt** → breakpoint-arm it |
| Attention residue | Task-A cognition persists into Task-B, worse under time pressure | strong (Leroy 2009) | switching texture = the observer's signal |
| Sleep deprivation | ≤6 h ≈ 2 nights' total deprivation; 17–19 h awake ≈ legal alcohol limit; **subjects unaware of their own deficit** | strong | **justifies the wind-down Ulysses pact** — the 2 AM self can't self-assess |
| Chronic stress | structural PFC remodeling, attention-regulation loss | strong | observe, don't add stress (no punitive UI) |
| Info overload | working memory ~7±2; overload → continuous partial attention | strong | don't dashboard the user with their own data |

## Restoration evidence — ranked (lean on the top, avoid the bottom)

| Approach | Effect / status | Evidence | keel stance |
|---|---|---|---|
| **Meta-awareness / mindfulness** | d/g ≈ 0.29–0.69 on attention; executive control, inhibition | **strong** (Verhaeghen 2021; Bartlett 2019; Lomas 2020) | **primary lever** — the "noticing" bell + reflection |
| **Equanimity** as differentiator | even-minded, fast disengagement/recovery | moderate-strong (Desbordes 2015) | the north-star construct; maps ES-16 Non-reactivity |
| **Vipassana meta-awareness / sustained attention** | improvements persist **7 yr** post-training | moderate-strong (Zanesco 2018) | scaffolding noticing can durably transfer → Fade |
| Binaural beats | inconsistent mechanism | **weak** | **do not build on** |
| NSDR / yoga nidra | non-significant for attention | **very weak** | **do not build on** |
| Flow "500% productivity" | self-report survey, not experimental | weak | **do not cite as fact** |

## HCI — what works vs what fails (the design verdict)

**Works:**
- **Breakpoint-based deferral** — fire at task transitions, not arbitrarily; simple sensors predict interruptibility ~78% (Iqbal & Bailey 2008; Fogarty 2005).
- **Periphery-first / calm tech** — ambient channels (light, subtle motion) over focal interruption (Case 2015; Weiser).
- **Scheduled focus blocks** improve wellbeing (Microsoft 2023).
- **Personalization** — Mark 2018: blocking helped low-Conscientiousness users, but **higher perceived-work-control users got *increased* workload from blocking.** One size fails.

**Fails:**
- **Hard app cutoffs / time limits** → frustration, workarounds, abandonment.
- **One-size-fits-all** interventions.
- **Punitive feedback** → only **6–10 %** adoption; users reject it.
- Ignoring the user's broader context.

## The six design principles (the backbone)

1. **Detect & respect natural breakpoints** — intervene at boundaries, not mid-task.
2. **Design for the periphery first** — ambient until genuinely needed.
3. **Nudge rather than block** — gentle friction > hard restriction; frame as helping, not policing.
4. **Support meta-awareness, not just task management** — help the user *notice their own state* (the strongest-evidence lever).
5. **Personalize to individual differences** — learn/adapt; don't impose uniform rules.
6. **Integrate with the user's wider context** — for keel, that context is **Zenborg** (the user's declared intentions).

## keel binding map

| Research principle | keel mechanism |
|---|---|
| Breakpoints (1) | **breakpoint-arming** — higher friction rungs engage at the next switch/idle/commit, not the clock tick |
| Periphery (2) | the **stain** (ambient wash), peripheral status |
| Nudge > block (3) | **no hard cutoff** — coding-block only (AI stops *producing*, not conversing); **scarce skip credits** as the override |
| Meta-awareness (4) | the **"digital bell"** (notice duration/hour) + **scoreless reflection** ("wound down on own N of 7") — *elevated to a primary mechanism, not a side feature* |
| Personalization (5) | user-set times, per-target tactics, credits; **the user is high-work-control → blocking would backfire → intention-alignment + meta-awareness fit better than quotas** |
| Wider context (6) | **Zenborg** as the intention source for the driver |

**The verdict that reshaped the design:** hard cutoffs + clock-slams are the documented failure modes; meta-awareness + breakpoints + personalization + intention-alignment are the documented wins. This is *why* keel demotes usage-vs-budget (a time-quota = the failing pattern), softened the gate, breakpoint-arms it, and elevates the meta-awareness layer.

## What keel explicitly does NOT lean on

The goldfish/8-second myth · "attention capacity is declining" · binaural beats · NSDR/yoga-nidra-for-attention · the flow "500%" figure. Naming them keeps the strategy honest.
