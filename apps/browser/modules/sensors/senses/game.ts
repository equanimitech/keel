/**
 * Game sense — emits game_finished when a finished-game marker appears.
 * "A game ended" has no generic DOM shape, so this sense only arms when
 * a site adapter supplies the page-specific probes (adapters.ts — data,
 * not architecture).
 */

import { firstMatch, gameResult, type SiteAdapter } from "../adapters";
import { sendSensorEvent } from "../send";

export function armGameSense(adapter: SiteAdapter): void {
  let modalVisible = false;

  const check = (): void => {
    const modal = firstMatch(adapter.gameOverSelectors, (selector) =>
      document.querySelector(selector)
    );
    if (modal !== null && !modalVisible) {
      modalVisible = true;
      const title =
        firstMatch(adapter.resultTitleSelectors, (selector) =>
          modal.querySelector(selector)
        )?.textContent?.trim() ?? "";
      // Document-scoped: the win marker sits on the modal HEADER, which is a
      // sibling-or-self of whichever candidate matched above, and the class
      // exists nowhere else on the page.
      const selfWon =
        firstMatch(adapter.selfWonSelectors, (selector) =>
          document.querySelector(selector)
        ) !== null;
      // Only the verdict crosses the boundary — never the title, which
      // carries the opponent's username.
      sendSensorEvent("game_finished", { result: gameResult(selfWon, title) });
    } else if (modal === null) {
      modalVisible = false;
    }
  };

  // Catch a modal already in the DOM at arm time (the sense may arm after
  // the game finished), then watch for future ones. The modal mounts deep
  // inside the board layout, not at body level, so the observer must be
  // subtree-wide; `documentElement` is the fallback for the (WXT-unlikely)
  // document_start injection where <body> does not exist yet.
  check();
  const root = document.body ?? document.documentElement;
  if (root !== null) {
    new MutationObserver(check).observe(root, {
      childList: true,
      subtree: true,
    });
  }
}
