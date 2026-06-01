import { InterventionType } from "./InterventionType";
import type {
  BCTReference,
  PDPReference,
  InterventionMetadata,
} from "@keel/domain";

/**
 * InterventionMetadata Value Object
 *
 * Types imported from @keel/domain. The INTERVENTION_METADATA registry
 * is desktop-specific — it maps each desktop InterventionType to its
 * BCT/PDP specification.
 *
 * NOTE: This metadata is for internal documentation only, not exposed in UI.
 * It serves as a reference for developers and enables future features
 * (e.g., "explain why this works" tooltips).
 */

// Re-export shared types for consumers that import from this file
export type { BCTReference, PDPReference };

/**
 * Desktop-specific alias for InterventionMetadata.
 * Consumers in this app reference this as InterventionSpec.
 */
export type InterventionSpec = InterventionMetadata;

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
