import { shieldEnabled } from "@/utils/storage";
import { youtubeSidebarRecs } from "@/modules/shields/youtube-sidebar-recs/definition";
import "./style.css";

/**
 * Content script: Sidebar Recommendations Hide
 *
 * Pure CSS shield — hides #secondary on watch pages.
 */

const CSS_CLASS = `keel-${youtubeSidebarRecs.id}-active`;
const enabled = shieldEnabled(youtubeSidebarRecs.id, youtubeSidebarRecs.defaultEnabled);

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
