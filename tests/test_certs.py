"""Certificate of Authenticity numbers (build/certs.py), through the real build on fake photos:
MS-<YYYY>-<NNNN>, issued once per artwork, unchanged by renames and rebuilds, never reused."""
import csv, io, json, os, re, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
from PIL import Image  # noqa: E402

import build  # noqa: E402
import certs  # noqa: E402

FIELDS = ["file", "type", "title", "date", "md5"]
COLOURS = {f"m{i}": ((i * 53) % 256, (i * 97) % 256, (i * 29) % 256) for i in range(1, 10)}
FORMAT = re.compile(r"^MS-\d{4}-\d{4}$")


class CertificateNumbersTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        for sub in ("site/img", "cache"):
            os.makedirs(os.path.join(self.d, sub))
        self.patches = [mock.patch.object(build, "HERE", self.d), mock.patch.object(build, "SITE", os.path.join(self.d, "site")),
                        mock.patch.object(build, "CACHE", os.path.join(self.d, "cache")),
                        mock.patch.object(build, "MANIFEST", os.path.join(self.d, "manifest.json")),
                        mock.patch.object(build, "cached", self.fake_cached),
                        mock.patch.object(build.seo, "generate", lambda *a, **k: None),     # the real site stays untouched
                        mock.patch.object(certs, "this_year", lambda: 2026),
                        mock.patch.object(build.drive, "ext", lambda n: os.path.splitext(n)[1].lower())]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def fake_cached(self, r):
        """A downloaded original: a flat colour per md5 with a stripe pattern (different md5 = different picture)."""
        p = os.path.join(self.d, "cache", r["md5"] + ".png")
        if not os.path.exists(p):
            base = r["md5"].rstrip("s")                       # "m7s": a smaller copy of the same picture as "m7"
            i = int(base[1:])
            im = Image.new("RGB", (900, 700), COLOURS[base])
            for x in range(0, 900, 30 + 10 * i):
                im.paste((20, 20, 20), (x, 0, x + 6, 700))
            if base != r["md5"]:
                im = im.resize((450, 350))
            im.save(p)
            open(p + ".px", "w").write(str(im.width * im.height))
        return p

    def run_build(self, rows):
        with open(os.path.join(self.d, "catalog.tsv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
            w.writeheader(); w.writerows(rows)
        with mock.patch.object(sys, "argv", ["build.py"]), redirect_stdout(io.StringIO()):
            build.main()
        data = open(os.path.join(self.d, "site", "data.js")).read()
        return {a["id"]: a for a in json.loads(data.split("=", 1)[1].strip().rstrip(";"))}

    def register(self):
        return json.load(open(os.path.join(self.d, "manifest.json")))["certs"]

    def row(self, title, md5, date="2026-10-12", typ="painting"):
        return {"file": title + ".jpg", "type": typ, "title": title, "date": date, "md5": md5}

    def test_format_and_unique(self):
        items = self.run_build([self.row("Lotus", "m1", "2021-03-04"), self.row("Ganesha", "m2", "2024-01-01"),
                                self.row("Kolam", "m3", "", "rangoli")])
        nums = [a["cert"] for a in items.values()]
        for n in nums:
            self.assertRegex(n, FORMAT)
            self.assertTrue(certs.PATTERN.match(n))
        self.assertEqual(len(set(nums)), len(nums))
        self.assertEqual(items["lotus"]["cert"], "MS-2021-0001", "year of its date")
        self.assertEqual(items["ganesha"]["cert"], "MS-2024-0002")
        self.assertEqual(items["kolam"]["cert"], "MS-2026-0003", "no date: year first published, numbered last")
        self.assertEqual(self.register()["MS-2021-0001"], ["m1", "lotus"])

    def test_first_run_order_is_by_date_then_id(self):
        items = self.run_build([self.row("Zebra", "m1", "2022-05-01"), self.row("Apple", "m2", "2022-05-01"),
                                self.row("Old", "m3", "2021-01-01")])
        self.assertEqual([items[i]["cert"] for i in ("old", "apple", "zebra")], ["MS-2021-0001", "MS-2022-0002", "MS-2022-0003"])

    def test_stable_across_rebuilds(self):
        rows = [self.row("Lotus", "m1", "2021-03-04"), self.row("Ganesha", "m2", "2024-01-01")]
        first = {i: a["cert"] for i, a in self.run_build(rows).items()}
        again = {i: a["cert"] for i, a in self.run_build(list(reversed(rows))).items()}
        self.assertEqual(first, again)

    def test_rename_keeps_the_number(self):
        before = self.run_build([self.row("Lotus Study", "m1", "2021-03-04"), self.row("Ganesha", "m2", "2024-01-01")])
        after = self.run_build([self.row("Lotus Pencil Sketch", "m1", "2021-03-04", "drawing"), self.row("Ganesha", "m2", "2024-01-01")])
        self.assertEqual(after["lotus-study"]["title"], "Lotus Pencil Sketch")
        self.assertEqual(after["lotus-study"]["cert"], before["lotus-study"]["cert"])
        self.assertEqual(after["ganesha"]["cert"], before["ganesha"]["cert"])

    def test_new_upload_gets_the_next_number(self):
        self.run_build([self.row("Lotus", "m1", "2021-03-04"), self.row("Ganesha", "m2", "2024-01-01")])
        items = self.run_build([self.row("Lotus", "m1", "2021-03-04"), self.row("Ganesha", "m2", "2024-01-01"),
                                self.row("Old Find", "m3", "2020-06-01")])
        self.assertEqual(items["old-find"]["cert"], "MS-2020-0003", "an older date does not jump the queue")

    def test_deleted_number_is_never_reused(self):
        self.run_build([self.row("Lotus", "m1"), self.row("Ganesha", "m2"), self.row("Peacock", "m3")])
        gone = self.register()
        items = self.run_build([self.row("Lotus", "m1"), self.row("Ganesha", "m2")])            # Peacock deleted
        self.assertNotIn("peacock", items)
        peacock = next(c for c, (_, i) in gone.items() if i == "peacock")
        self.assertIn(peacock, self.register(), "the register keeps a removed artwork's number")
        items = self.run_build([self.row("Lotus", "m1"), self.row("Ganesha", "m2"), self.row("Peacock", "m4")])  # new photo, old name
        self.assertNotEqual(items["peacock"]["cert"], peacock)
        self.assertEqual(certs.seq(items["peacock"]["cert"]), 4)

    def test_same_photo_reuploaded_gets_its_number_back(self):
        self.run_build([self.row("Lotus", "m1"), self.row("Ganesha", "m2")])
        n = self.register()
        self.run_build([self.row("Ganesha", "m2")])
        items = self.run_build([self.row("Lotus Flower", "m1"), self.row("Ganesha", "m2")])
        self.assertEqual(items["lotus-flower"]["cert"], next(c for c, (m, _) in n.items() if m == "m1"))

    def test_two_copies_of_one_artwork_keep_the_number_when_one_is_deleted(self):
        """She has a big and a small photo of one artwork under the same name; the site shows the big one.
        When she deletes the big one, the small one takes its place with the same number (and the other way round)."""
        big, small = self.row("Pongal Kolam", "m7", typ="rangoli"), dict(self.row("Pongal Kolam", "m7s", typ="rangoli"), file="Pongal Kolam 2.jpg")
        n = self.run_build([big, small, self.row("Lotus", "m1")])["pongal-kolam"]["cert"]
        items = self.run_build([small, self.row("Lotus", "m1")])
        self.assertEqual(items["pongal-kolam"]["cert"], n)
        items = self.run_build([big, small, self.row("Lotus", "m1")])
        self.assertEqual(items["pongal-kolam"]["cert"], n)
        self.assertEqual(len(self.register()), 2)

    def test_same_photo_under_two_names_gets_two_numbers(self):
        items = self.run_build([self.row("Music And Dance", "m1"), self.row("Musician Folk Art", "m1")])
        again = self.run_build([self.row("Music And Dance", "m1"), self.row("Musician Folk Art", "m1")])
        self.assertNotEqual(items["music-and-dance"]["cert"], items["musician-folk-art"]["cert"])
        self.assertEqual({i: a["cert"] for i, a in items.items()}, {i: a["cert"] for i, a in again.items()})

    def test_assign_directly(self):
        reg = {"MS-2021-0007": ["x", "gone"]}
        out = certs.assign([{"id": "a", "key": "m1", "date": ""}, {"id": "b", "key": "m2", "date": "2023-02-02"}], reg, 2026)
        self.assertEqual(out, {"b": "MS-2023-0008", "a": "MS-2026-0009"})
        self.assertIn("MS-2021-0007", reg)
        self.assertEqual(certs.fmt(2026, 12345), "MS-2026-12345")


if __name__ == "__main__":
    unittest.main()
