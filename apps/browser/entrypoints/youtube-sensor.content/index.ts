/**
 * YouTube sensor — video playback completions (observe tier).
 *
 * DOM knowledge inherited from the retired watch-time signal: <video>
 * elements appear/replace across SPA navigations, so a body-level
 * MutationObserver re-attaches listeners (WeakSet dedupes). Emits
 * `video_started` / `video_ended` — whether they persist is decided by
 * the background's watchlist gate, not here.
 */

import { sendSensorEvent } from "@/modules/sensors/send";

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  main() {
    const wired = new WeakSet<HTMLVideoElement>();

    const wire = (video: HTMLVideoElement): void => {
      if (wired.has(video)) {
        return;
      }
      wired.add(video);
      video.addEventListener("play", () => {
        sendSensorEvent("video_started", {
          seconds: Math.round(video.duration),
        });
      });
      video.addEventListener("ended", () => {
        sendSensorEvent("video_ended", {
          seconds: Math.round(video.duration),
        });
      });
    };

    const wireAll = (): void => {
      for (const video of document.querySelectorAll("video")) {
        wire(video);
      }
    };

    wireAll();
    new MutationObserver(wireAll).observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
