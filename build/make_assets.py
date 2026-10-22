"""One-off: the Vanna Reverie logo files, app icons and the link-preview image (WhatsApp / social).
Re-run if the logo (build/assets/vanna-reverie-logo.png) changes.

    python3 build/make_assets.py

Writes site/brand/logo.webp (full logo with tagline, footer), site/brand/wordmark.webp (no tagline, header),
site/icons/* (the butterfly from the logo) and site/og.jpg. The MS seal watermark on the pictures is separate.
"""
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
LOGO = os.path.join(HERE, "assets", "vanna-reverie-logo.png")   # 1597x985, flat cream background
CREAM, NAVY = (246, 240, 226), (13, 15, 28)
INK, GOLD_DARK, MUTED = (31, 36, 64), (138, 100, 32), (79, 84, 112)
SERIF = os.path.join(SITE, "fonts", "CormorantGaramond-normal-500-latin.woff2")
LOGO_BG = np.array([255, 251, 242.])     # the logo's paper colour
TAGLINE_TOP = 700                        # first row of "Every Stroke Tells a Story" in the source
BUTTERFLY = (1000, 140, 1240, 410)       # crop around the butterfly in the source


def transparent(path=LOGO):
    """The logo with its cream paper removed: alpha from how much darker than the paper each pixel is,
    colour un-mixed from the paper so the edges stay clean on any background."""
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    a = np.clip((LOGO_BG - im) / LOGO_BG, 0, 1).max(axis=2)
    a = np.clip((a - .035) / (1 - .035), 0, 1)       # paper texture -> fully transparent
    a[a < .02] = 0
    col = np.clip((im - LOGO_BG * (1 - a[..., None])) / np.maximum(a, 1e-6)[..., None], 0, 255)
    return Image.fromarray(np.dstack([col, a * 255]).astype("uint8"))


def components(mask):
    lab, n, (h, w) = np.zeros(mask.shape, int), 0, mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for yy in (y - 1, y, y + 1):
                for xx in (x - 1, x, x + 1):
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n; q.append((yy, xx))
    return lab, n


def butterfly(logo):
    """The butterfly alone: the brush stroke it sits on is whatever touches the crop's left edge."""
    b = np.asarray(logo.crop(BUTTERFLY)).copy()
    lab, n = components(b[..., 3] > 20)
    for i in set(lab[:, 0]) - {0}:
        b[lab == i, 3] = 0
    out = Image.fromarray(b)
    return out.crop(out.getbbox())


def fit(im, h=None, w=None):
    im = im.crop(im.getbbox())
    if h:
        return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def on_cream(mark, size, frac):
    im = Image.new("RGBA", (size, size), CREAM + (255,))
    k = size * frac / max(mark.size)                  # scale up or down so the longer side is size * frac
    m = mark.resize((round(mark.width * k), round(mark.height * k)), Image.LANCZOS)
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return im.convert("RGB")


def font(sz):
    for p in (SERIF, "/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(p, sz)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    logo = transparent()
    os.makedirs(os.path.join(SITE, "brand"), exist_ok=True)
    full = fit(logo, w=640)
    word = fit(logo.crop((0, 0, logo.width, TAGLINE_TOP)), h=120)
    full.save(os.path.join(SITE, "brand", "logo.webp"), quality=90, method=6)
    word.save(os.path.join(SITE, "brand", "wordmark.webp"), quality=90, method=6)

    mark = butterfly(logo)
    os.makedirs(os.path.join(SITE, "icons"), exist_ok=True)
    for name, size, frac in (("icon-192", 192, .86), ("icon-512", 512, .86), ("maskable-512", 512, .62),
                             ("apple-touch-icon", 180, .8)):
        on_cream(mark, size, frac).save(os.path.join(SITE, "icons", name + ".png"), optimize=True)

    W, H, P = 1200, 630, 560          # P = width of the cream logo panel
    og = Image.new("RGB", (W, H), NAVY)
    picks = ["kathakali-face-framed", "radha-seeing-krishna-reflection", "panchamukhi-hanuman-painting", "madhubani-peacock"]
    tiles = [Image.open(os.path.join(SITE, "img", p + ".webp")).convert("RGB") for p in picks
             if os.path.exists(os.path.join(SITE, "img", p + ".webp"))]
    tw, th, gap = 140, 270, 12
    x = P + (W - P - 4 * tw - 3 * gap) // 2
    for i, t in enumerate(tiles[:4]):
        t = ImageOps.fit(t, (tw, th if i % 2 == 0 else th - 40), Image.LANCZOS)
        og.paste(t, (x + i * (tw + gap), (H - t.height) // 2 + (-24 if i % 2 else 24)))
    d = ImageDraw.Draw(og)
    d.rectangle((0, 0, P, H), fill=CREAM)
    lg = fit(logo, w=P - 80)
    top = (H - (lg.height + 40 + 118)) // 2            # logo + three lines of text, centred
    og.paste(lg, (40, top), lg)
    y = top + lg.height + 40
    d.text((P // 2, y), "Original art by Mahalakshmi Srikanth", font=font(32), fill=INK, anchor="mt")
    d.text((P // 2, y + 56), "PAINTINGS · SKETCHES · MANDALAS · RANGOLI", font=font(17), fill=GOLD_DARK, anchor="mt")
    d.text((P // 2, y + 94), "mah-artworks.pages.dev", font=font(22), fill=MUTED, anchor="mt")
    og.save(os.path.join(SITE, "og.jpg"), quality=86, optimize=True, progressive=True)
    print("brand/, icons and og.jpg written:", full.size, word.size, mark.size)


if __name__ == "__main__":
    main()
