# Mahalakshmi Srikanth — Art portfolio

Static site in `site/` (plain HTML/CSS/JS, no build step). Images are generated from the
"my artworks" Google Drive folder, which is only ever read.

## Change the watermark
    python3 build/build.py --wm 1   # colour seal, see-through, bottom-right (current)
    python3 build/build.py --wm 2   # white stamp, see-through, bottom-right
    python3 build/build.py --wm 3   # big faint stamp across the middle + small colour seal
Resized originals are cached in `build/cache/` (gitignored), so a re-stamp takes a few minutes.

## Add new artworks
Add a row to `build/catalog.tsv` (file, type, title, date), then rebuild.
Types: painting, drawing, craft (screenshot/photo/other are skipped). Rangoli/kolam/mandala
are detected from the title.

## Contact details
Edit `CONTACT` at the top of `site/app.js` (email / Instagram handle). Empty = section hidden.

## Preview / deploy
    cd site && python3 -m http.server 8765         # http://localhost:8765
    cd site && vercel deploy                       # preview (login-protected)
    cd site && vercel deploy --prod                # public
