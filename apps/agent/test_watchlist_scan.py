import unittest
from watchlist_scan import genuine_nav, normalize_host, classify_host, normalize_route, ROUTE_REGISTRY
from watchlist_scan import quick_return_rate, binge_runs, drift_ratio

class TestHelpers(unittest.TestCase):
    def test_genuine_nav_drops_reload_subframe_redirect(self):
        self.assertTrue(genuine_nav(0))      # LINK
        self.assertTrue(genuine_nav(1))      # TYPED
        self.assertFalse(genuine_nav(8))     # RELOAD
        self.assertFalse(genuine_nav(3))     # AUTO_SUBFRAME
        self.assertFalse(genuine_nav(0x40000000))  # CLIENT_REDIRECT qualifier
        self.assertFalse(genuine_nav(0x80000000))  # SERVER_REDIRECT qualifier

    def test_normalize_host_strips_www_and_collapses_families(self):
        self.assertEqual(normalize_host("https://www.youtube.com/watch?v=x"), "youtube.com")
        self.assertEqual(normalize_host("https://m.youtube.com/x"), "youtube.com")
        self.assertEqual(normalize_host("https://youtu.be/abc"), "youtube.com")
        self.assertEqual(normalize_host("https://fr.linkedin.com/feed"), "linkedin.com")
        self.assertIsNone(normalize_host("chrome://extensions"))

    def test_classify_host(self):
        self.assertEqual(classify_host("github.com"), "work")
        self.assertEqual(classify_host("localhost:3000"), "work")
        self.assertEqual(classify_host("clerk.themia.pro"), "infra")
        self.assertEqual(classify_host("nhgfgpkpdcfmlcodnebehcljdnlfpamo"), "infra")  # no dot → ext id
        self.assertEqual(classify_host("youtube.com"), "residual")

    def test_normalize_route(self):
        self.assertEqual(normalize_route("youtube.com", "/shorts/abc"), "/shorts")
        self.assertEqual(normalize_route("youtube.com", "/watch"), "/watch")
        self.assertIsNone(normalize_route("youtube.com", "/"))
        self.assertIsNone(normalize_route("youtube.com", "/@creator"))   # privacy: no handles
        self.assertIsNone(normalize_route("github.com", "/rafa/keel"))   # off-registry

class TestLenses(unittest.TestCase):
    def test_quick_return_rate(self):
        # gaps: 60s (quick), 5s (too fast, reload-ish), 1200s (too slow)
        ts = [0, 60, 65, 1265]
        self.assertAlmostEqual(quick_return_rate(ts), 1 / 3)
        self.assertEqual(quick_return_rate([0]), 0.0)  # <2 visits → 0

    def test_binge_runs(self):
        # two runs within 300s gap: [0,100,200] and [1000,1100]; singleton 5000
        ts = [0, 100, 200, 1000, 1100, 5000]
        stats = binge_runs(ts, gap=300)
        self.assertEqual(stats["runs"], 2)
        self.assertEqual(stats["max_run"], 3)
        self.assertEqual(stats["median_run"], 2)  # runs of length 3 and 2 → median 2 (floor of 2.5)
        self.assertEqual(stats["pct_in_runs_5plus"], 0)

    def test_drift_ratio(self):
        now = 100 * 86400
        cut = now - 14 * 86400
        recent = [cut + i * 86400 for i in range(5)]   # 5 in last 14d
        prior = [cut - i * 86400 for i in range(1, 29)] # 28 over prior ~28d
        r = drift_ratio(recent + prior, now)
        self.assertGreater(r["recent_per_day"], 0)
        self.assertFalse(r["is_new"])
        self.assertTrue(drift_ratio([cut + 1, cut + 2], now)["is_new"])  # no prior → NEW


if __name__ == "__main__":
    unittest.main()
