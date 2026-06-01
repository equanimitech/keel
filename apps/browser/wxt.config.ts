import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "dist",
  manifest: {
    name: "keel",
    // Stable extension ID: Chromium derives a deterministic ID from this
    // public key, so chrome.storage contents and granted permissions survive
    // every rebuild, reload, and browser restart. Public key is safe to commit;
    // private key lives gitignored at repo-root .keys/keel.pem. See
    // docs/deploy-browser.md and the Slice A design doc.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr4PXcGQDz4++ZW7uNr5Y+T1GCHEid5cwAReGiiLBNyjhO5bhM1PqzZ4fYrrzhMY21N1I7htN1Pp/bhuoqgcl0W+fvtzMicQjrQSaCM4PmSPlZbxg1mETT1EPLGWSKiy1NRj8NXAm6QxKGQNVaNNLH+raMz7zJL58K8lB1VLiwkPpKdAp0qMZbHfjlXBr/qoVlCrZwpQ30kWB1TtEj0x0GXISOjAOEIIXu8PHzf4pjnAy9AeWJxsBRSr0WxekdsWGLYn8Do5HEVM42WWRUERn7eMjrauDLEcaoXZh4mVjBPCrzF76/Inby6cltdZCIBLiHJBfPrtPWjYeF3SU4pM6cwIDAQAB",
    description:
      "Stopping cues for the internet. Modular attention shields for YouTube, LinkedIn, Chess.com and more.",
    permissions: ["storage", "tabs", "activeTab"],
    icons: {
      "16": "/icons/icon-16.png",
      "32": "/icons/icon-32.png",
      "48": "/icons/icon-48.png",
      "128": "/icons/icon-128.png",
    },
  },
});
