/**
 * Behavioral science types for the keel platform.
 *
 * Grounded in the BCT Taxonomy v1 (Michie et al., 2013) and
 * Persuasive Design Principles (Oinas-Kukkonen & Harjumaa, 2009).
 *
 * These types are the scientific backbone of all interventions —
 * every shield, signal, and desktop intervention maps to specific
 * BCTs and PDPs that explain *why* it works.
 */

// ── Behavioral Mechanism ────────────────────────────────────────

/**
 * How an intervention operates on behavior.
 *
 * Subtractive mechanisms (reduce exposure):
 * - "cue-removal": Hides compulsive UI elements (BCT #12.3)
 * - "access-block": Blocks interaction mechanics (BCT #12.1 + #7)
 * - "friction": Adds delay/confirmation before action (BCT #11.2)
 * - "environment": Restructures page layout to reduce triggers (BCT #12.1)
 *
 * Additive mechanisms (surface awareness):
 * - "self-monitoring": Makes behavior visible — time, frequency, patterns (BCT #2.3)
 * - "prompt": Surfaces a reminder at the right moment (BCT #7.1)
 * - "reflection": Asks a question — "Is this what you intended?" (BCT #2.4)
 */
export type BehavioralMechanism =
  | "cue-removal"
  | "access-block"
  | "friction"
  | "environment"
  | "self-monitoring"
  | "prompt"
  | "reflection";

// ── UI Presentation (desktop surface) ───────────────────────────

/**
 * How a desktop intervention presents itself to the user.
 * Browser surface interventions don't use this — they operate
 * directly on the DOM.
 */
export type UIPresentation =
  | "notification"
  | "compass"
  | "stain"
  | "dialog";

// ── BCT Reference ───────────────────────────────────────────────

/** Reference to a specific Behavior Change Technique from the BCT Taxonomy v1. */
export interface BCTReference {
  /** Taxonomy code, e.g., "7.1" */
  readonly code: string;
  /** Technique name, e.g., "Prompts/cues" */
  readonly name: string;
  /** Grouping category, e.g., "Associations" */
  readonly grouping: string;
}

// ── PDP Reference ───────────────────────────────────────────────

/** Reference to a Persuasive Design Principle (Oinas-Kukkonen & Harjumaa). */
export interface PDPReference {
  readonly name: string;
  readonly category:
    | "Primary Task"
    | "Dialogue"
    | "System Credibility"
    | "Social Support";
}

// ── Intervention Metadata ───────────────────────────────────────

/**
 * Scientific metadata for an intervention.
 *
 * Links each intervention to the behavioral science that explains
 * why it works. Not required for the intervention to function,
 * but required for the intervention to be *legible* as a BCT.
 */
export interface InterventionMetadata {
  readonly bcts: readonly BCTReference[];
  readonly pdps: readonly PDPReference[];
  readonly mechanismsOfAction: readonly string[];
  readonly description: string;
}
