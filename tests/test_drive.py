"""Fetching an original when Drive has several files with one name (build/drive.py).
Run: python3 -m unittest discover -s tests -v
"""
import hashlib, os, sys, tempfile, unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
import drive  # noqa: E402


class SameNameTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.md5 = {}
        for f, data in (("Mandala art (1).jpg", b"\xff\xd8\xff one"), ("Mandala art (2).jpg", b"\xff\xd8\xff two"),
                        ("Lotus.jpg", b"\xff\xd8\xff lotus")):
            with open(os.path.join(self.d, f), "wb") as fh:
                fh.write(data)
            self.md5[f] = hashlib.md5(data).hexdigest()

    def path(self, name, md5=None):
        with mock.patch.object(drive, "LOCAL", self.d), mock.patch.object(drive, "USE_API", False):
            return os.path.basename(drive.path(name, md5))

    def test_md5_picks_the_right_same_named_file(self):
        self.assertEqual(self.path("Mandala art", self.md5["Mandala art (2).jpg"]), "Mandala art (2).jpg")
        self.assertEqual(self.path("Mandala art", self.md5["Mandala art (1).jpg"]), "Mandala art (1).jpg")

    def test_plain_name_still_works(self):
        self.assertEqual(self.path("Lotus.jpg"), "Lotus.jpg")
        self.assertEqual(self.path("Lotus.jpg", self.md5["Lotus.jpg"]), "Lotus.jpg")

    def test_ci_download_names_never_collide(self):
        with mock.patch.object(drive, "USE_API", True), mock.patch.object(drive, "SRC", self.d), \
             mock.patch.object(drive, "_mimes", {"Mandala art": "image/jpeg"}):
            a = drive.path
            for m in ("aaaaaaaa11", "bbbbbbbb22"):      # pre-create so nothing is downloaded
                open(os.path.join(self.d, m[:8] + "-Mandala art.jpg"), "wb").close()
            self.assertNotEqual(a("Mandala art", "aaaaaaaa11"), a("Mandala art", "bbbbbbbb22"))


if __name__ == "__main__":
    unittest.main()
