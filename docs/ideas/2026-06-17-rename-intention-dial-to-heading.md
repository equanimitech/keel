# Rename the `intention` session dial to `heading` (nautical theme)

- Rename keel's `intention` session dial → `heading`. A heading *is* a declared
  direction you steer to, which is exactly what `keel intention` is; arguably
  clearer than "intention" ("set your heading for this session") and on-theme.
- Completes a nautical instrument cluster: **tide** (when / rhythm) · **heading**
  (where you're pointed) · the depth-of-response dial. Three instruments reading
  off each other.
- Keep `granularity` as-is — do NOT rename to `depth`. Two snags:
  - The friction dial already renders a **"granularity ceiling"** notch
    (`docs/decisions/2026-06-17-tides-friction-dial-intervention-model.md`).
    Renaming the session dial to "depth" splits one concept across two words.
  - `granularity` is welded to the **semantic-zoom** ladder (L0–L5) it controls;
    the published plugin is meant to be de-Rafa / legible to strangers, and
    over-theming a response-depth knob taxes the newcomer more than it charms.
- Rule of thumb surfaced here: nautical for the *driver/instrument* layer (tide,
  heading, drift, ebb/flood — the poetic core); plain words for the *control
  surface* a stranger operates on install. `tide` already stretches the metaphor
  budget; two more renames tip it from evocative into cute-and-opaque.
- Scope if taken: CLI verb (`keel intention` → `keel heading`), HUD label, the
  session-dial docs. Contained change.

Don't shape yet.
