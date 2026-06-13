/**
 * Game sense — emits game_finished when a finished-game marker appears.
 * "A game ended" has no generic DOM shape, so this sense only arms when
 * a site adapter supplies the page-specific probes (adapters.ts — data,
 * not architecture).
 */

import { classifyGameResult, type SiteAdapter } from "../adapters";
import { sendSensorEvent } from "../send";

export function armGameSense(adapter: SiteAdapter): void {
  let modalVisible = false;

  const check = (): void => {
    const modal = document.querySelector(adapter.gameOverSelector);
    if (modal !== null && !modalVisible) {
      modalVisible = true;
      const title =
        modal.querySelector(adapter.resultTitleSelector)?.textContent?.trim() ??
        "";
      sendSensorEvent("game_finished", { result: classifyGameResult(title) });
    } else if (modal === null) {
      modalVisible = false;
    }
  };

  // Catch a modal already in the DOM at arm time (the sense may arm after
  // the game finished), then watch for future ones.
  check();
  new MutationObserver(check).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
