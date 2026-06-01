import { shieldEnabled } from "@/utils/storage";
import { linkedinNotificationBadge } from "@/modules/shields/linkedin-notification-badge/definition";
import "./style.css";

/**
 * Content script: LinkedIn Notification Badge Hide
 *
 * Pure CSS shield — hides notification count badges in the nav bar.
 */

const CSS_CLASS = `keel-${linkedinNotificationBadge.id}-active`;
const enabled = shieldEnabled(
  linkedinNotificationBadge.id,
  linkedinNotificationBadge.defaultEnabled,
);

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
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
