import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";
import { IConfigRepository } from "../../ports/IConfigRepository";
import { AppConfig, DEFAULT_CONFIG } from "../../../types/AppConfig";

/**
 * File System implementation of Config Repository
 *
 * Stores configuration in ~/.keel/config.json
 * Creates directory if it doesn't exist
 * Returns DEFAULT_CONFIG if file doesn't exist
 */
export class FileSystemConfigRepository implements IConfigRepository {
  private readonly configPath = ".keel/config.json";

  load(): TE.TaskEither<string, AppConfig> {
    return pipe(
      TE.tryCatch(
        async () => {
          // Check if config file exists
          const fileExists = await exists(this.configPath, {
            baseDir: BaseDirectory.Home,
          });

          if (!fileExists) {
            // Return default config if file doesn't exist
            return DEFAULT_CONFIG;
          }

          // Read and parse config file
          const content = await readTextFile(this.configPath, {
            baseDir: BaseDirectory.Home,
          });

          const loadedConfig = JSON.parse(content) as Partial<AppConfig>;

          // Merge with defaults to handle missing/null fields
          const config: AppConfig = {
            ...DEFAULT_CONFIG,
            ...loadedConfig,
            // Deep merge for nested objects
            globalShortcuts: {
              ...DEFAULT_CONFIG.globalShortcuts,
              ...loadedConfig.globalShortcuts,
            },
          };

          return config;
        },
        (error) => `Failed to load config: ${String(error)}`
      )
    );
  }

  save(config: AppConfig): TE.TaskEither<string, void> {
    return pipe(
      TE.tryCatch(
        async () => {
          // Ensure .keel directory exists
          const dirExists = await exists(".keel", {
            baseDir: BaseDirectory.Home,
          });

          if (!dirExists) {
            await mkdir(".keel", {
              baseDir: BaseDirectory.Home,
              recursive: true,
            });
          }

          // Serialize and write config
          const content = JSON.stringify(config, null, 2);
          await writeTextFile(this.configPath, content, {
            baseDir: BaseDirectory.Home,
          });
        },
        (error) => `Failed to save config: ${String(error)}`
      )
    );
  }
}
