"""Build the gallery: pick artworks, drop duplicates, resize to WebP, watermark.

    python3 build/build.py                 # uses WATERMARK below
    python3 build/build.py --wm 2          # re-stamp with another style (fast: uses cache)

Originals in Google Drive are only ever read.
"""
import argparse, csv, hashlib, json, os, re, subprocess, tempfile
from PIL import Image, ImageOps

import watermark

SRC = ("/Users/skymaster/Library/CloudStorage/GoogleDrive-ajithsri2000@gmail.com/"
       ".shortcut-targets-by-id/1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE/my artworks")
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
CACHE = os.path.join(HERE, "cache")          # resized, un-watermarked (gitignored)
WATERMARK = 1                                # 1 colour seal, 2 white stamp, 3 big faint + corner
FULL, THUMB = 1200, 480
SKIP_TYPES = {"screenshot", "photo", "other", "document"}
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def category(t, title):
    s = title.lower()
    if re.search(r"rangoli|kolam|pookalam", s):
        return "rangoli"
    if "mandala" in s:
        return "mandalas"
    if t == "craft":
        return "crafts"
    return "paintings" if t == "painting" else "drawings"


def load(path):
    if path.lower().endswith(".heic"):
        tmp = tempfile.mktemp(suffix=".jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", path, "--out", tmp], capture_output=True, check=True)
        path = tmp
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def dhash(im):
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.tobytes())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wm", type=int, default=WATERMARK)
    wm = watermark.STYLES[ap.parse_args().wm]
    os.makedirs(CACHE, exist_ok=True)

    rows = [r for r in csv.DictReader(open(os.path.join(HERE, "catalog.tsv")), delimiter="\t")
            if r["type"] not in SKIP_TYPES and os.path.splitext(r["file"])[1].lower() in EXTS
            and os.path.exists(os.path.join(SRC, r["file"]))]

    # Resize every candidate once into the cache.
    cands = []
    for r in rows:
        key = hashlib.md5(r["file"].encode()).hexdigest()[:12]
        cp = os.path.join(CACHE, key + ".png")
        if not os.path.exists(cp):
            im = load(os.path.join(SRC, r["file"]))
            r_px = im.width * im.height
            im.thumbnail((FULL, FULL), Image.LANCZOS)
            im.save(cp)
            open(cp + ".px", "w").write(str(r_px))
        im = Image.open(cp)
        cands.append(dict(r, cache=cp, px=int(open(cp + ".px").read()), h=dhash(im), size=im.size))

    # Same title + near-identical picture = one artwork; keep the biggest original.
    kept = []
    for c in sorted(cands, key=lambda c: -c["px"]):
        if not any(k["title"] == c["title"] and bin(k["h"] ^ c["h"]).count("1") <= 12 for k in kept):
            kept.append(c)

    out = os.path.join(SITE, "img")
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    items, used = [], set()
    for c in kept:
        s = slug(c["title"])
        n = 2
        while s in used:
            s, n = f"{slug(c['title'])}-{n}", n + 1
        used.add(s)
        im = Image.open(c["cache"]); im.thumbnail((FULL, FULL), Image.LANCZOS); im = wm(im)
        im.save(os.path.join(out, s + ".webp"), quality=64, method=6)
        t = im.copy(); t.thumbnail((THUMB, THUMB), Image.LANCZOS)
        t.save(os.path.join(out, s + ".t.webp"), quality=62, method=6)
        items.append({"id": s, "title": c["title"], "cat": category(c["type"], c["title"]),
                      "date": c["date"], "w": im.width, "h": im.height})

    items.sort(key=lambda i: i["date"] or "0000", reverse=True)
    with open(os.path.join(SITE, "data.js"), "w") as f:
        f.write("window.ARTWORKS = " + json.dumps(items, indent=0) + ";\n")
    from collections import Counter
    print(f"{len(cands)} candidates -> {len(items)} artworks", dict(Counter(i["cat"] for i in items)))


if __name__ == "__main__":
    main()
