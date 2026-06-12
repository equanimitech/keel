/**
 * Video sense — generic over any page that plays HTML5 video.
 * Type-level knowledge: <video> elements + SPA-safe re-wiring.
 * Emits video_started / video_ended (completion grammar).
 */

import { sendSensorEvent } from "../send";

export function armVideoSense(): void {
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
}
