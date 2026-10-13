"""Certificate of Authenticity numbers: MS-<YYYY>-<NNNN>, one per artwork, for ever.

    YYYY  the year of the artwork's date, or the year it was first published when it has no date
    NNNN  a running number in order of first publication (zero padded to 4 digits), never reused

The register lives in build/manifest.json as "certs": {number: [md5, id, (other md5s)]}: the picture (md5),
the artwork id it was issued to and any other photos of the same artwork (smaller copies the build dropped).
Entries are never deleted, so a removed artwork's number is never given to another one, and the next number
is always one more than the highest ever issued. A number follows the picture, not the filename: renaming
keeps it; re-uploading the same photo gets the old number back; and when she has two copies of an artwork
under one title (the build shows the bigger) and deletes one, the number stays with the copy that remains.
"""
import re
from datetime import date

PATTERN = re.compile(r"^MS-(\d{4})-(\d{4,})$")


def fmt(year, n):
    return f"MS-{year}-{n:04d}"


def seq(cert):
    return int(PATTERN.match(cert)[2])


def this_year():
    return date.today().year


def assign(arts, register, year=None):
    """arts: [{"id", "key" (md5), "date", "also" (md5s of dropped copies, optional)}].
    Updates register in place and returns {id: number}. Existing artworks keep their numbers; new ones
    are numbered in order of (date, id), undated ones last, with the year of first publication."""
    year = year or this_year()
    by_md5 = {}
    for cert, (md5, aid, *copies) in sorted(register.items(), key=lambda kv: seq(kv[0])):
        for m in [md5] + list(copies[0] if copies else []):
            by_md5.setdefault(m, []).append((cert, aid))
    out, used = {}, set()

    def take(a, cert):
        out[a["id"]] = cert
        used.add(cert)
        old = register.get(cert) or []
        # every photo ever seen of this artwork (smaller copies she uploaded too), so deleting the
        # biggest copy later leaves the number with the one that remains
        copies = set(a.get("also") or []) | set(old[2] if len(old) > 2 else []) | ({old[0]} if old else set())
        copies.discard(a["key"])
        register[cert] = [a["key"], a["id"]] + ([sorted(copies)] if copies else [])

    # 1. same picture, same artwork id   2. same picture (or a copy it replaced) under another id
    for exact in (True, False):
        for a in sorted(arts, key=lambda a: a["id"]):
            if a["id"] in out:
                continue
            for md5 in [a["key"]] + list(a.get("also") or []):
                hit = next((c for c, aid in by_md5.get(md5, []) if c not in used and (aid == a["id"] or not exact)), None)
                if hit:
                    take(a, hit)
                    break
    # 3. new artworks: next numbers, oldest first
    n = max((seq(c) for c in register), default=0)
    for a in sorted((a for a in arts if a["id"] not in out), key=lambda a: (a["date"] or "9999", a["id"])):
        n += 1
        take(a, fmt(a["date"][:4] if a["date"] else year, n))
    return out
