import { Store } from "@tauri-apps/plugin-store";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/function";
import { ISessionRepository } from "../../ports/ISessionRepository";
import {
  FocusSession,
  reconstitute,
  isActive,
  getId,
} from "../../../domain/aggregates/FocusSession";

/**
 * Tauri Store implementation of Session Repository
 *
 * Stores sessions in ~/.keel/store.bin with keys:
 * - "sessions:{id}" for individual sessions
 * - "activeSessionId" for quick active session lookup
 */
export class TauriStoreSessionRepository implements ISessionRepository {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  save(session: FocusSession): TE.TaskEither<string, void> {
    return pipe(
      TE.tryCatch(
        async () => {
          // Serialize session to plain object
          const sessionData = {
            id: session.id,
            taskName: session.taskName,
            blocklist: session.blocklist,
            startedAt: session.startedAt.toISOString(),
            endedAt: O.isSome(session.endedAt)
              ? O.toUndefined(
                  pipe(
                    session.endedAt,
                    O.map((d) => d.toISOString())
                  )
                )
              : undefined,
            status: session.status,
            interventionProtocol: session.interventionProtocol,
          };

          // Save session
          await this.store.set(`sessions:${getId(session)}`, sessionData);

          // Update active session reference if this session is active
          if (isActive(session)) {
            await this.store.set("activeSessionId", getId(session));
          } else {
            // Clear active session if this one was active and is now completed
            const activeId = await this.store.get<string>("activeSessionId");
            if (activeId === getId(session)) {
              await this.store.delete("activeSessionId");
            }
          }

          // Persist to disk
          await this.store.save();
        },
        (error) => `Failed to save session: ${String(error)}`
      )
    );
  }

  findById(id: string): TE.TaskEither<string, O.Option<FocusSession>> {
    return pipe(
      TE.tryCatch(
        async () => {
          const data = await this.store.get<any>(`sessions:${id}`);
          return data ? O.some(reconstitute(data)) : O.none;
        },
        (error) => `Failed to find session by ID: ${String(error)}`
      )
    );
  }

  findActive(): TE.TaskEither<string, O.Option<FocusSession>> {
    return pipe(
      TE.tryCatch(
        async () => {
          const activeId = await this.store.get<string>("activeSessionId");
          if (!activeId) {
            return O.none;
          }

          const data = await this.store.get<any>(`sessions:${activeId}`);
          return data ? O.some(reconstitute(data)) : O.none;
        },
        (error) => `Failed to find active session: ${String(error)}`
      )
    );
  }

  findAll(): TE.TaskEither<string, readonly FocusSession[]> {
    return pipe(
      TE.tryCatch(
        async () => {
          const entries = await this.store.entries();
          const sessions: FocusSession[] = [];

          for (const [key, value] of entries) {
            if (key.startsWith("sessions:")) {
              sessions.push(reconstitute(value as any));
            }
          }

          // Sort by startedAt descending (most recent first)
          return sessions.sort(
            (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
          );
        },
        (error) => `Failed to find all sessions: ${String(error)}`
      )
    );
  }
}
