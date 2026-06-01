/**
 * Core intervention types for the keel platform.
 *
 * An intervention is the atomic unit of attention management.
 * Both surfaces (desktop and browser) express their features
 * as interventions with a shared classification system.
 *
 * Desktop examples: notification on drift, compass HUD, stain overlay
 * Browser examples: YouTube Shorts scroll lock, chess.com cooldown, watch time signal
 */

import type {
  BehavioralMechanism,
  UIPresentation,
  InterventionMetadata,
} from "./behavior.js";

// ── Classification ──────────────────────────────────────────────

/**
 * How an intervention is classified.
 *
 * Every intervention has a behavioral mechanism (what it does to behavior).
 * Desktop interventions additionally have a UI presentation (how the user sees it).
 * Browser interventions operate directly on the DOM — no presentation type needed.
 */
export interface InterventionClassification {
  readonly mechanism: BehavioralMechanism;
  /** Desktop surface only. Browser interventions leave this undefined. */
  readonly presentation?: UIPresentation;
}

// ── Definition ──────────────────────────────────────────────────

/**
 * Immutable definition of an intervention.
 *
 * This is the "what" — what the intervention is, what it targets,
 * how it's classified. Separate from runtime state (enabled/disabled)
 * and configuration (trigger, settings).
 */
export interface InterventionDefinition {
  /** Unique kebab-case identifier, e.g., "youtube-shorts-scroll-lock" */
  readonly id: string;
  /** Human-readable name, e.g., "Shorts Scroll Lock" */
  readonly name: string;
  /** Tooltip/description for the user */
  readonly description: string;
  /** Target domain, e.g., "youtube.com". Use "*" for domain-agnostic (desktop). */
  readonly domain: string;
  /** Emoji icon for display */
  readonly icon: string;
  /** Behavioral + UI classification */
  readonly classification: InterventionClassification;
  /** Whether this intervention is enabled by default on first install */
  readonly defaultEnabled: boolean;
  /** Optional scientific metadata (BCTs, PDPs, mechanisms of action) */
  readonly metadata?: InterventionMetadata;
}

// ── Registry ────────────────────────────────────────────────────

/**
 * Read-only registry of available interventions.
 *
 * Each surface (desktop, browser) maintains its own registry.
 * The shared type ensures both registries speak the same language.
 */
export interface InterventionRegistry {
  readonly all: () => readonly InterventionDefinition[];
  readonly byId: (id: string) => InterventionDefinition | undefined;
  readonly byDomain: (domain: string) => readonly InterventionDefinition[];
  readonly byMechanism: (
    mechanism: BehavioralMechanism,
  ) => readonly InterventionDefinition[];
}
