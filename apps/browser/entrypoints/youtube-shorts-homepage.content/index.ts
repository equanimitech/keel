import { shieldEnabled } from "@/utils/storage";
import { youtubeShortsHomepage } from "@/modules/shields/youtube-shorts-homepage/definition";
import "./style.css";

/**
 * Content script: Shorts Homepage Removal
 *
 * Pure CSS shield — all hiding rules are in style.css, scoped under
 * the active class. This JS only manages adding/removing the class.
 */

const CSS_CLASS = `keel-${youtubeShortsHomepage.id}-active`;
const enabled = shieldEnabled(youtubeShortsHomepage.id, youtubeShortsHomepage.defaultEnabled);

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));
  },
});

function toggle(on: boolean): void {
  document.documentElement.classList.toggle(CSS_CLASS, on);
}
