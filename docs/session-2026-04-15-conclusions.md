# Session Close-out — 15 April 2026

Where we landed after a long thread on equanimi.tech architecture and the primer (v0.2).

## Decisions made

**Naming.** `equanimi.tech` confirmed. "Conditions for equanimity to flourish" — gardener, not surgeon. Drop "engagement metrics" framing entirely; use `patterns` (folded into existing `packages/domain`, no separate package).

**Architecture spine.**

- **Three layers of composition**: atomic primitives (deterministic, hand-built TS) → strategy templates (BCT/PDP-tagged, parameterized JSON) → equanimous constraints (validation pass on every LLM-drafted Rule).
- **Rules are JSON, not code.** LLM emits structured output conforming to a schema. Runtime is a small deterministic interpreter calling the primitives. `custom_script` action dropped — no LLM-generated JS at runtime.
- **MCP-shaped primitives.** ~10 well-named tools, double-duty as authoring vocabulary and runtime execution surface. Cross-browser by default. Tools tagged with which equanimous principles they support and which they risk violating.
- **Three consumption modes**: author-time (LLM composes Rule, default path), runtime (deterministic interpreter, default), live agentic (opt-in, power-user).

**LLM strategy.** Pragmatist: BYOK, cloud at author-time, local at runtime. Authoring needs a non-LLM fallback path (templates / hand-coded Rules / starter library) to honor Local-First.

**Compulsion detection.** Two scales:

- Slow: nightly domain classifier using thesis metrics (Endurability, Focused Attention, User Context, Richness, Control) over local browser history.
- Fast: runtime AttentionState inference (focused / drifting / compulsion).

Manual toggle remains as override + safety rail. Validated by lived experience: the toggle "works a bit" but fails primarily because compulsion erases the meta-cognition needed to flip it.

**Sync.** Cross-device leaks confirmed as a real failure mode. Sync is v1, not v3 — encrypted JSON via iCloud Drive or similar. No servers.

**Fade-by-Design — the spine.** Reliance fades. Patterns layer does two jobs: compulsion detection AND capacity-growth detection per-Rule. Rules get `lifecycle` (`active | retirement_candidate | retired`) and `reliance_score`. Quarterly "graduation review" UX surfaces the data; user judges. The system reports; never claims insight.

**Modification Rights stays.** Holistic Control was overloaded. Open source by default is a real commitment, not a default. Pyramid stays at 9.

## Open questions to resume on

1. **Which 10ish primitives** make the MCP surface? Initial candidates: `hide_elements`, `replace_elements`, `add_friction_wall`, `prompt_intention`, `cooldown_domain`, `reflect_post_session`, `value_reminder`, `measure_pattern`, `gate`, `schedule`. Need to converge.
2. **Capacity-growth signal definitions.** Per-Rule reliance score: which inputs (trigger frequency over time, override rate, voluntary disengagement after intervention, self-report drift) and how to combine? Do not over-engineer until real Rule data exists.
3. **Retirement UX copy.** The example proposed ("fired 14× in Oct, 1× in Dec, you overrode 0 times — keep, modify, retire?") needs design. Tone: reportorial, never congratulatory.
4. **Authoring fallback.** What does "no API key configured" look like? Templates library, copy-from-pack, manual JSON edit?
5. **Equanimous constraints as code.** The 9 principles need to become executable validators. Some are easy (Bounded Experiences → check action has end condition). Some are hard (Strategic Friction vs willpower → may need human review for ambiguous cases).

## Open questions on the primer (v0.2)

Held over from this session, worth a separate editorial pass:

1. **"You can't gamify non-reactivity"** needs defending or conceding. Current handwave is rhetorically beautiful but logically thin.
2. **"Mindful cyborg" first audience** is intellectually clean but commercially fragile. Either embrace the niche unapologetically as a discipline, or articulate the path beyond it.
3. **Strategic Friction** examples in §4.7 don't always honor the willpower distinction set up in §2.4. Tighten with a worked example that shows the user something about themselves at the friction point.
4. **Pyramid orderliness.** Three-by-three is suspicious. With Modification Rights now defended, the asymmetry question shifts: are Awareness-layer principles equally weighted? Peripheral Presence and Bounded Experiences feel sturdier than Attentional Granularity (which is the most generative concept but also the most underdeveloped).
5. **Equanimi as reference implementation of the equanimity micro-pulse SDK** (§5) is a much stronger positioning than "another wellness extension." Worth promoting from implication to thesis.

## Next session — suggested first move

Pick one of:

- (A) Spec the 10 MCP primitives with principle tags
- (B) Update `trigger-taxonomy.md` with `lifecycle`, `reliance_score`, retirement loop
- (C) Editorial pass on the primer (mindful-tech-editor mode) targeting the 5 primer questions above
- (D) Write the `equanimi-mcp` server stub as a tiny Node/Bun project to make the architecture real

If energy is low: (B) is mechanical. If energy is high: (D) crystallizes the whole thing in code.

## What I'd bet on

The defensible moat isn't the LLM authoring (commoditizing fast) or the friction interventions (well-trodden). It's the **equanimity micro-pulse SDK** — the patterns layer + the equanimous constraints + the reliance-fade loop. That's the thing nobody else is building. If equanimi.tech becomes the open reference implementation other builders depend on, the framework escapes the tool.

Sleep well.
