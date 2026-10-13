"""Search engines and AI answer engines can find every artwork: a page each, category pages, sitemap, llms.txt."""
import glob, inspect, json, os, re, shutil, sys, tempfile, unittest
import xml.etree.ElementTree as ET
from urllib.parse import unquote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import seo  # noqa: E402

SITE = os.path.join(os.path.dirname(__file__), "..", "site")
BASE = "https://mah-artworks.pages.dev"
SM = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "i": "http://www.google.com/schemas/sitemap-image/1.1"}


def read(*p):
    return open(os.path.join(SITE, *p), encoding="utf-8").read()


def meta(doc, attr, name):
    m = re.search(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(name)), doc)
    return m and m[1]


def ld_blocks(doc):
    return [json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', doc, re.S)]


def nodes(doc):
    out = []
    for b in ld_blocks(doc):
        out += b.get("@graph", [b])
    return out


def local(url):
    """The file Cloudflare Pages serves for a site URL (pretty URLs: /art/x -> art/x.html)."""
    path = url.replace(BASE, "").split("#")[0].split("?")[0].lstrip("/") or "index.html"
    return path if os.path.splitext(path)[1] else path + ".html"


class ArtworkPagesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.art = seo.artworks(SITE)
        cls.pages = {a["id"]: read("art", a["id"] + ".html") for a in cls.art}

    def test_one_page_per_artwork_and_no_orphans(self):
        files = sorted(os.listdir(os.path.join(SITE, "art")))
        self.assertEqual(files, sorted(a["id"] + ".html" for a in self.art))
        self.assertEqual(len(files), len(self.art))

    def test_titles_and_descriptions_unique(self):
        titles = [re.search(r"<title>(.*?)</title>", p)[1] for p in self.pages.values()]
        descs = [meta(p, "name", "description") for p in self.pages.values()]
        self.assertEqual(len(set(titles)), len(titles), "two artwork pages share a <title>")
        self.assertEqual(len(set(descs)), len(descs), "two artwork pages share a description")
        for t, d in zip(titles, descs):
            self.assertIn("Mahalakshmi Srikanth", t)
            self.assertTrue(d and 50 < len(d) < 300, d)

    def test_each_page_names_and_shows_its_artwork(self):
        for a in self.art:
            p = self.pages[a["id"]]
            url = f"{BASE}/art/{a['id']}"
            self.assertEqual(re.findall(r'<link rel="canonical" href="([^"]+)"', p), [url], a["id"])
            self.assertEqual(meta(p, "property", "og:url"), url)
            img = meta(p, "property", "og:image")
            self.assertEqual(img, f"{BASE}/img/{a['id']}.webp")
            self.assertTrue(os.path.exists(os.path.join(SITE, local(img))), img)
            self.assertEqual(meta(p, "name", "twitter:image"), img)
            self.assertEqual(len(re.findall(r"<h1>", p)), 1)
            self.assertIn(f"<h1>{seo.e(a['title'])}</h1>", p)
            self.assertRegex(p, r'<img src="/img/%s\.webp" alt="[^"]*Mahalakshmi Srikanth"' % re.escape(a["id"]))
            self.assertIn(f'href="/#art/{a["id"]}"', p, "View in the gallery link")
            self.assertIn(f'href="/{a["cat"]}"', p, "category link")

    def test_enquiry_mail_names_the_artwork_and_id(self):
        for a in self.art:
            m = re.search(r'href="(mailto:[^"]+)"[^>]*>Enquire about this artwork', self.pages[a["id"]])
            self.assertTrue(m, a["id"])
            subject = unquote(re.search(r"subject=([^&]+)", m[1].replace("&amp;", "&"))[1])
            self.assertEqual(subject, f"Enquiry: {a['title']} (ID {a['id']})")

    def test_structured_data(self):
        for a in self.art:
            ns = nodes(self.pages[a["id"]])
            work = next(n for n in ns if n["@type"] == "VisualArtwork")
            person = next(n for n in ns if n["@type"] == "Person")
            self.assertEqual(work["name"], a["title"])
            self.assertEqual(work["url"], f"{BASE}/art/{a['id']}")
            self.assertEqual(work["image"]["contentUrl"], f"{BASE}/img/{a['id']}.webp")
            self.assertEqual(work["creator"]["@id"], person["@id"])
            self.assertEqual(person["name"], "Mahalakshmi Srikanth")
            self.assertTrue(work["artform"])
            if a["date"]:
                self.assertEqual(work["dateCreated"], a["date"])
            self.assertTrue(any(n["@type"] == "BreadcrumbList" for n in ns))

    def test_related_links_stay_in_the_category_and_exist(self):
        ids = {a["id"]: a for a in self.art}
        for a in self.art:
            rel = re.search(r'<section class="related".*?</section>', self.pages[a["id"]], re.S)
            n = sum(1 for x in self.art if x["cat"] == a["cat"]) - 1
            if not n:
                self.assertIsNone(rel); continue
            links = re.findall(r'href="/art/([\w-]+)"', rel[0])
            self.assertEqual(len(links), min(seo.RELATED, n), a["id"])
            self.assertNotIn(a["id"], links)
            for i in links:
                self.assertEqual(ids[i]["cat"], a["cat"], f"{a['id']} -> {i}")


class GeneratedPagesTest(unittest.TestCase):
    """Things true of every generated page (artworks, categories, 404)."""
    @classmethod
    def setUpClass(cls):
        cls.files = glob.glob(os.path.join(SITE, "art", "*.html")) + \
            [os.path.join(SITE, k + ".html") for k in seo.CAT] + [os.path.join(SITE, f) for f in ("404.html", "verify.html")]

    def test_no_inline_scripts_so_csp_holds(self):
        for f in self.files:
            doc = open(f, encoding="utf-8").read()
            for attrs, body in re.findall(r"<script([^>]*)>(.*?)</script>", doc, re.S):
                if "application/ld+json" in attrs:
                    json.loads(body)
                else:
                    self.assertIn("src=", attrs, f)
                    self.assertFalse(body.strip(), f)
            self.assertNotRegex(doc, r"\son[a-z]+=\"", f)
            self.assertNotRegex(doc, r'(?:src|href)="(?:https?:)?//(?!mah-artworks\.pages\.dev|instagram\.com)', f"{f}: third-party request")

    def test_local_links_and_files_exist(self):
        for f in self.files:
            doc = open(f, encoding="utf-8").read()
            for ref in set(re.findall(r'(?:src|href)="(/[^"]*)"', doc)):
                self.assertTrue(os.path.exists(os.path.join(SITE, local(ref))), f"{os.path.basename(f)}: {ref}")

    def test_same_look_and_dedication(self):
        for f in self.files:
            doc = open(f, encoding="utf-8").read()
            for needle in ('href="/style.css"', 'src="/prefs.js"', 'name="viewport"', '<html lang="en">',
                           'class="nav solid"', "Made by Ajith, for his only loving Mom", 'id="year"'):
                self.assertIn(needle, doc, f)

    def test_404_is_not_indexed(self):
        doc = read("404.html")
        self.assertIn('<meta name="robots" content="noindex">', doc)
        self.assertNotIn('rel="canonical"', doc)


class CategoryPagesTest(unittest.TestCase):
    def setUp(self):
        self.art = seo.artworks(SITE)

    def test_every_artwork_reachable_by_plain_links(self):
        linked = set()
        for k in seo.CAT:
            items = [a["id"] for a in self.art if a["cat"] == k]
            path = os.path.join(SITE, k + ".html")
            if not items:
                self.assertFalse(os.path.exists(path)); continue
            doc = open(path, encoding="utf-8").read()
            tiles = re.search(r'<ul class="tiles">.*?</ul>', doc, re.S)[0]
            self.assertEqual(re.findall(r'href="/art/([\w-]+)"', tiles), items, k)
            linked |= set(items)
            self.assertEqual(re.findall(r'<link rel="canonical" href="([^"]+)"', doc), [f"{BASE}/{k}"])
            page = next(n for n in nodes(doc) if n["@type"] == "CollectionPage")
            self.assertEqual(page["mainEntity"]["numberOfItems"], len(items))
            self.assertEqual([i["url"] for i in page["mainEntity"]["itemListElement"]], [f"{BASE}/art/{i}" for i in items])
            self.assertTrue(re.search(r'<p class="lede">.{30,}</p>', doc), "intro sentence")
        self.assertEqual(linked, {a["id"] for a in self.art})

    def test_home_links_to_categories_and_newest(self):
        idx = read("index.html")
        for k in {a["cat"] for a in self.art}:
            self.assertIn(f'<a href="/{k}">', idx)
        block = re.search(r"<!-- seo:latest -->(.*?)<!-- /seo:latest -->", idx, re.S)[1]
        self.assertIn("<noscript>", block)
        self.assertEqual(re.findall(r'href="/art/([\w-]+)"', block), [a["id"] for a in self.art[:seo.LATEST]])


class HomePageTest(unittest.TestCase):
    def test_one_canonical_and_search_friendly_title(self):
        idx = read("index.html")
        self.assertEqual(re.findall(r'rel="canonical" href="([^"]+)"', idx), [BASE + "/"])
        title = re.search(r"<title>(.*?)</title>", idx)[1]
        for w in ("Mahalakshmi Srikanth", "Rangoli", "Mumbai"):
            self.assertIn(w, title)
        self.assertIn("Mumbai", meta(idx, "name", "description"))

    def test_person_and_website(self):
        ns = nodes(read("index.html"))
        person = next(n for n in ns if n["@type"] == "Person")
        site = next(n for n in ns if n["@type"] == "WebSite")
        self.assertEqual(person["address"], {"@type": "PostalAddress", "addressLocality": "Mumbai", "addressCountry": "IN"})
        self.assertIn("https://instagram.com/mah_artworks", person["sameAs"])
        self.assertIn("Rangoli", person["knowsAbout"])
        self.assertEqual(site["url"], BASE + "/")
        self.assertEqual(site["author"]["@id"], person["@id"])


class CrawlerFilesTest(unittest.TestCase):
    def setUp(self):
        self.art = seo.artworks(SITE)

    def test_sitemap_lists_every_page_with_images(self):
        root = ET.parse(os.path.join(SITE, "sitemap.xml")).getroot()
        urls = {u.find("s:loc", SM).text: u for u in root.findall("s:url", SM)}
        want = [BASE + "/", BASE + "/policies", BASE + "/verify"] + [f"{BASE}/{k}" for k in seo.CAT if any(a["cat"] == k for a in self.art)] \
            + [f"{BASE}/art/{a['id']}" for a in self.art]
        self.assertEqual(sorted(urls), sorted(want))
        for loc, u in urls.items():
            self.assertTrue(os.path.exists(os.path.join(SITE, local(loc))), loc)
            lm = u.find("s:lastmod", SM)
            if lm is not None:
                self.assertRegex(lm.text, r"^\d{4}-\d\d-\d\d$")
        for a in self.art:
            imgs = [i.text for i in urls[f"{BASE}/art/{a['id']}"].findall("i:image/i:loc", SM)]
            self.assertEqual(imgs, [f"{BASE}/img/{a['id']}.webp"])
            if a["date"]:
                self.assertEqual(urls[f"{BASE}/art/{a['id']}"].find("s:lastmod", SM).text, a["date"])

    def test_robots_allows_search_and_ai_and_points_to_sitemap(self):
        r = read("robots.txt")
        self.assertIn(f"Sitemap: {BASE}/sitemap.xml", r)
        self.assertNotRegex(r, r"(?m)^Disallow: /\s*$")
        for bot in ("OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Google-Extended", "GPTBot", "ClaudeBot"):
            self.assertIn(f"User-agent: {bot}", r)

    def test_llms_txt(self):
        short, full = read("llms.txt"), read("llms-full.txt")
        for doc in (short, full):
            self.assertTrue(doc.startswith("# Mahalakshmi Srikanth"))
            self.assertIn("Mumbai", doc)
            self.assertIn(f"{BASE}/policies#orders", doc)
            for k in {a["cat"] for a in self.art}:
                self.assertIn(f"]({BASE}/{k})", doc)
        self.assertIn(f"{BASE}/llms-full.txt", short)
        for a in self.art:
            self.assertIn(f"]({BASE}/art/{a['id']})", full)
        self.assertIn("finding joy in every stroke", full, "her own words, quoted")

    def test_headers_cover_new_pages(self):
        h = read("_headers")
        self.assertRegex(h, r"(?m)^/\*\n(?:  .*\n)*  Content-Security-Policy:")


class CertificateTest(unittest.TestCase):
    """Every artwork page shows its Certificate of Authenticity number; /verify/<number> leads to it."""
    def setUp(self):
        self.art = seo.artworks(SITE)

    def test_every_artwork_has_a_unique_certificate_number(self):
        nums = [a.get("cert") for a in self.art]
        for n in nums:
            self.assertRegex(n or "", r"^MS-\d{4}-\d{4,}$")
        self.assertEqual(len(set(nums)), len(nums))
        for a in self.art:
            if a["date"]:
                self.assertEqual(a["cert"][3:7], a["date"][:4], f"{a['id']}: certificate year is the artwork's year")

    def test_artwork_page_shows_the_certificate(self):
        for a in self.art:
            doc = read("art", a["id"] + ".html")
            sec = re.search(r'<section class="coa" id="certificate".*?</section>', doc, re.S)
            self.assertTrue(sec, a["id"])
            self.assertIn(f"<strong>{a['cert']}</strong>", sec[0])
            self.assertIn("Each original is accompanied by a Certificate of Authenticity signed by the artist", sec[0])
            self.assertIn('href="/verify"', sec[0])
            work = next(n for n in nodes(doc) if n["@type"] == "VisualArtwork")
            ids = [i for i in work["identifier"] if isinstance(i, dict)]
            self.assertEqual([(i["value"], i["url"]) for i in ids], [(a["cert"], f"{BASE}/verify/{a['cert']}")])

    def test_redirects_send_every_certificate_to_its_artwork(self):
        lines = [l.split() for l in read("_redirects").splitlines() if l.strip() and not l.startswith("#")]
        static = {l[0]: (l[1], l[2]) for l in lines if "*" not in l[0]}
        self.assertEqual(static, {f"/verify/{a['cert']}": (f"/art/{a['id']}#certificate", "301") for a in self.art})
        self.assertEqual(lines[-1], ["/verify/*", "/verify?n=:splat", "302"], "unknown numbers go to the lookup page, last")
        self.assertLess(len(static), 2000, "Cloudflare Pages allows 2,000 static redirects")
        for l in lines:
            self.assertIn(len(l), (2, 3), l)

    def test_too_many_certificates_fall_back_to_the_lookup_page(self):
        many = [{"id": f"a{i}", "cert": f"MS-2026-{i + 1:04d}"} for i in range(seo.MAX_REDIRECTS + 1)]
        lines = [l for l in seo.redirects(many).splitlines() if l and not l.startswith("#")]
        self.assertEqual(lines, ["/verify/* /verify?n=:splat 302"])

    def test_verify_page(self):
        doc = read("verify.html")
        self.assertIn('id="cert-input"', doc)
        self.assertIn('<script src="/data.js" defer></script>', doc)
        self.assertIn('<script src="/js/verify.js" defer></script>', doc)
        self.assertIn('data-email="mahasriphoto24@gmail.com"', doc)
        self.assertNotIn("<form", doc, "the CSP forbids form submissions (form-action 'none')")
        self.assertEqual(re.findall(r'<link rel="canonical" href="([^"]+)"', doc), [f"{BASE}/verify"])

    def test_no_signature_image_is_published(self):
        """Her real signature is supplied at runtime from private storage only, never committed."""
        root = os.path.join(SITE, "..")
        for d in ("site", "build"):
            for dirpath, _, files in os.walk(os.path.join(root, d)):
                if {"cache", "img", "art"} & set(dirpath.split(os.sep)):    # artworks (titles are hers to choose)
                    continue
                for f in files:
                    self.assertNotIn("signature", f.lower(), os.path.join(dirpath, f))


class GeneratorTest(unittest.TestCase):
    def test_build_runs_it(self):
        import build
        self.assertIn("seo.generate()", inspect.getsource(build.main))

    def test_committed_files_are_up_to_date_and_stable(self):
        """Regenerating from data.js changes nothing (so nobody hand-edited the output, and the bot's
        commits only change when the artworks do). Also: pages of removed artworks are deleted."""
        tmp = tempfile.mkdtemp()
        try:
            for f in ("data.js", "app.js", "index.html", "policies.html"):
                shutil.copy(os.path.join(SITE, f), tmp)
            os.makedirs(os.path.join(tmp, "art"))
            open(os.path.join(tmp, "art", "gone-artwork.html"), "w").write("old")
            r = seo.generate(tmp)
            self.assertEqual(r["removed"], ["gone-artwork.html"])
            outs = [os.path.join("art", f) for f in os.listdir(os.path.join(tmp, "art"))] + \
                ["index.html", "404.html", "verify.html", "_redirects", "sitemap.xml", "llms.txt", "llms-full.txt"] + \
                [k + ".html" for k in seo.CAT if os.path.exists(os.path.join(tmp, k + ".html"))]
            for f in outs:
                self.assertEqual(open(os.path.join(tmp, f), encoding="utf-8").read(), read(f),
                                 f"{f} is out of date: run python3 build/seo.py")
            self.assertEqual(seo.generate(tmp)["written"], 0)
        finally:
            shutil.rmtree(tmp)

    def test_repeated_titles_get_distinct_names(self):
        art = [{"id": "lotus", "title": "Lotus"}, {"id": "lotus-2", "title": "Lotus"}, {"id": "sun", "title": "Sun"}]
        self.assertEqual(seo.labels(art), {"lotus": "Lotus", "lotus-2": "Lotus (2)", "sun": "Sun"})

    def test_text_is_escaped(self):
        a = {"id": "x", "title": 'Krishna & "Radha" </script>', "cat": "paintings", "date": "", "w": 10, "h": 10}
        doc = seo.art_page(a, [a], a["title"], {"paintings": [a]}, "me@example.com", "2026")
        self.assertIn("<h1>Krishna &amp; &quot;Radha&quot; &lt;/script&gt;</h1>", doc)
        self.assertEqual(doc.count("</script>"), doc.count("<script"), "a title closed a <script> block")
        work = next(n for n in nodes(doc) if n["@type"] == "VisualArtwork")
        self.assertEqual(work["name"], a["title"])
        self.assertNotIn("dateCreated", work)


if __name__ == "__main__":
    unittest.main()
