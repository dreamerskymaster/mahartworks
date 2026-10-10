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
- Pipeline: `build/sync.py` (Drive → `catalog.tsv`, matched by md5; jpg/png/webp/heic/gif/pdf, every skipped file is logged) → `build/build.py` (incremental via
  `build/manifest.json`) → `site/img/*.webp` + `site/data.js`. Never hand-edit `data.js` or `manifest.json`.
- **Automatic**: `.github/workflows/sync.yml` runs hourly (GitHub often starts it late) with a read-only service account
  (`mahartworks-sync@ajithmlopsie7374.iam.gserviceaccount.com`, secret `GOOGLE_SERVICE_ACCOUNT_JSON`) and pushes;
  it commits as artworks-sync[bot]. Pull before editing locally. Titles come from her filenames; camera-named files wait.
- **Schedule:** GitHub's own cron (`17 * * * *`) is best-effort and in Oct 2026 fired only every 4–8 h, so uploads
  looked "missing" for hours. Cloudflare Worker `mah-artworks-scheduler` (`scheduler/`, cron `*/20 * * * *`) calls
  workflow_dispatch instead; it needs Worker secret `GITHUB_TOKEN` (fine-grained PAT, this repo only, Actions: write).
  Deploy with `cd scheduler && npx wrangler deploy`. Videos (.mp4) are skipped by design — the site is images only.
- Hand overrides live in the catalog `type` column (painting/drawing/craft/rangoli/other); sync preserves them.
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
- Scheduled workflows in public repos pause after 60 days without commits; re-enable in the Actions tab if she goes quiet.
