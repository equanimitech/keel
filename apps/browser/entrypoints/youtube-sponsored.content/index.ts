import { shieldEnabled } from "@/utils/storage";
import { youtubeSponsored } from "@/modules/shields/youtube-sponsored/definition";
import "./style.css";

/**
 * Content script: Sponsored Content Removal
 *
 * Pure CSS shield — hides ad slots, promoted videos, and masthead ads.
 */

const CSS_CLASS = `keel-${youtubeSponsored.id}-active`;
const enabled = shieldEnabled(youtubeSponsored.id, youtubeSponsored.defaultEnabled);

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
