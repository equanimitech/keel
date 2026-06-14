import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  outDir: "dist",
  // React for the extension PAGES (popup, manage). Content scripts stay vanilla.
  modules: ["@wxt-dev/module-react"],
  // Tailwind v4 for page entrypoints; per-entrypoint CSS scopes utilities.
  // Cast: @tailwindcss/vite resolves vite@7 types while wxt bundles vite@6 —
  // the Plugin shapes differ only in an internal `hotUpdate` `this` type
  // (harmless at runtime). A global vite override would break desktop (vite@7).
  vite: () => ({
    plugins: [tailwindcss()] as never,
    // Pin the dep-optimizer to source entrypoints. Without this, Vite's dev
    // scanner also globs the build output (outDir "dist") and ENOENTs on stale
    // dist/*.html mid-rebuild (regression from adding @tailwindcss/vite).
    optimizeDeps: {
      entries: ["entrypoints/**/*.html"],
    },
  }),
  manifest: {
    name: "keel",
    // Stable extension ID: Chromium derives a deterministic ID from this
    // public key, so chrome.storage contents and granted permissions survive
    // every rebuild, reload, and browser restart. Public key is safe to commit;
    // private key lives gitignored at repo-root .keys/keel.pem. See
    // docs/deploy-browser.md and the Slice A design doc.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr4PXcGQDz4++ZW7uNr5Y+T1GCHEid5cwAReGiiLBNyjhO5bhM1PqzZ4fYrrzhMY21N1I7htN1Pp/bhuoqgcl0W+fvtzMicQjrQSaCM4PmSPlZbxg1mETT1EPLGWSKiy1NRj8NXAm6QxKGQNVaNNLH+raMz7zJL58K8lB1VLiwkPpKdAp0qMZbHfjlXBr/qoVlCrZwpQ30kWB1TtEj0x0GXISOjAOEIIXu8PHzf4pjnAy9AeWJxsBRSr0WxekdsWGLYn8Do5HEVM42WWRUERn7eMjrauDLEcaoXZh4mVjBPCrzF76/Inby6cltdZCIBLiHJBfPrtPWjYeF3SU4pM6cwIDAQAB",
    description:
      "See where your attention goes and steer away from compulsion, toward what makes you flourish. Always private, on your device.",
    // Sovereignty by permission-minimalism (the manifest IS the privacy
    // statement). Note what is DELIBERATELY absent:
    //   • no host_permissions — keel injects no scripts via host grants
    //   • declarativeNetRequest, NOT declarativeNetRequestWithHostAccess and
    //     NOT webRequest — keel blocks by static rule and literally cannot read
    //     request contents, URLs-as-data, or page bodies.
    //   • storage is local (chrome.storage.local) — no sync, no server.
    // Only egress anywhere in keel is the user's own BYOK authoring call.
    // "idle" powers the activity writer's browser_idle/browser_active
    // events (120s detection interval) — still no host permissions.
    //   • nativeMessaging connects ONLY to the keel native host registered in
    //     the OS, gated to this extension by the host manifest's
    //     allowed_origins. It relays domains and timings to ~/.keel/log, never
    //     page content or URLs, and grants no web access. It is the relay that
    //     lets the browser writer reach the shared substrate.
    permissions: ["storage", "tabs", "activeTab", "declarativeNetRequest", "idle", "alarms", "nativeMessaging"],
    // Single shared instance in incognito so the porn Drogue's block holds
    // there too (where porn is most often browsed). The user must still flip
    // "Allow in incognito" once — see README. Shared storage = one source of
    // truth for shields/cooldowns across normal + incognito.
    incognito: "spanning",
    // The keel block page must be reachable as a redirect target from the
    // porn Drogue's DNR rules.
    web_accessible_resources: [
      {
        resources: ["block.html"],
        matches: ["<all_urls>"],
      },
    ],
    // No static rulesets. The blocklist Drogue uses DNR *dynamic* rules synced
    // from chrome.storage.local (modules/drogues/blocklist + background.ts) —
    // user- and Claude-editable, fully legible. The `declarativeNetRequest`
    // permission above is what those dynamic rules need.
    icons: {
      "16": "/icons/icon-16.png",
      "32": "/icons/icon-32.png",
      "48": "/icons/icon-48.png",
      "128": "/icons/icon-128.png",
    },
  },
});
