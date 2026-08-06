# keel log query interface — CLI + MCP over ~/.keel/log

- Ending the content retreat (2026-07-13) required two ad-hoc Python scripts to answer basic questions: dwell minutes / visits / feed impressions per domain per window, baseline vs retreat, cross-surface (browser + desktop + agent), by hour of day. That analytics logic should live in keel, not in a session scratchpad.
- Shape: `keel log query`-style subcommands (keel.mjs already has `log status`), then an `mcp-server/` app exposing the same queries — penceive and zenborg both ship a sibling `mcp-server/` that reads the local substrate directly. "UI navigates, MCP does the work."
- The dwell methodology is the valuable part: global timeline, focus/idle-gated, 30m segment cap, dedup by event id. It reproduced the seed's baseline numbers (617m youtube) — canonize it in one place so every retrospective uses the same math.
- Sibling of [2026-06-26-keel-logs-to-private-daily-summaries](2026-06-26-keel-logs-to-private-daily-summaries.md) — that one generates prose summaries; this one is the query substrate both could sit on.
- Questions:
  - CLI-first then MCP wrap, or MCP-first since the consumer is usually an agent session?
  - Instrumentation gap found during the retreat: the drogue never logs block-page hits — same project or separate fix?

Don't shape yet.
