import unittest
from watchlist_scan import genuine_nav, normalize_host, classify_host, normalize_route, ROUTE_REGISTRY

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

if __name__ == "__main__":
    unittest.main()
