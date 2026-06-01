/**
 * Value Object: Duration
 *
 * Base branded type imported from @keel/domain.
 * Desktop-specific utilities (between, formatDuration) defined locally.
 */
import type { Duration } from "@keel/domain";
import { createDuration } from "@keel/domain";

// Re-export base type and shared factory
export type { Duration };
export { createDuration };

export const fromMilliseconds = (ms: number): Duration => createDuration(ms);

export const fromMinutes = (minutes: number): Duration =>
  createDuration(minutes * 60 * 1000);

export const between = (start: Date, end: Date): Duration =>
  createDuration(end.getTime() - start.getTime());

export const toMilliseconds = (duration: Duration): number => duration;

export const formatDuration = (duration: Duration): string => {
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
};
