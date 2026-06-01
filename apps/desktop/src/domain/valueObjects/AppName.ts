/**
 * Value Object: AppName
 *
 * Base branded type imported from @keel/domain.
 * Desktop-specific utilities (matching, equality, null handling) defined locally.
 */
import type { AppName } from "@keel/domain";

// Re-export base type
export type { AppName };

export const createAppName = (name: string | undefined | null): AppName => {
  if (!name || typeof name !== "string") {
    return "" as AppName; // Return empty AppName for undefined/null
  }
  return name.toLowerCase().trim() as AppName;
};

export const appNameMatches = (appName: AppName) => (pattern: string): boolean =>
  appName.includes(pattern.toLowerCase().trim());

export const appNameEquals = (a: AppName) => (b: AppName): boolean =>
  a === b;

export const appNameToString = (appName: AppName): string => appName;
