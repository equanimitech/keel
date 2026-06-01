import { Store } from "@tauri-apps/plugin-store";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/function";
import { ICaptureRepository } from "../../ports/ICaptureRepository";
import {
  Capture,
  reconstitute,
  getId,
} from "../../../domain/entities/Capture";

/**
 * Tauri Store implementation of Capture Repository
 *
 * Stores captures in ~/.keel/store.bin with keys:
 * - "captures:{id}" for individual captures
 */
export class TauriStoreCaptureRepository implements ICaptureRepository {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  save(capture: Capture): TE.TaskEither<string, void> {
    return pipe(
      TE.tryCatch(
        async () => {
          // Serialize capture to plain object
          const captureData = {
            id: capture.id,
            content: capture.content,
            capturedAt: capture.capturedAt.toISOString(),
            sessionId: O.toUndefined(capture.sessionId),
          };

          // Save capture
          await this.store.set(`captures:${getId(capture)}`, captureData);

          // Persist to disk
          await this.store.save();
        },
        (error) => `Failed to save capture: ${String(error)}`
      )
    );
  }

  findAll(): TE.TaskEither<string, readonly Capture[]> {
    return pipe(
      TE.tryCatch(
        async () => {
          const entries = await this.store.entries();
          const captures: Capture[] = [];

          for (const [key, value] of entries) {
            if (key.startsWith("captures:")) {
              captures.push(reconstitute(value as any));
            }
          }

          // Sort by capturedAt descending (most recent first)
          return captures.sort(
            (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
          );
        },
        (error) => `Failed to find all captures: ${String(error)}`
      )
    );
  }

  findBySessionId(sessionId: string): TE.TaskEither<string, readonly Capture[]> {
    return pipe(
      TE.tryCatch(
        async () => {
          const entries = await this.store.entries();
          const captures: Capture[] = [];

          for (const [key, value] of entries) {
            if (key.startsWith("captures:")) {
              const capture = reconstitute(value as any);
              // Check if capture belongs to this session
              if (
                O.isSome(capture.sessionId) &&
                O.toUndefined(capture.sessionId) === sessionId
              ) {
                captures.push(capture);
              }
            }
          }

          // Sort by capturedAt descending (most recent first)
          return captures.sort(
            (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()
          );
        },
        (error) => `Failed to find captures by session: ${String(error)}`
      )
    );
  }
}
