/**
 * chess.com sensor — game completions (observe tier).
 *
 * DOM knowledge inherited from the retired post-game cooldown shield:
 * `.game-over-modal-container` appearing = game finished;
 * `.header-title-component` text classifies the result. Emits one
 * `game_finished` per modal appearance.
 */

import { sendSensorEvent } from "@/modules/sensors/send";

const MODAL_SELECTOR = ".game-over-modal-container";
const TITLE_SELECTOR = ".header-title-component";

function classifyResult(title: string): "win" | "loss" | "draw" | "unknown" {
  const t = title.toLowerCase();
  if (t.includes("you won")) {
    return "win";
  }
  if (t.includes("you lost")) {
    return "loss";
  }
  if (t.includes("draw")) {
    return "draw";
  }
  return "unknown";
}

export default defineContentScript({
  matches: ["*://*.chess.com/*"],
  main() {
    let modalVisible = false;

    const check = (): void => {
      const modal = document.querySelector(MODAL_SELECTOR);
      if (modal !== null && !modalVisible) {
        modalVisible = true;
        const title =
          modal.querySelector(TITLE_SELECTOR)?.textContent?.trim() ?? "";
        sendSensorEvent("game_finished", { result: classifyResult(title) });
      } else if (modal === null) {
        modalVisible = false;
      }
    };

    new MutationObserver(check).observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
