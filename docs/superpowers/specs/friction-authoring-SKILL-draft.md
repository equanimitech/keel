---
name: friction-authoring
description: >-
  Author a keel friction rule — from "this site is pulling at me" to a verified
  RuleSpec JSON in $KAIROS_HOME/keel/rules/. Names the pull by mechanism, picks the
  smallest friction that removes it, and VERIFIES every selector against a live DOM
  with Playwright before writing anything. Use when Rafa says "/friction", "hide the
  X on Y", "this site is pulling at me", "write a keel rule", "add a friction rule",
  "block/limit/degrade <surface>", "the feed is eating me", "I keep autoplaying",
  "one more game again", or reports drift on a specific site. ALSO use to re-verify
  an existing rule when it "stopped working" or when a site has redesigned —
  selectors rot and a rule verified months ago has unknown status. Do NOT use for
  the focus gate, intentions, or blocklist arming — those are keel's other surfaces.
---

# Authoring a friction rule

A rule that matches nothing looks exactly like a rule that works. That is the failure
this skill exists to prevent, and it has already happened: three versions of a Shorts
rule written from memory, every selector dead, the plumbing faithfully applying a
stylesheet that selected nothing.

**The gate: no selector enters a rule until it has been counted against a live DOM.**

---

## Read first, once per session

- `packages/domain/src/rules.ts` — the contract. Specifically the header comment: the
  invariant (a tide may arm a `gate`, never a `cooldown`) and **§On walls**.
- The live rules in `$KAIROS_HOME/keel/rules/*.json` — read the `description` fields,
  they carry the reasoning and the verification records.

Two rules that are not negotiable:

1. **Type-based, never company-based.** Site knowledge lives as data in a rule's
   selectors, never as a branch in code. You are writing data.
2. **No walls.** `gate.proceedAffordance` and `cooldown.unlockPath` are required.
   Anything imposed and inescapable is out of scope by design. Genuine walls are
   external actuators (a Screen Time passcode you did not record); keel surfaces them,
   never builds one.

---

## The workflow

### 1. Name the pull, mechanically

Not "YouTube is bad". Which mechanism is operating?

| Category | The pull |
|---|---|
| Infinite feed | No terminal cue; the container regenerates before you reach its end |
| Autoplay queue | Continuation is the default; stopping is the act |
| Short-form video | Feed + autoplay, with a swipe cheap enough to skip deliberation |
| One-more-round | Restart rendered where the eye lands, while the last round's affect is live |
| Variable-reward inbox | Intermittent reinforcement with a user-operated refresh lever |
| Badge counter | A number that constitutes an open loop |
| Streak | Loss aversion over an asset you did not ask to hold |
| Validation metric | Counts on your own output; publishing becomes a lever |
| Recommendation rail | Each page seeds three more, chosen to produce a fourth |
| Marketplace browse | Recommendation grid plus manufactured scarcity and urgency |
| Synchronous presence | Typing indicators and read receipts manufacture obligation to answer now |
| Doomscroll news | Feed plus negativity bias; the affect is the retention mechanism |
| Comment thread | Variable social reward plus reactance |
| Live event | A running clock you are outside of — real scarcity, not manufactured |

**Write one sentence: "the pull is ___."** If you cannot, you are not ready to write a
rule. Ask instead.

Two categories to handle differently:
- **Streak** — hiding the counter removes the reminder, not the obligation, and can raise
  anxiety. Say this out loud before proposing it.
- **Live event** — the pull is external to the page. Say that keel cannot help here
  rather than shipping a transform that pretends otherwise.

### 2. Pick the smallest mechanism that removes it

Ordered by cost to the person. Take the first one that works.

| Mechanism | Primitive | Runs today? | Backfires when |
|---|---|:--:|---|
| **Remove** | `transform{hide}` | **yes** | the element is load-bearing for a legitimate use, or the selector is broad enough to break the site |
| **Degrade** | `transform{restyle}` | **yes** | the site starts to feel dead — indifference is not equanimity |
| **Interpose** | `gate{intention}` | **yes**, `dwell` trigger only | habituation; a prompt seen 20×/day becomes a swat |
| **Delay** | `gate{delay}` | **no** — silently rendered as an intention prompt | over ~30s it is punishment, not a beat |
| **Reroute** | `gate.proceedAffordance{redirect}` | **no** — always `continue` | the substitute is not actually wanted |
| **Window** | `schedule` | **no** | the window covers most of the day |
| **Suppress** | `intercept` | **no** | immediately, unless an affordance explains why |
| **Act on page** | `actuate` | **no** (gate pauses media as a side effect) | it interrupts engagement actually chosen |
| **Lock** | `cooldown` | **yes**, browser only | imposed rather than chosen — blocking raises workload for high-work-control users (Mark 2018), and Rafa is one |

**If the mechanism you want is not wired, say so before writing.** Either pick a wired
one, or write the rule knowing it is inert and label it in the description. Never write
an inert rule silently.

Recommended first move per category: Remove for 1, 2, 3, 6, 7, 8, 9, 10, 11, 13;
Degrade for 12; Interpose for 4 (but `element_click` is unwired, so today it is Remove).

### 3. Check arming

- Does it need a `cooldown`? Then `arming` is `self-now` or `self-foresight`. **A tide
  may never arm a lock.** This is enforced in the type system, not by a validator —
  `AmbientRule.primitives` is `Exclude<PrimitiveSpec, CooldownSpec>`.
- Everything else can be `ambient`.

### 4. Name the exit before naming the selectors

- `gate` → what does `proceedAffordance` say, and where does it go?
- `cooldown` → `wait`, `unlock_with_intention`, `unlock_with_delay`, or `out_of_band`.
  A **standing** cooldown may not use `wait` — waiting never lifts one, and the
  validator rejects it.
- `transform` → the exit is that the thing is still one URL away. Confirm that is true.

No exit means you have designed a wall. Stop and say so.

### 5. Verify against the live DOM — MANDATORY

Use the Playwright MCP. Never skip, never approximate, never trust memory for a
selector.

#### 5a. Sample every surface the rule claims

A rule verified on one page is verified on one page. `matches: ["*://youtube.com/*"]`
claims the home page, search, watch, channel, and mobile. List which you sampled and
which you did not.

#### 5b. Count twice — target AND control

The count that matters is not "did I hide the thing". It is "did I hide *only* the
thing". Define both before injecting:

- **target** — what must go to zero (e.g. visible `a[href^="/shorts"]`)
- **control** — what must survive (e.g. visible `a[href^="/watch"]`)

```js
// Baseline probe. Run before injecting anything.
() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const count = (sel) => [...document.querySelectorAll(sel)].filter(visible).length;
  return { target: count('<TARGET_SELECTOR>'), control: count('<CONTROL_SELECTOR>') };
}
```

#### 5c. Bisect — every candidate selector, alone

This is what catches the redundant-and-destructive fallback. Run each candidate on its
own and record three numbers.

```js
() => {
  const sels = [ /* every candidate, primary and fallbacks */ ];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const probe = () => ({
    target: [...document.querySelectorAll('<TARGET_SELECTOR>')].filter(visible).length,
    control: [...document.querySelectorAll('<CONTROL_SELECTOR>')].filter(visible).length,
  });
  const base = probe();
  const rows = [];
  for (const s of sels) {
    let matches;
    try { matches = document.querySelectorAll(s).length; }
    catch { rows.push({ selector: s, matches: "INVALID SELECTOR" }); continue; }
    const st = document.createElement("style");
    st.textContent = s + " { display: none !important; }";
    document.documentElement.append(st);
    const p = probe();
    rows.push({ selector: s, matches, targetHidden: base.target - p.target, controlLost: base.control - p.control });
    st.remove();
  }
  return { base, rows };
}
```

Then prune:

- `controlLost > 0` → **remove the selector.** No exceptions. A selector that takes the
  site with it is not a fallback, it is a bug with a plausible name.
- `matches: 0` on every sampled surface → remove it, **or** keep it with a stated reason
  ("older Polymer components, home not sampled") — it costs nothing at zero matches, but
  the reason must be written down.
- `matches: "INVALID SELECTOR"` → remove it. `transform/apply.ts` catches the throw, but
  an engine that rejects it silently drops the whole rule's stylesheet on that page.

#### 5d. Confirm the whole chain together

Inject exactly what `transformCss()` builds — all surviving selectors, comma-joined,
one declaration block — and re-probe. Pass condition: **target → 0, control unchanged.**

```js
() => {
  const sels = [ /* surviving selectors, in rule order */ ];
  const st = document.createElement("style");
  st.id = "keel-verify";
  st.textContent = sels.join(",\n") + " { display: none !important; }";
  document.documentElement.append(st);
  /* re-run the baseline probe here, then report */
}
```

#### 5e. Clean up

`document.getElementById("keel-verify")?.remove()`. This is Rafa's real browser.

#### Two ways verification lies

- **A negative on a surface that never rendered proves nothing.** Scanning a site's
  loaded CSS for a class that only ships with a lazily-loaded modal will find nothing
  whether the class is dead or alive. Write "not sampled", never "not present".
- **Zero visible ≠ zero present.** Always filter by computed visibility, never by
  `querySelectorAll().length` alone — YouTube renders ~1,900 `/watch` anchors of which
  ~480 are visible at any moment.

### 6. Order selectors by durability, not by what reads naturally

A **URL prefix is a product contract**: `/shorts` will outlive four rounds of component
renaming. A **custom element name is an implementation detail** with a half-life of a
quarter or two.

Put the durable predicate in `primary` and the component names in `fallbacks` — the
reverse of the intuitive ordering. Prefer, in order:

1. `:has(a[href^="/<path>"])` and other URL-derived predicates
2. `[data-*]` test hooks and ARIA roles
3. stable semantic classes
4. custom element / component names — always last, always with a dated note

### 7. Write the RuleSpec

To `$KAIROS_HOME/keel/rules/<id>.json`. One rule per file.

```json
{
  "id": "kebab-case-id",
  "name": "Short human name",
  "description": "<see §8 — this field carries the reasoning AND the verification record>",
  "domains": ["example.com"],
  "matches": ["*://example.com/*", "*://www.example.com/*"],
  "mechanism": "friction | cue-removal | access-block | substitution | self-monitoring",
  "defaultEnabled": true,
  "fadeEligibility": "auto | manual | never",
  "persistAcrossSpaNavigation": true,
  "arming": "ambient | self-now | self-foresight",
  "primitives": [ { "kind": "transform", "targets": { "primary": "...", "fallbacks": ["..."] }, "replacement": { "type": "hide" } } ]
}
```

Field traps, all of them real:

- `matches` must be non-empty and must not be `*://*/*` — the validator rejects both.
- Include the bare domain **and** the `www.` form in `matches`. The transform matcher
  strips `www.` and suffix-matches, so `domains` need only the bare form, but `matches`
  is a URL pattern list and is literal.
- `fadeEligibility` must be declared. No implicit "forever" scaffolding.
- `transform.replacement.type: "replace"` is projected as `hide` — there is no template
  registry. Do not use it expecting substitution.
- A `gate` today only fires on `trigger: {type: "dwell", everyMinutes: N}` and only its
  `frictionType.prompt` reaches the page. Declared affordance labels are ignored; the
  overlay hard-codes "Keep watching" / "Close the tab".
- An escalating `cooldown` (`multiplier > 1`) needs `allowEscalation: true` or the
  validator rejects it as punishment-shaped.

### 8. The description carries the record — and the honesty label

There is no schema field for provenance, so the description is it. Include, in order:

1. **Date declared** and what the pull was, in one sentence.
2. **Why this mechanism**, and what was rejected. Name the rejected option.
3. **The verification record**: surfaces sampled, target and control counts before and
   after, date. Surfaces *not* sampled, named.
4. **Which selectors are durable and which will rot**, and why.

**If any selector was not exercised against a live DOM, the description MUST contain
`SELECTORS UNVERIFIED` and name them.** Not a hedge — a label. Three of the six live
rules carry it honestly today. A rule that quietly claims coverage it does not have is
worse than no rule, because the board says you are protected and you are not.

Worked example of a good record:

> Declared 2026-08-08. Shorts is the one YouTube surface with no natural end. Hiding the
> entry points removes the pull; /shorts URLs still resolve if you go looking, which is
> deliberate (rules.ts, §On walls). Rejected: a cooldown on the domain — YouTube is
> load-bearing for work, and a lock is imposed rather than chosen.
>
> Verified 2026-08-08 on `/results?search_query=lofi`: 141 visible Shorts links → 0;
> control (visible `/watch` links) 482 → 482. Per-selector bisection pruned
> `ytd-item-section-renderer:has(…)`, which hid all 140 Shorts links but took 442 of the
> 482 search results with it and was redundant with the `grid-shelf-view-model` selector
> above it. Logged-in home and subscriptions NOT SAMPLED — the trailing `ytd-*`
> fallbacks are kept for them at zero cost, unverified.
>
> `:has(a[href^="/shorts"])` is the durable half: the URL is a product contract. The
> view-model element names are Lit-era components and will rot.

### 9. Commit and flush

1. Write the JSON.
2. Flush the relay so the extension's policy mirror updates (`pageTransforms.watch`
   re-renders open tabs; no reload needed).
3. **Confirm in the browser** that the rule is live. Projection is silent on failure:
   `loadTransforms` skips a primitive with an empty `primary`, and
   `defaultEnabled: false` drops the whole rule with no message.

### 10. Re-verify on a cadence

Selectors rot. A rule verified three months ago has unknown status. When a rule
"stopped working", start at step 5 — not at step 1, and never by rewriting selectors
from memory. That is how this happened the first time.

---

## Refusals

- **No walls.** Anything imposed and inescapable. Say why and stop.
- **No shame or punitive framing.** 6–10% adoption; users reject it.
- **No escalating multipliers** without an explicit, acknowledged `allowEscalation`.
- **No company names in code.** Only in rule data.
- **No bare `confirmation` gates** — dumb friction trains dismissal. Prefer intention.
- **No rule written from memory.** Ever.
