#!/usr/bin/env node
// @ts-check
// keel agent — the Claude Code surface: focus gate + activity-log writer. Thin orchestration over core (pure) + store (I/O).
// Fail-open: any error → exit 0, allow. A hook must never trap the user.

import {
  phaseOf, nowMinOf, monthKey, skipActive, nextResetTs, frictionNow, toMin, inWindow,
  refillCredits, spendSkip, updateSession, denyingRule, recordNight,
  denyReason, renderOrient, reflectionLine, ritualNudge, parseParkTarget, parkActive,
  setIntention, activeIntention, intentionLine,
  setAppetite, normalizeAppetite, activeAppetite, appetiteLine, APPETITE_LEVELS,
  viceWindows, viceScheduledAt, viceShouldBlock, setVicePact, spendViceSkip,
  viceSkipActive, vicePactActive, isAllowedPath,
  buildEvent, capPayload, summarizeEvents, matchDispatch, targetHash, renderRules, consentLines,
  watchlistLines, desktopSensorLines,
} from "./core.mjs";
import { loadTarget, loadRawTarget, loadWatchlist, loadDesktopSensors, loadState, saveState, readStdin, TARGET_ID, KEEL_DIR, LOG_DIR, appendEvent, readEvents } from "./store.mjs";
import { runHost } from "./native-host.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

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
  const f = frictionNow(target, state, now);
  const input = await readStdin();
  const rule = denyingRule(target, f, input?.tool_name, state, now);
  const allowed = !rule || isAllowedPath(input?.tool_input?.file_path, rule.allowPaths, homedir());
  // Rules observability: every gate decision is auditable from the log alone.
  logHookEvent("tool_dispatched", now, input, { extra: {
    keel_denied: !allowed, keel_friction: Number(f.toFixed(3)), keel_phase: phaseOf(f),
    ...(rule?.notch ? { keel_rule_notch: rule.notch } : {}),
  } });
  if (allowed) return emit(null); // allow (silent)
  saveState(recordNight(state, now, target.driver, { observed: true }));
  return emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: denyReason(target, state),
    },
  });
}

async function handleUserSubmit(now) {
  const input = await readStdin();
  logHookEvent("prompt", now, input);
  const target = loadTarget();
  let state = updateSession(loadState(), now, target.orient);
  const phase = phaseOf(frictionNow(target, state, now));
  // Mark whether THIS turn opened under lockdown — the breakpoint signal PreToolUse reads.
  state.turnLockedTs = phase === "lockdown" && !skipActive(state, now) ? state.lastPromptTs : 0;
  if (phase !== "day") state = recordNight(state, now, target.driver, { observed: true });

  // Ambient by design: indicators live in the statusline HUD (`keel hud`), not injected per-turn.
  // The one exception — fired once per session, on turn 2+, only while unset: prompt the agent
  // to infer intention + appetite from the conversation and set them silently. Surfaces in the HUD.
  const freshTurn = state.sessionStartTs === now;        // the session's first prompt
  const unset = !activeIntention(state, now) || !activeAppetite(state, now);
  let nudge = "";
  if (!freshTurn && unset && state.inferNudgedTs !== state.sessionStartTs) {
    state.inferNudgedTs = state.sessionStartTs;
    nudge = "<keel: intention and/or appetite are unset for this session. Infer both from the conversation so far and set them silently — `keel intention \"<focus>\"` and `keel appetite <tiny|small|normal|deep>`. Do not announce; they surface in the statusline HUD. If you genuinely cannot infer one, leave it.>";
  }
  saveState(state);
  return emitText(nudge);
}

async function handleSessionStart(now) {
  const input = await readStdin();
  logHookEvent("session_start", now, input);
  const target = loadTarget();
  let state = refillCredits(loadState(), target, monthKey(now));
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
  const reflection = reflectionLine(state, target, now);
  const nudge = ritualNudge(state, now, target.voice);
  if (nudge) state = { ...state, lastRitualNudge: nudge.mark };
  saveState(state);
  return emitText([...consent, reflection, nudge?.line, intentionLine(state, now), appetiteLine(state, now)].filter(Boolean).join("\n"));
}

function cmdSkip(now) {
  const target = loadTarget();
  const refilled = refillCredits(loadState(), target, monthKey(now));
  const { spent, state } = spendSkip(refilled, nextResetTs(now, target.driver));
  if (!spent) {
    console.log(`keel: 0 skip credits left — coding stays paused until ${target.driver.reset}.`);
    return;
  }
  saveState(recordNight(state, now, target.driver, { observed: true, skipped: true }));
  console.log(`keel: skip spent. Coding unblocked until ${target.driver.reset}. ${state.credits} credit(s) left this month.`);
}

function cmdStatus(now) {
  const target = loadTarget();
  const state = refillCredits(loadState(), target, monthKey(now));
  const f = frictionNow(target, state, now);
  const locked = phaseOf(f) === "lockdown" && !skipActive(state, now);
  const park = state.parkAtTs
    ? ` park=${new Date(state.parkAtTs).toTimeString().slice(0, 5)}${parkActive(state, now, target.driver) ? "(BITING)" : ""}`
    : "";
  console.log(
    `keel[${TARGET_ID}]: f=${f.toFixed(2)} phase=${phaseOf(f)}${locked ? " (LOCKED)" : ""} ` +
    `credits=${state.credits} windDown=${target.driver.windDown} hardStop=${target.driver.hardStop} reset=${target.driver.reset}${park}`,
  );
}

function cmdPark(now, arg) {
  const target = loadTarget();
  const ts = parseParkTarget(arg, now);
  if (!ts) {
    console.log("keel: park needs a time. e.g. `keel park 21:00` or `keel park 15m`.");
    return;
  }
  saveState({ ...loadState(), parkAtTs: ts });
  const at = new Date(ts).toTimeString().slice(0, 5);
  const mins = Math.round((ts - now) / 60_000);
  console.log(`keel: parked. Coding stops at ${at} (in ${mins} min), held until ${target.driver.reset}. \`keel unpark\` to cancel.`);
}

function cmdUnpark() {
  saveState({ ...loadState(), parkAtTs: 0 });
  console.log("keel: park cleared.");
}

function cmdSignoff(now) {
  const target = loadTarget();
  // Sovereign close: lock coding AND raise vices for the rest of the night, same lifecycle as park.
  saveState(setVicePact({ ...loadState(), parkAtTs: now }, now, target.driver));
  try { viceApply("on"); } catch { /* daemon reconciles within the tick window */ }
  console.log(`keel: signed off. Coding closed + vices raised, held until ${target.driver.reset}. The day is sealed. \`keel unpark\` reopens coding; \`keel vice skip\` lifts vices (costs a credit).`);
}

function cmdIntention(now, arg) {
  const text = String(arg ?? "").trim();
  if (text === "clear") {
    saveState(setIntention(loadState(), "", now));
    console.log("keel: intention cleared.");
    return;
  }
  if (!text) {
    const cur = activeIntention(loadState(), now);
    console.log(cur ? `keel: intention — ${cur}` : "keel: no intention set today. `keel intention \"<focus>\"` to set one.");
    return;
  }
  saveState(setIntention(loadState(), text, now));
  console.log(`keel: intention set — ${text}. Held for today; surfaced each turn. \`keel intention clear\` to release.`);
}

function cmdAppetite(now, arg) {
  const raw = String(arg ?? "").trim();
  if (raw === "clear") {
    saveState(setAppetite(loadState(), "", now));
    console.log("keel: appetite cleared.");
    return;
  }
  if (!raw) {
    const cur = activeAppetite(loadState(), now);
    console.log(cur ? `keel: appetite — ${cur}: ${APPETITE_LEVELS[cur]}` : "keel: no appetite set today. `keel appetite <tiny|small|normal|deep>`.");
    return;
  }
  const level = normalizeAppetite(raw);
  if (!level) {
    console.log(`keel: unknown appetite "${raw}". Choose: tiny | small | normal | deep.`);
    return;
  }
  saveState(setAppetite(loadState(), level, now));
  console.log(`keel: appetite set — ${level}: ${APPETITE_LEVELS[level]} Held for today; surfaced each turn. \`keel appetite clear\` to release.`);
}

// ── Vice block (hosts toggle + scheduled Ulysses pact) ────────
function viceBlocked() {
  try { return readFileSync("/etc/hosts", "utf8").includes(">>> keel vice-block"); }
  catch { return false; }
}

/** Apply the hosts block via the privileged primitive, by the least-friction path
 * available: direct (root daemon) · passwordless sudo (sudoers.d) · GUI auth (fallback).
 * @param {"on"|"off"} action */
function viceApply(action) {
  const script = `${KEEL_DIR}/vice-block.sh`;
  if (typeof process.getuid === "function" && process.getuid() === 0)
    return execFileSync(script, [action], { stdio: "ignore" });
  try { return execFileSync("sudo", ["-n", script, action], { stdio: "ignore" }); }
  catch {
    return execFileSync("osascript",
      ["-e", `do shell script ${JSON.stringify(`${script} ${action}`)} with administrator privileges`],
      { stdio: "ignore" });
  }
}

const windowsLabel = (target) => viceWindows(target).map((w) => `${w.from}→${w.to}`).join(", ");

function cmdVice(now, sub) {
  const target = loadTarget();
  const reset = target.driver.reset;
  let state = refillCredits(loadState(), target, monthKey(now));

  if (sub === "on" || sub === "panic") {
    state = setVicePact(state, now, target.driver);
    saveState(state);
    try { viceApply("on"); } catch { /* daemon reconciles */ }
    console.log(`keel: vices raised — held until ${reset}. \`keel vice skip\` lifts early (costs a credit).`);
    return;
  }
  if (sub === "skip") {
    const { spent, state: s2 } = spendViceSkip(state, nextResetTs(now, target.driver));
    if (!spent) { console.log(`keel: 0 skip credits left — vices stay up until ${reset}.`); return; }
    saveState(s2);
    try { viceApply("off"); } catch { /* daemon reconciles */ }
    console.log(`keel: skip spent. Vices down until ${reset}. ${s2.credits} credit(s) left this month.`);
    return;
  }
  if (sub === "off") {
    state = { ...state, viceUntilTs: 0 };          // drop the manual pact
    saveState(state);
    if (viceShouldBlock(target, state, now)) {     // a schedule window still bites
      console.log(`keel: vices scheduled now (${windowsLabel(target)}). \`keel vice skip\` lifts early (costs a credit).`);
      return;
    }
    try { viceApply("off"); } catch { /* daemon reconciles */ }
    console.log("keel: vices down.");
    return;
  }
  // status (default)
  const should = viceShouldBlock(target, state, now);
  const actual = viceBlocked();
  const sched = viceScheduledAt(nowMinOf(now), target);
  const pact = vicePactActive(state, now) ? ` · pact→${new Date(state.viceUntilTs).toTimeString().slice(0, 5)}` : "";
  const skip = viceSkipActive(state, now) ? ` · skip→${new Date(state.viceSkipUntilTs).toTimeString().slice(0, 5)}` : "";
  console.log(
    `keel vices: ${actual ? "🔒 up" : "🔓 down"} (want ${should ? "up" : "down"})` +
    ` · schedule ${windowsLabel(target)}${sched ? " [in window]" : ""}${pact}${skip} · credits=${state.credits}`,
  );
}

/** The root daemon's heartbeat: reconcile /etc/hosts to the desired state. Quiet on no-op. */
function cmdViceTick(now) {
  const target = loadTarget();
  const should = viceShouldBlock(target, loadState(), now);
  if (should === viceBlocked()) return;            // already reconciled
  const stamp = new Date(now).toISOString();
  try { viceApply(should ? "on" : "off"); console.log(`[${stamp}] vice-tick: ${should ? "raised" : "lifted"} vices.`); }
  catch (e) { console.log(`[${stamp}] vice-tick: FAILED (${should ? "raise" : "lift"}) — ${e?.message ?? e}`); }
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
  const state = refillCredits(loadState(), target, monthKey(now));
  const d = target.driver;
  const phase = phaseOf(frictionNow(target, state, now));
  const minsUntil = (hhmm) => (toMin(hhmm) - nowMinOf(now) + 1440) % 1440;

  const parts = [];

  // Abnormal states only — silent on a normal day or an on-track wind-down.
  if (phase === "lockdown") {
    parts.push(`keel 🔒 locked till ${d.reset}`);
  } else if (phase === "wind_down" && !inWindow(nowMinOf(now), toMin(d.windDown), toMin(d.hardStop))) {
    parts.push(d.backstop ? `keel 🌙 past stop · ${minsUntil(d.backstop)}m to backstop` : "keel 🌙 past stop");
  }

  // Always-on indicators: intention + appetite, when set.
  const inten = activeIntention(state, now);
  const app = activeAppetite(state, now);
  if (inten) parts.push(`◎ ${inten.length > 24 ? inten.slice(0, 23) + "…" : inten}`);
  if (app) parts.push(`▤ ${app}`);

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
  if (cmd === "skip") return cmdSkip(now);
  if (cmd === "park") return cmdPark(now, sub);
  if (cmd === "unpark") return cmdUnpark();
  if (cmd === "signoff") return cmdSignoff(now);
  if (cmd === "vice" || cmd === "vices") return cmdVice(now, sub);
  if (cmd === "vice-tick") return cmdViceTick(now);
  if (cmd === "intention") return cmdIntention(now, process.argv.slice(3).join(" "));
  if (cmd === "appetite") return cmdAppetite(now, sub);
  if (cmd === "hud") return cmdHud(now);
  if (cmd === "status") return cmdStatus(now);
  console.log("usage: keel <hook pre-tool|user-submit|session-start | skip | park <HH:MM|15m> | unpark | signoff | vice <on|off|skip|status|panic> | intention [\"<focus>\"|clear] | appetite [tiny|small|normal|deep|clear] | rules | log status | status>");
}

main().catch(() => process.exit(0)); // fail-open
