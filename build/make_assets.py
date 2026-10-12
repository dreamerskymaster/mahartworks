"""One-off: app icons and the link-preview image (WhatsApp / social). Re-run if the seal changes.

    python3 build/make_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
SEAL = Image.open(os.path.join(HERE, "assets", "seal_color.png")).convert("RGBA")
CREAM, NAVY, GOLD = (246, 240, 226), (13, 15, 28), (212, 174, 92)
SERIF = os.path.join(SITE, "fonts", "CormorantGaramond-normal-500-latin.woff2")


def seal_on(size, frac, bg):
    im = Image.new("RGB", (size, size), bg)
    s = SEAL.copy(); s.thumbnail((int(size * frac), int(size * frac)), Image.LANCZOS)
    im.paste(s, ((size - s.width) // 2, (size - s.height) // 2), s)
    return im


def font(sz):
    for p in (SERIF, "/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"):
        try:
            return ImageFont.truetype(p, sz)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    os.makedirs(os.path.join(SITE, "icons"), exist_ok=True)
    for name, size, frac in (("icon-192", 192, .92), ("icon-512", 512, .92), ("maskable-512", 512, .68),
                             ("apple-touch-icon", 180, .86)):
        seal_on(size, frac, CREAM).save(os.path.join(SITE, "icons", name + ".png"), optimize=True)

    W, H = 1200, 630
    og = Image.new("RGB", (W, H), NAVY)
    picks = ["kathakali-face-framed", "radha-seeing-krishna-reflection", "panchamukhi-hanuman-painting", "madhubani-peacock"]
    tiles = [Image.open(os.path.join(SITE, "img", p + ".webp")).convert("RGB") for p in picks
             if os.path.exists(os.path.join(SITE, "img", p + ".webp"))]
    x, tw, th, gap = 536, 150, 270, 12
    for i, t in enumerate(tiles[:4]):
        t = ImageOps.fit(t, (tw, th if i % 2 == 0 else th - 40), Image.LANCZOS)
        og.paste(t, (x + i * (tw + gap), (H - t.height) // 2 + (-24 if i % 2 else 24)))
    d = ImageDraw.Draw(og)
    s = SEAL.copy(); s.thumbnail((120, 120), Image.LANCZOS)
    disc = Image.new("RGBA", (132, 132), (0, 0, 0, 0)); ImageDraw.Draw(disc).ellipse((0, 0, 131, 131), fill=CREAM + (255,))
    disc.paste(s, ((132 - s.width) // 2, (132 - s.height) // 2), s)
    og.paste(disc, (64, 70), disc)
    d.text((64, 250), "Mahalakshmi", font=font(66), fill=(236, 230, 216))
    d.text((64, 322), "Srikanth", font=font(66), fill=(236, 230, 216))
    d.text((66, 420), "PAINTINGS · SKETCHES · MANDALAS · RANGOLI", font=font(20), fill=GOLD)
    d.text((66, 470), "mah-artworks.pages.dev", font=font(26), fill=(169, 166, 186))
    og.save(os.path.join(SITE, "og.jpg"), quality=86, optimize=True, progressive=True)
    print("icons + og.jpg written")


if __name__ == "__main__":
    main()
