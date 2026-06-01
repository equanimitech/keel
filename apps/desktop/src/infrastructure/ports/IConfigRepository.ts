import * as TE from "fp-ts/TaskEither";
import { AppConfig } from "../../types/AppConfig";

/**
 * Repository Port: Application Configuration
 *
 * Defines contract for config persistence (typically ~/.keel/config.json).
 * Returns default config if file doesn't exist.
 */
export interface IConfigRepository {
  /**
   * Load application configuration
   * If config file doesn't exist, returns DEFAULT_CONFIG
   * @returns TaskEither with error message on left, AppConfig on right
   */
  load(): TE.TaskEither<string, AppConfig>;

  /**
   * Save application configuration
   * Creates config directory if it doesn't exist
   * @returns TaskEither with error message on left, void on success
   */
  save(config: AppConfig): TE.TaskEither<string, void>;
}
