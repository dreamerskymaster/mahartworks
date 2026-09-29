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

## Adding / removing artworks
1. She adds, renames or deletes photos in the Drive folder.
2. Update `build/catalog.tsv` (columns: file, type, title, date) to match the folder.
   Types: `painting`, `drawing`, `craft`; `screenshot`, `photo`, `other` are skipped.
   Category comes from the title first: *rangoli / kolam / pookalam* → Rangoli & Kolam,
   *mandala* → Mandalas; otherwise the type decides.
3. `python3 build/build.py` — resizes, drops near-duplicates, watermarks, writes `site/img/` and `site/data.js`.
4. Commit and push; Cloudflare publishes.

Naming rule: **"Sketch"** only for pencil sketches; coloured pen / crayon work is a **"Drawing"**;
crayon or sketch-pen work belongs in Drawings even if it looks painterly.

## Watermark
    python3 build/build.py --wm 1   # colour seal, see-through, bottom-right (current)
    python3 build/build.py --wm 2   # white stamp, see-through, bottom-right
    python3 build/build.py --wm 3   # big faint stamp across the middle + small colour seal
Resized originals are cached in `build/cache/` (gitignored), so a re-stamp takes minutes.

## Contact details
`CONTACT` at the top of `site/app.js` (email / Instagram). Empty = section hidden.
Seller and grievance details live in `site/policies.html`.
