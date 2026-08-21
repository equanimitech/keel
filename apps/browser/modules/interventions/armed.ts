/**
 * The armed cache — what is in force right now, as the extension sees it.
 *
 * ── Why a cache and not a query ─────────────────────────────────────────
 *
 * The app decides what is armed; the extension decides when it fires. A
 * navigation cannot wait on a native-messaging round trip, and a shield that
 * depends on a live host is a shield that lifts whenever the host is asleep,
 * mid-update, or crashed. So the record is **pushed** and held locally, and
 * actuation reads nothing but local state.
 *
 * `kairos/kernel/substrate.md` records why the push exists at all: the browser
 * extension has no filesystem access and never will, so it takes a pusher
 * rather than a loader. Pushing is a read with extra steps, not a second
 * writer — nothing here is authoritative, and nothing here is written back.
 *
 * ── Invariant 6 is enforced at the door ─────────────────────────────────
 *
 * `parseArmed` refuses any entry that carries no reachable exit. Sovereignty
 * rests on the exit, not on who was allowed to arm the thing, so a block with
 * no visible way out is a bug rather than a stricter shield — and the cheapest
 * place to hold that line is the boundary the record crosses.
 *
 * Everything in this file is pure: no chrome APIs, no clock, no storage. The
 * chrome.storage mirror is `store.ts`; the actuation wiring is `actuate.ts`.
 */

import { normalizeDomain } from "../domains";
import type { DwellGate, GateFriction } from "../friction/gate/decide";

/** Where a lockout is applied. Only `browser` is this surface's to enforce. */
export type ArmedEnforcement = "browser" | "resolver" | "device";

/**
 * The desugared primitive, narrowed to what a browser can actuate.
 *
 * The domain speaks seven primitives; two of them reach a page. `transform`
 * already has its own mirror and interpreter, and `observe`, `schedule`,
 * `intercept` and `actuate` are refused here rather than half-implemented.
 */
export type ArmedPrimitive =
  | {
      readonly kind: "cooldown";
      readonly enforcement: ArmedEnforcement;
      /** `standing` never lapses — what the blocklist has always been. */
      readonly standing: boolean;
    }
  | {
      readonly kind: "gate";
      readonly everyMinutes: number;
      readonly friction: GateFriction;
    };

/**
 * The exit, in the one shape that covers both primitives.
 *
 * `continue` / `redirect` / `abort` come from a gate's `proceedAffordance`;
 * `wait` / `intention` / `delay` / `out_of_band` from a cooldown's
 * `unlockPath`. A costly exit is still an exit — `out_of_band` is deliberately
 * outside the running system so it cannot be taken in the moment of wanting —
 * but an *absent* one is not, and neither is one with nothing to read.
 */
export interface ProceedAffordance {
  readonly label: string;
  readonly action:
    | { readonly type: "continue" }
    | { readonly type: "redirect"; readonly to: string }
    | { readonly type: "abort" }
    | { readonly type: "wait" }
    | { readonly type: "intention"; readonly prompt: string }
    | { readonly type: "delay"; readonly seconds: number }
    | { readonly type: "out_of_band"; readonly note: string };
}

export interface ArmedIntervention {
  readonly ruleId: string;
  /** What the person called it. Shown wherever the exit is shown. */
  readonly label: string;
  /** Registrable hosts. Domains only — never URLs, never paths. */
  readonly domains: readonly string[];
  readonly primitive: ArmedPrimitive;
  /** Invariant 6. Required: no exit, no arming. */
  readonly proceed: ProceedAffordance;
  readonly abort?: { readonly label: string };
  /**
   * From `RuleSpec.deliveryProbability`. `1` means the rule never withholds;
   * anything below it buys the comparison condition a proximal outcome needs.
   */
  readonly deliveryProbability: number;
}

/** The cache, keyed by rule id — the shape of the pushed record. */
export type Armed = Readonly<Record<string, ArmedIntervention>>;

export type RefusalReason = "no_exit" | "no_domains" | "unactuatable";

export interface Refusal {
  readonly ruleId: string;
  readonly reason: RefusalReason;
}

export interface ParsedArmed {
  readonly armed: Armed;
  /** Entries the door turned away. Reported, never silently dropped. */
  readonly refused: readonly Refusal[];
}

const MAX_RULE_ID = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The exit, or null.
 *
 * Null is the invariant-6 refusal and it has three causes, all of them the
 * same failure from the person's side: nothing to read, nothing to press, or
 * an action this surface does not know how to offer.
 */
function readProceed(raw: unknown): ProceedAffordance | null {
  if (!isRecord(raw)) {
    return null;
  }
  const label = text(raw.label);
  if (label === "") {
    return null;
  }
  const action = isRecord(raw.action) ? raw.action : null;
  if (action === null) {
    return null;
  }
  switch (action.type) {
    case "continue":
      return { label, action: { type: "continue" } };
    case "abort":
      return { label, action: { type: "abort" } };
    case "wait":
      return { label, action: { type: "wait" } };
    case "redirect": {
      const to = text(action.to);
      // A redirect with no destination is a `continue` wearing another name.
      return to === "" ? null : { label, action: { type: "redirect", to } };
    }
    case "intention": {
      const prompt = text(action.prompt);
      return prompt === "" ? null : { label, action: { type: "intention", prompt } };
    }
    case "delay": {
      const seconds = Number(action.seconds);
      return Number.isFinite(seconds) && seconds >= 0
        ? { label, action: { type: "delay", seconds: Math.round(seconds) } }
        : null;
    }
    case "out_of_band": {
      const note = text(action.note);
      // The note IS the exit here — a lift with no stated path is unreachable.
      return note === "" ? null : { label, action: { type: "out_of_band", note } };
    }
    default:
      return null;
  }
}

function readFriction(raw: unknown): GateFriction | null {
  if (!isRecord(raw)) {
    return null;
  }
  switch (raw.type) {
    case "confirmation":
      return { type: "confirmation" };
    case "intention": {
      const prompt = text(raw.prompt);
      return prompt === "" ? null : { type: "intention", prompt };
    }
    case "delay": {
      const seconds = Number(raw.seconds);
      return Number.isFinite(seconds) ? { type: "delay", seconds: Math.round(seconds) } : null;
    }
    case "breath": {
      const cycles = Number(raw.cycles);
      return Number.isFinite(cycles) ? { type: "breath", cycles: Math.round(cycles) } : null;
    }
    default:
      return null;
  }
}

function readPrimitive(raw: unknown): ArmedPrimitive | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.kind === "cooldown") {
    const at = raw.enforcement;
    const enforcement: ArmedEnforcement =
      at === "resolver" || at === "device" ? at : "browser";
    return { kind: "cooldown", enforcement, standing: raw.standing === true };
  }
  if (raw.kind === "gate") {
    const friction = readFriction(raw.friction);
    const everyMinutes = Number(raw.everyMinutes);
    if (friction === null || !Number.isFinite(everyMinutes) || everyMinutes <= 0) {
      return null;
    }
    return { kind: "gate", everyMinutes: Math.round(everyMinutes), friction };
  }
  return null;
}

function readDomains(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const host = normalizeDomain(entry);
    if (host !== null) {
      out.add(host);
    }
  }
  return [...out];
}

function readProbability(raw: unknown): number {
  const p = Number(raw);
  if (raw === undefined || raw === null || !Number.isFinite(p)) {
    return 1;
  }
  return Math.min(1, Math.max(0, p));
}

/**
 * Read a pushed armed record.
 *
 * Returns `null` when the push is not a record collection at all. That is the
 * difference that keeps the shields up: **malformed means keep what you have,
 * empty means lift.** An older host, a truncated frame or a garbled reply must
 * never read as "nothing is armed" — but an explicitly empty record is the
 * person taking a fence down, and it has to land.
 */
export function parseArmed(raw: unknown): ParsedArmed | null {
  if (!isRecord(raw)) {
    return null;
  }

  const armed: Record<string, ArmedIntervention> = {};
  const refused: Refusal[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }
    const ruleId = (text(value.ruleId) || key).slice(0, MAX_RULE_ID);
    if (ruleId === "") {
      continue;
    }

    const primitive = readPrimitive(value.primitive);
    if (primitive === null) {
      refused.push({ ruleId, reason: "unactuatable" });
      continue;
    }

    // Invariant 6 first among the content checks: a thing with no way out is
    // refused whatever else is right about it.
    const proceed = readProceed(value.proceed);
    if (proceed === null) {
      refused.push({ ruleId, reason: "no_exit" });
      continue;
    }

    const domains = readDomains(value.domains);
    if (domains.length === 0) {
      refused.push({ ruleId, reason: "no_domains" });
      continue;
    }

    const abortLabel = isRecord(value.abort) ? text(value.abort.label) : "";
    armed[ruleId] = {
      ruleId,
      label: text(value.label) || ruleId,
      domains,
      primitive,
      proceed,
      ...(abortLabel === "" ? {} : { abort: { label: abortLabel } }),
      deliveryProbability: readProbability(value.deliveryProbability),
    };
  }

  return { armed, refused };
}

/** Does `host` fall under `domain`? Exact match or a true subdomain, which is
 * what DNR's `requestDomains` already does — the two must not disagree. */
function covers(domain: string, host: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Everything armed on `host`. The hot-path read: pure, local, no round trip. */
export function armedFor(armed: Armed, host: string): readonly ArmedIntervention[] {
  const needle = normalizeDomain(host);
  if (needle === null) {
    return [];
  }
  const out: ArmedIntervention[] = [];
  for (const entry of Object.values(armed)) {
    if (entry.domains.some((d) => covers(d, needle))) {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Hosts under a standing cooldown this surface enforces.
 *
 * Resolver- and device-enforced blocks are deliberately absent: they hold
 * somewhere the extension is not, and projecting them here would double-block
 * on this machine while reporting a firing that another surface actually made.
 */
export function browserStandingHosts(armed: Armed): readonly string[] {
  const out = new Set<string>();
  for (const entry of Object.values(armed)) {
    const p = entry.primitive;
    if (p.kind !== "cooldown" || !p.standing || p.enforcement !== "browser") {
      continue;
    }
    for (const domain of entry.domains) {
      out.add(domain);
    }
  }
  return [...out];
}

/**
 * Hosts a *timed* browser cooldown may cover once armed.
 *
 * The candidate set, not the held set: a timed cooldown is armed by a gesture —
 * the popup, the keyboard, the tray — and the arming state decides what actually
 * holds. This says which hosts a rule has made available to that gesture.
 *
 * Migration step 5 moved this read here from the policy mirror
 * (`local:policy:armable`), which was projected host-side from
 * `~/.kairos/keel/rules/*.json`. Same question, one store.
 */
export function browserArmableHosts(armed: Armed): readonly string[] {
  const out = new Set<string>();
  for (const entry of Object.values(armed)) {
    const p = entry.primitive;
    if (p.kind !== "cooldown" || p.standing || p.enforcement !== "browser") {
      continue;
    }
    for (const domain of entry.domains) {
      out.add(domain);
    }
  }
  return [...out];
}

/**
 * A gate's exit, narrowed to the three actions an interstitial can offer.
 *
 * `wait`, `delay`, `intention` and `out_of_band` are cooldown vocabulary — a
 * lockout's way out, not a gate's — so a gate carrying one degrades to
 * `continue` rather than being dropped. The label survives either way, which is
 * what the person actually reads.
 */
function gateAction(proceed: ProceedAffordance): DwellGate["proceed"]["action"] {
  const { action } = proceed;
  if (action.type === "redirect") {
    return { type: "redirect", to: action.to };
  }
  if (action.type === "abort") {
    return { type: "abort" };
  }
  return { type: "continue" };
}

/**
 * The armed gates, in the shape the dwell interpreter already speaks.
 *
 * Reusing `DwellGate` rather than inventing a parallel gate type is what keeps
 * one interstitial in the codebase: an armed gate and a policy gate are the
 * same primitive arriving down two transports, and they must not diverge into
 * two overlays with two behaviours.
 */
export function gatesFrom(armed: Armed): readonly DwellGate[] {
  const out: DwellGate[] = [];
  for (const entry of Object.values(armed)) {
    if (entry.primitive.kind !== "gate") {
      continue;
    }
    out.push({
      ruleId: entry.ruleId,
      domains: entry.domains,
      everyMinutes: entry.primitive.everyMinutes,
      friction: entry.primitive.friction,
      proceed: { label: entry.proceed.label, action: gateAction(entry.proceed) },
      abort: entry.abort ?? { label: "Close the tab" },
    });
  }
  return out;
}

/** The armed gates covering `host`. The hot-path read for the gate poll. */
export function armedGatesFor(armed: Armed, host: string): readonly DwellGate[] {
  const onHost: Record<string, ArmedIntervention> = {};
  for (const entry of armedFor(armed, host)) {
    onHost[entry.ruleId] = entry;
  }
  return gatesFrom(onHost);
}

/**
 * The exit as one readable line.
 *
 * This is what makes invariant 6 visible rather than merely true. A standing
 * block replaces the page with the browser's own error page, where no
 * extension UI can run, so the way out has to be legible on a surface that is
 * always reachable — see the popup.
 */
export function exitLine(entry: ArmedIntervention): string {
  const { label, action } = entry.proceed;
  switch (action.type) {
    case "out_of_band":
      return `${label} — ${action.note}`;
    case "intention":
      return `${label} — ${action.prompt}`;
    case "delay":
      return `${label} — after ${action.seconds}s`;
    case "redirect":
      return `${label} — goes to ${action.to}`;
    default:
      return label;
  }
}
