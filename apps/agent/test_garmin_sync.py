import unittest
from datetime import date

from garmin_sync import (activity_event, sleep_event, new_activities,
                         sleep_dates, log_file_name, event_id)

# Field NAMES and types mirror garminconnect as of 2026-08-07; every VALUE below
# is invented. Nothing here is a real record — this file is public, and the
# fields it exercises (place name, coordinates, sleep architecture) are exactly
# the ones garmin_sync exists to strip. A fixture that leaked them would defeat
# the tests written under it.
ACTIVITY = {
    "activityId": 1000000001,
    "activityName": "Somewhere Soccer/Football",
    "activityType": {"typeId": 215, "typeKey": "soccer"},
    "eventType": {"typeId": 9, "typeKey": "uncategorized"},
    "startTimeGMT": "2026-01-05 10:00:00",
    "startTimeLocal": "2026-01-05 11:00:00",
    "duration": 7200.0,
    "distance": 8000.0,
    "calories": 1200.0,
    "averageHR": 140.0,
    "steps": 9000,
    "locationName": "Somewhere",
    "startLatitude": 12.34,
    "startLongitude": 56.78,
    "manualActivity": False,
}

SLEEP = {
    "calendarDate": "2026-01-05",
    "sleepTimeSeconds": 28800,
    "sleepEndTimestampGMT": 1767598200000,
    "deepSleepSeconds": 5400,
    "lightSleepSeconds": 18000,
    "remSleepSeconds": 5400,
    "awakeSleepSeconds": 900,
    "avgSleepStress": 15.0,
    "sleepScores": {"overall": {"value": 85, "qualifierKey": "GOOD"}},
}


class TestActivityEvent(unittest.TestCase):
    def test_maps_core_fields(self):
        e = activity_event(ACTIVITY)
        self.assertEqual(e["surface"], "garmin")
        self.assertEqual(e["kind"], "workout_completed")
        self.assertEqual(e["sessionId"], "")
        self.assertEqual(e["payload"]["activityType"], "soccer")
        self.assertEqual(e["ts"], 1767607200000)          # start (GMT), not end
        self.assertEqual(e["durationMs"], 7200000)

    def test_drops_every_location_bearing_field(self):
        payload = activity_event(ACTIVITY)["payload"]
        for leaked in ("activityName", "locationName", "startLatitude", "startLongitude"):
            self.assertNotIn(leaked, payload)
        self.assertNotIn("Somewhere", str(payload))

    def test_omits_absent_metrics_rather_than_nulling(self):
        bare = {"activityId": 1, "activityType": {"typeKey": "yoga"},
                "startTimeGMT": "2026-01-05 10:00:00", "duration": 600}
        payload = activity_event(bare)["payload"]
        self.assertNotIn("avgHrBpm", payload)
        self.assertNotIn("distanceM", payload)

    def test_no_duration_when_garmin_reports_none(self):
        a = dict(ACTIVITY, duration=None)
        self.assertNotIn("durationMs", activity_event(a))

    def test_unusable_rows_return_none(self):
        self.assertIsNone(activity_event({"activityId": 1}))
        self.assertIsNone(activity_event({"startTimeGMT": "2026-01-05 10:00:00"}))

    def test_id_is_stable_across_runs(self):
        self.assertEqual(activity_event(ACTIVITY)["id"], activity_event(ACTIVITY)["id"])
        self.assertNotEqual(event_id("activity:1"), event_id("sleep:1"))


class TestSleepEvent(unittest.TestCase):
    def test_maps_core_fields(self):
        e = sleep_event(SLEEP)
        self.assertEqual(e["kind"], "sleep_recorded")
        self.assertEqual(e["ts"], 1767598200000)          # sleep END = the completion
        self.assertEqual(e["durationMs"], 28800000)
        self.assertEqual(e["payload"]["sleepScore"], 85)
        self.assertEqual(e["payload"]["deepS"], 5400)

    def test_absent_night_is_not_a_zero_night(self):
        self.assertIsNone(sleep_event(None))
        self.assertIsNone(sleep_event({}))
        self.assertIsNone(sleep_event(dict(SLEEP, sleepTimeSeconds=0)))
        self.assertIsNone(sleep_event(dict(SLEEP, sleepEndTimestampGMT=None)))


class TestCursor(unittest.TestCase):
    def test_high_water_mark_filters_and_orders(self):
        rows = [{"activityId": 5}, {"activityId": 3}, {"activityId": 9}]
        self.assertEqual([a["activityId"] for a in new_activities(rows, 3)], [5, 9])

    def test_first_run_takes_everything(self):
        self.assertEqual(len(new_activities([{"activityId": 5}], None)), 1)

    def test_backdated_manual_entry_still_caught(self):
        # Manual entries get a fresh (higher) id even when backdated, which is
        # exactly why the mark is on id and not on start time.
        self.assertEqual(len(new_activities([{"activityId": 99}], 98)), 1)

    def test_sleep_window_skips_already_logged(self):
        got = sleep_dates(date(2026, 1, 6), ["2026-01-05"], 3)
        self.assertEqual(got, ["2026-01-06", "2026-01-04"])

    def test_missed_night_does_not_stall_the_window(self):
        # The night of the 5th was never logged (watch off). A watermark would
        # be stuck there forever; the window keeps offering it.
        self.assertIn("2026-01-05", sleep_dates(date(2026, 1, 8), ["2026-01-08"], 5))


class TestLogFile(unittest.TestCase):
    def test_named_by_local_date_and_surface(self):
        self.assertTrue(log_file_name(1767598200000).endswith(".garmin.jsonl"))
        self.assertRegex(log_file_name(1767598200000), r"^\d{4}-\d{2}-\d{2}\.garmin\.jsonl$")


if __name__ == "__main__":
    unittest.main()
