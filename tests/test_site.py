"""The published site is complete and consistent: every artwork has its images, every link works."""
import json, os, re, unittest
from PIL import Image

SITE = os.path.join(os.path.dirname(__file__), "..", "site")
CATS = {"paintings", "drawings", "mandalas", "rangoli", "crafts"}


def artworks():
    s = open(os.path.join(SITE, "data.js")).read()
    return json.loads(s.split("=", 1)[1].strip().rstrip(";"))


class DataTest(unittest.TestCase):
    def setUp(self):
        self.art = artworks()

    def test_has_artworks_with_valid_fields(self):
        self.assertGreater(len(self.art), 100)
        for a in self.art:
            self.assertRegex(a["id"], r"^[a-z0-9-]+$")
            self.assertTrue(a["title"].strip(), a)
            self.assertIn(a["cat"], CATS, a)
            self.assertGreater(a["w"], 0); self.assertGreater(a["h"], 0)
            if a["date"]:
                self.assertRegex(a["date"], r"^\d{4}-\d\d-\d\d$")

    def test_ids_unique(self):
        ids = [a["id"] for a in self.art]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_artwork_has_both_images(self):
        missing = [f"{a['id']}{s}" for a in self.art for s in (".webp", ".t.webp")
                   if not os.path.exists(os.path.join(SITE, "img", a["id"] + s))]
        self.assertEqual(missing, [])

    def test_no_orphan_images(self):
        ids = {a["id"] for a in self.art}
        orphans = [f for f in os.listdir(os.path.join(SITE, "img")) if f.split(".")[0] not in ids]
        self.assertEqual(orphans, [])

    def test_images_stay_phone_friendly(self):
        big = [f for f in os.listdir(os.path.join(SITE, "img")) if os.path.getsize(os.path.join(SITE, "img", f)) > 700_000]
        self.assertEqual(big, [], "images over 700 KB slow phones down")

    def test_app_knows_every_category(self):
        app = open(os.path.join(SITE, "app.js")).read()
        for c in {a["cat"] for a in self.art}:
            self.assertIn(f'["{c}",', app)


class PagesTest(unittest.TestCase):
    PAGES = ("index.html", "policies.html")

    def test_local_links_and_files_exist(self):
        for page in self.PAGES:
            html = open(os.path.join(SITE, page)).read()
            for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
                if re.match(r"(https?:|mailto:|#|tel:)", ref):
                    continue
                path = ref.split("#")[0].split("?")[0].lstrip("/") or "index.html"
                if not os.path.splitext(path)[1]:        # pretty URL, as Cloudflare Pages serves it: /paintings
                    path += ".html"
                self.assertTrue(os.path.exists(os.path.join(SITE, path)), f"{page}: {ref}")

    def test_in_page_anchors_exist(self):
        idx = open(os.path.join(SITE, "index.html")).read()
        pol = open(os.path.join(SITE, "policies.html")).read()
        for page, html in (("index.html", idx), ("policies.html", pol)):
            for a in re.findall(r'href="#([\w-]+)"', html):
                self.assertIn(f'id="{a}"', html, f"{page}#{a}")
        for a in re.findall(r'policies\.html#([\w-]+)', idx):
            self.assertIn(f'id="{a}"', pol, a)

    def test_no_inline_scripts_so_csp_holds(self):
        for page in self.PAGES:
            html = open(os.path.join(SITE, page)).read()
            for attrs, body in re.findall(r"<script([^>]*)>(.*?)</script>", html, re.S):
                if "application/ld+json" in attrs:
                    json.loads(body)          # structured data must be valid JSON
                    continue
                self.assertIn("src=", attrs, f"{page}: inline script would be blocked by the CSP")
            self.assertNotRegex(html, r"\son[a-z]+=\"", f"{page}: inline event handler")

    def test_security_headers(self):
        h = open(os.path.join(SITE, "_headers")).read()
        for needle in ("Content-Security-Policy:", "script-src 'self'", "frame-ancestors 'none'", "X-Content-Type-Options: nosniff"):
            self.assertIn(needle, h)

    def test_meta_for_phones_and_sharing(self):
        html = open(os.path.join(SITE, "index.html")).read()
        for needle in ('name="viewport"', 'property="og:image" content="https://', 'rel="manifest"', 'rel="apple-touch-icon"',
                       'rel="canonical"', "Made by Ajith, for his only loving Mom"):
            self.assertIn(needle, html)
        with Image.open(os.path.join(SITE, "og.jpg")) as im:
            self.assertEqual(im.size, (1200, 630))

    def test_manifest_icons(self):
        m = json.load(open(os.path.join(SITE, "manifest.webmanifest")))
        self.assertEqual(m["display"], "standalone")
        for icon in m["icons"]:
            with Image.open(os.path.join(SITE, icon["src"])) as im:
                self.assertEqual("%dx%d" % im.size, icon["sizes"], icon["src"])

    def test_about_text_is_her_own_words(self):
        html = open(os.path.join(SITE, "index.html")).read()
        self.assertIn("For me, art is not just about the finished painting; it is about the journey of learning, "
                      "experimenting, evolving, and finding joy in every stroke.", html)


if __name__ == "__main__":
    unittest.main()
