import { observer } from "@legendapp/state/react";
import { usePreferences } from "../hooks/usePreferences";
import { ShortcutRecorder } from "../components/ShortcutRecorder";

/**
 * Preferences Pane Component (Presenter Layer)
 *
 * Pure presentation - displays settings and handles user interactions.
 * Business logic delegated to usePreferences hook.
 */
export const PreferencesPane = observer(function PreferencesPane() {
  const {
    defaultSessionDuration,
    updateDefaultSessionDuration,
    shortcuts,
    updateShortcut,
  } = usePreferences();

  return (
    <div className="p-6 font-sans">
      <div className="flex justify-between items-center mb-6">
        <h1 className="m-0 text-2xl font-semibold">Preferences</h1>
      </div>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="text-base font-semibold mb-3">General</h2>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span>Launch at login</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span>Show in menu bar only</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-3">Sessions</h2>
          <div className="flex flex-col gap-3">
            <label>
              <span className="block mb-1 text-sm">
                Default session duration
              </span>
              <select
                className="px-3 py-1.5 rounded border border-gray-300"
                defaultValue={defaultSessionDuration}
                onChange={(e) =>
                  updateDefaultSessionDuration(Number(e.target.value))
                }
              >
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-3">Keyboard Shortcuts</h2>
          <div className="flex flex-col gap-3">
            <label>
              <span className="block mb-1 text-sm text-gray-600">
                Capture Waypoint
              </span>
              <ShortcutRecorder
                value={shortcuts.captureModal}
                onChange={(value) => updateShortcut("captureModal", value)}
                placeholder="Click to record shortcut..."
              />
            </label>
            <label>
              <span className="block mb-1 text-sm text-gray-600">
                Start Session
              </span>
              <ShortcutRecorder
                value={shortcuts.startSession}
                onChange={(value) => updateShortcut("startSession", value)}
                placeholder="Click to record shortcut..."
              />
            </label>
            <p className="text-xs text-gray-500 italic">
              Shortcuts auto-save. App reloads when you change them.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-3">About</h2>
          <div className="text-sm text-gray-600">
            <p className="my-1">keel v0.1.0</p>
            <p className="my-1">An attention compass</p>
          </div>
        </section>
      </div>
    </div>
  );
});
