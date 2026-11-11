# CLAUDE.md — Mahalakshmi Srikanth art portfolio

Ajith's site for his mom's art business in India. Live: https://vanna-reverie.pages.dev
(the old https://mah-artworks.pages.dev 301-redirects every path there since 2026-11-10).
Repo: `dreamerskymaster/mahartworks` (public), branch `main`. README has the how-to; this file is the rules and status.

## Status (2026-11-10)
- **Live and automatic:** the Vanna Reverie gallery, artwork/category pages, certificates and /verify, policies.
  Her Drive edits go live within ~20 min. Nothing to do day to day.
- **2026-11-10 (her 11-06 emails):** address moved to vanna-reverie.pages.dev (new Pages project; old one redirects);
  footer like the Nippon Gallery one she sent: Subscribe box, "Total views" counter (page loads, from 0 on 11-10),
  "For art lovers" links (README → Publishing → Footer API). Shop links hidden (`SHOP_LIVE = false` in app.js) because
  the shop has no production deploy yet and they led to a Cloudflare 404 after the 11-05 merge. PR #17 merged
  (f95b39e); old address verified 301 on every path. Email "Done: your new website address…" sent to her 11-10
  23:10 (text in `~/Projects/vanna-reverie/private/`) with her private subscriber-list link and the pending list:
  2 camera-named photos (she deleted both as duplicates 11-10), the skipped .mp4, UPI ID + Rs 1 test, prices.
  23:39 a full overview email was sent too (private/email-to-amma-2026-11-10-overview.txt).
- **2026-10-22:** her duplicate camera-named copies moved to the Drive subfolder "Duplicates - not on website",
  4 new photos named, names starting with a digit fixed (PR #11). Her plain-language guide was emailed to her.
- **2026-10-25/26:** her emails fixed: glass paintings → Paintings (PR #13, merged); Crafts trimmed to the doll and diya holders only (2026-10-26).
- **Shop: merged to main, awaiting go-live checklist.** Preview: https://preview.mah-artworks-shop.pages.dev. See shop/README.md.
- **Pending, needs Ajith or his mom** (in order):
  1. Shop admin: she signs in once on the shop preview; then add her to `shop.admins` (SQL in `shop/README.md`).
  2. She enters her UPI ID in /admin → Settings.
  3. Login emails: Supabase custom SMTP with her Gmail app password; raise the email rate limit; add
     `{{ .Token }}` to the Magic link template; add the shop's redirect URLs (exact steps in `shop/README.md`).
  4. Prices: /admin → Artworks → Import from the gallery, then price/size/weight/For sale per piece.
  5. Shiprocket: free account + KYC + pickup address, then the three Cloudflare secrets on the shop project.
  6. "Go live": deploy the shop to production, then set `SHOP_LIVE = true` in `site/app.js` and restore the
     visible-link e2e checks (the shop code is already on `main` since 2026-11-05). (Quote signing is already done.)
  7. Search Console: verified + sitemap for the OLD address 2026-11-05; redo for https://vanna-reverie.pages.dev/,
     then Change of address in the old property; Bing (import from Google). README → Search engines.
  8. Optional: ask GitHub Support to purge old `refs/pull/*` snapshots (see History); add GSTIN to policies if she registers.

## Where things live (one of each)
- **Code:** this repo, branch `main` (plus `shop` until go-live). Local checkout: `~/Projects/vanna-reverie/mahartworks`.
  No other local copies: the OneDrive copy and old scratch clones were pre-rewrite and are retired.
- **Private, not in git:** `~/Projects/vanna-reverie/private/` — `rename_log.tsv` (every Drive rename/move done for
  her, old → new, for undo), `SOP-for-Amma-emailed-2026-10-21.txt` (the guide she was sent), `SOP-for-Amma-fuller-not-sent.md` (a simpler, fuller draft), `watermark-options/`.
- **Her originals:** the Google Drive "my artworks" folder (below). Account details: Claude memory only.

## Deploy
- Cloudflare Pages project `vanna-reverie` (Ajith's Cloudflare account) is **Git-connected**: push to `main` = publish. Output dir `site`, no build command, Functions in `functions/` (footer API, D1 `vanna-reverie`).
- The old project `mah-artworks` is also Git-connected but has root dir `legacy-redirect` and watches only that path:
  it is just the 301 to the new address. Never point it back at `site/` (two live copies = duplicate content).
- Pages free plan = 500 builds/month for the whole account (shared with Appa's `srikanthk`): keep the old project's
  watch path narrow; the sync bot only commits when her Drive changes.
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
- **Tests:**  (98) and  (60, real Chrome at phone/tablet/laptop sizes), and  (49 shop cases). Run before pushing site changes;  runs them in CI.
  case for any new naming rule or UI behaviour. Linux CI Chrome lays out slightly differently from a Mac — trust CI.
- **Same-named files:** Drive allows several files with one name (2026-10: three different "Mandala art" drawings).
  A file is its (name, md5) pair: sync keeps every pair, `drive.path(name, md5)` fetches the right one and the
  build cache is keyed by md5. Before this fix the sync dropped and re-added them every run (~70 bot commits a day).
- Hand overrides live in the catalog `type` column (painting/drawing/craft/rangoli/oil/other); sync keeps them
  unless she renames the file with a different category word.
- **Duplicates:** copies of published artworks go into the Drive subfolder "Duplicates - not on website" (2026-10-22:
  62 camera-named copies moved there; sync never reads subfolders). Find copies by perceptual hash against
  `site/img/*.t.webp`, then check by eye. Her how-to guide was emailed to her 2026-10-22; text in `../private/SOP-for-Amma-emailed-2026-10-21.txt`.
- Every Drive rename done for her is appended to `../private/rename_log.tsv` (old, new) so it can be undone.
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
- **Brand: Vanna Reverie — "Every Stroke Tells a Story"** (her logo, 2026-10-21). Source `build/assets/vanna-reverie-logo.png`;
  `build/make_assets.py` cuts it out of its cream paper and writes `site/brand/wordmark.webp` (header, no tagline),
  `site/brand/logo.webp` (footer), `icons/` (the butterfly from the logo) and `og.jpg`. Re-run it if the logo changes.
  The header/footer markup is `BRAND_LINK` / `FOOT_LOGO` in seo.py; index.html and policies.html copy it (test_brand checks).
  The logo always sits on cream (`--paper`) so it reads in dark mode. She stays the named artist, copyright holder
  and seller ("Vanna Reverie, the trading name of Mahalakshmi Srikanth"); titles read "… by Mahalakshmi Srikanth".
  The MS seal is unchanged: watermark on every picture, About-letter stamp, certificates.
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

## Shop (PR #8, branch `shop` — NOT merged; `shop/README.md` has everything)
- **Where it lives:** `shop/` on that branch. Separate Cloudflare Pages project `mah-artworks-shop`, output `shop/public`,
  functions `shop/functions`. Not Git-connected. Deploy with
  `npx wrangler pages deploy public --cwd shop --project-name mah-artworks-shop --branch preview` (`--branch main` for
  production; it writes `shop/.wrangler/`, outside the published folder). Preview says "Payments are not open yet";
  production is not deployed.
- **Brand:** same Vanna Reverie wordmark/logo as the gallery (`shop/public/brand/` is a copy of `site/brand/`; re-copy
  if the logo changes). UPI payee and copyright stay her legal name, "Mahalakshmi Srikanth".
- **Don't merge #8 until the shop's production deploy exists** — merging adds "Shop" links to the gallery.
- **Database:** Supabase `shop` schema, not exposed to the Data API; RLS on every table. The browser calls
  `public.shop_*` (SECURITY INVOKER), which calls `shop.api_*` (SECURITY DEFINER, own auth checks, empty search_path).
  Never put a definer function in `public`. Migrations in `supabase/migrations/` are named by the version Supabase
  recorded. `place_order` re-prices on the server; one live order per artwork; unpaid orders expire after 48 h;
  private bucket `shop-private` for her signature.
- **Ajith's private tables** live in the same project: never read, change or add policies to anything outside `shop`.
  After any DB change, run the advisors and `supabase/tests/shop_security.sql` (it rolls itself back).
- **Money:** payments by UPI link/QR, buyer submits the UTR, she marks it paid; never mark an order paid automatically.
  Nothing is for sale until she prices it, and payments stay closed until `upi_vpa` is set. Shipping: Shiprocket live
  rates; Mumbai PIN = free pickup; international = email enquiry.
- **Secrets:** Shiprocket, `SHOP_QUOTE_KEY` (Cloudflare secret + Supabase Vault), her UPI ID and the pickup PIN never go
  in the repo, logs or output.
- **Categories:** shop labels are in `shop/public/js/ui.js` `CATEGORY` (including `oils`); add new gallery categories there.
- **Tests:** `npm test --prefix tests/shop` (49: unit + browser, with a mock Supabase in `tests/shop/server.mjs`). CI job `shop`.

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
- "Glass" in a title = Paintings, even on a door, tile or plate (her request 2026-10-25; checked after rangoli/mandala/oil,
  before craft, in both `build.category` and `sync.type_named`). Two glass pieces had hand-set `craft` types before (PR #13).
- Crafts = only the best-out-of-waste doll and the diya holders (her email 2026-10-26). Lippan, mirror work, embroidery,
  door plaques, painted boxes/cardboard are Paintings. `CRAFT` in sync.py = craft|doll|best out of waste|diya holder.
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
