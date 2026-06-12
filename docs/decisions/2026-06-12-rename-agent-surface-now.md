# Execute the keel-agent rename immediately (supersedes the deferral clause)

**Date:** 2026-06-12
**Context:** `keel` (equanimitech). Partially supersedes one consequence line of
`2026-06-12-keel-productization.md` (stamped): "repo/package renames are deferred
until the identity hardens."

## Decision

`packages/keel-gate` → `apps/agent`, package `@keel/gate` → `@keel/agent`, done
the same day as the productization decision, at the principal's direction.

## Rationale

The identity hardened the moment the productization decision was stamped, and
pre-plugin is the cheapest this rename ever gets: the plugin manifest
(`apps/agent/.claude-plugin/`) is born at the right path instead of moving later.
Operational hazard (absolute `~/.keel` symlinks breaking fail-open) was handled by
re-linking in the same change and verifying liveness via `keel log status`.

## Consequences

- Surfaces now sit uniformly in `apps/` (agent / browser / desktop) per the grammar.
- Dev-mode deploy remains `~/.keel` symlinks (Rafa's machine); distribution is the
  plugin, which carries `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths.
- The stamped decision is otherwise unchanged; this note records only the
  schedule change of its rename clause.
