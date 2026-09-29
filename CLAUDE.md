# CLAUDE.md — Mahalakshmi Srikanth art portfolio

Ajith's site for his mom's art business in India. Live: https://mah-artworks.pages.dev.
Repo: `dreamerskymaster/mahartworks` (public), branch `main`. README has the how-to.

## Deploy
- Cloudflare Pages project `mah-artworks` (account 3f4bfd018e345900174ed8cefdadd8af, login
  ajithsri3103@gmail.com) is **Git-connected**: push to `main` = publish. Output dir `site`, no build command.
- Don't also run `wrangler pages deploy` for normal changes. If you ever must, run it from the
  repo root on `site` — running wrangler *inside* `site/` writes `.wrangler/` there and it gets published.
- Wrangler 4.x `pages project create` silently makes a Workers project unless `--force`.

## Source of truth
- Originals: Google Drive "my artworks" folder
  (`~/Library/CloudStorage/GoogleDrive-ajithsri2000@gmail.com/.shortcut-targets-by-id/1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE/my artworks`).
  Flat folder, no subfolders. **His mom edits it herself** (deletes, renames, adds) — always diff the
  folder against `build/catalog.tsv` before rebuilding; never assume the catalog is current.
- `build/catalog.tsv` → `build/build.py` → `site/img/*.webp` + `site/data.js`. Never hand-edit `data.js`.
- Every Drive rename is appended to `~/Documents/artwork-rename-backup/rename_log.tsv` (old, new) so it can be undone.
- `build/cache/` is gitignored and slow to rebuild (Drive downloads on demand); in a worktree, symlink it
  to the main checkout's `build/cache`.

## Content rules
- "Sketch" = pencil only; coloured pen/crayon = "Drawing". Rangoli/kolam/mandala are title-detected,
  so avoid those words in titles of paintings (a "Kolam Border" canvas once landed in Rangoli).
- Watermark: colour MS seal (style 1) until she picks; options in README. Originals are never stamped.
- Her story in About is her own words — quote verbatim, don't edit.
- Footer line "Made by Ajith, for his only loving Mom" stays.
- `site/policies.html` is written for an Indian sole proprietor (DPDP Act 2023, Consumer Protection
  E-Commerce Rules 2020, Copyright Act 1957, RPwD Act 2016). Mumbai city, returns and commission
  terms are defaults awaiting her confirmation. Add GSTIN there if she registers.
- No trackers, cookies or third-party requests (fonts are self-hosted) — the privacy policy says so.

## Open
- Her watermark choice (1/2/3).
- 12 new files in Drive not yet catalogued (e.g. "Pongal kolam", "Kadva chauth").
- Proposed: GitHub Actions + Google service account to auto-sync Drive → site. Not built; Ajith to choose
  naming (her filenames vs free-tier AI). Free services only.
