"""Bring build/catalog.tsv in line with the Drive folder.

- A file whose contents we already know (same md5) keeps its type and date; if she renamed it,
  the title follows her new filename.
- A new file gets its title from her filename and a type guessed from the words in it.
- Files still carrying camera names (IMG_1234, Screenshot_…) are left off until she renames them.
- Files deleted from Drive are dropped.
- Anything skipped (unsupported type, camera name, duplicate copy) is printed with its exact name,
  so a file never goes missing silently. Stray spaces around names ("x .heic ") are ignored.
- A second copy of a picture that is still listed under its old name is a copy, not a rename.

Prints a summary and, in GitHub Actions, sets the output `changed=true|false`.
"""
import csv, os, re, sys

import drive

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, "catalog.tsv")
FIELDS = ["file", "type", "title", "date", "md5"]
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".pdf"}

CAMERA = re.compile(r"^(img|image|dsc|pxl|photo|preview|screenshot|fb_img|inshot|picsart|snapchat|whatsapp|"
                    r"vid|adobe scan|-?\d|[0-9a-f]{8}-)", re.I)
SMALL = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"}
DRAWING = re.compile(r"sketch|drawing|doodle|pencil|crayon|pen art|zentangle|line art|mandala", re.I)
CRAFT = re.compile(r"craft|mirror|embroider|lippan|plate|diya holder|door plaque|clay|mehndi|quilling", re.I)


def ext_of(name):
    return os.path.splitext(name.strip())[1].strip().lower()


def title_of(name):
    base = os.path.splitext(name.strip())[0]
    base = re.sub(r"(\s*\(\d+\)|~\d+|\s+\d+)$", "", base.strip())       # "x (2)", "x~3", "x 2"
    words = re.sub(r"[_\s]+", " ", base).strip().split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(lw if i and lw in SMALL else lw[:1].upper() + lw[1:])
    return " ".join(out)


def guess_type(title):
    if re.search(r"rangoli|kolam|pookalam", title, re.I):
        return "rangoli"
    if CRAFT.search(title):
        return "craft"
    if DRAWING.search(title):
        return "drawing"
    return "painting"     # rangoli / kolam are picked out from the title at build time


def date_of(name, modified):
    m = re.search(r"(20[12]\d)(\d\d)(\d\d)", name)
    if m and 1 <= int(m[2]) <= 12 and 1 <= int(m[3]) <= 31:
        return f"{m[1]}-{m[2]}-{m[3]}"
    return modified


def main():
    old = list(csv.DictReader(open(CATALOG), delimiter="\t"))
    by_file = {r["file"]: r for r in old}
    by_md5 = {r["md5"]: r for r in old if r.get("md5")}
    rows, added, renamed, waiting, skipped, copies = [], [], [], [], [], []
    listing = drive.listing()
    names = {n for n, _, _ in listing}
    for name, md5, modified in listing:
        if ext_of(name) not in EXTS:
            skipped.append(repr(name))
            continue
        known = by_file.get(name) if by_file.get(name, {}).get("md5") in ("", None, md5) else None
        if not known and by_md5.get(md5) and by_md5[md5]["file"] in names:
            copies.append(f"{name} (same picture as {by_md5[md5]['file']})")    # a copy, not a rename
            continue
        known = known or by_md5.get(md5)
        if known:
            r = dict(known, md5=md5)
            if known["file"] != name:
                r["file"] = name
                if not CAMERA.match(name.strip()):    # renamed to IMG_/UUID: keep the old title
                    r["title"] = title_of(name)
                renamed.append(f"{known['file']} -> {name}")
            rows.append(r)
        elif CAMERA.match(name.strip()):
            waiting.append(repr(name))
        else:
            t = title_of(name)
            rows.append({"file": name, "type": guess_type(t), "title": t,
                         "date": date_of(name, modified), "md5": md5})
            added.append(f"{name}  [{rows[-1]['type']}]")
    kept = {r["file"] for r in rows}
    removed = [r["file"] for r in old if r["file"] not in kept]
    # Safety: an unshared folder or an API hiccup looks like "everything was deleted".
    if old and (not rows or len(removed) > len(old) / 3) and not os.environ.get("ALLOW_BIG_REMOVAL"):
        sys.exit(f"Refusing to sync: {len(removed)} of {len(old)} artworks would disappear. "
                 "Check the service account can see the folder, or set ALLOW_BIG_REMOVAL=1 if this is real.")

    changed = sorted(map(repr, (dict((k, r.get(k, "")) for k in FIELDS) for r in rows))) != \
        sorted(map(repr, (dict((k, r.get(k, "")) for k in FIELDS) for r in old)))
    with open(CATALOG, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter="\t", lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["file"].lower()))

    for label, items in (("added", added), ("renamed", renamed), ("removed", removed),
                         ("waiting for a real name", waiting), ("skipped, not a picture", skipped),
                         ("skipped, duplicate copy", copies)):
        print(f"{label}: {len(items)}")
        for i in items:
            print("   ", i)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
            f.write(f"summary=+{len(added)} new, {len(renamed)} renamed, -{len(removed)} removed\n")


if __name__ == "__main__":
    main()
