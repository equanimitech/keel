/**
 * Video sense — generic over any page that plays HTML5 video.
 * Type-level knowledge: <video> elements + SPA-safe re-wiring.
 * Emits video_started / video_ended (completion grammar) plus the debounced
 * video_paused / video_resumed pair (the pure state machine lives in ../events).
 */

import {
  INITIAL_PLAYBACK,
  PAUSE_SETTLE_MS,
  finiteSeconds,
  playbackTransition,
  videoCompleted,
  type PlaybackInput,
  type PlaybackState,
} from "../events";
import { sendSensorEvent } from "../send";

export function armVideoSense(): void {
  // LOAD-BEARING ASSUMPTION: platforms SWAP the <video> element per video
  // (YouTube does — each new video gets a fresh element → fresh wire()).
  // Dedupe is therefore keyed per element: one started + one ended each.
  // A platform that REUSES one element across videos would degrade to a
  // single started+ended for the whole session (once:true + the `ended`
  // WeakSet suppress every subsequent video). No clean hostile-page signal
  // for per-video identity exists, so this is the pragmatic boundary.
  const wired = new WeakSet<HTMLVideoElement>();
  const ended = new WeakSet<HTMLVideoElement>();

  // Completion fires at most once per element — from whichever trigger
  // (the ≥90% heuristic or the native `ended`) reaches it first.
  const emitEnded = (video: HTMLVideoElement): void => {
    if (ended.has(video)) {
      return;
    }
    ended.add(video);
    sendSensorEvent("video_ended", {
      seconds: finiteSeconds(video.currentTime),
    });
  };

  const wire = (video: HTMLVideoElement): void => {
    if (wired.has(video)) {
      return;
    }
    wired.add(video);

    // One "started" per video element. `playing` (not `play`) fires after
    // buffering resolves, and `{ once: true }` collapses YouTube's
    // play/seek/ad-transition storm to a single emission per element.
    // `seconds` is the start position (≈0 fresh, >0 on resume), not the
    // total length — duration is often NaN at this moment.
    video.addEventListener(
      "playing",
      () => {
        sendSensorEvent("video_started", {
          seconds: finiteSeconds(video.currentTime),
        });
      },
      { once: true }
    );

    // Completion grammar: platform players rarely let native `ended` fire
    // (autoplay swaps the element; Shorts loop by resetting currentTime),
    // so treat ≥90% watched as the completion. `ended` stays wired as a
    // supplementary trigger for ordinary HTML5 video; emitEnded dedupes.
    video.addEventListener("timeupdate", () => {
      if (videoCompleted(video.currentTime, video.duration)) {
        emitEnded(video);
      }
    });
    video.addEventListener("ended", () => {
      emitEnded(video);
    });

    // Pause/resume grammar. A raw `pause` fires on ad breaks, scrubbing, and
    // autoplay swaps, so the pure machine only "settles" into video_paused
    // after the element stays paused past PAUSE_SETTLE_MS; a `play` before
    // then is a transient. A play after a settled pause emits video_resumed.
    // The setTimeout is the only impurity — it feeds a `tick` to the machine.
    let playback: PlaybackState = INITIAL_PLAYBACK;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const feedPlayback = (input: PlaybackInput): void => {
      const result = playbackTransition(playback, input);
      playback = result.state;
      if (result.emit !== null) {
        sendSensorEvent(result.emit, { seconds: finiteSeconds(video.currentTime) });
      }
    };
    video.addEventListener("pause", () => {
      const t = Date.now();
      feedPlayback({ type: "pause", t });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(
        () => feedPlayback({ type: "tick", t: t + PAUSE_SETTLE_MS }),
        PAUSE_SETTLE_MS
      );
    });
    video.addEventListener("play", () => {
      clearTimeout(settleTimer);
      feedPlayback({ type: "play", t: Date.now() });
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
