import React from "react";
import ReactDOM from "react-dom/client";
import { ServiceProvider } from "./ui/hooks/useServices";
import { ThemeProvider } from "./ui/components/ThemeProvider";
import { App } from "./ui/App";
import { bootstrap } from "./bootstrap";

/**
 * Application Entry Point
 *
 * Bootstrap sequence:
 * 1. Initialize ServiceContainer (Tauri Store + adapters)
 * 2. Request notification permissions
 * 3. Hydrate active session from store
 * 4. Render app with ServiceProvider
 */

bootstrap()
  .then((container) => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <ThemeProvider>
          <ServiceProvider container={container}>
            <App />
          </ServiceProvider>
        </ThemeProvider>
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error("❌ Failed to bootstrap application:", error);

    // Show error to user
    document.getElementById("root")!.innerHTML = `
      <div style="padding: 24px; max-width: 600px; margin: 50px auto; text-align: center;">
        <h1 style="color: #C00;">Failed to start keel</h1>
        <p style="color: #666; margin: 16px 0;">An error occurred during initialization:</p>
        <pre style="background: #F5F5F4; padding: 16px; border-radius: 8px; text-align: left; overflow-x: auto;">${error}</pre>
        <p style="color: #666; margin-top: 16px;">Please restart the application.</p>
      </div>
    `;
  });
