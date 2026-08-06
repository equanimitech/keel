import { useEffect, useState } from "react";
import { armBreak, type BreakTarget } from "@/modules/friction/cooldown/arm";
import { cooldownNextLapse } from "@/modules/friction/cooldown/store";
import { breakTarget } from "@/modules/friction/policy/store";

/**
 * Popup — one gesture.
 *
 * Everything else that used to live here (event counts, "videos / games /
 * posts" tallies, the domain chip cloud, an "observing" badge) was removed
 * 2026-08-06: it was status about the tool rather than help for the person, and
 * a wall of domain chips is the wrong unit — nobody thinks in domains, they
 * think in areas of their life.
 *
 * The button is shaped against System 1: no confirmation, no duration picker,
 * no countdown. Friction belongs on the temptation, never on the reach for
 * help. It names the areas it pauses, because that is the sentence you are
 * actually saying — not the domain list that implements it.
 *
 * History and configuration live on the Areas page, where your own data is
 * what you sort.
 */
function formatUntil(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function Popup() {
  const [target, setTarget] = useState<BreakTarget | null>(null);
  const [until, setUntil] = useState<number | null>(null);

  useEffect(() => {
    breakTarget.getValue().then(setTarget).catch(() => setTarget(null));
    cooldownNextLapse().then(setUntil).catch(() => setUntil(null));
  }, []);

  const take = (): void => {
    void armBreak("popup").then((r) => setUntil(r.until));
  };

  const onBreak = until !== null;
  const areas = target?.areas ?? [];

  // The only colour in the interface, and it names an area rather than a
  // sentiment — the break reads red because Entertainement is red, not because
  // "destructive". Stone when no area carries one (zenborg design grammar).
  const accent = areas.find((a) => a.color)?.color;

  return (
    <div
      className="popup-root"
      style={accent === undefined ? undefined : ({ "--area": accent } as React.CSSProperties)}
    >
      <header className="popup-header">
        <h1>keel</h1>
      </header>

      {onBreak ? (
        <div className="popup-resting">
          <p className="popup-resting-title">On a break</p>
          <p className="popup-resting-until">until {formatUntil(until)}</p>
          <p className="popup-resting-areas">
            {areas.map((a) => `${a.emoji} ${a.name}`).join(" · ")} paused
          </p>
        </div>
      ) : (
        <>
          <button className="popup-break" onClick={take} disabled={areas.length === 0}>
            Take a break
          </button>
          <p className="popup-break-sub">
            {areas.length === 0
              ? "No areas set up yet — open Areas to sort your sites."
              : `2 hours away from ${areas.map((a) => `${a.emoji} ${a.name}`).join(" · ")}`}
          </p>
        </>
      )}

      <button
        className="popup-areas-link"
        onClick={() => {
          void browser.tabs.create({ url: browser.runtime.getURL("/manage.html") });
        }}
      >
        Areas
      </button>

      <p className="popup-note">Everything stays on this machine.</p>
    </div>
  );
}
