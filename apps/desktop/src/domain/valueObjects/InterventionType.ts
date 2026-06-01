/**
 * InterventionType Value Object
 *
 * Re-exported from @keel/domain's UIPresentation type.
 * Defines how desktop interventions present themselves to the user.
 *
 * - "notification": System notification (BCT 7.1: Prompts/cues)
 * - "compass": Navigation HUD showing alignment (BCT 2.3: Self-monitoring)
 * - "stain": Visual overlay (BCT 14.2: Punishment) - disabled by default
 * - "dialog": Interactive dialog (BCT 1.8: Behavioral contract)
 */
import type { UIPresentation } from "@keel/domain";

export type InterventionType = UIPresentation;
