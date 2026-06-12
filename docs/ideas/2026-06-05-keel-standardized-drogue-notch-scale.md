# keel: drogues as a standardized notch scale

> Captured 2026-06-05, late.

## The idea

Drogues should be **standardized along one ordered scale** of intensity, not ad-hoc per
shield. keel-gate's `core.mjs` already names it:

```
hide  <  dim  <  delay  <  blur  <  block
```

"delay > blocklist" — i.e. delay is a gentler notch than block, on the same axis. A drogue
becomes `(target, notch)` where `notch` is a point on this scale and friction selects it.

## Already implemented ad-hoc on the web

The whole scale exists, scattered across shields — it just isn't *named* as one vocabulary:

| Notch | Existing web instance |
|---|---|
| `hide` | linkedin-feed-hide, youtube-comments-hide |
| `dim` | youtube-stain |
| `delay` | youtube-cooldown, chess-post-game-cooldown |
| `blur` | (porn block page candidate / not yet) |
| `block` | drogue blocklist (porn), snack-window Drogue |

## The move

1. Lift the `Notch` type into `@keel/domain` (it's pure — currently trapped in keel-gate's
   `core.mjs`).
2. Tag each shield/Drogue with its notch.
3. Let a **driver** raise friction and **select** the notch (e.g. wind-down ramps
   `dim → delay → block` as the night deepens), instead of each shield being a fixed binary.

## Payoff

One vocabulary across both surfaces (browser + the Claude gate) and both driver kinds
(schedule, commitment). A friction value maps to a notch the same way everywhere — the
"drag scale" the architecture memory already names.

Relates to: `docs/superpowers/specs/2026-06-05-snack-window-drogue-design.md`,
`packages/keel-gate/core.mjs` (`Notch` typedef).
