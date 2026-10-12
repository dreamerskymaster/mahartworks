# Mahalakshmi Srikanth — Art portfolio

Live at **https://mah-artworks.pages.dev** · repo `dreamerskymaster/mahartworks`

Static site in `site/` (plain HTML/CSS/JS, no build step on the server). The gallery images
are generated (by GitHub Actions, or on a Mac) from her "my artworks" Google Drive folder, which the build only reads.

## Publishing
The Cloudflare Pages project `mah-artworks` is connected to this repo: **every push to `main`
publishes the site** (build command: none, output directory: `site`). No `wrangler` needed.

Manual fallback, from the repo root:

    npx wrangler pages deploy site --project-name mah-artworks --branch main

Preview locally with `cd site && python3 -m http.server 8765`.

## Adding / removing artworks — automatic
**She just adds, renames or deletes photos in her "my artworks" Drive folder.** Within about
20 minutes the change is live, with her MS seal watermark on every picture.

How it runs (`.github/workflows/sync.yml`, on `main` only):
1. **Tests** (`tests/`) run first; if they fail, nothing is published.
2. `build/sync.py` compares Drive with `build/catalog.tsv`; `build/build.py` stamps and resizes only new photos.
3. The bot commits and pushes to `main`; Cloudflare Pages publishes.
4. The `next` job waits 20 minutes and starts the next run with GitHub's built-in token (no personal token).
   GitHub's hourly cron is only a backup that restarts this chain if it ever stops. There is only ever one chain:
   a run that sees a newer one hands over to it.

To publish immediately: GitHub → Actions → "Sync artworks from Google Drive" → Run workflow.
To pause everything: same page → "…" → Disable workflow.

How the sync names things (`build/sync.py`):
- **Title = her filename**, tidied: "Pongal kolam.jpg" → "Pongal Kolam". Trailing " 2", "(1)", "~3" are dropped.
- **Category** from words in the name: rangoli/kolam/pookalam → Rangoli & Kolam; mandala → Mandalas;
  sketch/drawing/pencil/crayon/doodle → Drawings; craft/mirror/embroidery/plate → Crafts;
  painting/canvas/acrylic/watercolour → Paintings; no category word → Paintings.
- **Renaming** updates the title, and the category too when the new name has a category word
  ("… kolam" moves it to Rangoli & Kolam). With no such word it keeps its category. A photo is
  recognised by its contents (md5), not its name, so its date is kept.
- Photos still named by the camera (`IMG_…`, `Screenshot_…`, `PXL_…`, UUIDs) are **held back** until she renames them.
- Videos (`.mp4`) are skipped by design — the site shows pictures only.
- Hidden items (`other`: collages, phone photos) stay hidden even if renamed. To fix a category by hand,
  edit the `type` column in `build/catalog.tsv` (painting, drawing, craft, rangoli, other) and push.
- Safety stop: a run that would remove more than a third of the artworks publishes nothing.

## Tests
    python3 -m unittest discover -s tests -v
`tests/test_sync.py` replays add / rename / delete / copy / video / camera-name / safety cases against a
fake Drive listing; `tests/test_build.py` checks the seal is stamped bottom-right, see-through, and the
gallery sections. CI runs them before every sync.

Access: Google service account `mahartworks-sync@ajithmlopsie7374.iam.gserviceaccount.com`
(project `ajithmlopsie7374`) with **Viewer** access to the folder; its key is the repo secret
`GOOGLE_SERVICE_ACCOUNT_JSON`. It can only read.

On the Mac the same scripts read the local Drive folder: `python3 build/sync.py && python3 build/build.py`.
`build/manifest.json` remembers every image already processed, so only new photos are downloaded.

Naming rule: **"Sketch"** only for pencil sketches; coloured pen / crayon work is a **"Drawing"**.

## Watermark
    python3 build/build.py --wm 1   # colour seal, see-through, bottom-right (current)
    python3 build/build.py --wm 2   # white stamp, see-through, bottom-right
    python3 build/build.py --wm 3   # big faint stamp across the middle + small colour seal
The choice is remembered in `build/manifest.json`. Or switch from GitHub: Actions → Run workflow → watermark 1/2/3
(re-stamping needs every original, so that run downloads the whole folder, ~15 min).

## Contact details
`CONTACT` at the top of `site/app.js` (email / Instagram). Empty = section hidden.
Seller and grievance details live in `site/policies.html`.
