"""Where the originals come from: the local Google Drive folder on the Mac, or the Drive API in CI.

CI sets GOOGLE_SERVICE_ACCOUNT_JSON (the key) and DRIVE_FOLDER_ID; the service account needs
Viewer access to the "my artworks" folder. Nothing here ever writes to Drive.
"""
import glob, hashlib, io, json, os

FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE")
# The Mac's synced copy of the folder. Found by folder id, so no account email is written here;
# set ARTWORKS_DIR to override.
LOCAL = os.environ.get("ARTWORKS_DIR") or next(iter(glob.glob(os.path.expanduser(
    f"~/Library/CloudStorage/GoogleDrive-*/.shortcut-targets-by-id/{FOLDER_ID}/my artworks"))), "")
HERE = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS = os.path.join(HERE, "originals")      # CI download dir (gitignored)

USE_API = bool(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"))
SRC = DOWNLOADS if USE_API else LOCAL

_svc = None
_ids = {}
_ids_md5 = {}   # Drive allows several files with one name; the checksum tells them apart
_mimes = {}
# Drive names can lack an extension ("culture of india " — the Mac app adds one locally),
# so the type falls back to the file's MIME type.
MIME_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic",
            "image/heif": ".heif", "image/gif": ".gif", "application/pdf": ".pdf"}


def _service():
    global _svc
    if _svc is None:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_info(
            json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
            scopes=["https://www.googleapis.com/auth/drive.readonly"])
        _svc = build("drive", "v3", credentials=creds, cache_discovery=False)
    return _svc


def listing():
    """[(name, md5, modified 'YYYY-MM-DD')] for every file directly in the folder."""
    if not USE_API:
        out = []
        for name in sorted(os.listdir(LOCAL)):
            p = os.path.join(LOCAL, name)
            if name.startswith(".") or not os.path.isfile(p):
                continue
            h = hashlib.md5()
            with open(p, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            from datetime import date
            out.append((name, h.hexdigest(), date.fromtimestamp(os.path.getmtime(p)).isoformat()))
        return out
    out, token = [], None
    while True:
        r = _service().files().list(
            q=f"'{FOLDER_ID}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
            fields="nextPageToken, files(id, name, md5Checksum, modifiedTime, mimeType)", pageSize=1000,
            pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        for f in r["files"]:
            _ids[f["name"]] = f["id"]
            if f.get("md5Checksum"):
                _ids_md5[f["md5Checksum"]] = f["id"]
            _mimes[f["name"]] = f.get("mimeType", "")
            out.append((f["name"], f.get("md5Checksum", ""), f["modifiedTime"][:10]))
        token = r.get("nextPageToken")
        if not token:
            return sorted(out)


def ext(name):
    """'.jpg', '.heic', … from the filename, else from the Drive MIME type ('' if neither)."""
    e = os.path.splitext(name.strip())[1].strip().lower()
    if e in MIME_EXT.values() or e in (".jpeg",):
        return e
    if USE_API and not _mimes:
        listing()
    if USE_API:
        return MIME_EXT.get(_mimes.get(name), e)
    return _sniff(local(name)) or e   # on the Mac there is no MIME type: read the file's first bytes


def local(name):
    """Path in the Mac's Drive folder. Drive lists some files without an extension that the Mac
    Drive app then adds ("culture of india " -> "culture of india .heic"), so fall back to that."""
    p = os.path.join(LOCAL, name)
    if os.path.exists(p) or USE_API or not os.path.isdir(LOCAL):
        return p
    for f in os.listdir(LOCAL):
        if os.path.splitext(f)[0] == name or os.path.splitext(f)[0].strip() == name.strip():
            return os.path.join(LOCAL, f)
    return p


def _sniff(p):
    """'.jpg' / '.png' / … from a local file's magic bytes, '' if unknown or unreadable."""
    try:
        with open(p, "rb") as f:
            head = f.read(16)
    except OSError:
        return ""
    if head[:3] == b"\xff\xd8\xff": return ".jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n": return ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return ".webp"
    if head[:4] in (b"GIF8",): return ".gif"
    if head[:4] == b"%PDF": return ".pdf"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"): return ".heic"
    return ""


def _md5_of(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def path(name, md5=None):
    """Local path to an original, downloading it first in CI (with an extension the loader knows).
    Pass the file's md5 so that one of several same-named files is the one fetched."""
    if not USE_API:
        p = local(name)
        if md5 and os.path.isdir(LOCAL) and not (os.path.exists(p) and _md5_of(p) == md5):
            for f in sorted(os.listdir(LOCAL)):        # the Mac shows them as "x (1).jpg", "x (2).jpg"
                q = os.path.join(LOCAL, f)
                if f.lower().startswith(name.strip().lower()) and os.path.isfile(q) and _md5_of(q) == md5:
                    return q
        return p
    e = ext(name)
    p = os.path.join(SRC, (md5[:8] + "-" if md5 else "") + name.strip()
                     + ("" if name.strip().lower().endswith(e) else e))
    if not os.path.exists(p):
        from googleapiclient.http import MediaIoBaseDownload
        if not _ids:
            listing()
        os.makedirs(DOWNLOADS, exist_ok=True)
        buf = io.FileIO(p, "wb")
        file_id = _ids_md5.get(md5) or _ids[name]
        dl = MediaIoBaseDownload(buf, _service().files().get_media(fileId=file_id, supportsAllDrives=True))
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf.close()
    return p
