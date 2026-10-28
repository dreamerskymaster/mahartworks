"""Bring build/catalog.tsv in line with the Drive folder.

- A file whose contents we already know (same md5) keeps its date; if she renamed it, the title
  follows her new filename, and so does the category when the new name says one (kolam, sketch,
  painting, craft…). Hidden items (type `other`: collages, photos) stay hidden.
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

# Camera / app names wait for a real name. A name that only *starts* with a number ("3D Star Rangoli",
# "2 Peacocks") is a real name; only all-number names ("1234", "-1_orig (10)", "20230101_120000") wait.
CAMERA = re.compile(r"^(img|image|dsc|pxl|photo|preview|screenshot|fb_img|inshot|picsart|snapchat|whatsapp|"
                    r"vid|adobe scan|[0-9a-f]{8}-|-?\d[\d\W_]*((orig|copy|edited)[\d\W_]*)*(\.\w+)?$)", re.I)
SMALL = {"a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"}
DRAWING = re.compile(r"sketch|drawing|doodle|pencil|crayon|pen art|zentangle|line art|mandala", re.I)
# Only the doll and the diya holders are crafts; lippan, mirror work, embroidery and plaques are paintings (her email 2026-10-26).
CRAFT = re.compile(r"craft|\bdolls?\b|best out (of )?waste|diya holder", re.I)


def title_of(name):
    base, e = os.path.splitext(name.strip())
    if e.lower() not in EXTS:                  # no extension, or a dot inside the title
        base = name.strip()
    base = re.sub(r"(\s*\(\d+\)|~\d+|\s+\d+)$", "", base.strip())       # "x (2)", "x~3", "x 2"
    words = re.sub(r"[_\s]+", " ", base).strip().split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(lw if i and lw in SMALL else lw.upper() if re.fullmatch(r"\d+d", lw) else lw[:1].upper() + lw[1:])
    return " ".join(out)


PAINTING = re.compile(r"painting|canvas|acrylic|watercolou?r|oil|madhubani|warli|pichwai", re.I)


def type_named(title):
    """The category her filename asks for, or None if it names none."""
    if re.search(r"rangoli|kolam|pookalam", title, re.I):
        return "rangoli"
    if re.search(r"\boil\b", title, re.I):
        return "oil"
    if re.search(r"\bglass\b", title, re.I):   # "Glass painting on a plate" is a painting, not a craft
        return "painting"
    if CRAFT.search(title):
        return "craft"
    if DRAWING.search(title):
        return "drawing"
    if PAINTING.search(title):
        return "painting"
    return None


def guess_type(title):
    return type_named(title) or "painting"


def date_of(name, modified):
    m = re.search(r"(20[12]\d)(\d\d)(\d\d)", name)
    if m and 1 <= int(m[2]) <= 12 and 1 <= int(m[3]) <= 31:
        return f"{m[1]}-{m[2]}-{m[3]}"
    return modified


def main():
    with open(CATALOG) as f:
        old = list(csv.DictReader(f, delimiter="\t"))
    by_file = {r["file"]: r for r in old}
    by_md5 = {r["md5"]: r for r in old if r.get("md5")}
    rows, added, renamed, waiting, skipped, copies = [], [], [], [], [], []
    listing = drive.listing()
    # Drive allows several files with one name, so a file is its (name, md5) pair, not its name.
    pairs, seen = {(n, m) for n, m, _ in listing}, set()
    for name, md5, modified in listing:
        if drive.ext(name) not in EXTS:
            skipped.append(repr(name))
            continue
        if (name, md5) in seen:                       # same name and same picture, uploaded twice
            copies.append(f"{name} (same picture as {name})")
            continue
        seen.add((name, md5))
        owner = by_md5.get(md5)
        known = by_file.get(name) if by_file.get(name, {}).get("md5") in ("", None, md5) else None
        if not known and owner and owner["file"] == name:
            known = owner                             # one of several same-named files
        if not known and owner and (owner["file"], md5) in pairs:
            copies.append(f"{name} (same picture as {owner['file']})")    # a copy, not a rename
            continue
        known = known or owner
        if known:
            r = dict(known, md5=md5)
            if known["file"] != name:
                r["file"] = name
                if not CAMERA.match(name.strip()):    # renamed to IMG_/UUID: keep the old title
                    r["title"] = title_of(name)
                    if r["type"] != "other" and type_named(r["title"]):
                        r["type"] = type_named(r["title"])
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
