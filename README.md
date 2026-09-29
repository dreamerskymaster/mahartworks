# Mahalakshmi Srikanth — Art portfolio

Live at **https://mah-artworks.pages.dev** · repo `dreamerskymaster/mahartworks`

Static site in `site/` (plain HTML/CSS/JS, no build step on the server). The gallery images
are generated on a Mac from her "my artworks" Google Drive folder, which the build only reads.

## Publishing
The Cloudflare Pages project `mah-artworks` is connected to this repo: **every push to `main`
publishes the site** (build command: none, output directory: `site`). No `wrangler` needed.

Manual fallback, from the repo root:

    npx wrangler pages deploy site --project-name mah-artworks --branch main

Preview locally with `cd site && python3 -m http.server 8765`.

## Adding / removing artworks — automatic
**She just adds, renames or deletes photos in her "my artworks" Drive folder.**
GitHub Actions (`.github/workflows/sync.yml`) checks the folder every 3 hours, rebuilds, and pushes;
Cloudflare then publishes. To publish immediately: GitHub → Actions → "Sync artworks from Google Drive" → Run workflow.

How the sync names things (`build/sync.py`):
- **Title = her filename**, tidied: "Pongal kolam.jpg" → "Pongal Kolam". Trailing " 2", "(1)", "~3" are dropped.
- **Category** from words in the name: rangoli/kolam/pookalam → Rangoli & Kolam; mandala → Mandalas;
  sketch/drawing/pencil/crayon/doodle → Drawings; craft/mirror/embroidery/plate → Crafts; anything else → Paintings.
- **Renaming keeps the category**: a photo is recognised by its contents (md5), not its name.
- Photos still named by the camera (`IMG_…`, `Screenshot_…`, `PXL_…`) are **held back** until she renames them.
- To fix a category by hand, edit the `type` column in `build/catalog.tsv` (painting, drawing, craft,
  rangoli; `other` hides a file) and push — the sync keeps hand edits.

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
