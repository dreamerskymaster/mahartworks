"""Build the gallery: pick artworks, drop duplicates, resize to WebP, watermark.

    python3 build/build.py                 # uses WATERMARK below
    python3 build/build.py --wm 2          # re-stamp with another style (remembered afterwards)

Run build/sync.py first to bring catalog.tsv in line with Drive. Originals are only ever read.
"""
import argparse, csv, hashlib, json, os, re, subprocess, tempfile
from PIL import Image, ImageOps

import drive
import watermark

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "site")
CACHE = os.path.join(HERE, "cache")          # resized, un-watermarked (gitignored)
MANIFEST = os.path.join(HERE, "manifest.json")  # per-image facts + what each output was made from
WATERMARK = 1                                # 1 colour seal, 2 white stamp, 3 big faint + corner
FULL, THUMB = 1200, 480
SKIP_TYPES = {"screenshot", "photo", "other", "document"}
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".pdf"}


def category(t, title):
    s = title.lower()
    if t == "rangoli":                           # set by hand when the title doesn't say so
        return "rangoli"
    if re.search(r"rangoli|kolam|pookalam", s):
        return "rangoli"
    if "mandala" in s:
        return "mandalas"
    if t == "craft":
        return "crafts"
    return "paintings" if t == "painting" else "drawings"


def load(path):
    ext = os.path.splitext(path.strip())[1].strip().lower()
    if ext == ".pdf":                            # a scanned artwork: use the first page
        import fitz
        with fitz.open(path) as doc:
            pix = doc[0].get_pixmap(dpi=200)
            return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    if ext in (".heic", ".heif"):
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
            return ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        except ImportError:
            pass
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


def cached(r):
    """Resized, un-watermarked copy of an original (made on first use)."""
    cp = os.path.join(CACHE, hashlib.md5(r["file"].encode()).hexdigest()[:12] + ".png")
    if not os.path.exists(cp):
        im = load(drive.path(r["file"]))
        open(cp + ".px", "w").write(str(im.width * im.height))
        im.thumbnail((FULL, FULL), Image.LANCZOS)
        im.save(cp)
    return cp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wm", type=int, default=None, help="watermark style (default: last used, else %d)" % WATERMARK)
    args = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {"facts": {}, "outputs": {}, "wm": WATERMARK}
    wm_no = args.wm or man.get("wm", WATERMARK)
    wm = watermark.STYLES[wm_no]

    rows = [r for r in csv.DictReader(open(os.path.join(HERE, "catalog.tsv")), delimiter="\t")
            if r["type"] not in SKIP_TYPES and drive.ext(r["file"]) in EXTS]

    # Facts per original (size, duplicate hash) are remembered, so CI only downloads new photos.
    cands, facts = [], {}
    for r in rows:
        key = r.get("md5") or r["file"]
        f = man["facts"].get(key)
        if not f:
            cp = cached(r)
            im = Image.open(cp)
            full = im.copy(); full.thumbnail((FULL, FULL), Image.LANCZOS)
            f = {"px": int(open(cp + ".px").read()), "h": dhash(im), "w": full.width, "hgt": full.height}
        facts[key] = f
        cands.append(dict(r, key=key, **f))

    # Same title + near-identical picture = one artwork; keep the biggest original.
    kept = []
    for c in sorted(cands, key=lambda c: (-c["px"], c["file"])):
        if not any(k["title"] == c["title"] and bin(k["h"] ^ c["h"]).count("1") <= 12 for k in kept):
            kept.append(c)

    out = os.path.join(SITE, "img")
    os.makedirs(out, exist_ok=True)
    items, used, outputs, made = [], set(), {}, 0
    for c in kept:
        s = slug(c["title"])
        n = 2
        while s in used:
            s, n = f"{slug(c['title'])}-{n}", n + 1
        used.add(s)
        stamp = [c["key"], wm_no]
        fp, tp = os.path.join(out, s + ".webp"), os.path.join(out, s + ".t.webp")
        if man["outputs"].get(s) != stamp or not (os.path.exists(fp) and os.path.exists(tp)):
            im = Image.open(cached(c)); im.thumbnail((FULL, FULL), Image.LANCZOS); im = wm(im)
            im.save(fp, quality=64, method=6)
            t = im.copy(); t.thumbnail((THUMB, THUMB), Image.LANCZOS)
            t.save(tp, quality=62, method=6)
            made += 1
        outputs[s] = stamp
        items.append({"id": s, "title": c["title"], "cat": category(c["type"], c["title"]),
                      "date": c["date"], "w": c["w"], "h": c["hgt"]})
    for f in os.listdir(out):                        # drop images of removed artworks
        if f.split(".")[0] not in outputs:
            os.remove(os.path.join(out, f))

    items.sort(key=lambda i: (i["date"] or "0000", i["id"]), reverse=True)
    with open(os.path.join(SITE, "data.js"), "w") as f:
        f.write("window.ARTWORKS = " + json.dumps(items, indent=0) + ";\n")
    json.dump({"wm": wm_no, "facts": facts, "outputs": outputs}, open(MANIFEST, "w"), indent=0, sort_keys=True)
    from collections import Counter
    print(f"{len(cands)} candidates -> {len(items)} artworks ({made} images made)",
          dict(Counter(i["cat"] for i in items)))


if __name__ == "__main__":
    main()
