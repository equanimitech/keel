# iOS activity via Shortcuts event-push

- The phone produces, keel-on-Mac consumes. Apple seals iOS activity data on-device — there is no Mac→iPhone query, and the Screen Time API (DeviceActivity/FamilyControls) can *render* usage in a sandboxed extension but cannot *export* the numbers. So you can't reach out; the phone has to push.
- Loggable path with no Xcode and no app: iOS **Shortcuts automations** (app-open, Focus-change, location, charging) append a timestamped event to a file in **iCloud Drive** that keel-on-Mac tails.
- Fits observability-first dead-on: phone emits raw events, keel logs them — no inference, no intervention. The actuator use (keel *sets* Focus/DND) belongs to the retired intervention layer; stay read-only.
- Sits alongside the open sensors-restart pitches as a *candidate sensor* — the cheapest phone-side foothold keel could ever stand up.
- Heavier alternatives if this proves too thin: a **Focus Filter mini-app** (coarse intent only) or a full **keel iOS app** (richest, but its Screen Time integration still can't feed keel numbers — back to event-push anyway).

- Questions:
  - Does it have teeth? ~20-min spike: confirm the Shortcuts → iCloud-Drive → Mac loop fires **reliably and silently** (no per-run confirmation tap on iOS app-launch automations).
  - What's the event vocabulary worth logging — just app-open + Focus-change, or also location/charging/unlock?
  - iCloud Drive append vs. a CloudKit/webhook sink — does file-tail hold up under rapid events?

Don't shape yet.
