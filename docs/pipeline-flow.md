# Pipeline Flow — Generative Interventions

The four-stage authoring pipeline for LLM-generated, equanimously-constrained, deterministically-executed browser interventions.

## Principles

- **The LLM's primary output is code.** The spec is a durable, human-readable contract; the code is a regeneratable snapshot.
- **Transparency by default.** Show-implementation is always available, never gated.
- **Conversation, not configuration.** Authoring is a natural-language dialogue. Scripts reload per iteration so the effect is immediately felt.
- **Validation is a gate at commit, not a wall during play.** Experimentation is unblocked; commitment is rigorous.
- **Modification Rights is sovereign.** Validation can be overridden. Overrides are recorded and surfaced in the patterns layer.
- **Versioning over replacement.** Rules accumulate history. Rollback is a first-class action.

## Lifecycle

```
  ┌────────────────────────────────────────────────────────┐
  │                  EXPERIMENTAL                          │
  │                                                        │
  │   user prompt ─→ LLM ─→ spec + code                    │
  │        ↑                    │                          │
  │        │                    ▼                          │
  │   refine in NL    ephemeral userScript runs            │
  │        ↑                    │                          │
  │        └────────────────────┘   (loop)                 │
  │                                                        │
  │                  user clicks "commit"                  │
  └────────────────────────────────┬───────────────────────┘
                                   ▼
  ┌────────────────────────────────────────────────────────┐
  │                  VALIDATION GATE                       │
  │                                                        │
  │   spec  ─→ schema check + equanimous-intent check      │
  │   code  ─→ AST analysis + security review              │
  │   pair  ─→ behavioral conformance check                │
  │                                                        │
  │           pass ─────────────┐                          │
  │           fail ─→ user sees report                     │
  │                  ├─ iterate further (back to exp)      │
  │                  └─ commit-with-override (recorded)    │
  └────────────────────────────────┬───────────────────────┘
                                   ▼
  ┌────────────────────────────────────────────────────────┐
  │                  COMMITTED                             │
  │                                                        │
  │   chrome.userScripts.register(version_n)               │
  │   patterns layer begins reliance tracking              │
  │   version archived; rollback available                 │
  └────────────────────────────────────────────────────────┘
```

## Stages

### 1. Prompt → Spec + Code (LLM)

User describes intent in natural language. LLM produces a paired output.

**Boundary schema:**

```ts
interface AuthoringRequest {
  readonly prompt: string;             // user's natural-language description
  readonly context?: {
    readonly currentUrl?: string;      // active tab when authoring started
    readonly priorVersion?: RuleVersion; // for edits to existing Rules
  };
}

interface AuthoringResponse {
  readonly spec: RuleSpec;             // declarative, human-readable
  readonly implementation: GeneratedScript; // TS/JS source
  readonly explanation: string;        // plain-English narration
  readonly diffFromPrior?: SpecDiff;   // when editing existing
}
```

### 2. Ephemeral Execution (experimental)

Generated script runs immediately via `chrome.userScripts.register()` with a `world: "MAIN"` scope and an `ephemeral: true` flag in our local registry. User sees the effect on the page they were experimenting on.

**Boundary schema:**

```ts
interface EphemeralRegistration {
  readonly sessionId: string;          // experimental session
  readonly script: GeneratedScript;
  readonly matches: readonly string[]; // URL patterns
  readonly registeredAt: number;
}
```

Sessions end when the user commits, abandons (closes studio / starts new prompt), or 60 minutes of inactivity elapses (cleanup, not TTL).

### 3. Iteration (loop within experimental)

Each refinement re-invokes the LLM with prior context, regenerates spec + code, swaps the ephemeral script. Old ephemeral script is unregistered atomically before new one is registered.

The show-implementation toggle exposes the current code at any point. This is the *learning* role of the toggle — what is the LLM doing in response to my words.

### 4. Commit → Validation Gate

User clicks "commit." Three validators run in parallel:

| Validator | Input | Output |
|---|---|---|
| **Schema** | spec | structural conformance to a primitive contract |
| **AST** | code | no `eval`, no remote fetch without declaration, no untracked side effects, no unbounded loops, no `setInterval` below threshold |
| **Equanimous-intent** | spec | declared intent does not violate principles (e.g., gate without proceed-affordance fails Modification Rights) |
| **Equanimous-behavior** | code | code does not implement refused BCTs/PDPs (e.g., reward loops, social comparison) even if spec doesn't declare them |
| **Conformance** | spec + code | code actually implements the spec; no scope creep |

**Validation outcome:**

```ts
type ValidationResult =
  | { readonly status: "pass"; readonly version: RuleVersion }
  | {
      readonly status: "fail";
      readonly findings: readonly Finding[];
      readonly canOverride: true;       // always true — Modification Rights is sovereign
    };
```

A failing validation surfaces a report. The user can:

- *Iterate further* — re-enter experimental with the LLM seeing the findings as additional context
- *Commit-with-override* — explicit second confirmation, override recorded permanently in the version's metadata, surfaced in the patterns layer ("3 of your committed Rules carry override flags")

### 5. Committed Registration

```ts
interface CommittedRule {
  readonly id: RuleId;                 // stable across versions
  readonly versions: readonly RuleVersion[]; // append-only
  readonly active: VersionId;          // current
  readonly createdAt: number;
  readonly lifecycle: "active" | "retirement_candidate" | "retired";
  readonly relianceScore?: number;     // populated by patterns layer over time
}

interface RuleVersion {
  readonly id: VersionId;
  readonly spec: RuleSpec;
  readonly implementation: GeneratedScript;
  readonly explanation: string;
  readonly validation: ValidationResult;
  readonly committedAt: number;
  readonly committedFrom?: VersionId;  // parent version, for edits
}
```

Registered via `chrome.userScripts.register()` on extension startup and on commit. Old version stays running until new is committed (no protection gap during edits).

The patterns layer begins tracking reliance from this point. Override flags are visible in the per-Rule view.

## Editing an Existing Rule

User opens a committed Rule, says "tweak this gate to also block reactions."

1. New experimental session opens with prior version's spec + code as starting context
2. Old version *remains active* on matching pages
3. New iteration loop runs
4. On commit, validation runs against new version
5. Atomic swap: new version registers, old version unregisters
6. Old version archived in `versions[]`, accessible for rollback
7. Rollback action restores prior version atomically; no LLM round-trip needed

## What This Pipeline Does Not Cover (next docs)

- **Validator implementation depth** — the equanimous-behavior validator's actual rule set. → `validator-budget.md`
- **Primitive contracts** — what `gate`, `cooldown`, `conceal`, etc. require structurally. → `primitive-contracts.md`
- **Drift repair** — when chess.com redesigns and the script silently fails, how does the system notice and propose a regeneration? → `drift-repair.md`
- **Sharing & packs** — committed Rules as portable artifacts other users can install. → `rule-packs.md`

## Decisions on previously open items

- **Drift repair** — the user notices. The patterns layer may eventually surface "this Rule has stopped firing" as a soft signal, but v1 does not attempt automated drift detection. When chess.com redesigns and the script breaks, the user opens the Rule, says "doesn't work anymore," and re-enters experimental.
- **Cross-tab experimentation** — single tab. Ephemeral scripts during experimentation are scoped to the active tab where the studio session was opened. Lifted to all matching tabs on commit.

## Still open

- **Override metric.** What proportion of committed Rules carrying override flags is a healthy ceiling? Probably a soft nudge in the patterns layer with no hard cap — hard limits feel coercive; pure information may not reach the user.
