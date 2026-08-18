import unittest
from datetime import date

from garmin_sync import (activity_event, sleep_event, new_activities,
                         sleep_dates, log_file_name, event_id,
                         body_sample_events, body_battery_change_events,
                         readiness_event, day_summary_event, stillness_metrics,
                         is_stillness, stress_pairs, body_battery_pairs,
                         seen_keys, remember, window_dates, day_is_over,
                         BINS_PER_HOUR, STREAM_KEEP)

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



# Every VALUE below is invented, same discipline as the fixtures above: this
# file is public and the streams it exercises (stress, HRV, readiness) are
# precisely the ones the kairos guard exists to keep out of a transcript.

def _hour_ms(date_str, hour, minute=0):
    """Local epoch ms, mirroring _local_hour_bounds so fixtures stay tz-honest
    wherever the suite runs."""
    from datetime import datetime as _dt
    return int(_dt.strptime(date_str, "%Y-%m-%d")
               .replace(hour=hour, minute=minute).timestamp() * 1000)


DAY = "2026-01-05"
# Two readings inside hour 9, one inside hour 10, plus both sentinels.
STRESS_DTO = {
    "calendarDate": DAY,
    "stressValuesArray": [
        [_hour_ms(DAY, 9, 1), 20], [_hour_ms(DAY, 9, 3), 30],
        [_hour_ms(DAY, 9, 20), 60],
        [_hour_ms(DAY, 10, 1), 45],
        [_hour_ms(DAY, 11, 1), -1],   # no reading
        [_hour_ms(DAY, 11, 5), -2],   # in an activity
    ],
    "bodyBatteryValuesArray": [
        [_hour_ms(DAY, 9, 2), "MEASURED", 80, 1.0],
        [_hour_ms(DAY, 10, 2), "MEASURED", 74, 1.0],
    ],
}

READINESS = {
    "calendarDate": DAY,
    "timestamp": "2026-01-05T07:30:00.0",
    "level": "MODERATE",
    "score": 61,
    "feedbackShort": "MODERATE_SLEEP_HISTORY",
    "sleepScore": 78,
    "recoveryTime": 240,
    "acuteLoad": 310,
    "hrvFactorPercent": 22,
}

HRV = {
    "hrvSummary": {
        "calendarDate": DAY,
        "lastNightAvg": 42,
        "weeklyAvg": 45,
        "status": "BALANCED",
        "feedbackPhrase": "HRV_BALANCED_1",
        "baseline": {"balancedLow": 38, "balancedUpper": 52, "lowUpper": 33},
    }
}

STATS = {
    "totalSteps": 8200,
    "sedentarySeconds": 41000,
    "highlyActiveSeconds": 1800,
    "restingHeartRate": 52,
    "averageStressLevel": 31,
    "bodyBatteryDrainedValue": 55,
}

BB_DAY = {
    "date": DAY,
    "bodyBatteryActivityEvent": [
        {
            "eventType": "sleep",
            "eventStartTimeGmt": "2026-01-05T00:10:00.0",
            "durationInMilliseconds": 7200000,
            "bodyBatteryImpact": 31,
            "shortFeedback": "GOOD_RECOVERY",
        },
        {"eventType": "no_start_time"},
    ],
}


class TestBodySampled(unittest.TestCase):
    def _events(self, seen=()):
        # now = end of the day, so every hour counts as complete
        return body_sample_events(DAY, STRESS_DTO, _hour_ms(DAY, 23, 59), set(seen))

    def test_one_rollup_per_hour_with_data(self):
        got = self._events()
        self.assertEqual([e["payload"]["hour"] for e in got], [9, 10])
        self.assertTrue(all(e["kind"] == "body_sampled" for e in got))
        self.assertTrue(all(e["surface"] == "garmin" for e in got))

    def test_ts_is_hour_end_and_duration_is_the_hour(self):
        nine = self._events()[0]
        self.assertEqual(nine["ts"], _hour_ms(DAY, 10))
        self.assertEqual(nine["durationMs"], 3600000)

    def test_bins_are_fixed_width_and_positional(self):
        bins = self._events()[0]["payload"]["stress"]
        self.assertEqual(len(bins), BINS_PER_HOUR)
        self.assertEqual(bins[0], 25)          # mean of 20 and 30, minutes 1+3
        self.assertEqual(bins[4], 60)          # minute 20 -> bin 4
        self.assertIsNone(bins[1])             # empty bin holds position

    def test_reads_both_body_battery_row_shapes(self):
        self.assertEqual(body_battery_pairs(
            {"bodyBatteryValuesArray": [[1, "MEASURED", 80, 1.0]]})[0][1], 80)
        self.assertEqual(body_battery_pairs(
            {"bodyBatteryValuesArray": [[1, 80]]})[0][1], 80)

    def test_sentinels_are_unknown_not_calm(self):
        # Hour 11 holds only -1 and -2. Mapping those to 0 would invent serenity,
        # so the hour must produce no event at all.
        self.assertNotIn(11, [e["payload"]["hour"] for e in self._events()])
        self.assertEqual(stress_pairs(STRESS_DTO), [
            (_hour_ms(DAY, 9, 1), 20), (_hour_ms(DAY, 9, 3), 30),
            (_hour_ms(DAY, 9, 20), 60), (_hour_ms(DAY, 10, 1), 45)])

    def test_incomplete_hour_is_withheld(self):
        # Polled at 09:30: hour 9 is not over, and writing it now would put
        # different numbers under the same deterministic id an hour later.
        got = body_sample_events(DAY, STRESS_DTO, _hour_ms(DAY, 9, 30), set())
        self.assertEqual(got, [])

    def test_already_written_hour_is_skipped(self):
        got = self._events(seen={f"{DAY}T09"})
        self.assertEqual([e["payload"]["hour"] for e in got], [10])

    def test_id_is_deterministic_per_hour(self):
        self.assertEqual(self._events()[0]["id"], event_id(f"body:{DAY}T09"))


class TestBodyBatteryChanged(unittest.TestCase):
    def test_maps_period_to_a_completion_with_duration(self):
        got = body_battery_change_events(BB_DAY, set())
        self.assertEqual(len(got), 1)          # the row without a start is dropped
        self.assertEqual(got[0]["kind"], "body_battery_changed")
        self.assertEqual(got[0]["durationMs"], 7200000)
        self.assertEqual(got[0]["payload"]["bodyBatteryImpact"], 31)

    def test_drops_feedback_prose(self):
        payload = body_battery_change_events(BB_DAY, set())[0]["payload"]
        self.assertNotIn("shortFeedback", payload)
        self.assertNotIn("GOOD_RECOVERY", str(payload))

    def test_seen_key_suppresses_rewrite(self):
        ts = body_battery_change_events(BB_DAY, set())[0]["ts"]
        self.assertEqual(body_battery_change_events(BB_DAY, {f"bb:{ts}"}), [])


class TestReadiness(unittest.TestCase):
    def test_joins_readiness_with_hrv(self):
        e = readiness_event(READINESS, HRV, set())
        self.assertEqual(e["kind"], "readiness_recorded")
        self.assertEqual(e["payload"]["score"], 61)
        self.assertEqual(e["payload"]["hrvLastNightMs"], 42)
        self.assertEqual(e["payload"]["hrvStatus"], "BALANCED")
        self.assertEqual(e["payload"]["hrvBalancedUpperMs"], 52)

    def test_drops_feedback_prose(self):
        payload = readiness_event(READINESS, HRV, set())["payload"]
        for prose in ("feedbackShort", "feedback", "feedbackPhrase"):
            self.assertNotIn(prose, payload)
        self.assertNotIn("HRV_BALANCED_1", str(payload))

    def test_survives_missing_hrv(self):
        # HRV is a separate call and can 404 on its own; readiness still stands.
        e = readiness_event(READINESS, None, set())
        self.assertEqual(e["payload"]["score"], 61)
        self.assertNotIn("hrvStatus", e["payload"])

    def test_unusable_entry_returns_none(self):
        self.assertIsNone(readiness_event({}, HRV, set()))
        self.assertIsNone(readiness_event(None, HRV, set()))


class TestDaySummary(unittest.TestCase):
    def test_emits_for_a_finished_day(self):
        e = day_summary_event(DAY, STATS, _hour_ms("2026-01-07", 0), set())
        self.assertEqual(e["kind"], "day_summarized")
        self.assertEqual(e["payload"]["sedentaryS"], 41000)
        self.assertEqual(e["payload"]["restingHrBpm"], 52)

    def test_withholds_an_unfinished_day(self):
        # Midday numbers under the day's id are a different fact from the day's.
        self.assertIsNone(day_summary_event(DAY, STATS, _hour_ms(DAY, 12), set()))

    def test_day_without_data_is_absent_not_zero(self):
        self.assertIsNone(day_summary_event(DAY, {}, _hour_ms("2026-01-07", 0), set()))

    def test_already_written_date_is_skipped(self):
        self.assertIsNone(
            day_summary_event(DAY, STATS, _hour_ms("2026-01-07", 0), {DAY}))


class TestStillness(unittest.TestCase):
    def test_recognises_the_sit_types(self):
        self.assertTrue(is_stillness("yoga"))
        self.assertTrue(is_stillness("Meditation"))
        self.assertFalse(is_stillness("soccer"))
        self.assertFalse(is_stillness(None))

    def test_enriches_a_sit_with_settling_not_exertion(self):
        stress = stress_pairs(STRESS_DTO)
        battery = body_battery_pairs(STRESS_DTO)
        # startTimeGMT must name the same instant as the (local) series above,
        # or the windows miss each other wherever the suite runs.
        from datetime import datetime as _dt, timezone as _tz
        start_gmt = _dt.fromtimestamp(_hour_ms(DAY, 9, 10) / 1000, _tz.utc)
        sit = {"activityId": 7, "activityType": {"typeKey": "yoga"},
               "startTimeGMT": start_gmt.strftime("%Y-%m-%d %H:%M:%S"),
               "duration": 600.0}
        payload = activity_event(sit, stress, battery)["payload"]
        self.assertIn("stressBefore", payload)
        self.assertIn("stressDelta", payload)

    def test_workout_is_untouched_by_the_series(self):
        payload = activity_event(ACTIVITY, stress_pairs(STRESS_DTO),
                                 body_battery_pairs(STRESS_DTO))["payload"]
        self.assertNotIn("stressBefore", payload)
        self.assertEqual(payload["activityType"], "soccer")

    def test_delta_signs_are_after_minus_before(self):
        stress = [(100, 50), (200, 50), (900, 20)]
        got = stillness_metrics(stress, [], 150, 800, pad_ms=200)
        self.assertEqual(got["stressBefore"], 50)
        self.assertEqual(got["stressAfter"], 20)
        self.assertEqual(got["stressDelta"], -30)


class TestStreamCursor(unittest.TestCase):
    def test_sleep_keeps_its_original_field(self):
        # An existing cursor file must keep working untouched.
        c = {"seenSleepDates": ["2026-01-05"]}
        self.assertEqual(seen_keys(c, "sleep"), {"2026-01-05"})
        remember(c, "sleep", ["2026-01-06"])
        self.assertEqual(sorted(c["seenSleepDates"]), ["2026-01-05", "2026-01-06"])
        self.assertNotIn("seen", c)

    def test_new_streams_nest_under_seen(self):
        c = {}
        remember(c, "body", [f"{DAY}T09"])
        self.assertEqual(seen_keys(c, "body"), {f"{DAY}T09"})
        self.assertEqual(seen_keys(c, "summary"), set())

    def test_each_stream_is_bounded(self):
        c = {}
        remember(c, "readiness", [f"readiness:{i}" for i in range(500)])
        self.assertEqual(len(c["seen"]["readiness"]), STREAM_KEEP["readiness"])

    def test_empty_write_is_a_no_op(self):
        c = {}
        remember(c, "body", [])
        self.assertEqual(c, {})


class TestWindow(unittest.TestCase):
    def test_window_is_oldest_first(self):
        self.assertEqual(window_dates(date(2026, 1, 6), 3),
                         ["2026-01-04", "2026-01-05", "2026-01-06"])

    def test_day_is_over_only_after_its_last_instant(self):
        self.assertFalse(day_is_over(DAY, _hour_ms(DAY, 23, 59)))
        self.assertTrue(day_is_over(DAY, _hour_ms("2026-01-06", 0)))


if __name__ == "__main__":
    unittest.main()
