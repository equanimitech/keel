import { useEffect, type ReactNode } from "react";

/**
 * ThemeProvider — sets `data-keel-theme` on the document root so @keel/ui
 * tokens resolve. System-aware: follows `prefers-color-scheme` and updates
 * live. Per the design-system alignment spec, theme preference is
 * per-surface, default = system.
 *
 * NOTE: a persisted user override (light/dark/system) belongs in the desktop
 * config (Tauri plugin-store + AppConfig schema); wired in a follow-up so this
 * stays decoupled from the config layer. For now: system-only.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (dark: boolean) => {
      document.documentElement.setAttribute(
        "data-keel-theme",
        dark ? "dark" : "light"
      );
    };
    apply(media.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return <>{children}</>;
}
