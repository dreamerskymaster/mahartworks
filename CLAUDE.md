# CLAUDE.md — Mahalakshmi Srikanth art portfolio

Ajith's site for his mom's art business in India. Live: https://mah-artworks.pages.dev.
Repo: `dreamerskymaster/mahartworks` (public), branch `main`. README has the how-to.

## Deploy
- Cloudflare Pages project `mah-artworks` (Ajith's Cloudflare account) is **Git-connected**: push to `main` = publish. Output dir `site`, no build command.
- Don't also run `wrangler pages deploy` for normal changes. If you ever must, run it from the
  repo root on `site` — running wrangler *inside* `site/` writes `.wrangler/` there and it gets published.
- Wrangler 4.x `pages project create` silently makes a Workers project unless `--force`.

## Source of truth
- Originals: Google Drive "my artworks" folder
  (on the Mac: `~/Library/CloudStorage/GoogleDrive-*/.shortcut-targets-by-id/<folder id>/my artworks`, found by `build/drive.py`).
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
- **Tests:** `python3 -m unittest discover -s tests -v` (57) and `npm test --prefix tests/e2e` (37, real Chrome at
  phone/tablet/laptop sizes). Run both before pushing site changes; `test.yml` runs them in CI. Add a case for any
  new naming rule or UI behaviour.
- Hand overrides live in the catalog `type` column (painting/drawing/craft/rangoli/other); sync keeps them
  unless she renames the file with a different category word.
- Every Drive rename is appended to `~/Documents/artwork-rename-backup/rename_log.tsv` (old, new) so it can be undone.
- `build/cache/` is gitignored and slow to rebuild (Drive downloads on demand); in a worktree, symlink it
  to the main checkout's `build/cache`.

## Site (redesigned 2026-10-12)
- Phone-first, no framework. Breakpoints 860 (menu becomes a dropdown) / 640 (2-column grid, swipeable chips) / 480
  (icon-only Display button). Never let anything widen the page: the e2e "no sideways scrolling" test catches it
  (the absolutely-positioned stamp once did; `.about` clips it).
- CSP in `site/_headers` forbids inline scripts — keep JS in files (JSON-LD is allowed). prefs.js fills `#year`.
- Spotlight: mouse, touch (touchmove) and arrow keys; reduced motion makes the reveal instant but keeps it playable
  (it used to auto-reveal, which looked "broken" on Macs with Reduce Motion on).
- Deep links `#art/<id>`; an id is fixed to the picture (md5) once published, so renames never break links (PR #4).
- `og.jpg` and `icons/` come from `build/make_assets.py`.
- **SEO / AI search** (`build/seo.py`, run at the end of build.py; standalone `python3 build/seo.py`):
  - Generates `site/art/<id>.html` (→ `/art/<id>`), the 5 category pages (`/paintings` …), `404.html`,
    `sitemap.xml` (+ images), `llms.txt`, `llms-full.txt`, and the `<!-- seo:… -->` blocks in index.html.
    Never hand-edit them; `test_seo.py` regenerates and fails on any difference. Output is deterministic (no clock).
  - Generated pages use root-absolute paths (`/style.css`, `/img/…`) and the same header/footer; prefs.js only.
  - robots.txt allows every crawler, AI training included (opt-out documented in README); keep Google-Extended.
  - 404.html turns off Pages' SPA fallback, so removed/renamed artworks give a real 404.
  - Search Console / Bing verification needs Ajith (README has the steps).

## Privacy (audited 2026-10-12)
- This repo is public. Never commit personal emails, account ids, local paths with usernames, keys or `.wrangler/`.
  Keep account notes in Claude memory, not here. Published images carry no EXIF/GPS (Pillow re-encode) — keep it so.
- Visitors: no cookies, no third-party requests; only `ms-prefs` in localStorage when Display settings change.

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
