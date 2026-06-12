/**
 * InterventionType Value Object
 *
 * Desktop-local since the 2026-06-12 intervention-layer retirement
 * (was @keel/domain's UIPresentation; this frozen surface absorbed it).
 * Defines how desktop interventions present themselves to the user.
 *
 * - "notification": System notification (BCT 7.1: Prompts/cues)
 * - "compass": Navigation HUD showing alignment (BCT 2.3: Self-monitoring)
 * - "stain": Visual overlay (BCT 14.2: Punishment) - disabled by default
 * - "dialog": Interactive dialog (BCT 1.8: Behavioral contract)
 */
export type InterventionType = "notification" | "compass" | "stain" | "dialog";
