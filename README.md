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

## The site (`site/`)
Plain HTML/CSS/JS, no framework or build step; designed phone-first and checked at 360, 390, 768 and 1440 px.
- **Home:** hero with her words and five artworks, stats, the **Spotlight** easter egg, gallery, journey,
  her letter (sealed with her stamp), contact, footer with policies and the dedication.
- **Spotlight:** a painting in the dark; the light follows the cursor (laptop), the finger (phone) or the
  arrow keys. "Reveal the painting", then "Try another painting". Picks from `SPOTLIGHT` in `site/app.js`;
  titles that no longer exist are skipped, and it falls back to any paintings.
- **Gallery:** category chips (swipeable on phones), search, 48 at a time with "Show more". Phones show titles
  under each piece; laptops show them on hover.
- **Viewer:** arrows / swipe, counter, Share (phone share sheet, else copies the link). Each artwork has a link,
  `https://mah-artworks.pages.dev/#art/<id>`, that opens it directly.
- **Display panel:** theme, text size, reduce motion, contrast, readable font, underline links.
- Installable as a phone app (`manifest.webmanifest`, `icons/`); link previews use `og.jpg`.
  Regenerate both with `python3 build/make_assets.py`.
- `site/_headers`: security headers (strict CSP: no inline scripts, nothing third-party) and caching.

## Tests
    python3 -m unittest discover -s tests -v          # 35 cases
    npm ci --prefix tests/e2e && npm test --prefix tests/e2e   # 30 browser cases (needs Chrome)
- `tests/test_sync.py`: add / rename / delete / copy / video / camera-name / safety cases against a fake Drive.
- `tests/test_build.py`: the seal is stamped bottom-right and see-through; gallery sections.
- `tests/test_site.py`: every artwork has both images, no orphans, all links and anchors resolve, no inline
  scripts (CSP), meta/manifest/icons, her About text unchanged.
- `tests/e2e/`: real Chrome on two phones, a tablet and a laptop: no errors or broken files, no sideways scroll,
  menu, spotlight (mouse, finger, keys, reduced motion), filters, search, viewer, shared links, share, settings.
  `server.mjs` serves `site/` like Cloudflare Pages, including the `_headers` CSP.

CI: `.github/workflows/test.yml` runs both suites on every push and pull request; `sync.yml` runs the
Python suite before each Drive sync.

## Watermark
    python3 build/build.py --wm 1   # colour seal, see-through, bottom-right (current)
    python3 build/build.py --wm 2   # white stamp, see-through, bottom-right
    python3 build/build.py --wm 3   # big faint stamp across the middle + small colour seal
The choice is remembered in `build/manifest.json`. Or switch from GitHub: Actions → Run workflow → watermark 1/2/3
(re-stamping needs every original, so that run downloads the whole folder, ~15 min).

## Contact details
`CONTACT` at the top of `site/app.js` (email / Instagram). Empty = section hidden.
Seller and grievance details live in `site/policies.html`.
