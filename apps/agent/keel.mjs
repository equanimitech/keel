#!/usr/bin/env node
// @ts-check
// keel agent — the Claude Code surface: activity-log writer + HUD. Thin orchestration over core (pure) + store (I/O).
// Fail-open: any error → exit 0, allow. A hook must never trap the user.
// Gate-free since 2026-08-18: this surface observes and reports; it denies nothing.

import {
  bandNow, updateSession,
  resolveActiveMoment, todaysMoments, intentionLine, intentionNudge, intentionSwitch,
  setGranularity, normalizeGranularity, activeGranularity, GRANULARITY_LEVELS, DEFAULT_GRANULARITY,
  setFocus, focusLine,
  buildEvent, capPayload, summarizeEvents, matchDispatch, targetHash, renderRules, consentLines,
  watchlistLines, desktopSensorLines,
  applyObserveVerdicts, mergeLedger,
} from "./core.mjs";
import { loadTarget, loadRawTarget, loadWatchlist, loadDesktopSensors, loadState, saveState, loadPhaseConfigs, loadActiveMomentPointer, loadMoments, loadAreas, readStdin, TARGET_ID, LOG_DIR, appendEvent, readEvents, loadLedger, saveLedger, loadSnapshot, saveSnapshot, writeObserveList, LEDGER_PATH, SNAPSHOT_PATH } from "./store.mjs";
import { runHost } from "./native-host.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const emit = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const emitText = (t) => { if (t) process.stdout.write(t); process.exit(0); };

// ── Activity log: every hook event lands in ~/.kairos/keel/log, full stdin captured
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

/** Session-end hook: log the event, then write a lightweight journal trace
 * so every session leaves a mark even when close-up wasn't invoked.
 * Fail-open at every step -- the journal entry is a bonus, not a gate. */
async function handleSessionEnd(now) {
  const input = await readStdin();
  logHookEvent("session_end", now, input);

  try {
    const cwd = input?.cwd || process.cwd();
    const transcriptPath = input?.transcript_path;

    // If close-up already ran this session, it wrote its own journal entry.
    if (transcriptPath) {
      try {
        const grep = spawnSync("grep", ["-q", "close-up", transcriptPath], { timeout: 3000 });
        if (grep.status === 0) { return emit(null); }
      } catch { /* fall through -- write the trace */ }
    }

    // Gather git context from the session's working directory.
    let branch = "", diffSummary = "", recentCommits = "";
    try {
      const r = spawnSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
        { encoding: "utf8", timeout: 3000 });
      branch = r.stdout?.trim() || "";
    } catch { /* not a repo, or git unavailable */ }

    if (branch) {
      try {
        const r = spawnSync("git", ["-C", cwd, "diff", "--stat", "--no-color"],
          { encoding: "utf8", timeout: 3000 });
        const lines = (r.stdout || "").trim().split("\n");
        diffSummary = lines[lines.length - 1]?.trim() || "";
      } catch { /* fail-open */ }

      try {
        const r = spawnSync("git", ["-C", cwd, "log", "--oneline", "-5", "--since=3 hours ago"],
          { encoding: "utf8", timeout: 3000 });
        recentCommits = (r.stdout || "").trim();
      } catch { /* fail-open */ }
    }

    const hhmm = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const project = cwd.split("/").pop() || "unknown";

    const body = [`## ${hhmm} -- session ended: ${project}`, "", "source: keel-agent/session-end", ""];
    if (branch) { body.push(`- branch: ${branch}`); }
    if (recentCommits) {
      body.push("- commits:");
      for (const line of recentCommits.split("\n").slice(0, 5)) {
        body.push(`  - ${line}`);
      }
    }
    if (diffSummary) { body.push(`- uncommitted: ${diffSummary}`); }
    if (!branch && !recentCommits && !diffSummary) { body.push("- (no git context)"); }

    const journalAppend = process.env.KEEL_JOURNAL_CMD
      || join(process.env.HOME || "", "Developer/equanimitech/penceive/bin/journal-append");
    spawnSync(journalAppend, [], { input: body.join("\n"), encoding: "utf8", timeout: 5000 });
  } catch { /* fail-open */ }

  return emit(null);
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

// PreToolUse is observation only. keel denied tools here until 2026-08-18 — the night lock,
// the day-note gate, and the single-stream focus lock. All three are gone; what remains is
// the dispatch record every read-side derivation is built on.
//
// The band is stamped at write time rather than derived read-side because zenborg's bands
// can be re-cut later: an event has to remember the day it was actually filed against.
async function handlePreTool(now) {
  const input = await readStdin();
  const band = bandNow(loadPhaseConfigs(), now);
  logHookEvent("tool_dispatched", now, input, { extra: band ? { keel_band: band } : {} });
  return emit(null); // always allow
}

async function handleUserSubmit(now) {
  const input = await readStdin();
  logHookEvent("prompt", now, input);
  const target = loadTarget();
  let state = updateSession(loadState(), now, target.orient);

  // Ambient by design: indicators live in the statusline HUD (`keel hud`), not injected per-turn.
  // One exception, silent on an ordinary turn:
  //
  // 1. Once per session, on turn 2+, only while nothing is active: prompt the agent to infer
  //    what this session is doing and PROPOSE a moment. It proposes; zenborg writes; keel only
  //    ever reads.
  //
  // The granularity ceiling injected here too until 2026-08-20. attently now owns response
  // depth, and two depth contracts arriving on the same turn boundary contradicted each other:
  // keel rationed one claim by length (a rung ladder under a ceiling), attently splits the
  // answer by what each tier costs the reader. The dial, its CLI and the tray submenu survive
  // but now reach no agent — see docs/decisions/2026-08-20-hand-response-depth-to-attently.md.
  const moments = loadMoments();
  const pointer = loadActiveMomentPointer();
  const moment = resolveActiveMoment(pointer, moments, loadAreas(), now);
  // Mid-session switches land here — session-start alone would miss every one of them.
  const switched = intentionSwitch(pointer, moment, state);
  if (switched) {
    logHookEvent("intention_switched", now, input, { extra: switched.extra });
    state.lastMomentId = switched.lastMomentId;
  }
  const unset = !moment;
  let nudge = "";
  // ponytail: this waited for turn 2 (`!freshTurn`) until 2026-08-20. Turn 1 is the turn
  // that carries the prompt, so it is both the earliest the agent can infer anything and
  // the last moment before work starts. Waiting one more turn only ever bought a proposal
  // that arrived after the session had already committed to something.
  if (unset && state.inferNudgedTs !== state.sessionStartTs) {
    state.inferNudgedTs = state.sessionStartTs;
    nudge = intentionNudge(todaysMoments(moments, now), input?.cwd);
  }
  saveState(state);
  // The focus cue rides the same turn-boundary channel. Empty unless `keel focus` is on.
  return emitText([nudge, focusLine(state)].filter(Boolean).join("\n"));
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
  // The intention is kairos's, not keel's — every session reads the active moment fresh, so
  // there is nothing here to roll or clear. Granularity is now day-scoped like focus: it is
  // stamped with the waking-day inside setGranularity and lapses at the 04:00 roll, so it
  // survives session restarts; focus clears only on explicit `keel focus off`.
  //
  // A `startup`/`clear` wipe used to live here. It is why the dial read `tldr` every time it
  // was looked at — many sessions a day meant the ceiling was reset before it could ever
  // govern one. See docs/superpowers/specs/2026-08-08-granularity-ceiling-design.md.
  const pointer = loadActiveMomentPointer();
  const moment = resolveActiveMoment(pointer, loadMoments(), loadAreas(), now);
  // The pointer keeps no history of its own, so a switch is only ever recoverable if keel
  // notices it. Sitting down to a moment declared while away lands here.
  const switched = intentionSwitch(pointer, moment, state);
  if (switched) {
    logHookEvent("intention_switched", now, input, { extra: switched.extra });
    state = { ...state, lastMomentId: switched.lastMomentId };
  }
  saveState(state);
  return emitText([...consent, intentionLine(moment)].filter(Boolean).join("\n"));
}

function cmdStatus(now) {
  const state = loadState();
  const band = bandNow(loadPhaseConfigs(), now) || "(none — zenborg's phaseConfigs unreadable)";
  console.log(
    `keel[${TARGET_ID}]: band=${band} · gates=none · ` +
    `tending=${activeMomentNow(now)?.name ?? "nothing"} · ` +
    `focus=${state.focus ? "on" : "off"} · granularity=${activeGranularity(state)}`,
  );
}

// ponytail: signoff's levers went in stages — the self-imposed park and vice block with the
// walls (2026-06-17), then the night lock that outlived them (2026-08-18). Nothing is left to
// pull: signoff acknowledges the close and the log carries the rest.
function cmdSignoff() {
  console.log("keel: signed off. The day is sealed. (keel walls nothing — it watches and reports.)");
}

// ponytail: `keel signon` is gone (2026-08-07). The day now opens in zenborg, which
// owns `$KAIROS_HOME/signon.json`; a keel command that stamped keel's own state would
// be a second source of truth AND a key cut from inside the locked box.

// `keel intention` READS the active moment. It cannot set one: the intention is a zenborg
// moment now, and keel is a reader of the vault (2026-08-07). An old `keel intention "…"`
// caller gets told where the setter went rather than silently doing nothing.
function cmdIntention(arg, now) {
  const moment = activeMomentNow(now);
  if (String(arg ?? "").trim()) {
    console.log("keel: what you tend is a zenborg moment now — tend it there (MCP or the UI) and keel picks it up. `keel intention` shows what's being tended.");
    return;
  }
  console.log(moment
    ? `keel: ◎ tending — ${moment.name}${moment.area ? ` (${moment.area})` : ""}.`
    : "keel: nothing is being tended. Tend a habit in zenborg; keel reads it from the vault.");
}

/** The active moment right now, resolved from the kairos vault. @param {number} now */
function activeMomentNow(now) {
  return resolveActiveMoment(loadActiveMomentPointer(), loadMoments(), loadAreas(), now);
}

function cmdGranularity(arg) {
  const raw = String(arg ?? "").trim();
  if (raw === "clear" || raw === "reset") {
    saveState(setGranularity(loadState(), ""));
    console.log(`keel: granularity ceiling cleared — back to the default (${DEFAULT_GRANULARITY}: ${GRANULARITY_LEVELS[DEFAULT_GRANULARITY]}).`);
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
  console.log(`keel: granularity ceiling set — ${level}: ${GRANULARITY_LEVELS[level]} Held for this waking-day across sessions; below it, answers fit the ask. \`keel granularity reset\` returns to ${DEFAULT_GRANULARITY}.`);
}

function logFocusEvent(kind, now) {
  try { appendEvent(LOG_DIR, buildEvent({ id: randomUUID(), kind, ts: now, sessionId: "", payload: { source: "cli" } })); }
  catch { /* fail-open */ }
}

// `keel focus` — the deep gear over the intention: flips the breath flag over the active
// moment. It no longer NAMES the stream; the active moment does that (2026-08-07), so any
// label argument is accepted and ignored rather than becoming a second source of truth.
// It no longer HOLDS the stream either: the single-stream lock went on 2026-08-18. What it
// still does is mark the period — focus_on/focus_off land in the log so the gap-fill EDA can
// segment focus periods — and put a breath on the AI-wait gap.
function cmdFocus(arg, now) {
  const raw = String(arg ?? "").trim();
  const low = raw.toLowerCase();
  const state = loadState();
  const label = activeMomentNow(now)?.name ?? "";
  if (!raw) {
    console.log(state.focus
      ? `keel: ◉ focus on${label ? ` — "${label}"` : ""}. \`keel focus off\` to close.`
      : "keel: focus off. `keel focus on` to go deep on the active moment.");
    return;
  }
  if (low === "off" || low === "stop" || low === "clear") {
    saveState(setFocus(state, false, now));
    logFocusEvent("focus_off", now);
    console.log("keel: focus off — stream closed. (the active moment stays whatever zenborg says.)");
    return;
  }
  saveState(setFocus(state, true, now));
  logFocusEvent("focus_on", now);
  const named = label ? `one stream on "${label}"` : "one stream (no active moment — set one in zenborg to name it)";
  console.log(`keel: ◉ focus on — ${named}. A marker, not a lock: nothing is held. Breath on the AI gap. \`keel focus off\` to release.`);
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
// A calm HUD: glyphs appear only when they carry signal, no empty dashes.
// The 🔒/🌙 lock and wind-down leaders went with the night gate (2026-08-18) — there is no
// held-until to report when nothing is held, and a countdown to a wall that no longer exists
// is worse than silence.
function cmdHud(now) {
  const state = loadState();

  const parts = [];

  // Always-on indicators: the active moment (when one is set) + the day's granularity ceiling.
  const inten = activeMomentNow(now)?.name ?? "";
  if (inten) parts.push(`◎ ${inten.length > 24 ? inten.slice(0, 23) + "…" : inten}`);
  if (state.focus) parts.push("◉ focus");
  parts.push(`▤ ${activeGranularity(state)}`);

  process.stdout.write(parts.join("  ·  "));
}

/** `keel rules` — the effective rules, with provenance per section. */
function cmdRules() {
  console.log(renderRules(loadTarget(), loadRawTarget(), loadPhaseConfigs()));
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
      : "keel log: no events today yet — is the writer wired? (hooks → ~/.kairos/keel/log/)");
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
    if (sub === "session-end") return handleSessionEnd(now);
    if (sub in KIND_BY_HOOK) return handleObservedHook(sub, now);
    return process.exit(0);
  }
  if (cmd === "log") return cmdLog(now, sub, process.argv[4]);
  if (cmd === "rules") return cmdRules();
  if (cmd === "native-host") { runHost(); return; }
  if (cmd === "signoff") return cmdSignoff();
  if (cmd === "intention") return cmdIntention(process.argv.slice(3).join(" "), now);
  if (cmd === "granularity" || cmd === "gran") return cmdGranularity(sub);
  if (cmd === "focus") return cmdFocus(process.argv.slice(3).join(" "), now);
  if (cmd === "arm") return cmdFocus(process.argv.slice(3).join(" ") || "on", now);  // skill entry: empty label → on, no shell expansion needed
  if (cmd === "hud") return cmdHud(now);
  if (cmd === "status") return cmdStatus(now);
  if (cmd === "watchlist" && sub === "scan") return cmdWatchlistScan();
  console.log("usage: keel <hook pre-tool|user-submit|session-start | signoff | intention (read-only; set it in zenborg) | granularity [sentence|tldr|page|essay|report|reset] | focus [on|off] | rules | log status | status | watchlist scan>");
}

main().catch(() => process.exit(0)); // fail-open
