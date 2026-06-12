# A single vice list as keel's config spine

- One user-declared list of domains/apps (with optional tiers) replaces four scattered mechanisms: shield per-domain configs, vice-block hosts list, desktop blocklists, and "which domains get enhanced observability."
- Tiers, maybe: `observe` (deep sensors: opens, key actions, durations) · `windowed` (vice-block schedule, today's hosts mechanism) · plain absence (default: coarse logging only).
- Sovereignty-clean: the list is self-authored like the voice — keel never ships one (the porn drogue's prefilled blocklist stays the lone, explicitly-consented exception). Naming for strangers: "vices" is Rafa's register; neutral default label could be "watchlist" (presets principle). Relates to [[2026-06-05-keel-areas-of-compulsion-via-zenborg]] — areas could eventually *feed* the list.
- Lives in `~/.keel/config.json` next to voice/rules → `keel rules` shows it, `rule_changed` logs its edits, MCP can tighten-not-loosen it. The browser/tray sensors read it to decide depth per domain.
- Questions: domain-only or app names too (desktop)? does `logDetail: full` ride per-tier? migration of existing vice windows config?

Don't shape yet — pairs with the shields→sensors restart slice.
