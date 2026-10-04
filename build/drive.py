"""Where the originals come from: the local Google Drive folder on the Mac, or the Drive API in CI.

CI sets GOOGLE_SERVICE_ACCOUNT_JSON (the key) and DRIVE_FOLDER_ID; the service account needs
Viewer access to the "my artworks" folder. Nothing here ever writes to Drive.
"""
import hashlib, io, json, os

FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE")
LOCAL = ("/Users/skymaster/Library/CloudStorage/GoogleDrive-ajithsri2000@gmail.com/"
         ".shortcut-targets-by-id/1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE/my artworks")
HERE = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS = os.path.join(HERE, "originals")      # CI download dir (gitignored)

USE_API = bool(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"))
SRC = DOWNLOADS if USE_API else LOCAL

_svc = None
_ids = {}
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
    return MIME_EXT.get(_mimes.get(name), e)


def path(name):
    """Local path to an original, downloading it first in CI (with an extension the loader knows)."""
    p = os.path.join(SRC, name)
    if USE_API:
        e = ext(name)
        p = os.path.join(SRC, name.strip() + ("" if name.strip().lower().endswith(e) else e))
    if USE_API and not os.path.exists(p):
        from googleapiclient.http import MediaIoBaseDownload
        if not _ids:
            listing()
        os.makedirs(DOWNLOADS, exist_ok=True)
        buf = io.FileIO(p, "wb")
        dl = MediaIoBaseDownload(buf, _service().files().get_media(fileId=_ids[name], supportsAllDrives=True))
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf.close()
    return p
