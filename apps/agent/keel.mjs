#!/usr/bin/env node
// @ts-check
// keel agent — the Claude Code surface: focus gate + activity-log writer. Thin orchestration over core (pure) + store (I/O).
// Fail-open: any error → exit 0, allow. A hook must never trap the user.

import {
  phaseOf, nowMinOf, frictionNow, nightWindow, minToHHMM, toDurationMin,
  updateSession, denyingRule,
  denyReason, renderOrient, ritualNudge, focusDayKey,
  setIntention, rollIntentionDay, activeIntention, activeWatch, intentionLine,
  setGranularity, normalizeGranularity, activeGranularity, granularityLine, GRANULARITY_LEVELS, DEFAULT_GRANULARITY,
  setFocus, focusLine, claimFocus, focusBlocks, FOCUS_DENY,
  isAllowedPath,
  buildEvent, capPayload, summarizeEvents, matchDispatch, targetHash, renderRules, consentLines,
  watchlistLines, desktopSensorLines,
  applyObserveVerdicts, mergeLedger,
} from "./core.mjs";
import { loadTarget, loadRawTarget, loadWatchlist, loadDesktopSensors, loadState, saveState, readStdin, TARGET_ID, LOG_DIR, appendEvent, readEvents, loadLedger, saveLedger, loadSnapshot, saveSnapshot, writeObserveList, LEDGER_PATH, SNAPSHOT_PATH } from "./store.mjs";
import { runHost } from "./native-host.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const emit = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const emitText = (t) => { if (t) process.stdout.write(t); process.exit(0); };

// ── Activity log: every hook event lands in ~/.keel/log, full stdin captured
// (size-capped per field; the transcript_path we log keeps full fidelity).
// Fail-open at every layer — observability must never break the gate.
const KIND_BY_HOOK = {
  "session-start": "session_start", "user-submit": "prompt",
  "pre-tool": "tool_dispatched", "post-tool": "tool_completed",
  "post-tool-failure": "tool_failed", "stop": "turn_stop",
  "subagent-stop": "subagent_stop", "session-end": "session_end",
  "notification": "notification", "pre-compact": "pre_compact",
  "permission-request": "permission_request", "config-change": "config_change",
  "file-changed": "file_changed",
};

/** @param {string} kind @param {number} now @param {any} input
 * @param {{ durationMs?: number, extra?: Record<string, unknown> }} [opts] */
function logHookEvent(kind, now, input, opts = {}) {
  try {
    appendEvent(LOG_DIR, buildEvent({
      id: randomUUID(), kind, ts: now, sessionId: input?.session_id ?? "",
      payload: { ...capPayload(input), ...(opts.extra ?? {}) },
      durationMs: opts.durationMs,
    }));
  } catch { /* fail-open */ }
}

/** Generic full-capture hook: log the event, decide nothing. */
async function handleObservedHook(sub, now) {
  const input = await readStdin();
  const kind = KIND_BY_HOOK[sub] ?? sub;
  if (kind === "tool_completed" || kind === "tool_failed") {
    let durationMs;
    try {
      const m = matchDispatch(readEvents(LOG_DIR, now), {
        sessionId: input?.session_id ?? "", ts: now,
        payload: { tool_name: input?.tool_name, tool_use_id: input?.tool_use_id },
      });
      if (m) durationMs = now - m.ts;
    } catch { /* derive later read-side */ }
    logHookEvent(kind, now, input, { durationMs });
  } else {
    logHookEvent(kind, now, input);
  }
  return emit(null);
}

async function handlePreTool(now) {
  const target = loadTarget();
  const state = loadState();
  const f = frictionNow(target, now);
  const input = await readStdin();
  const rule = denyingRule(target, f, input?.tool_name, state, now);
  const filePath = input?.tool_input?.file_path;
  const nightDenied = !!rule && !isAllowedPath(filePath, rule.allowPaths, homedir());
  // Single-stream commitment: a non-owner session's tools are denied while focus is active.
  // Journal + ~/.keel stay open so capture and sign-off are never trapped.
  const focusDenied = focusBlocks(state, input?.session_id)
    && !isAllowedPath(filePath, ["~/journals", "~/.keel"], homedir());
  const allowed = !nightDenied && !focusDenied;
  // Rules observability: every gate decision is auditable from the log alone.
  logHookEvent("tool_dispatched", now, input, { extra: {
    keel_denied: !allowed, keel_friction: Number(f.toFixed(3)), keel_phase: phaseOf(f),
    ...(rule?.notch ? { keel_rule_notch: rule.notch } : {}),
    ...(focusDenied ? { keel_focus_block: true } : {}),
  } });
  if (allowed) return emit(null); // allow (silent)
  return emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: focusDenied ? FOCUS_DENY : denyReason(target),
    },
  });
}

async function handleUserSubmit(now) {
  const input = await readStdin();
  logHookEvent("prompt", now, input);
  const target = loadTarget();
  let state = updateSession(loadState(), now, target.orient);
  const phase = phaseOf(frictionNow(target, now));
  // Mark whether THIS turn opened under lockdown — the breakpoint signal PreToolUse reads.
  state.turnLockedTs = phase === "lockdown" ? state.lastPromptTs : 0;

  // Ambient by design: indicators live in the statusline HUD (`keel hud`), not injected per-turn.
  // The one exception — fired once per session, on turn 2+, only while unset: prompt the agent
  // to infer the intention from the conversation and set it silently. Surfaces in the HUD.
  // (Granularity needs no inference — it always has a floor, set at session-start.)
  const freshTurn = state.sessionStartTs === now;        // the session's first prompt
  const unset = !activeIntention(state, now, target.watches);
  let nudge = "";
  if (!freshTurn && unset && state.inferNudgedTs !== state.sessionStartTs) {
    state.inferNudgedTs = state.sessionStartTs;
    nudge = "<keel: today's intention is unset. Infer it from the conversation so far and set it silently — `keel intention \"<focus>\"`. Do not announce; it surfaces in the statusline HUD. If you genuinely cannot infer it, leave it.>";
  }
  // First prompt while focus is on + unclaimed → this session becomes the focus owner.
  state = claimFocus(state, input?.session_id);
  saveState(state);
  // Deep-focus cue rides the same turn-boundary channel — breath in the owner session, a
  // held-elsewhere note in blocked ones. Empty unless `keel focus` is on.
  return emitText([nudge, focusLine(state, input?.session_id)].filter(Boolean).join("\n"));
}

async function handleSessionStart(now) {
  const input = await readStdin();
  logHookEvent("session_start", now, input);
  const target = loadTarget();
  let state = loadState();
  // Rules observability: any change to the effective rules — including the
  // watchlist (config spine) — becomes a logged event.
  const hash = targetHash({ target, watchlist: loadWatchlist(), desktop: loadDesktopSensors() });
  if (state.lastRuleHash !== hash) {
    logHookEvent("rule_changed", now, input, { extra: { keel_rule_hash: hash, keel_prev_hash: state.lastRuleHash || "" } });
    state = { ...state, lastRuleHash: hash };
  }
  // First-run contract: shown exactly once, before anything else.
  let consent = [];
  if (!state.consentShownTs) {
    consent = consentLines();
    state = { ...state, consentShownTs: now };
  }
  // Persists every session until `/sign-on` runs this waking-day (no mark to spend).
  const nudge = ritualNudge(state, now, target.voice);
  // Focus is day-scoped, depth is session-scoped. Intention clears only on a new
  // calendar day (rollIntentionDay) — it survives session restarts and /clear, since
  // per-session focus is already covered by Claude's own session goals. Granularity is
  // a per-session dial: a fresh session (startup/clear) resets it to the floor (tldr).
  state = rollIntentionDay(state, now);
  // Granularity is per-session (resets to the floor on a fresh session); focus is a standing
  // commitment that survives session restarts — it clears only on explicit `keel focus off`.
  if (input?.source === "startup" || input?.source === "clear") state = { ...state, granularity: "" };
  saveState(state);
  return emitText([...consent, nudge?.line, intentionLine(state, now, target.watches), granularityLine(state)].filter(Boolean).join("\n"));
}

function cmdStatus(now) {
  const target = loadTarget();
  const f = frictionNow(target, now);
  const locked = phaseOf(f) === "lockdown";
  const w = nightWindow(target.watches, toDurationMin(target.windDown));
  console.log(
    `keel[${TARGET_ID}]: f=${f.toFixed(2)} phase=${phaseOf(f)}${locked ? " (LOCKED · night)" : ""} ` +
    `watch=${activeWatch(now, target.watches)} windDown=${target.windDown} ` +
    (w ? `night=${minToHHMM(w.nightStart)}→${minToHHMM(w.reset)}` : "(no night watch → pure-soft)"),
  );
}

// ponytail: signoff's old levers (self-imposed park + vice block) retired with the
// walls (decision 2026-06-17 — block kept for the night-lock only). The dial-driven
// "friction all the way up" is pass 2; for now signoff just acknowledges the close.
function cmdSignoff() {
  console.log("keel: signed off. The day is sealed. (keel no longer walls coding — your declared night is the only hard stop.)");
}

// Marks the day as opened — `/sign-on` calls this on completion. Clears the day-open
// nudge (ritualNudge keys off lastSignOnDay) until the next waking-day (04:00 roll).
function cmdSignon(now) {
  saveState({ ...loadState(), lastSignOnDay: focusDayKey(now) });
  console.log("keel: signed on. The day is open — nudge cleared till tomorrow.");
}

// Sets the intention for a watch. `keel intention "<focus>"` → the current watch;
// `keel intention <watch> "<focus>"` → a named watch. Day-scoped (clears at the 04:00 roll).
function cmdIntention(arg, now) {
  const target = loadTarget();
  const watches = target.watches;
  const raw = String(arg ?? "").trim();
  // optional leading watch name
  let watch = activeWatch(now, watches);
  let text = raw;
  const m = raw.match(/^(\S+)\s*(.*)$/);
  if (m && Object.prototype.hasOwnProperty.call(watches, m[1])) { watch = m[1]; text = m[2].trim(); }

  if (text === "clear") {
    saveState(setIntention(loadState(), watch, "", now));
    console.log(`keel: ${watch} intention cleared.`);
    return;
  }
  if (!text) {
    const cur = (loadState().watchIntentions ?? {})[watch] || "";
    console.log(cur ? `keel: ${watch} intention — ${cur}` : `keel: no intention set for ${watch}. \`keel intention "<focus>"\` to set one.`);
    return;
  }
  saveState(setIntention(loadState(), watch, text, now));
  console.log(`keel: ${watch} intention set — ${text}. Held for today; surfaced during the ${watch} watch. \`keel intention ${watch} clear\` to release.`);
}

function cmdGranularity(arg) {
  const raw = String(arg ?? "").trim();
  if (raw === "clear" || raw === "reset") {
    saveState(setGranularity(loadState(), ""));
    console.log(`keel: granularity reset to the floor (${DEFAULT_GRANULARITY}: ${GRANULARITY_LEVELS[DEFAULT_GRANULARITY]}).`);
    return;
  }
  if (!raw) {
    const cur = activeGranularity(loadState());
    console.log(`keel: granularity — ${cur}: ${GRANULARITY_LEVELS[cur]}`);
    return;
  }
  const level = normalizeGranularity(raw);
  if (!level) {
    console.log(`keel: unknown granularity "${raw}". Choose: ${Object.keys(GRANULARITY_LEVELS).join(" | ")} (or reset).`);
    return;
  }
  saveState(setGranularity(loadState(), level));
  console.log(`keel: granularity set — ${level}: ${GRANULARITY_LEVELS[level]} Held for this session; surfaced in the HUD. \`keel granularity reset\` returns to ${DEFAULT_GRANULARITY}.`);
}

function logFocusEvent(kind, now) {
  try { appendEvent(LOG_DIR, buildEvent({ id: randomUUID(), kind, ts: now, sessionId: "", payload: { source: "cli" } })); }
  catch { /* fail-open */ }
}

// `keel focus "<hard problem>"` — the deep gear of intention: sets the current watch's
// intention AND flips the breath/self-ending flag. `keel focus on` reuses the current
// intention; `keel focus off` drops the gear but keeps the intention. focus_on/focus_off
// land in the log so the gap-fill EDA can segment focus periods.
function cmdFocus(arg, now) {
  const raw = String(arg ?? "").trim();
  const low = raw.toLowerCase();
  const state = loadState();
  const target = loadTarget();
  if (!raw) {
    const cur = activeIntention(state, now, target.watches);
    console.log(state.focus
      ? `keel: ◉ focus on${cur ? ` — "${cur}"` : ""}. \`keel focus off\` to close.`
      : "keel: focus off. `keel focus \"<hard problem>\"` to go deep, or `keel focus on` for the current intention.");
    return;
  }
  if (low === "off" || low === "stop" || low === "clear") {
    saveState(setFocus(state, false, now));
    logFocusEvent("focus_off", now);
    console.log("keel: focus off — stream closed. (intention kept for the watch.)");
    return;
  }
  let s = state, label;
  if (low === "on" || low === "start") {
    label = activeIntention(state, now, target.watches);
    if (!label) { console.log("keel: name what you're going deep on — `keel focus \"<hard problem>\"`."); return; }
  } else {
    label = raw;                                  // the hard problem → set it as the watch intention
    s = setIntention(state, activeWatch(now, target.watches), raw, now);
  }
  saveState(setFocus(s, true, now));
  logFocusEvent("focus_on", now);
  console.log(`keel: ◉ focus on — one stream on "${label}". Other sessions are held; this one's the owner once you prompt. Breath on the AI gap. \`keel focus off\` to release.`);
}

// ── HUD (for the Claude Code statusLine) ──────────────────────
function sessionCount() {  // approximate # of concurrent Claude Code sessions
  try {  // no shell: execFile with an arg array. pgrep exits 1 if none → caught.
    const out = execFileSync("pgrep", ["-fl", "claude"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const n = out.split("\n").filter((l) =>
      /\bclaude\b/i.test(l) && !/keel\.mjs|statusline|pgrep|grep|caveman/i.test(l)).length;
    return n || 1;
  } catch { return 1; }
}
// A calm, phase-adaptive HUD: one useful thing per phase, no empty dashes.
// DAY near-silent · WIND-DOWN leads with time-to-sign-off · LOCKDOWN leads with
// the held-until + skips. Context glyphs appear only when they carry signal.
function cmdHud(now) {
  const target = loadTarget();
  const state = loadState();
  const w = nightWindow(target.watches, toDurationMin(target.windDown));
  const phase = phaseOf(frictionNow(target, now));

  const parts = [];

  // Abnormal states only — silent on a normal day.
  if (phase === "lockdown") {
    parts.push(`keel 🔒 locked till ${w ? minToHHMM(w.reset) : "wake"}`);
  } else if (phase === "wind_down" && w) {
    const mins = (w.nightStart - nowMinOf(now) + 1440) % 1440;
    parts.push(`keel 🌙 winding down · ${mins}m to night`);
  }

  // Day-open pending — persists until `/sign-on` runs this waking-day.
  if (state.lastSignOnDay !== focusDayKey(now)) parts.push("⊙ sign-on");

  // Always-on indicators: the current watch's intention (when set) + the session granularity.
  const inten = activeIntention(state, now, target.watches);
  if (inten) parts.push(`◎ ${inten.length > 24 ? inten.slice(0, 23) + "…" : inten}`);
  if (state.focus) parts.push("◉ focus");
  parts.push(`▤ ${activeGranularity(state)}`);

  process.stdout.write(parts.join("  ·  "));
}

/** `keel rules` — the effective rules, with provenance per section. */
function cmdRules() {
  console.log(renderRules(loadTarget(), loadRawTarget()));
  console.log(watchlistLines(loadWatchlist()).join("\n"));
  console.log(desktopSensorLines(loadDesktopSensors()).join("\n"));
}

/** `keel log status` — today's per-kind counts + session liveness. The P1
 * data-quality seed: its job is to make silent writer death visible. */
function cmdLog(now, sub = "status", day = "today") {
  if (sub !== "status") { console.log("usage: keel log status [yesterday]"); return; }
  const at = day === "yesterday" ? now - 86_400_000 : now;
  const events = readEvents(LOG_DIR, at);
  if (!events.length) {
    console.log(day === "yesterday"
      ? "keel log: no events yesterday."
      : "keel log: no events today yet — is the writer wired? (hooks → ~/.keel/log/)");
    return;
  }
  const s = summarizeEvents(events, now);
  const kinds = Object.entries(s.byKind).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`).join(" ");
  console.log(`keel log: ${events.length} events today · ${s.sessions} session(s), ${s.activeSessions} active · ${kinds}`);
}

async function cmdWatchlistScan() {
  const here = dirname(fileURLToPath(import.meta.url));
  const py = spawnSync("python3", [
    join(here, "watchlist_scan.py"),
    "--ledger", LEDGER_PATH,
    "--snapshot", SNAPSHOT_PATH,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (py.status !== 0 || !py.stdout) {
    console.error("scan failed:", py.stderr || "(no output)");
    process.exit(0); // fail-open
  }
  /** @type {any} */
  let slate;
  try { slate = JSON.parse(py.stdout); } catch { console.error("bad slate JSON"); process.exit(0); }
  if (slate.error) { console.error("scan:", slate.error, slate.path || slate.detail || ""); process.exit(0); }
  const candidates = slate.candidates || [];
  if (candidates.length === 0) { console.log("No new candidates. Observe tier is current."); process.exit(0); }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (/** @type {string} */ q) => new Promise((res) => rl.question(q, res));
  /** @type {Record<string, string>} */
  const verdicts = {};
  console.log(`\nkeel watchlist scan — ${candidates.length} candidates. ` +
    `[o]bserve · [b]enign(never-ask) · [w]ork · [s]kip · [q]uit\n`);
  for (const c of candidates) {
    const e = c.evidence;
    const binge = e.binge ? `binge ${e.binge.max_run}max/${e.binge.pct_in_runs_5plus}%in5+` : "";
    const line = `${c.key}\n  ${e.dwell_hours}h · ${e.visits} visits · return ${e.return_pct}% · ${binge}` +
      `${e.is_new ? " · NEW" : ""}\n  suggested: ${c.suggested_tier}  → [o/b/w/s/q]? `;
    const a = (await ask(line)).trim().toLowerCase()[0];
    if (a === "q") { break; }
    if (a === "o") { verdicts[c.key] = "observe"; }
    else if (a === "b") { verdicts[c.key] = "benign"; }
    else if (a === "w") { verdicts[c.key] = "work"; }
    // s/skip → no verdict recorded
  }
  rl.close();

  const observe = applyObserveVerdicts(loadWatchlist().observe, verdicts);
  writeObserveList(observe);
  saveLedger(mergeLedger(loadLedger(), verdicts));
  if (slate._snapshot) { saveSnapshot(slate._snapshot); }
  const added = Object.values(verdicts).filter((v) => v === "observe").length;
  console.log(`\nDone. ${added} key(s) added to watchlist.observe (${observe.length} total). Ledger + snapshot updated.`);
  process.exit(0);
}

async function main() {
  const [cmd, sub] = process.argv.slice(2);
  const now = Date.now();
  if (cmd === "hook") {
    if (sub === "pre-tool") return handlePreTool(now);
    if (sub === "user-submit") return handleUserSubmit(now);
    if (sub === "session-start") return handleSessionStart(now);
    if (sub in KIND_BY_HOOK) return handleObservedHook(sub, now);
    return process.exit(0);
  }
  if (cmd === "log") return cmdLog(now, sub, process.argv[4]);
  if (cmd === "rules") return cmdRules();
  if (cmd === "native-host") { runHost(); return; }
  if (cmd === "signoff") return cmdSignoff();
  if (cmd === "signon") return cmdSignon(now);
  if (cmd === "intention") return cmdIntention(process.argv.slice(3).join(" "), now);
  if (cmd === "granularity" || cmd === "gran") return cmdGranularity(sub);
  if (cmd === "focus") return cmdFocus(process.argv.slice(3).join(" "), now);
  if (cmd === "hud") return cmdHud(now);
  if (cmd === "status") return cmdStatus(now);
  if (cmd === "watchlist" && sub === "scan") return cmdWatchlistScan();
  console.log("usage: keel <hook pre-tool|user-submit|session-start | signon | signoff | intention [<watch>] [\"<focus>\"|clear] | granularity [sentence|tldr|page|report|reset] | focus [\"<hard problem>\"|on|off] | rules | log status | status | watchlist scan>");
}

main().catch(() => process.exit(0)); // fail-open
