# keel Desktop - Development Guide

**An attention compass using DDD architecture with Tauri + React + TypeScript**

Part of the [equanimi monorepo](../../CLAUDE.md). Run from root with `pnpm dev:desktop` or locally with `pnpm tauri dev`.

---

## Shared Domain

Canonical domain types live in `@keel/domain` (`packages/domain/`). Desktop-specific domain logic (fp-ts aggregates, entities, services) lives in `src/domain/`. Value objects in `src/domain/valueObjects/` extend shared types with local utilities.

**Rule:** If a type exists in `@keel/domain`, import it. Only define locally what requires fp-ts or desktop-specific behavior.

---

## Architecture Overview

keel Desktop follows **Domain-Driven Design** with **hexagonal architecture**:

```
src/
├── domain/              # Pure business logic (ZERO dependencies)
│   ├── aggregates/      # FocusSession
│   ├── entities/        # Capture, DriftEvent
│   ├── valueObjects/    # AppName, Duration, AlertPolicy
│   └── services/        # DriftDetectionService
├── application/         # Use cases & orchestration
│   ├── services/        # SessionService, CaptureService, etc.
│   └── ServiceContainer.ts  # Dependency injection
├── infrastructure/      # External adapters
│   ├── ports/           # Interfaces (ISessionRepository, etc.)
│   ├── persistence/     # Tauri Store + FileSystem adapters
│   └── notifications/   # Tauri notification adapter
├── ui/                  # React components + hooks
│   ├── components/      # SetNorth, Navigation, Waypoint, DriftNotice
│   ├── hooks/           # useServices, useWindowTracking, useGlobalShortcuts
│   ├── state/           # appState$ (Legend State - ephemeral only)
│   └── App.tsx
├── bootstrap.ts         # App initialization
└── main.tsx             # Entry point
```

**Key principle**: Domain → Application → Infrastructure → UI (dependencies flow inward)

---

## Core Technologies

- **Frontend**: React 19 + TypeScript (strict mode)
- **State**: Legend State (ephemeral UI state only)
- **Persistence**: Tauri Store (`~/.keel/store.bin`)
- **Backend**: Rust (minimal - only window tracking + permissions)
- **FP Library**: fp-ts (TaskEither, Option, pipe)

---

## Development Workflow

### Adding a Feature

1. **Domain first**: Add/modify domain entities/services if needed
   - Keep pure (no infrastructure dependencies)
   - Use fp-ts types (Option, Either)
   - Immutable data structures

2. **Application layer**: Create/update use case service
   - Orchestrate domain + infrastructure
   - Return `TaskEither<string, T>`
   - Handle errors gracefully

3. **Infrastructure** (if needed): Add adapter or extend existing
   - Implement port interfaces
   - Use Tauri plugins where possible

4. **UI**: Create/update components
   - Wrap with `observer()` for reactivity
   - Use `useServices()` hook for DI
   - Update `appState$` for UI changes

### Running the App

```bash
# Development (from monorepo root)
pnpm dev:desktop

# Development (from apps/desktop/)
pnpm tauri dev

# Type check (from monorepo root)
pnpm typecheck

# Build Rust only
cargo check --manifest-path=src-tauri/Cargo.toml

# Production build
pnpm tauri build
```

### Testing

See `VERIFICATION.md` for comprehensive testing checklist.

**Manual testing preferred** - focus on:
- Session flow (start → drift → capture → end)
- Persistence (restart app with active session)
- Keyboard shortcuts (Cmd+Shift+C)
- Notification permissions

---

## Key Files

| File | Purpose |
|------|---------|
| `src/bootstrap.ts` | App initialization sequence |
| `src/application/ServiceContainer.ts` | Dependency injection container |
| `src/ui/state/appState.ts` | Ephemeral UI state (NOT persisted) |
| `src/types/AppConfig.ts` | Config schema + defaults |
| `src-tauri/src/lib.rs` | Rust window tracking (keep minimal) |

---

## Philosophy & Constraints

### Attentive Technology Principles

**DO:**
- ✅ Infrastructure that fades (boring, reliable, unsexy)
- ✅ Peripheral awareness (calm notifications)
- ✅ User owns all data (local-first, transparent storage)
- ✅ Functional programming (immutability, pure functions)
- ✅ DDD patterns (domain purity, ports/adapters)

**DON'T:**
- ❌ No tracking, metrics, or analytics
- ❌ No gamification (streaks, scores, celebrations)
- ❌ No cloud sync or accounts
- ❌ No animations or "delight"
- ❌ No social features
- ❌ No time tracking dashboards

### Language & Metaphors

**Compass metaphor throughout:**
- North = declared intention
- Heading = current app
- Drift = off-course navigation
- Waypoint = quick capture
- Navigation = focus session

**Tone:** Non-judgmental, calm, infrastructure-like

---

## State Management Rules

### Legend State (`appState$`)

**Purpose**: Ephemeral UI reactivity ONLY (lost on refresh)

**What goes in appState$:**
- Current session (hydrated from Tauri Store on startup)
- Current app name (from window tracking)
- Active drift event
- UI state (modals, overlays)

**What does NOT go in appState$:**
- Persistent data (use repositories)
- Session history (use SessionService.findAll())
- Captures (use CaptureService.findAll())

### Persistence

**Tauri Store** (`~/.keel/store.bin`):
- Sessions (`sessions:{id}`, `activeSessionId`)
- Captures (`captures:{id}`)
- Drift events (`driftEvents:{id}`)

**FileSystem** (`~/.keel/config.json`):
- App configuration
- Default blocklist

**Rule**: Repositories handle ALL persistence. Services coordinate. UI reads via state.

---

## Common Patterns

### Service Call Pattern

```typescript
const services = useServices();
const result = await services.sessionService.startSession(taskName, blocklist)();

if (result._tag === "Right") {
  // Success
  appState$.currentSession.set(result.right);
} else {
  // Error
  setError(result.left);
}
```

### Component Pattern

```typescript
export const Component = observer(function Component() {
  const services = useServices();
  const value = appState$.someValue.get();

  // Component re-renders only when tracked values change
  return <div>{value}</div>;
});
```

### Repository Pattern

```typescript
class TauriStoreRepository implements IRepository {
  async save(entity: Entity): TE.TaskEither<string, void> {
    return pipe(
      TE.tryCatch(
        async () => {
          await this.store.set(`key:${entity.id}`, entity);
          await this.store.save();
        },
        (error) => `Failed to save: ${String(error)}`
      )
    );
  }
}
```

---

## Rust Guidelines

**Keep minimal** - Only for system integration:
- Window tracking (`x-win` crate)
- Permissions (macOS accessibility)
- Tauri plugin initialization

**ALL business logic in TypeScript** for fast iteration.

**Current Rust commands:**
- `start_tracking()` - Begins window polling
- `check_permissions()` - Returns bool
- `request_permissions()` - Opens System Settings

---

## Adding a New Component

1. Create in `src/ui/components/ComponentName.tsx`
2. Wrap with `observer()` from `@legendapp/state/react`
3. Use `useServices()` for service access
4. Read state: `appState$.value.get()`
5. Write state: `appState$.value.set(newValue)`
6. Export from `src/ui/components/index.ts`

---

## Adding a New Service

1. Define port interface in `src/infrastructure/ports/IServiceName.ts`
2. Create service in `src/application/services/ServiceName.ts`
3. Implement adapter in `src/infrastructure/.../AdapterName.ts`
4. Wire in `ServiceContainer.ts` constructor
5. Add to `ServiceContainer` public API

---

## Adding a New Domain Entity

1. Create in `src/domain/entities/EntityName.ts`
2. Define interface (readonly properties)
3. Export factory function (`createEntity`)
4. Export `reconstitute` for deserialization
5. Export getters (avoid direct property access)
6. Keep PURE - no infrastructure dependencies

---

## Troubleshooting

**TypeScript errors:**
```bash
npx tsc --noEmit
```

**Rust errors:**
```bash
cargo check --manifest-path=src-tauri/Cargo.toml
```

**State not updating:**
- Ensure component wrapped with `observer()`
- Use `.get()` to read, `.set()` to write
- Check console for errors

**Persistence not working:**
- Verify `~/.keel/store.bin` exists
- Check repository save methods return Right
- Look for Tauri Store errors in console

**Window tracking not working:**
- Grant Accessibility permissions (macOS)
- Check `invoke("start_tracking")` called
- Verify `x-win` crate functioning

---

## References

- **Architecture**: `docs/plans/joyful-splashing-bear.md` (implementation plan)
- **Testing**: `VERIFICATION.md` (comprehensive checklist)
- **Philosophy**: `Attentive_Tech_Brief.md` (core principles)

---

## Version & Changelog

**Current**: v0.1.0 (DDD Architecture - MVP)

**Phases Completed:**
- ✅ Phase 1: Foundation Setup
- ✅ Phase 2: Domain Layer
- ✅ Phase 3: Infrastructure Ports
- ✅ Phase 4: Infrastructure Adapters
- ✅ Phase 5: Application Services
- ✅ Phase 6: State Management & Hooks
- ✅ Phase 7: UI Components
- ✅ Phase 8: Bootstrap & Integration

**Next Steps:**
- Test full flow (see VERIFICATION.md)
- Polish UI/UX
- Add session history view
- Implement progressive friction (optional)

---

🧭 **Build the compass. Let users find their own north.**
- Never run the development. I'll run it myself