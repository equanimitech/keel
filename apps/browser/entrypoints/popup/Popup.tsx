import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent } from "@keel/ui";
import { buildBrowserEvent } from "@/modules/activity/events";
import { appendEvent, countEvents } from "@/modules/activity/log";
import { observeDomains } from "@/modules/watchlist/store";

/**
 * Popup — observability status, nothing else.
 *
 * keel browser observes (taxonomy events + watchlist sensors); it does
 * not intervene. Management (watchlist, drogue blocklist, log export)
 * lives on the manage page.
 */
export function Popup() {
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [observed, setObserved] = useState<number | null>(null);
  const [panicLogged, setPanicLogged] = useState(false);

  // The old self-invoked cooldowns, reborn as pure observation: a
  // panic press is a self-anchored vulnerability label (the strongest
  // ground truth the log can carry). It logs; it blocks nothing.
  const logPanic = (): void => {
    void appendEvent(
      buildBrowserEvent({
        id: crypto.randomUUID(),
        kind: "panic_pressed",
        ts: Date.now(),
        sessionId: "",
      })
    ).then(() => setPanicLogged(true));
  };

  useEffect(() => {
    countEvents()
      .then(setEventCount)
      .catch(() => setEventCount(null));
    observeDomains
      .getValue()
      .then((domains) => setObserved(domains.length))
      .catch(() => setObserved(null));
  }, []);

  return (
    <div className="popup-root">
      <header className="popup-header">
        <h1>keel</h1>
        <Badge variant="secondary">observing</Badge>
      </header>

      <Card>
        <CardContent className="popup-stats">
          <div className="popup-stat">
            <span className="popup-stat-value">
              {eventCount === null ? "—" : eventCount.toLocaleString()}
            </span>
            <span className="popup-stat-label">events in the local log</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-value">
              {observed === null ? "—" : observed}
            </span>
            <span className="popup-stat-label">watchlist domains (deep sensors)</span>
          </div>
        </CardContent>
      </Card>

      <p className="popup-note">
        Everything stays on this machine. Raw events, domains only.
      </p>

      <Button variant="secondary" onClick={logPanic} disabled={panicLogged}>
        {panicLogged ? "noted — it's in the log" : "step back (log this moment)"}
      </Button>

      <Button
        onClick={() => {
          void browser.tabs.create({
            url: browser.runtime.getURL("/manage.html"),
          });
        }}
      >
        Manage
      </Button>
    </div>
  );
}
