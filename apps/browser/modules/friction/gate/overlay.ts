/**
 * The gate surface — an in-page interstitial.
 *
 * Rendered in a closed shadow root so page CSS cannot restyle it and page JS
 * cannot query it away. It is an overlay rather than a DNR redirect because
 * DNR's `redirect` action requires host permissions, and keel ships none —
 * that absence is the structural guarantee it cannot read your browsing
 * (see drogues/blocklist/sync.ts).
 *
 * Media is paused while the gate is up. Without that, an interstitial over a
 * playing video is decorative: the audio continues, the watch continues, and
 * the only thing interrupted is your view of it. Pausing is what makes it a
 * stopping cue rather than a notification.
 */

const HOST_ID = "keel-gate-host";

export interface GateOptions {
  readonly prompt: string;
  readonly dwellMinutes: number;
  readonly proceedLabel: string;
  readonly abortLabel: string;
}

/** Pause every playing media element; returns the ones actually paused. */
function pauseMedia(): readonly HTMLMediaElement[] {
  const paused: HTMLMediaElement[] = [];
  for (const el of document.querySelectorAll("video, audio")) {
    const media = el as HTMLMediaElement;
    if (!media.paused) {
      media.pause();
      paused.push(media);
    }
  }
  return paused;
}

const STYLE = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(12, 14, 16, 0.92);
  display: flex; align-items: center; justify-content: center;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  animation: fade 220ms ease-out;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.card {
  max-width: 30rem; padding: 2.5rem; text-align: center; color: #f4f4f5;
}
.dwell {
  font-size: 0.8125rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: #a1a1aa; margin: 0 0 1.25rem;
}
.prompt {
  font-size: 1.5rem; line-height: 1.35; font-weight: 500; margin: 0 0 2rem;
}
.actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
button {
  font: inherit; font-size: 0.9375rem; padding: 0.6875rem 1.25rem;
  border-radius: 0.5rem; cursor: pointer; border: 1px solid transparent;
}
.proceed { background: transparent; border-color: #52525b; color: #e4e4e7; }
.proceed:hover { border-color: #a1a1aa; }
.abort { background: #f4f4f5; color: #18181b; }
.abort:hover { background: #ffffff; }
@media (prefers-color-scheme: light) {
  .backdrop { background: rgba(250, 250, 250, 0.94); }
  .card { color: #18181b; }
  .dwell { color: #71717a; }
  .proceed { border-color: #d4d4d8; color: #3f3f46; }
  .abort { background: #18181b; color: #fafafa; }
}
`;

/**
 * Show the gate. Resolves when the user chooses: `true` to proceed, `false` to
 * leave. There is no third outcome — no Escape key, no backdrop click, no
 * timeout. A gate you can dismiss without deciding is one you learn to swat.
 */
export function showGate(options: GateOptions): Promise<boolean> {
  const existing = document.getElementById(HOST_ID);
  if (existing !== null) {
    return Promise.resolve(true); // Already up; never stack.
  }

  const paused = pauseMedia();
  const host = document.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "card";

  const dwell = document.createElement("p");
  dwell.className = "dwell";
  dwell.textContent = `${options.dwellMinutes} minutes here today`;

  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.textContent = options.prompt;

  const actions = document.createElement("div");
  actions.className = "actions";

  const proceed = document.createElement("button");
  proceed.className = "proceed";
  proceed.textContent = options.proceedLabel;

  const abort = document.createElement("button");
  abort.className = "abort";
  abort.textContent = options.abortLabel;

  actions.append(proceed, abort);
  card.append(dwell, prompt, actions);
  backdrop.append(card);
  root.append(style, backdrop);
  document.documentElement.append(host);

  // Focus the *abort* affordance: the default action should be the one you'd
  // choose with a clear head, not the one momentum wants.
  abort.focus();

  return new Promise<boolean>((resolve) => {
    const close = (proceeded: boolean): void => {
      host.remove();
      if (proceeded) {
        for (const media of paused) {
          void media.play().catch(() => {
            // Autoplay policy refused the resume — leave it paused.
          });
        }
      }
      resolve(proceeded);
    };
    proceed.addEventListener("click", () => close(true));
    abort.addEventListener("click", () => close(false));
  });
}
