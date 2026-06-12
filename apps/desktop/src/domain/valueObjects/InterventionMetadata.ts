import { InterventionType } from "./InterventionType";

/**
 * InterventionMetadata Value Object
 *
 * Desktop-local since the 2026-06-12 intervention-layer retirement
 * (BCT/PDP types were @keel/domain's behavior.ts; this frozen surface
 * absorbed them). The INTERVENTION_METADATA registry is desktop-specific
 * — it maps each desktop InterventionType to its BCT/PDP specification.
 *
 * NOTE: This metadata is for internal documentation only, not exposed in UI.
 * It serves as a reference for developers and enables future features
 * (e.g., "explain why this works" tooltips).
 */

/** Reference to a specific Behavior Change Technique (BCT Taxonomy v1,
 * Michie et al. 2013). */
export interface BCTReference {
  /** Taxonomy code, e.g., "7.1" */
  readonly code: string;
  /** Technique name, e.g., "Prompts/cues" */
  readonly name: string;
  /** Grouping category, e.g., "Associations" */
  readonly grouping: string;
}

/** Reference to a Persuasive Design Principle (Oinas-Kukkonen & Harjumaa). */
export interface PDPReference {
  readonly name: string;
  readonly category:
    | "Primary Task"
    | "Dialogue"
    | "System Credibility"
    | "Social Support";
}

/** Scientific metadata for an intervention — why it works, as a BCT. */
export interface InterventionSpec {
  readonly bcts: readonly BCTReference[];
  readonly pdps: readonly PDPReference[];
  readonly mechanismsOfAction: readonly string[];
  readonly description: string;
}

/**
 * Intervention metadata registry
 * Maps each intervention type to its BCT/PDP specification
 */
export const INTERVENTION_METADATA: Record<InterventionType, InterventionSpec> =
  {
    notification: {
      bcts: [{ code: "7.1", name: "Prompts/cues", grouping: "Associations" }],
      pdps: [
        { name: "Suggestion", category: "Dialogue" },
        { name: "Reminders", category: "Dialogue" },
      ],
      mechanismsOfAction: ["Behavioral Cueing", "Environmental Context"],
      description: "System notification on drift detection",
    },

    compass: {
      bcts: [
        {
          code: "2.3",
          name: "Self-monitoring of behavior",
          grouping: "Feedback & Monitoring",
        },
        {
          code: "2.2",
          name: "Feedback on behavior",
          grouping: "Feedback & Monitoring",
        },
      ],
      pdps: [
        { name: "Self-monitoring", category: "Primary Task" },
        { name: "Feedback", category: "Dialogue" },
      ],
      mechanismsOfAction: ["Behavioral Regulation", "Feedback Processes"],
      description:
        "Persistent navigation HUD showing alignment with intention (focused vs drifted)",
    },

    stain: {
      bcts: [
        {
          code: "14.2",
          name: "Punishment",
          grouping: "Scheduled Consequences",
        },
      ],
      pdps: [{ name: "Reduction", category: "Primary Task" }],
      mechanismsOfAction: ["Reinforcement", "Attitude towards behavior"],
      description:
        "Visual overlay that grows over time when drifted (disabled by default)",
    },

    dialog: {
      bcts: [
        {
          code: "1.8",
          name: "Behavioral contract",
          grouping: "Goals & Planning",
        },
        {
          code: "1.4",
          name: "Action planning",
          grouping: "Goals & Planning",
        },
      ],
      pdps: [{ name: "Suggestion", category: "Dialogue" }],
      mechanismsOfAction: ["Behavioral Regulation", "Goals"],
      description: "Interactive dialog for commitment or reflection",
    },
  };

/**
 * Get metadata for specific intervention type
 */
export const getInterventionMetadata = (
  type: InterventionType
): InterventionSpec => INTERVENTION_METADATA[type];
