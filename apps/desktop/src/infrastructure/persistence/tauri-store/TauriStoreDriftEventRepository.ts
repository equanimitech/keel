import { Store } from "@tauri-apps/plugin-store";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/function";
import { IDriftEventRepository } from "../../ports/IDriftEventRepository";
import {
  DriftEvent,
  reconstitute,
  getId,
} from "../../../domain/entities/DriftEvent";

/**
 * Tauri Store implementation of Drift Event Repository
 *
 * Stores drift events in ~/.keel/store.bin with keys:
 * - "driftEvents:{id}" for individual events
 */
export class TauriStoreDriftEventRepository implements IDriftEventRepository {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  save(event: DriftEvent): TE.TaskEither<string, void> {
    return pipe(
      TE.tryCatch(
        async () => {
          // Serialize event to plain object
          const eventData = {
            id: event.id,
            sessionId: event.sessionId,
            appName: event.appName,
            detectedAt: event.detectedAt.toISOString(),
            dismissedAt: O.isSome(event.dismissedAt)
              ? O.toUndefined(
                  pipe(
                    event.dismissedAt,
                    O.map((d) => d.toISOString())
                  )
                )
              : undefined,
            action: O.toUndefined(event.action),
          };

          // Save drift event
          await this.store.set(`driftEvents:${getId(event)}`, eventData);

          // Persist to disk
          await this.store.save();
        },
        (error) => `Failed to save drift event: ${String(error)}`
      )
    );
  }

  findBySessionId(
    sessionId: string
  ): TE.TaskEither<string, readonly DriftEvent[]> {
    return pipe(
      TE.tryCatch(
        async () => {
          const entries = await this.store.entries();
          const events: DriftEvent[] = [];

          for (const [key, value] of entries) {
            if (key.startsWith("driftEvents:")) {
              const event = reconstitute(value as any);
              if (event.sessionId === sessionId) {
                events.push(event);
              }
            }
          }

          // Sort by detectedAt descending (most recent first)
          return events.sort(
            (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime()
          );
        },
        (error) => `Failed to find drift events by session: ${String(error)}`
      )
    );
  }
}
