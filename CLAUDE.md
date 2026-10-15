# CLAUDE.md — Mahalakshmi Srikanth art portfolio

Ajith's site for his mom's art business in India. Live: https://mah-artworks.pages.dev.
Repo: `dreamerskymaster/mahartworks` (public), branch `main`. README has the how-to; this file is the rules and status.

## Status (2026-10-14)
- **Live and automatic:** gallery, artwork/category pages, certificates and /verify, policies. Her Drive edits go
  live within ~20 min. Nothing to do day to day.
- **Shop: built, not live.** PR #8 (branch `shop`) is green and mergeable but must wait (see Shop below).
- **Pending, needs Ajith or his mom** (in order):
  1. Shop admin: she signs in once on the shop preview; then add her to `shop.admins` (SQL in `shop/README.md`).
  2. She enters her UPI ID in /admin → Settings.
  3. Login emails: Supabase custom SMTP with her Gmail app password; raise the email rate limit; add
     `{{ .Token }}` to the Magic link template; add the shop's redirect URLs (exact steps in `shop/README.md`).
  4. Prices: /admin → Artworks → Import from the gallery, then price/size/weight/For sale per piece.
  5. Shiprocket: free account + KYC + pickup address, then the three Cloudflare secrets on the shop project.
  6. "Go live": deploy the shop to production, then merge PR #8. (Quote signing, checklist step 6, is already done.)
  7. Google Search Console + Bing Webmaster Tools, submit `sitemap.xml` (README → Search engines).
  8. Optional: ask GitHub Support to purge old `refs/pull/*` snapshots (see History); add GSTIN to policies if she registers.

## Deploy
- Cloudflare Pages project `mah-artworks` (Ajith's Cloudflare account) is **Git-connected**: push to `main` = publish. Output dir `site`, no build command.
- Don't also run `wrangler pages deploy` for normal changes. If you ever must, run it from the
  repo root on `site` — running wrangler *inside* `site/` writes `.wrangler/` there and it gets published.
- Wrangler 4.x `pages project create` silently makes a Workers project unless `--force`.

## Source of truth
- Originals: Google Drive "my artworks" folder
  (on the Mac: `~/Library/CloudStorage/GoogleDrive-*/.shortcut-targets-by-id/<folder id>/my artworks`, found by `build/drive.py`;
  `ARTWORKS_DIR` overrides). Flat folder, no subfolders. **His mom edits it herself** (deletes, renames, adds) — always diff
  the folder against `build/catalog.tsv` before rebuilding; never assume the catalog is current.
- Pipeline: `build/sync.py` (Drive → `catalog.tsv`, matched by md5; jpg/png/webp/heic/gif/pdf, every skipped file is logged) → `build/build.py` (incremental via
  `build/manifest.json`) → `site/img/*.webp` + `site/data.js` → `build/certs.py` + `build/seo.py`. Never hand-edit `data.js`,
  `manifest.json` or anything seo.py writes.
- **Automatic**: `.github/workflows/sync.yml` reads Drive with a read-only Google service account (secret
  `GOOGLE_SERVICE_ACCOUNT_JSON`; account details are in Claude memory, not here) and pushes as artworks-sync[bot].
  **Pull before editing locally** — the bot commits several times a day. Titles come from her filenames; camera-named files wait.
- **Schedule (every ~20 min):** GitHub's own cron is best-effort (in Oct 2026 it fired only every 4–8 h), so each sync run's
  `next` job sleeps 20 min and dispatches the following run with the built-in `github.token` (actions: write).
  The hourly cron only restarts the chain if a run is ever lost; a run that sees a newer one stops, so there is
  one chain. Both jobs are gated to `main` and `concurrency` is on the `sync` job only (so the 20-min sleep never
  blocks a manual run). Free: public repo. Pause with Actions → Disable workflow.
- **Never run sync.yml on a non-main branch.** On 2026-10-10 PR #2 was merged minutes before its last commit;
  the chain kept running on the PR branch for 2 days, committing her renames there and cancelling every main run
  via the shared concurrency group. Check `gh run list --workflow sync.yml` for branch runs if the site goes stale.
- **Renames:** title follows her new filename; type follows it too when the name has a category word
  (`type_named` in sync.py), else kept. `other` stays hidden. Camera names wait. Videos skipped.
  Safety stop: a run that would remove more than a third of the artworks publishes nothing.
- **Tests:** `python3 -m unittest discover -s tests -v` (81) and `npm ci --prefix tests/e2e && npm test --prefix tests/e2e`
  (52, real Chrome at phone/tablet/laptop sizes). Run both before pushing site changes; `test.yml` runs them in CI. Add a
  case for any new naming rule or UI behaviour. Linux CI Chrome lays out slightly differently from a Mac — trust CI.
- Hand overrides live in the catalog `type` column (painting/drawing/craft/rangoli/oil/other); sync keeps them
  unless she renames the file with a different category word.
- Every Drive rename done for her is appended to `~/Documents/artwork-rename-backup/rename_log.tsv` (old, new) so it can be undone.
- `build/cache/` is gitignored and slow to rebuild (Drive downloads on demand); in a worktree, symlink it
  to the main checkout's `build/cache`.

## Site (redesigned 2026-10-12)
- Phone-first, no framework. Breakpoints 860 (menu becomes a dropdown) / 640 (2-column grid, swipeable chips) / 480
  (icon-only Display button). Never let anything widen the page: the e2e "no sideways scrolling" test catches it
  (the absolutely-positioned stamp once did; `.about` clips it).
- Six gallery sections: Paintings, Oil Paintings (`oils`), Drawings, Mandalas, Rangoli & Kolam, Crafts.
- CSP in `site/_headers` forbids inline scripts — keep JS in files (JSON-LD is allowed). prefs.js fills `#year`.
- Spotlight: mouse, touch (touchmove) and arrow keys; reduced motion makes the reveal instant but keeps it playable
  (it used to auto-reveal, which looked "broken" on Macs with Reduce Motion on).
- Deep links `#art/<id>`; an id is fixed to the picture (md5) once published, so renames never break links (PR #4).
- `og.jpg` and `icons/` come from `build/make_assets.py`.
- **SEO / AI search** (`build/seo.py`, run at the end of build.py; standalone `python3 build/seo.py`):
  - Generates `site/art/<id>.html` (→ `/art/<id>`), the 6 category pages (`/paintings`, `/oils` …), `404.html`,
    `sitemap.xml` (+ images), `llms.txt`, `llms-full.txt`, and the `<!-- seo:… -->` blocks in index.html.
    Never hand-edit them; `test_seo.py` regenerates and fails on any difference. Output is deterministic (no clock).
  - Generated pages use root-absolute paths (`/style.css`, `/img/…`) and the same header/footer; prefs.js only.
  - robots.txt allows every crawler, AI training included (opt-out documented in README); keep Google-Extended.
  - 404.html turns off Pages' SPA fallback, so removed/renamed artworks give a real 404.

## Certificates of Authenticity (PR #6, 2026-10-12; README has the details)
- Number `MS-<YYYY>-<NNNN>` per artwork (`build/certs.py`, called by build.py): YYYY = year of its date, else year first
  published; NNNN = running number, never reused. Register = `certs` in manifest.json (`number -> [md5, id, other md5s of the same artwork]`), entries
  never deleted; follows the picture (md5), so renames keep it. First run: MS-2021-0001 … MS-2026-0539 (by date, then id;
  146 undated ones last as 2026). Exposed as `cert` in data.js. Never hand-edit the register.
- seo.py adds the `#certificate` section to every artwork page, generates `site/verify.html` and `site/_redirects`
  (`/verify/<cert> /art/<id>#certificate 301` + catch-all `/verify/* /verify?n=:splat 302`; Pages max 2,000 static rules,
  so above 1,900 only the catch-all is written). `site/js/verify.js` does the lookup from data.js.
- `site/js/certificate.js` `renderCertificate(container, {...})` is the printable A4 landscape certificate the shop
  calls; QR via vendored `site/js/qrcodegen.js` (Nayuki, MIT). Print = exactly one page (e2e checks the PDF).
- **Her signature never goes in the repo or on the site**: `signatureUrl` is passed at runtime from private storage;
  without it a blank line is printed for a wet signature. Fixtures use a fake test squiggle.
- The bot's sync commits touch manifest.json/data.js; if this conflicts, keep main's register entries and re-run build.

## Shop (PR #8, branch `shop` — NOT merged)
- Lives in `shop/` on that branch, with its own `shop/README.md`. Separate Cloudflare Pages project `mah-artworks-shop`
  (not Git-connected; deploy with `npx wrangler pages deploy public --cwd shop --project-name mah-artworks-shop --branch preview`,
  `--branch main` for production). Preview is up and says "Payments are not open yet"; production is not deployed.
- Backend: Supabase `shop` schema (RLS on every table; `public.shop_*` invoker wrappers call `shop.api_*` definer functions;
  `place_order` re-prices on the server; one live order per artwork; unpaid orders expire after 48 h; private bucket
  `shop-private` for her signature). Payments: UPI link/QR, buyer submits the UTR, she marks it paid. Shipping: Shiprocket
  live rates; Mumbai PIN = free pickup; international = email enquiry. Prices are set in her own /admin page.
- **Don't merge #8 until the shop's production deploy exists** — merging adds "Shop" links to the gallery.
- The Supabase project also holds Ajith's private tables: never read, change or add policies to anything outside `shop`.
- The quote-signing key is a Cloudflare secret + Supabase Vault entry; never print, log or commit it.

## Privacy (audited 2026-10-12)
- This repo is public. Never commit personal emails, account ids, local paths with usernames, keys or `.wrangler/`.
  Keep account notes in Claude memory, not here. Commit as `245060650+dreamerskymaster@users.noreply.github.com`.
  Published images carry no EXIF/GPS (Pillow re-encode) — keep it so.
- Visitors: no cookies, no third-party requests; only `ms-prefs` in localStorage when Display settings change.
- Ajith chose to keep "My Son's Merit Award" (shows his name/school) and the Raksha Bandhan photo public.

## History rewrite (2026-10-13)
- All history was rewritten with git-filter-repo to remove two personal emails and old `.wrangler/` files, then
  force-pushed (`main`, `shop`). **Every checkout made before that is stale — re-clone, never push from it.**
- GitHub still keeps old pull-request snapshots (`refs/pull/*`); only GitHub Support can purge them
  (https://support.github.com/request → "Remove sensitive data").

## Content rules
- "Sketch" = pencil only; coloured pen/crayon = "Drawing". Rangoli/kolam/mandala/oil are title-detected (`\boil\b`, so "Foil" doesn't count; Oil Paintings = `oils`),
  so avoid those words in titles of other paintings (a "Kolam Border" canvas once landed in Rangoli).
- Watermark: colour MS seal (style 1), see-through, bottom-right, on every picture; confirmed by Ajith 2026-10-12.
  Originals are never stamped.
- Her story in About is her own words — quote verbatim, don't edit. Only change it when she asks (2026-10-13: she added "and oil painting").
- Footer line "Made by Ajith, for his only loving Mom" stays.
- `site/policies.html` is written for an Indian sole proprietor (DPDP Act 2023, Consumer Protection
  E-Commerce Rules 2020, Copyright Act 1957, RPwD Act 2016). Mumbai, the returns and the commission terms
  were confirmed by Ajith on 2026-10-13. Add GSTIN there if she registers.
- No trackers, cookies or third-party requests (fonts are self-hosted) — the privacy policy says so.
  (Cloudflare adds its own NEL/Report-To headers at the edge; minor, known.)

## Maintenance
- Scheduled workflows in public repos pause after 60 days without commits; if she goes quiet, re-enable sync.yml in the
  Actions tab (or click Run workflow — the chain restarts itself).
- If the site stops updating: `gh run list --workflow sync.yml` (look for failures or runs on a non-main branch).
