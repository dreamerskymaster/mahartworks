"""The Vanna Reverie brand: logo in every header and footer, brand name in titles, previews and the app,
while she stays the named artist and seller. Regenerate the logo files with `python3 build/make_assets.py`."""
import glob, json, os, re, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
from PIL import Image  # noqa: E402

import seo  # noqa: E402

SITE = os.path.join(os.path.dirname(__file__), "..", "site")


def read(name):
    with open(os.path.join(SITE, name), encoding="utf-8") as f:
        return f.read()


PAGES = sorted(os.path.relpath(p, SITE) for p in glob.glob(os.path.join(SITE, "*.html")))
ART = sorted(os.path.relpath(p, SITE) for p in glob.glob(os.path.join(SITE, "art", "*.html")))


class BrandTest(unittest.TestCase):
    def test_every_page_has_the_logo_header_and_footer(self):
        for page in PAGES + ART[:40] + ART[-5:]:
            html = read(page)
            if "/__fixtures__" in page:
                continue
            header = re.search(r'<header class="nav[^"]*">(.*?)</header>', html, re.S)[1]
            self.assertIn('<img class="brand-logo" src="/brand/wordmark.webp" alt="Vanna Reverie"', header, page)
            self.assertIn("by Mahalakshmi Srikanth", header, page)
            self.assertNotIn("seal.png", header, page)
            footer = re.search(r"<footer>(.*?)</footer>", html, re.S)[1]
            self.assertIn(seo.FOOT_LOGO, footer, page)
            self.assertIn("Mahalakshmi Srikanth. All rights reserved.", footer, page)

    def test_hand_written_pages_match_the_generated_frame(self):
        self.assertIn(seo.BRAND_LINK.format(home="#top"), read("index.html"))
        self.assertIn(seo.BRAND_LINK.format(home="index.html"), read("policies.html"))

    def test_logo_files(self):
        for name, h in (("wordmark.webp", 120), ("logo.webp", None)):
            with Image.open(os.path.join(SITE, "brand", name)) as im:
                self.assertEqual(im.mode, "RGBA", name)
                a = im.getchannel("A")
                self.assertEqual(a.getpixel((0, 0)), 0, f"{name}: cream background not removed")
                self.assertGreater(a.getextrema()[1], 250, f"{name}: logo is see-through")
                if h:
                    self.assertEqual(im.height, h)
                    self.assertGreater(im.width / im.height, 2.2, "wordmark should be wide (no tagline)")
        with Image.open(os.path.join(SITE, "brand", "logo.webp")) as im:
            self.assertAlmostEqual(im.width / im.height, 280 / 134, delta=.03, msg="footer width/height attributes")
        with Image.open(os.path.join(SITE, "brand", "wordmark.webp")) as im:
            self.assertAlmostEqual(im.width / im.height, 101 / 40, delta=.03, msg="header width/height attributes")

    def test_icons_are_the_butterfly_not_the_seal(self):
        sizes = set()
        for name in ("icon-192", "icon-512", "maskable-512", "apple-touch-icon"):
            with Image.open(os.path.join(SITE, "icons", name + ".png")) as im:
                im = im.convert("RGB")
                self.assertEqual(im.getpixel((2, 2)), (246, 240, 226), name)   # cream, not the navy seal
                sizes.add(im.resize((64, 64)).tobytes())
        self.assertEqual(len(sizes), 4, "each icon size is drawn separately (maskable has more margin)")

    def test_names_titles_and_app(self):
        m = json.loads(read("manifest.webmanifest"))
        self.assertEqual(m["short_name"], "Vanna Reverie")
        self.assertIn("Mahalakshmi Srikanth", m["name"])
        home = read("index.html")
        self.assertRegex(home, r"<title>Vanna Reverie — [^<]*Mahalakshmi Srikanth[^<]*</title>")
        self.assertIn('<meta name="apple-mobile-web-app-title" content="Vanna Reverie">', home)
        for page in PAGES + ART[:5]:
            if page in ("policies.html",):
                continue
            self.assertIn('<meta property="og:site_name" content="Vanna Reverie">', read(page), page)
        self.assertIn("<title>Policies — Vanna Reverie</title>", read("policies.html"))

    def test_structured_data_names_the_brand(self):
        home = read("index.html")
        graph = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)[1])["@graph"]
        person = next(n for n in graph if n["@type"] == "Person")
        site = next(n for n in graph if n["@type"] == "WebSite")
        self.assertEqual(person["name"], "Mahalakshmi Srikanth")
        self.assertEqual(person["brand"], seo.PERSON["brand"])
        self.assertEqual(person["brand"]["name"], "Vanna Reverie")
        self.assertEqual(site["name"], "Vanna Reverie")
        self.assertIn("Mahalakshmi Srikanth Art", site["alternateName"], "old name kept so existing links/searches still match")

    def test_she_stays_the_seller(self):
        pol = read("policies.html")
        self.assertIn("Vanna Reverie, the trading name of Mahalakshmi Srikanth (sole proprietorship)", pol)

    def test_llms_txt_names_brand_and_tagline(self):
        for doc in (read("llms.txt"), read("llms-full.txt")):
            self.assertTrue(doc.startswith("# Mahalakshmi Srikanth — Vanna Reverie"))
            self.assertIn('Vanna Reverie ("Every Stroke Tells a Story")', doc)

    def test_seal_still_on_pictures_and_certificates(self):
        self.assertTrue(os.path.exists(os.path.join(SITE, "seal.png")))
        self.assertIn("/seal.png", read(ART[0]), "certificate section keeps her MS seal")


if __name__ == "__main__":
    unittest.main()
