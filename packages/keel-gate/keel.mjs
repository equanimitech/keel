#!/usr/bin/env node
// @ts-check
// keel-gate — Claude Code focus hook. Thin orchestration over core (pure) + store (I/O).
// Fail-open: any error → exit 0, allow. A hook must never trap the user.

import {
  frictionAt, phaseOf, nowMinOf, monthKey, skipActive, nextResetTs,
  refillCredits, spendSkip, updateSession, denyingRule, recordNight,
  denyReason, renderOrient, reflectionLine,
} from "./core.mjs";
import { loadTarget, loadState, saveState, readStdin, TARGET_ID } from "./store.mjs";

const emit = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const emitText = (t) => { if (t) process.stdout.write(t); process.exit(0); };

async function handlePreTool(now) {
  const target = loadTarget();
  const f = frictionAt(nowMinOf(now), target.driver);
  const state = loadState();
  const input = await readStdin();
  const rule = denyingRule(target, f, input?.tool_name, state, now);
  if (!rule) return emit(null); // allow (silent)
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
  const target = loadTarget();
  const f = frictionAt(nowMinOf(now), target.driver);
  const phase = phaseOf(f);
  let state = updateSession(loadState(), now, target.orient);
  // Mark whether THIS turn opened under lockdown — the breakpoint signal PreToolUse reads.
  state.turnLockedTs = phase === "lockdown" && !skipActive(state, now) ? state.lastPromptTs : 0;
  if (phase !== "day") state = recordNight(state, now, target.driver, { observed: true });
  saveState(state);
  return emitText(renderOrient(target, phase, state, now));
}

function handleSessionStart(now) {
  const target = loadTarget();
  const state = refillCredits(loadState(), target, monthKey(now));
  saveState(state);
  return emitText(reflectionLine(state, target, now));
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
  const f = frictionAt(nowMinOf(now), target.driver);
  const state = refillCredits(loadState(), target, monthKey(now));
  const locked = phaseOf(f) === "lockdown" && !skipActive(state, now);
  console.log(
    `keel[${TARGET_ID}]: f=${f.toFixed(2)} phase=${phaseOf(f)}${locked ? " (LOCKED)" : ""} ` +
    `credits=${state.credits} windDown=${target.driver.windDown} hardStop=${target.driver.hardStop} reset=${target.driver.reset}`,
  );
}

async function main() {
  const [cmd, sub] = process.argv.slice(2);
  const now = Date.now();
  if (cmd === "hook") {
    if (sub === "pre-tool") return handlePreTool(now);
    if (sub === "user-submit") return handleUserSubmit(now);
    if (sub === "session-start") return handleSessionStart(now);
    return process.exit(0);
  }
  if (cmd === "skip") return cmdSkip(now);
  if (cmd === "status") return cmdStatus(now);
  console.log("usage: keel <hook pre-tool|user-submit|session-start | skip | status>");
}

main().catch(() => process.exit(0)); // fail-open
