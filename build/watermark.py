"""See-through Mahalakshmi Srikanth seal, in three styles."""
import os
from PIL import Image

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
SEAL = Image.open(os.path.join(A, "seal_color.png"))
STAMP_MASK = Image.open(os.path.join(A, "stamp_mask.png"))


def _white_stamp():
    im = Image.new("RGBA", STAMP_MASK.size, (255, 255, 255, 255))
    im.putalpha(STAMP_MASK)
    return im


def _place(img, logo, frac, where, opacity):
    img = img.convert("RGBA")
    w, h = img.size
    s = int(min(w, h) * frac)
    logo = logo.resize((s, int(logo.height * s / logo.width)), Image.LANCZOS)
    logo.putalpha(logo.getchannel("A").point(lambda v: int(v * opacity)))
    pad = int(min(w, h) * 0.03)
    xy = {"br": (w - logo.width - pad, h - logo.height - pad),
          "center": ((w - logo.width) // 2, (h - logo.height) // 2)}[where]
    img.alpha_composite(logo, xy)
    return img


def colour_corner(img):
    return _place(img, SEAL, 0.24, "br", 0.55).convert("RGB")


def white_corner(img):
    return _place(img, _white_stamp(), 0.24, "br", 0.55).convert("RGB")


def big_faint(img):
    img = _place(img, _white_stamp(), 0.62, "center", 0.22)
    return _place(img, SEAL, 0.18, "br", 0.6).convert("RGB")


STYLES = {1: colour_corner, 2: white_corner, 3: big_faint}
