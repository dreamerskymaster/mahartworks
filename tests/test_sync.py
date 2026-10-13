"""What happens when she adds, renames or deletes a photo in the Drive folder.

Each test gives build/sync.py a fake Drive listing and a starting catalog, then checks the
catalog it writes. Run: python3 -m unittest discover -s tests -v
"""
import csv, io, os, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import drive  # noqa: E402
import sync   # noqa: E402

FIELDS = ["file", "type", "title", "date", "md5"]
BASE = [  # a small starting catalog
    {"file": "Lotus Pattern Drawing.jpg", "type": "drawing", "title": "Lotus Pattern Drawing", "date": "2024-01-02", "md5": "a1"},
    {"file": "Krishna With Cow By River.jpg", "type": "painting", "title": "Krishna With Cow By River", "date": "2023-05-06", "md5": "b2"},
    {"file": "Assorted Collage.jpg", "type": "other", "title": "Assorted Collage", "date": "2022-01-01", "md5": "c3"},
    {"file": "Peacock Rangoli.jpg", "type": "rangoli", "title": "Peacock Rangoli", "date": "2022-02-02", "md5": "d4"},
]
LISTING = [(r["file"], r["md5"], "2026-10-01") for r in BASE]


def without(md5):
    return [l for l in LISTING if l[1] != md5]


class SyncTest(unittest.TestCase):
    def run_sync(self, listing, catalog=BASE, env=None):
        d = tempfile.mkdtemp()
        path = os.path.join(d, "catalog.tsv")
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS, delimiter="\t", lineterminator="\n")
            w.writeheader(); w.writerows(catalog)
        out = io.StringIO()
        env = dict(env or {})
        with mock.patch.object(sync, "CATALOG", path), \
             mock.patch.object(drive, "listing", return_value=listing), \
             mock.patch.dict(os.environ, env), redirect_stdout(out):
            os.environ.pop("GITHUB_OUTPUT", None)
            if "ALLOW_BIG_REMOVAL" not in env:
                os.environ.pop("ALLOW_BIG_REMOVAL", None)
            sync.main()
        with open(path) as f:
            rows = {r["file"]: r for r in csv.DictReader(f, delimiter="\t")}
        return rows, out.getvalue()

    # --- new uploads -------------------------------------------------------
    def test_new_upload_gets_her_filename_as_title(self):
        rows, _ = self.run_sync(LISTING + [("radha krishna on canvas.jpg", "e5", "2026-10-11")])
        r = rows["radha krishna on canvas.jpg"]
        self.assertEqual(r["title"], "Radha Krishna on Canvas")
        self.assertEqual(r["type"], "painting")
        self.assertEqual(r["date"], "2026-10-11")

    def test_new_upload_category_from_name(self):
        rows, _ = self.run_sync(LISTING + [("Pongal kolam.jpg", "e5", "x"), ("Ganesha pencil sketch.jpg", "e6", "x"),
                                           ("Mirror work plate.jpg", "e7", "x"), ("Sea stone shell.jpg", "e8", "x")])
        self.assertEqual(rows["Pongal kolam.jpg"]["type"], "rangoli")
        self.assertEqual(rows["Ganesha pencil sketch.jpg"]["type"], "drawing")
        self.assertEqual(rows["Mirror work plate.jpg"]["type"], "craft")
        self.assertEqual(rows["Sea stone shell.jpg"]["type"], "painting")   # no category word: painting

    def test_oil_painting_named_upload(self):
        rows, _ = self.run_sync(LISTING + [("Hanuman oil painting.jpg", "e5", "x"), ("Foil flowers.jpg", "e6", "x")])
        self.assertEqual(rows["Hanuman oil painting.jpg"]["type"], "oil")
        self.assertEqual(rows["Foil flowers.jpg"]["type"], "painting")

    def test_camera_named_upload_waits_until_renamed(self):
        for n in ("IMG_20261011_101010.jpg", "Screenshot_2026-10-11.png", "PXL_20261011.jpg",
                  "3A26F782-313F-4024-8DBE-E3CACDD5156F.JPG"):
            rows, out = self.run_sync(LISTING + [(n, "e5", "x")])
            self.assertNotIn(n, rows, n)
            self.assertIn("waiting for a real name: 1", out)

    def test_trailing_copy_numbers_dropped_from_title(self):
        rows, _ = self.run_sync(LISTING + [("Stone painting (1).JPG", "e5", "x")])
        self.assertEqual(rows["Stone painting (1).JPG"]["title"], "Stone Painting")

    # --- renames -----------------------------------------------------------
    def test_rename_after_camera_name_publishes_it(self):
        _, out = self.run_sync(LISTING + [("IMG_1234.jpg", "e5", "2026-10-11")])
        self.assertIn("waiting for a real name: 1", out)
        rows, _ = self.run_sync(LISTING + [("Shivratri kolam.jpg", "e5", "2026-10-11")])
        self.assertEqual(rows["Shivratri kolam.jpg"]["title"], "Shivratri Kolam")
        self.assertEqual(rows["Shivratri kolam.jpg"]["type"], "rangoli")

    def test_rename_updates_title_and_keeps_date(self):
        rows, out = self.run_sync(without("b2") + [("Ganesha With Cow By River.jpg", "b2", "2026-10-12")])
        self.assertNotIn("Krishna With Cow By River.jpg", rows)
        r = rows["Ganesha With Cow By River.jpg"]
        self.assertEqual(r["title"], "Ganesha with Cow by River")
        self.assertEqual(r["date"], "2023-05-06")
        self.assertIn("renamed: 1", out)

    def test_rename_follows_category_in_new_name(self):
        rows, _ = self.run_sync(without("b2") + [("Shivling kolam.jpg", "b2", "x")])
        self.assertEqual(rows["Shivling kolam.jpg"]["type"], "rangoli")
        rows, _ = self.run_sync(without("a1") + [("Lotus acrylic painting.jpg", "a1", "x")])
        self.assertEqual(rows["Lotus acrylic painting.jpg"]["type"], "painting")
        rows, _ = self.run_sync(without("b2") + [("Krishna pencil sketch.jpg", "b2", "x")])
        self.assertEqual(rows["Krishna pencil sketch.jpg"]["type"], "drawing")

    def test_rename_without_category_word_keeps_category(self):
        rows, _ = self.run_sync(without("d4") + [("Peacock for Diwali.jpg", "d4", "x")])
        self.assertEqual(rows["Peacock for Diwali.jpg"]["type"], "rangoli")

    def test_hidden_collage_stays_hidden_after_rename(self):
        rows, _ = self.run_sync(without("c3") + [("Assorted paintings.jpg", "c3", "x")])
        self.assertEqual(rows["Assorted paintings.jpg"]["type"], "other")

    def test_rename_to_camera_name_keeps_old_title(self):
        rows, _ = self.run_sync(without("b2") + [("IMG_9999.jpg", "b2", "x")])
        self.assertEqual(rows["IMG_9999.jpg"]["title"], "Krishna With Cow By River")

    # --- deletions, copies, other files -----------------------------------
    def test_deleted_photo_is_removed(self):
        rows, out = self.run_sync(LISTING[1:])
        self.assertNotIn("Lotus Pattern Drawing.jpg", rows)
        self.assertIn("removed: 1", out)

    def test_second_copy_is_not_a_rename(self):
        rows, out = self.run_sync(LISTING + [("Lotus Pattern Drawing copy.jpg", "a1", "x")])
        self.assertIn("Lotus Pattern Drawing.jpg", rows)
        self.assertNotIn("Lotus Pattern Drawing copy.jpg", rows)
        self.assertIn("skipped, duplicate copy: 1", out)

    def test_video_is_skipped_and_reported(self):
        rows, out = self.run_sync(LISTING + [("Krishna playing flute.mp4", "e5", "x")])
        self.assertNotIn("Krishna playing flute.mp4", rows)
        self.assertIn("'Krishna playing flute.mp4'", out)

    def test_nothing_changed_is_stable(self):
        rows, out = self.run_sync(LISTING)
        self.assertEqual(set(rows), {r["file"] for r in BASE})
        self.assertIn("added: 0", out)

    # --- safety ------------------------------------------------------------
    def test_refuses_when_most_artworks_vanish(self):
        with self.assertRaises(SystemExit):
            self.run_sync(LISTING[:1])

    def test_refuses_when_folder_looks_empty(self):
        with self.assertRaises(SystemExit):
            self.run_sync([])

    def test_big_removal_allowed_when_confirmed(self):
        rows, _ = self.run_sync(LISTING[:1], env={"ALLOW_BIG_REMOVAL": "1"})
        self.assertEqual(len(rows), 1)


if __name__ == "__main__":
    unittest.main()
