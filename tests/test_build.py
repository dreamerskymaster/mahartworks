"""Every published picture carries her seal, and lands in the right gallery section."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "build"))
from PIL import Image, ImageChops, ImageStat  # noqa: E402

import build      # noqa: E402
import watermark  # noqa: E402


def changed(a, b, box):
    return ImageStat.Stat(ImageChops.difference(a.crop(box), b.crop(box))).mean[0]


class WatermarkTest(unittest.TestCase):
    def setUp(self):
        self.art = Image.new("RGB", (1000, 800), (200, 120, 60))

    def test_colour_seal_is_default(self):
        self.assertEqual(build.WATERMARK, 1)
        self.assertIs(watermark.STYLES[1], watermark.colour_corner)

    def test_seal_bottom_right_and_see_through(self):
        out = watermark.STYLES[1](self.art)
        self.assertEqual(out.size, self.art.size)
        self.assertGreater(changed(self.art, out, (760, 560, 990, 790)), 5, "no seal in bottom-right")
        self.assertLess(changed(self.art, out, (0, 0, 500, 400)), 0.5, "artwork changed outside the seal")
        r, g, b = out.getpixel((875, 675))
        self.assertGreater(r + g + b, 60, "seal is fully opaque; art should show through")

    def test_all_styles_stamp(self):
        for n, fn in watermark.STYLES.items():
            self.assertGreater(changed(self.art, fn(self.art), (0, 0, 1000, 800)), 0.2, f"style {n}")


class CategoryTest(unittest.TestCase):
    def test_sections(self):
        c = build.category
        self.assertEqual(c("painting", "Pongal Kolam"), "rangoli")
        self.assertEqual(c("rangoli", "Kadva Chauth"), "rangoli")
        self.assertEqual(c("drawing", "Rainbow Mandala"), "mandalas")
        self.assertEqual(c("craft", "Mirror Work Plate"), "crafts")
        self.assertEqual(c("painting", "Sea Stone Shell Painting"), "paintings")
        self.assertEqual(c("drawing", "Girl In Rain Drawing"), "drawings")

    def test_hidden_types_not_published(self):
        self.assertIn("other", build.SKIP_TYPES)


if __name__ == "__main__":
    unittest.main()
