import { useEffect } from "react";
import { TrayIcon } from "@tauri-apps/api/tray";
import { Image } from "@tauri-apps/api/image";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { appState$ } from "../state/appState";
import { formatRemainingTime } from "../../domain/aggregates/FocusSession";
import { exit } from "@tauri-apps/plugin-process";

/**
 * Hook: Tray Icon Management
 *
 * Manages the system tray icon and menu:
 * 1. Adapts icon to activity state (idle, active, drifted)
 * 2. Updates menu items based on session state
 * 3. Handles menu item clicks
 *
 * Icon states:
 * - Idle: tray_idle.png (no active session)
 * - Active: tray_active.png (session running)
 * - Drifted: tray_drifted.png (session running but user drifted)
 *
 * Menu items:
 * - "Activate" (if idle) / "Ending in X minutes..." (disabled, if active)
 * - Separator
 * - "Preferences"
 * - "Quit"
 *
 * Usage:
 *   useTrayIcon(); // Call once in App component
 */
export function useTrayIcon(): void {
  useEffect(() => {
    let tray: TrayIcon | null = null;
    let updateInterval: number | undefined;

    const setupTray = async () => {
      try {
        console.log("🔧 Setting up tray icon...");

        // Load icon images from resources directory
        const idleIcon = await Image.fromPath("resources/tray_idle.png");
        const activeIcon = await Image.fromPath("resources/tray_active.png");
        const driftedIcon = await Image.fromPath("resources/tray_drifted.png");
        console.log("✅ Icons loaded successfully");

        // Create initial menu
        const menu = await createMenu();

        // Create tray icon
        tray = await TrayIcon.new({
          id: "main-tray",
          menu,
          icon: idleIcon,
          iconAsTemplate: true,
          tooltip: "Keel",
        });

        console.log("✅ Tray icon created successfully!");

        // Subscribe to state changes and update tray
        const updateTray = async () => {
          if (!tray) return;

          const currentSession = appState$.currentSession.get();
          const activeDrift = appState$.activeDrift.get();

          // Determine icon state
          let icon = idleIcon;
          if (currentSession) {
            if (activeDrift) {
              icon = driftedIcon;
            } else {
              icon = activeIcon;
            }
          }

          // Update icon
          await tray.setIcon(icon);

          // Update menu
          const newMenu = await createMenu();
          await tray.setMenu(newMenu);
        };

        // Listen for state changes
        const unsubscribeSession =
          appState$.currentSession.onChange(updateTray);
        const unsubscribeDrift = appState$.activeDrift.onChange(updateTray);

        // Update menu every minute (for time remaining countdown)
        updateInterval = window.setInterval(updateTray, 60000);

        // Initial update
        await updateTray();

        // Cleanup
        return () => {
          console.log("🧹 Cleaning up tray subscriptions");
          unsubscribeSession();
          unsubscribeDrift();
          if (updateInterval !== undefined) {
            window.clearInterval(updateInterval);
          }
        };
      } catch (error) {
        console.error("❌ Failed to setup tray:", error);
        console.error("Error details:", error);
      }
    };

    setupTray();

    return () => {
      if (updateInterval !== undefined) {
        window.clearInterval(updateInterval);
      }
    };
  }, []);
}

/**
 * Helper: Create menu based on current state
 */
async function createMenu(): Promise<Menu> {
  const currentSession = appState$.currentSession.get();

  let firstItem: MenuItem | PredefinedMenuItem;

  if (currentSession) {
    // Active session - show time remaining (disabled)
    const timeRemaining = formatRemainingTime(currentSession);
    const label = timeRemaining
      ? `Ending in ${timeRemaining}`
      : "Session active";

    firstItem = await MenuItem.new({
      text: label,
      enabled: false,
    });
  } else {
    // No session - show "Activate" option
    firstItem = await MenuItem.new({
      text: "Activate",
      action: async () => {
        // TODO: Open main window or trigger activation
        console.log("Activate clicked");
      },
    });
  }

  // Create menu
  return Menu.new({
    items: [
      firstItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        text: "Preferences...",
        action: async () => {
          // Open or focus preferences window
          let prefsWindow = await WebviewWindow.getByLabel("preferences");

          if (!prefsWindow) {
            // Create new preferences window
            prefsWindow = new WebviewWindow("preferences", {
              url: "#preferences",
              title: "Preferences",
              width: 600,
              height: 500,
              center: true,
              resizable: true,
              decorations: true,
            });
          } else {
            // Window exists, just show and focus it
            await prefsWindow.show();
            await prefsWindow.setFocus();
          }
        },
      }),
      await MenuItem.new({
        text: "Quit Keel",
        action: async () => {
          await exit(0);
        },
      }),
    ],
  });
}
