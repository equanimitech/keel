# Unify event taxonomy across browser + desktop (tray) writers

- "tray" = the implementation body; the *surface* is keel desktop. Rename user-facing references accordingly.
- Divergences to reconcile (one vocabulary in `@keel/domain`, both writers conform):
  - idle: desktop `idle_start`/`idle_end`+durationMs vs browser `browser_idle`/`browser_active` — pick the start/end+duration pattern everywhere (interval-friendly, matches resumption-lag derivation).
  - focus: `app_focus` vs `window_focus`/`window_blur` — converge on `focus_changed` + surface-specific payload, or keep per-surface kinds but document the equivalence map for read-side.
  - sessions: agent has real session_ids; browser invents one per SW lifetime; desktop has none — define what "session" means per surface in domain docs (read-side bouts may be the real unit).
  - shared payload keys: app_name/domain, title caps, `logDetail` tiers — one schema doc in packages/domain (kinds registry as docs, not enum — kinds stay open).
- Do this *before* slice E (baselines) — distributions shouldn't straddle dialects.

Don't shape yet — fold into the shields→sensors restart session.
