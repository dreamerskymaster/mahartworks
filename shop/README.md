# The shop — mah-artworks-shop.pages.dev

A small shop for Mahalakshmi's originals, separate from the gallery (mah-artworks.pages.dev). The gallery links to
it in a new tab: the menu and footer have a **Shop** link, and the artwork viewer has **Buy / check availability**.

**Status:** preview only (`https://preview.mah-artworks-shop.pages.dev`). Production isn't deployed, and payments
stay closed until her UPI ID is saved in admin. See the [go-live checklist](#go-live-checklist).
Branded **Vanna Reverie** like the gallery (2026-10-22): the header and footer use the same wordmark and logo
(`public/brand/`, copied from `site/brand/`). UPI payee and copyright stay her legal name.
The preview deploy predates the rebrand: redeploy it before showing it to anyone.

## What a buyer does
1. **Browse** `/`: only artworks she has priced (or marked sold) appear. Each shows its price, size and a **Sold** /
   **Reserved** badge. The product page is `/p/<artwork id>` (ids are the gallery's permanent ids).
2. **Cart** `/cart`: kept in the browser. Each original is one of a kind, so there are no quantities. The cart is
   re-checked against the server every time.
3. **Sign in** `/signin`: email plus a 6-digit code, or the link in the same email. No passwords. A new email gets an
   account automatically.
4. **Checkout** `/checkout`:
   - The buyer chooses **India** or **another country**. Buyers abroad can't check out; they get an
     **Enquire by email** button per artwork (subject `Purchase enquiry: <title> (ID <id>, Certificate <cert>)`;
     the body asks for country and address).
   - **Address** (saved to the account, India only).
   - **Delivery**: courier options from `/api/shipping-quote`. The cheapest tracked option is pre-selected.
     **Free pickup** is offered for Mumbai PINs (`400…`; she can add `401`, `421` for the wider MMR in Settings).
   - **Review**, then **Place order**. The database re-prices everything, reserves the artworks and writes the order.
5. **Pay** `/order/<order no>`:
   - On a phone, a **Pay ₹… with a UPI app** button (`upi://pay?pa=<her UPI ID>&pn=Mahalakshmi%20Srikanth&am=<total>&cu=INR&tn=<order no>`).
     It opens GPay, PhonePe, Paytm or the buyer's bank app with everything filled in. On a laptop, the same as a QR code.
   - The QR code is drawn in the browser (vendored MIT encoder, `public/vendor/qrcodegen.js`). No third party sees it.
   - The buyer then types the **12-digit UPI reference (UTR)** and the order becomes *Payment being checked*.
   - If nobody pays within **48 h** (a setting), the order is cancelled and the artwork is released.
6. **Account** `/account`: profile, saved addresses, and order history with a status timeline and tracking.

## What she does: `/admin`
Sign in with her own email. `/admin` only opens for accounts listed in `shop.admins`.
- **Orders**: the list opens on *Payment to check*.
  1. Open an order and look in her bank or UPI app for the amount and the UTR (the payment note shows the order
     number). Only when the money is there: **Mark paid**. This also marks the artwork **Sold**. Nothing is ever
     marked paid automatically.
  2. **Ship it**: courier, tracking number (AWB) and an optional tracking link, then **Mark shipped**. For pickup
     orders the button is **Mark collected** instead.
  3. **Mark delivered**.
  - **Issue certificate**: renders the certificate of authenticity with the buyer's name. It uses
    `renderCertificate` from the gallery's `/js/certificate.js` and her signature. **Print / save as PDF** prints
    only the certificate.
  - **Cancel** releases the artwork. A paid order needs a reason; refund the buyer first.
  - **Note to self** is kept on the order. Every change is logged in the order's history.
- **Artworks & prices**:
  - **Import artworks from the gallery** copies new artworks, titles, categories and certificate numbers from the
    gallery's `data.js`. Run it after new uploads.
  - Import never changes prices, sizes or "for sale". Oil paintings start with the medium "Oil on canvas".
  - For each artwork: **Price ₹**, **For sale**, **Medium**, **Width/Height/Depth cm** and **Weight kg**
    (unpacked; used for shipping), and **Sold** (e.g. if sold offline). Nothing is for sale until it has a price and
    *For sale* is ticked.
- **Settings**:
  - **UPI ID**: payments are closed until this is set. Clearing it closes them again.
  - Payee name, pickup PIN prefixes, pickup note, and the payment window in hours.
  - **Signature**: a PNG or JPEG under 1 MB, stored in a private bucket that only admins can read. It is used on
    certificates through a 10-minute signed link.

## Architecture
```
shop/
  public/              static site (Cloudflare Pages output directory)
    *.html             one page each: index, product, cart, signin, checkout, order, account, admin, 404
    js/pages/*.js      page scripts (ES modules, no framework, no build step)
    js/lib/*.js        pure logic, unit-tested: money, pin, upi, order, cart, shipping, quote, enquiry
    js/api.js          Supabase Auth + RPC + Storage over plain fetch (no SDK); friendly error messages
    js/config.js       Supabase URL + publishable key (public by design), gallery and shop URLs
    vendor/qrcodegen.js   MIT QR encoder (same file as site/js/qrcodegen.js)
    _headers           strict CSP: scripts only from self and the gallery (certificate.js); data only from Supabase
    _redirects         /p/* → product.html, /order/* → order.html
  functions/api/shipping-quote.js   Pages Function (thin wrapper)
  server/quote.js      the quote logic: Shiprocket, fallback table, signing (not published as a file)
supabase/migrations/   the database, as applied to the project (see `list_migrations`)
supabase/tests/shop_security.sql  security tests; run with MCP execute_sql or psql (self-cleaning)
tests/shop/            unit + browser tests with a mock Supabase (server.mjs); `npm run serve` to try it locally
```
- **No cookies, no trackers, no third-party scripts.** The session and cart live in `localStorage`. Fonts are
  self-hosted copies of the gallery's. Images, `data.js` and `certificate.js` come from the gallery's own origin.
- **Prices are never trusted from the browser.**
  - `shop_place_order` re-reads every price and checks availability with the rows locked.
  - It refuses if the subtotal changed since the buyer looked (`price_changed`), and computes the total in the database.
  - A unique index allows only one live order per artwork, so an original can't be sold twice.
- **Shipping prices are signed.** `/api/shipping-quote` signs each option with HMAC-SHA256
  (`v1|pin|ids|code|price|expiry`, 30 min). The database checks the signature with the same key from Supabase Vault
  (`shop_quote_key`).
  - Until that key exists, orders still work, but courier prices are recorded as *not verified*. The admin order page
    then shows a red warning to check the charge before dispatch. Free pickup is always checked in the database.

### Shipping quote (`POST /api/shipping-quote {pin, items}`)
- **With Shiprocket set up** (secrets below):
  - `POST /v1/external/auth/login` gets a token, cached for 9 of its 10 days.
  - `GET /v1/external/courier/serviceability/?pickup_postcode&delivery_postcode&weight&cod=0&length&breadth&height&declared_value`
    returns `data.available_courier_companies[]` (`courier_company_id`, `courier_name`, `rate`, `estimated_delivery_days`/`etd`).
    The function offers the 6 cheapest.
  - Field names were taken from Shiprocket's API collection (apidocs.shiprocket.in, *Couriers › Check Courier Serviceability*).
- **Parcel**: unpacked size + 8 cm a side, + 6 cm depth, weight × 1.15 + 0.6 kg. Couriers charge the larger of actual and
  volumetric (L×B×H/5000) weight, rounded up to 0.5 kg. Missing sizes default to a 30×40×3 cm, 1 kg piece.
- **Without Shiprocket** (or if it fails): an estimate table, clearly labelled *estimate, confirmed before dispatch*.
  - India Post Speed Post–style slabs (first 500 g + each extra 500 g) by distance band from the pickup PIN:
    local (same 3-digit district), state, neighbouring zone, national, remote (NE, J&K, islands).
  - The estimate adds insurance (1 % of value, at least ₹50) and offers an express option at about 1.8×.
- Weights and prices are always re-read from the database, never taken from the request.

## Data model (`shop` schema)
| table | what | who can see / change |
|---|---|---|
| `products` | one row per gallery artwork: `artwork_id` (PK = gallery id), cert, title, category, `price_inr`, `for_sale`, `sold`, medium, `width/height/depth_cm`, `weight_kg`, `on_site` | anyone: rows that are for sale or sold; admins: everything; only admins change it |
| `profiles` | user_id, name, phone | the user; admins read |
| `addresses` | the user's saved delivery addresses (India only) | only the user |
| `orders` | `order_no` (MSA-YYYY-NNNNN), user, status, subtotal, shipping, `total_inr` (generated), pickup, shipping code/label/eta/verified, `ship_to` snapshot, buyer note, `utr`, courier, tracking, expiry, timestamps per status | the buyer and admins read; changed only through functions |
| `order_items` | artwork, title, cert and price at the time of the order, `active` (holds the artwork) | as orders |
| `order_events` | audit trail: time, status, who (buyer/admin/system), note | as orders |
| `settings` | `upi_vpa` (private), payee name, pickup prefixes, pickup note, payment window | public rows to anyone; all rows and changes for admins |
| `admins` | auth user ids allowed into `/admin` | each admin sees their own row; added by hand in SQL |

**Statuses:**
- `awaiting_payment` → `payment_submitted` (buyer entered a UTR) → `paid` (she confirmed) → `shipped` → `delivered`.
- Pickup orders go from `paid` straight to `delivered`.
- `cancelled` can happen from awaiting/submitted (buyer or her) or paid (her, with a reason). Expiry also cancels.

**API.**
- The browser calls `public.shop_*` functions with `POST /rest/v1/rpc/<name>`:
  - **Anyone**: `shop_settings`, `shop_products`.
  - **Buyers**: `shop_profile`, `shop_save_profile`, `shop_addresses`, `shop_save_address`, `shop_delete_address`,
    `shop_place_order`, `shop_my_orders`, `shop_order`, `shop_submit_utr`, `shop_cancel_order`.
  - **Admins**: `shop_is_admin`, `shop_admin_products`, `shop_admin_save_product`, `shop_admin_import`, `shop_admin_orders`,
    `shop_admin_update_order`, `shop_admin_settings`, `shop_admin_save_settings`.
- The `shop` schema is **not exposed** to the Data API, so no dashboard toggle is needed.
- The `public.shop_*` functions are `SECURITY INVOKER`. Anything that must bypass RLS (placing orders, admin order
  changes) is a `SECURITY DEFINER` function in the private `shop` schema (`shop.api_*`). Those functions check
  `auth.uid()` / `shop.is_admin()` themselves and run with an empty `search_path`.
- RLS is on for every table anyway, as a second wall.
- Storage bucket `shop-private` (private, 1 MB, images): read and write for admins only.
- The project's other tables (`personal.email_cleanup_log`, `public.job_outreach`) are untouched: RLS on, no
  policies, unreachable by shop users. `shop_security.sql` checks this.

## Go-live checklist (for Ajith)
1. **Her admin account**:
   - She signs in once on the shop with her email, then opens `/admin`. It shows her account id.
   - In Supabase → SQL editor, run:
     `insert into shop.admins (user_id, note) values ('<her id>', 'Mahalakshmi');`
2. **Login emails (do this before buyers use it):**
   - Supabase's built-in email sender only sends a few emails an hour, and only to team members' addresses.
   - Free fix: Supabase → Authentication → **Emails → SMTP settings** → enable custom SMTP with her Gmail.
   - Host `smtp.gmail.com`, port `465` (or 587), user: her Gmail address, password: a Google **app password**
     (Google Account → Security → 2-Step Verification on → App passwords). Sender name "Mahalakshmi Srikanth".
     Gmail allows about 500 emails a day.
   - Then Authentication → **Rate limits**: raise "emails per hour".
   - Authentication → **Email templates → Magic link**: add `{{ .Token }}` so the email shows the 6-digit code as
     well as the link, e.g. `<p>Your code: <b>{{ .Token }}</b></p>`.
   - Authentication → **URL configuration**: add `https://mah-artworks-shop.pages.dev/**` (and
     `https://*.mah-artworks-shop.pages.dev/**` for previews) to Redirect URLs.
   - Optionally set the Site URL to the shop.
3. **Her UPI ID**: she enters it in `/admin` → Settings (it is never in the repo). Payments open immediately.
4. **Prices**: `/admin` → Artworks → **Import artworks from the gallery**, then price, size, weight and *For sale*
   for each piece she wants to sell.
5. **Shiprocket** (free account; she pays per shipment, buyers pay shipping):
   - Sign up at app.shiprocket.in, complete **KYC**, and add the pickup address (her Mumbai address stays in Shiprocket).
   - Settings → API → **Create an API user** (a separate email and password).
   - In Cloudflare → Workers & Pages → `mah-artworks-shop` → Settings → **Variables and Secrets**, add (Production
     and Preview) as *Secret*: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `PICKUP_PINCODE` (her 6-digit PIN).
   - Until these exist, checkout shows the labelled estimate.
6. **Quote signing** (recommended, free): make a random key (`openssl rand -hex 32`) and store it twice:
   - In Supabase SQL: `select vault.create_secret('<key>', 'shop_quote_key');`
   - As Cloudflare secret `SHOP_QUOTE_KEY`.
   - Admin → Settings then says "quote signing is on". Never commit the key.
7. **Publish production**, one of:
   - **(a)** Git-connect: Cloudflare → `mah-artworks-shop` → Settings → Builds → Connect to Git → this repo,
     production branch `main`, root directory `shop`, build command *none*, output directory `public`. Every push to
     `main` then publishes it.
   - **(b)** Manual: from the repo root run `npx wrangler pages deploy public --cwd shop --project-name
     mah-artworks-shop --branch main`. This writes `shop/.wrangler/`, outside the published folder and gitignored.
8. **Policies**: `site/policies.html` (Privacy, Orders, Shipping) now describes accounts, addresses and phone
   numbers stored with Supabase, sharing with the courier, UPI and pickup.
   - Because the shop collects buyers' personal data, this **DPDP Act 2023 privacy notice is mandatory**. Keep it in
     step with what the shop does.
   - Confirm the Mumbai, returns and commission defaults with her. Add a GSTIN if she registers.
9. **Google sign-in (later, optional)**:
   - Google Cloud → OAuth client (web), with redirect `https://<project>.supabase.co/auth/v1/callback`.
   - Supabase → Authentication → Providers → Google, using that client's id and secret.
   - Add a button that goes to `googleSignInUrl()` in `js/api.js` (already written).
10. **Security re-check** after any database change:
    - Supabase advisors (security + performance).
    - `supabase/tests/shop_security.sql` (it must end with `SHOP SQL TESTS PASSED`).

## Tests
    cd tests/shop && npm ci
    npm run test:unit    # 27: shipping table & parcel, PIN/Mumbai rules, UPI link & amounts, UTR, order numbers,
                         #     cart validation, quote signing (matches Postgres), enquiry mailto, /api/shipping-quote
    npm run test:e2e     # 22: real Chrome at 390 px and 1440 px against server.mjs (mock Supabase, no network)
    npm run serve        # try it locally with mock data (sign in with any email and code 123456)
- The SQL tests (`supabase/tests/shop_security.sql`, 8 groups, about 60 checks) cover:
  - buyer isolation (orders, addresses, profiles);
  - anon access;
  - non-admins can't change prices or orders;
  - tampered prices, shipping and pickup;
  - sold and reserved items;
  - expiry, UTR and the admin flow;
  - the private tables.
- They run against the real project and roll themselves back. CI runs the unit and browser tests (`shop` job in
  `.github/workflows/test.yml`).
