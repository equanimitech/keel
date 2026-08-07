# Phone pickup sensor via iOS Shortcuts

- iOS gives no read access to Screen Time. Apple's Screen Time API
  (FamilyControls / DeviceActivity, iOS 15+) needs a special entitlement and
  renders inside a privacy-preserving extension that cannot pass app names or
  durations back out — even a native app can't exfiltrate your own numbers.
  So the phone can't be *queried*; it can only be made to *emit*.
- Shortcuts personal automations do have App → Is Opened / Is Closed triggers.
  That's an event stream you author yourself: one automation per watched app,
  Run Immediately, notifications off, appending a line to a JSONL file in
  iCloud Drive. The Mac tails that file into `~/.keel/log/`.
- The signal is **opens, not minutes** — pickup frequency per app. Plausibly the
  better attention measure anyway: twenty Instagram opens in an afternoon says
  more than the 14 minutes it totals. Drift is reaching, not consuming.
- Honours the event-taxonomy contract as-is: opens are bare events with no
  `durationMs`. The Is Closed trigger would give spans, but it's ambiguous when
  the phone locks or you switch between two watched apps — don't fabricate the
  interval.
- Payload stays inside the privacy posture: app name + timestamp, nothing else.
  No URLs, no content.
- Same peripheral-sensor shape as the Garmin poller — a second body of evidence
  the tide read-side can consume. See
  [2026-07-05-garmin-as-equanimitech-peripheral.md] for the precedent.
- Scope discipline: 5–8 apps that actually pull you. Enumerating the whole
  home screen is setup tax for signal nobody reads.

- Questions:
  - Does the App trigger with *multiple* apps selected pass which app fired, or
    does it genuinely need one automation per app?
  - iCloud Drive sync lag and silent Shortcuts-automation failures — tolerable
    for a log, disqualifying for a gate. Does anything downstream want this
    live?
  - Alternative worth pricing: Screen Time "Share Across Devices" + Full Disk
    Access + SQL against the undocumented Apple DB. Richer and retroactive,
    but the schema is unversioned and breaks on OS updates. Checked
    2026-08-07 — no local store present today (`Knowledge/` is TCC-locked,
    `com.apple.remotemanagementd/` absent), so sync is currently off.

Don't shape yet.
