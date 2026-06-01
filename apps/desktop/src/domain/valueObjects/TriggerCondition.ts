/**
 * TriggerCondition Value Object
 *
 * Re-exported from @keel/domain. Defines when an intervention should
 * be triggered. The shared domain includes all variants:
 * - immediate: Trigger immediately on drift detection
 * - delayed: Wait N ms before triggering
 * - threshold: Trigger after N drift events
 * - budget-based: Trigger when budget progress exceeds threshold
 */
export type { TriggerCondition } from "@keel/domain";
export {
  createImmediateTrigger,
  createDelayedTrigger,
  createThresholdTrigger,
  createBudgetTrigger,
} from "@keel/domain";
