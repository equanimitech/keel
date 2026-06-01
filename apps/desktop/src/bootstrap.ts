import * as O from "fp-ts/Option";
import { ServiceContainer } from "./application/ServiceContainer";
import { appState$ } from "./ui/state/appState";

/**
 * Bootstrap Function - Application Initialization
 *
 * Sequence:
 * 1. Initialize ServiceContainer (Tauri Store + all adapters)
 * 2. Request notification permissions
 * 3. Hydrate active session from Tauri Store into appState$
 * 4. Return initialized container
 */
export async function bootstrap(): Promise<ServiceContainer> {
  console.log("🧭 Bootstrapping keel...");

  // Step 1: Initialize ServiceContainer
  console.log("  → Initializing ServiceContainer...");
  const container = await ServiceContainer.initialize();
  console.log("  ✓ ServiceContainer initialized");

  // Step 2: Check and request notification permissions
  console.log("  → Checking notification permissions...");
  const checkResult = await container.notificationFacade.hasPermission()();

  if (checkResult._tag === "Right") {
    const hasPermission = checkResult.right;
    console.log(`  → Current permission status: ${hasPermission ? "granted" : "not granted"}`);

    if (!hasPermission) {
      console.log("  → Requesting notification permission...");
      const requestResult = await container.notificationFacade.ensurePermissions()();

      if (requestResult._tag === "Right") {
        console.log(`  ✓ Permission ${requestResult.right ? "granted" : "denied"}`);

        if (!requestResult.right) {
          console.warn("  ⚠ Notifications denied - drift alerts will not appear");
          console.warn("  ⚠ Enable in System Settings > Notifications");
        }
      } else {
        console.error(`  ❌ Failed to request permissions: ${requestResult.left}`);
      }
    } else {
      console.log("  ✓ Notification permissions already granted");
    }
  } else {
    console.error(`  ❌ Failed to check permissions: ${checkResult.left}`);
  }

  // Step 3: Hydrate active session from Tauri Store
  console.log("  → Hydrating active session from store...");
  const sessionResult = await container.sessionService.getActiveSession()();

  if (sessionResult._tag === "Right") {
    const maybeSession = sessionResult.right;
    if (O.isSome(maybeSession)) {
      const session = O.toUndefined(maybeSession);
      if (session) {
        appState$.currentSession.set(session);
        console.log(`  ✓ Active session restored: "${session.taskName}"`);
      }
    } else {
      console.log("  → No active session found");
    }
  } else {
    console.warn(`  ⚠ Failed to load active session: ${sessionResult.left}`);
  }

  console.log("🧭 Bootstrap complete!\n");
  console.log("📋 To test notifications:");
  console.log("   1. Start a session");
  console.log("   2. Add 'slack' or 'chrome' to blocklist");
  console.log("   3. Switch to that app");
  console.log("   4. Notification should appear\n");

  return container;
}
