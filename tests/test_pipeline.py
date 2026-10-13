"""The real build on fake photos: every published picture is watermarked, sorted into its section,
and keeps its link (#art/<id>) for ever, even after she renames the file."""
import csv, io, json, os, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
from PIL import Image, ImageChops, ImageStat  # noqa: E402

import build  # noqa: E402

FIELDS = ["file", "type", "title", "date", "md5"]
COLOURS = {"m1": (200, 60, 40), "m2": (40, 120, 200), "m3": (90, 170, 80)}


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        for sub in ("site/img", "cache", "src"):
            os.makedirs(os.path.join(self.d, sub))
        self.patches = [mock.patch.object(build, "HERE", self.d), mock.patch.object(build, "SITE", os.path.join(self.d, "site")),
                        mock.patch.object(build, "CACHE", os.path.join(self.d, "cache")),
                        mock.patch.object(build, "MANIFEST", os.path.join(self.d, "manifest.json")),
                        mock.patch.object(build, "cached", self.fake_cached),
                        mock.patch.object(build.drive, "ext", lambda n: os.path.splitext(n)[1].lower())]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def fake_cached(self, r):
        """Stand-in for a downloaded original: a flat colour picture per md5 (with some texture)."""
        p = os.path.join(self.d, "cache", r["md5"] + ".png")
        if not os.path.exists(p):
            im = Image.new("RGB", (900, 700), COLOURS[r["md5"]])
            for x in range(0, 900, 60):
                im.paste((20, 20, 20), (x, 0, x + 6, 700))
            im.save(p)
            open(p + ".px", "w").write(str(900 * 700))
        return p

    def run_build(self, rows):
        with open(os.path.join(self.d, "catalog.tsv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
            w.writeheader(); w.writerows(rows)
        out = io.StringIO()
        with mock.patch.object(sys, "argv", ["build.py"]), redirect_stdout(out):
            build.main()
        data = open(os.path.join(self.d, "site", "data.js")).read()
        items = {a["id"]: a for a in json.loads(data.split("=", 1)[1].strip().rstrip(";"))}
        return items, out.getvalue()

    def row(self, file, typ, md5):
        return {"file": file, "type": typ, "title": os.path.splitext(file)[0], "date": "2026-10-12", "md5": md5}

    def test_new_upload_is_watermarked_and_sorted(self):
        items, _ = self.run_build([self.row("Peacock Rangoli.jpg", "rangoli", "m1"), self.row("Ganesha Painting.jpg", "painting", "m2")])
        self.assertEqual(items["peacock-rangoli"]["cat"], "rangoli")
        self.assertEqual(items["ganesha-painting"]["cat"], "paintings")
        for i in items:
            for name in (i + ".webp", i + ".t.webp"):
                self.assertTrue(os.path.exists(os.path.join(self.d, "site", "img", name)), name)
        src = Image.open(self.fake_cached({"md5": "m1"})).convert("RGB").resize((900, 700))
        pub = Image.open(os.path.join(self.d, "site", "img", "peacock-rangoli.webp")).convert("RGB").resize((900, 700))
        corner = ImageStat.Stat(ImageChops.difference(src.crop((680, 480, 890, 690)), pub.crop((680, 480, 890, 690)))).mean[0]
        middle = ImageStat.Stat(ImageChops.difference(src.crop((100, 100, 400, 300)), pub.crop((100, 100, 400, 300)))).mean[0]
        self.assertGreater(corner, middle + 4, "no seal in the bottom-right corner of the published picture")

    def test_rename_keeps_the_link_and_does_not_restamp(self):
        self.run_build([self.row("Peacock Rangoli.jpg", "rangoli", "m1")])
        items, out = self.run_build([self.row("Diwali Peacock Kolam.jpg", "rangoli", "m1")])
        self.assertEqual(list(items), ["peacock-rangoli"], "the link changed after a rename")
        self.assertEqual(items["peacock-rangoli"]["title"], "Diwali Peacock Kolam")
        self.assertIn("(0 images made)", out)

    def test_rename_can_move_section_and_keep_link(self):
        self.run_build([self.row("Lotus Study.jpg", "painting", "m1")])
        items, _ = self.run_build([self.row("Lotus Pencil Sketch.jpg", "drawing", "m1")])
        self.assertEqual(items["lotus-study"]["cat"], "drawings")

    def test_new_upload_never_takes_an_existing_link(self):
        self.run_build([self.row("Peacock Rangoli.jpg", "rangoli", "m1")])
        self.run_build([self.row("Diwali Peacock.jpg", "rangoli", "m1")])          # rename: keeps peacock-rangoli
        items, _ = self.run_build([self.row("Diwali Peacock.jpg", "rangoli", "m1"),
                                   self.row("Peacock Rangoli.jpg", "rangoli", "m2")])  # a new photo with the old name
        self.assertEqual(items["peacock-rangoli"]["title"], "Diwali Peacock")
        self.assertEqual(items["peacock-rangoli-2"]["title"], "Peacock Rangoli")

    def test_same_photo_under_two_names_keeps_both_links(self):
        self.run_build([self.row("Music And Dance.jpg", "painting", "m1"), self.row("Musician Folk Art.jpg", "painting", "m1")])
        items, _ = self.run_build([self.row("Music And Dance.jpg", "painting", "m1"), self.row("Musician Folk Art.jpg", "painting", "m1")])
        self.assertEqual(sorted(items), ["music-and-dance", "musician-folk-art"])
        self.assertEqual(items["music-and-dance"]["title"], "Music And Dance")

    def test_deleted_artwork_images_are_removed(self):
        self.run_build([self.row("Peacock Rangoli.jpg", "rangoli", "m1"), self.row("Ganesha Painting.jpg", "painting", "m2")])
        items, _ = self.run_build([self.row("Ganesha Painting.jpg", "painting", "m2")])
        self.assertEqual(list(items), ["ganesha-painting"])
        self.assertFalse(os.path.exists(os.path.join(self.d, "site", "img", "peacock-rangoli.webp")))

    def test_hidden_items_never_published(self):
        items, _ = self.run_build([self.row("Assorted Collage.jpg", "other", "m3"), self.row("Ganesha Painting.jpg", "painting", "m2")])
        self.assertEqual(list(items), ["ganesha-painting"])


if __name__ == "__main__":
    unittest.main()
