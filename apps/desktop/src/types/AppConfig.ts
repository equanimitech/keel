/**
 * Application Configuration
 *
 * Stored in ~/.keel/config.json
 */
export interface AppConfig {
  /**
   * Default blocklist patterns for new sessions
   */
  readonly defaultBlocklist: readonly string[];

  /**
   * Global keyboard shortcuts (action name -> shortcut key)
   * null = disabled
   */
  readonly globalShortcuts?: Readonly<Record<string, string | null>>;

  /**
   * Default session duration in minutes
   * 0 = open-ended (no time limit)
   */
  readonly defaultSessionDuration: number;

  /**
   * Compass widget position (x, y coordinates)
   * null = default position (near Mac notch)
   */
  readonly compassPosition: { x: number; y: number } | null;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  defaultBlocklist: [
    "slack",
    "discord",
    "twitter",
    "facebook",
    "instagram",
    "linkedin",
    "reddit",
    "youtube",
    "netflix",
    "twitch",
    "chess.com",
  ],
  globalShortcuts: {
    captureModal: null,
    startSession: null,
  },
  defaultSessionDuration: 90, // 90 minutes
  compassPosition: null, // Auto-position near notch
};
