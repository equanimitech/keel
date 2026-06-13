import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent } from "@keel/ui";
import {
  buildBrowserEvent,
  startOfLocalDay,
  tallyCompletionsSince,
  type CompletionTally,
} from "@/modules/activity/events";
import {
  appendEvent,
  countEvents,
  readEventsSince,
} from "@/modules/activity/log";
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
  const [domains, setDomains] = useState<readonly string[] | null>(null);
  const [today, setToday] = useState<CompletionTally | null>(null);
  const [panicLogged, setPanicLogged] = useState(false);
  const version = browser.runtime.getManifest().version;

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
      .then(setDomains)
      .catch(() => setDomains(null));
    // Only today's slice, via the ts index — never the whole log.
    readEventsSince(startOfLocalDay(Date.now()))
      .then((events) => setToday(tallyCompletionsSince(events, startOfLocalDay(Date.now()))))
      .catch(() => setToday(null));
  }, []);

  return (
    <div className="popup-root">
      <header className="popup-header">
        <h1>keel</h1>
        <div className="popup-header-meta">
          <Badge variant="secondary">observing</Badge>
          <span className="popup-version">v{version}</span>
        </div>
      </header>

      <Card>
        <CardContent className="popup-stats">
          <div className="popup-today-label">Today, keel noticed</div>
          <div className="popup-today">
            <div className="popup-today-item">
              <span className="popup-stat-value">
                {today === null ? "—" : today.videos}
              </span>
              <span className="popup-stat-label">videos</span>
            </div>
            <div className="popup-today-item">
              <span className="popup-stat-value">
                {today === null ? "—" : today.games}
              </span>
              <span className="popup-stat-label">games</span>
            </div>
            <div className="popup-today-item">
              <span className="popup-stat-value">
                {today === null ? "—" : today.posts}
              </span>
              <span className="popup-stat-label">posts</span>
            </div>
          </div>
          <div className="popup-subtotals">
            {eventCount === null ? "—" : eventCount.toLocaleString()} events ·{" "}
            {domains === null ? "—" : domains.length} domains — all time
          </div>
        </CardContent>
      </Card>

      <div className="popup-domains">
        <div className="popup-domains-label">Deep-sensed</div>
        {domains === null || domains.length === 0 ? (
          <p className="popup-domains-empty">
            None yet — add domains on Manage.
          </p>
        ) : (
          <div className="popup-domain-chips">
            {domains.map((domain) => (
              <span key={domain} className="popup-domain-chip">
                {domain}
              </span>
            ))}
          </div>
        )}
      </div>

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
