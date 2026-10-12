# CLAUDE.md — Mahalakshmi Srikanth art portfolio

Ajith's site for his mom's art business in India. Live: https://mah-artworks.pages.dev.
Repo: `dreamerskymaster/mahartworks` (public), branch `main`. README has the how-to.

## Deploy
- Cloudflare Pages project `mah-artworks` (account 3f4bfd018e345900174ed8cefdadd8af, login
  <cloudflare-account>) is **Git-connected**: push to `main` = publish. Output dir `site`, no build command.
- Don't also run `wrangler pages deploy` for normal changes. If you ever must, run it from the
  repo root on `site` — running wrangler *inside* `site/` writes `.wrangler/` there and it gets published.
- Wrangler 4.x `pages project create` silently makes a Workers project unless `--force`.

## Source of truth
- Originals: Google Drive "my artworks" folder
  (`~/Library/CloudStorage/GoogleDrive-<google-account>/.shortcut-targets-by-id/1WPuT5LQUEvd2W90qsTFSUPs--Z4GB3rE/my artworks`).
  Flat folder, no subfolders. **His mom edits it herself** (deletes, renames, adds) — always diff the
  folder against `build/catalog.tsv` before rebuilding; never assume the catalog is current.
- Pipeline: `build/sync.py` (Drive → `catalog.tsv`, matched by md5; jpg/png/webp/heic/gif/pdf, every skipped file is logged) → `build/build.py` (incremental via
  `build/manifest.json`) → `site/img/*.webp` + `site/data.js`. Never hand-edit `data.js` or `manifest.json`.
- **Automatic**: `.github/workflows/sync.yml` runs hourly (GitHub often starts it late) with a read-only service account
  (`mahartworks-sync@ajithmlopsie7374.iam.gserviceaccount.com`, secret `GOOGLE_SERVICE_ACCOUNT_JSON`) and pushes;
  it commits as artworks-sync[bot]. Pull before editing locally. Titles come from her filenames; camera-named files wait.
- **Schedule:** GitHub's own cron is best-effort (in Oct 2026 it fired only every 4–8 h), so each sync run's
  `next` job sleeps 20 min and dispatches the following run with the built-in `github.token` (actions: write).
  The hourly cron only restarts the chain if a run is ever lost; a run that sees a newer one stops, so there is
  one chain. Both jobs are gated to `main` and `concurrency` is on the `sync` job only (so the 20-min sleep never
  blocks a manual run). Free: public repo. Pause with Actions → Disable workflow.
- **Never run sync.yml on a non-main branch.** On 2026-10-10 PR #2 was merged minutes before its last commit;
  the chain kept running on the PR branch for 2 days, committing her renames there and cancelling every main run
  via the shared concurrency group. Check `gh run list --workflow sync.yml` for branch runs if the site goes stale.
- **Renames:** title follows her new filename; type follows it too when the name has a category word
  (`type_named` in sync.py), else kept. `other` stays hidden. Camera names wait. Videos skipped.
- **Tests:** `python3 -m unittest discover -s tests -v` (22 cases); CI runs them before syncing — add a case for
  any new naming rule.
- Hand overrides live in the catalog `type` column (painting/drawing/craft/rangoli/other); sync keeps them
  unless she renames the file with a different category word.
- Every Drive rename is appended to `~/Documents/artwork-rename-backup/rename_log.tsv` (old, new) so it can be undone.
- `build/cache/` is gitignored and slow to rebuild (Drive downloads on demand); in a worktree, symlink it
  to the main checkout's `build/cache`.

## Content rules
- "Sketch" = pencil only; coloured pen/crayon = "Drawing". Rangoli/kolam/mandala are title-detected,
  so avoid those words in titles of paintings (a "Kolam Border" canvas once landed in Rangoli).
- Watermark: colour MS seal (style 1), confirmed by Ajith 2026-10-12. Originals are never stamped.
- Her story in About is her own words — quote verbatim, don't edit.
- Footer line "Made by Ajith, for his only loving Mom" stays.
- `site/policies.html` is written for an Indian sole proprietor (DPDP Act 2023, Consumer Protection
  E-Commerce Rules 2020, Copyright Act 1957, RPwD Act 2016). Mumbai city, returns and commission
  terms are defaults awaiting her confirmation. Add GSTIN there if she registers.
- No trackers, cookies or third-party requests (fonts are self-hosted) — the privacy policy says so.

## Open
- Watermark: **decided 2026-10-12 — colour MS seal (style 1)**, see-through, bottom-right, on every picture.
- Scheduled workflows in public repos pause after 60 days without commits; re-enable in the Actions tab if she goes quiet.
