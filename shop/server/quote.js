// Shipping quotes for /api/shipping-quote (a Cloudflare Pages Function). Kept out of public/ so it is not
// served as a file, and free of Cloudflare-only APIs so the unit tests can run it in Node.
//
// Shiprocket (one free account, rates for Delhivery, Blue Dart, DTDC, Xpressbees, India Post, …):
//   POST https://apiv2.shiprocket.in/v1/external/auth/login        {email, password} -> {token}   (valid 10 days)
//   GET  https://apiv2.shiprocket.in/v1/external/courier/serviceability/
//        ?pickup_postcode&delivery_postcode&weight(kg)&cod(0/1)&length&breadth&height(cm)&declared_value(₹)
//        -> data.available_courier_companies[]: courier_company_id, courier_name, rate, etd, estimated_delivery_days
// (field names from Shiprocket's API collection at apidocs.shiprocket.in, "Couriers › Check Courier Serviceability").
// Secrets (Cloudflare Pages → Settings → Variables and Secrets, never in the repo):
//   SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD (an API user), PICKUP_PINCODE, SHOP_QUOTE_KEY (same value as Vault shop_quote_key)
import { packageFor, estimateOptions, cheapestTracked } from "../public/js/lib/shipping.js";
import { isValidPin, cleanPin, isPickupPin } from "../public/js/lib/pin.js";
import { signOption } from "../public/js/lib/quote.js";
import { SUPABASE_URL, SUPABASE_KEY } from "../public/js/config.js";

export const SR = "https://apiv2.shiprocket.in/v1/external";
export const FALLBACK_PICKUP_PIN = "400001";   // Mumbai GPO: only for estimates when PICKUP_PINCODE isn't set
const TOKEN_TTL_MS = 9 * 24 * 3600 * 1000;      // Shiprocket tokens last 10 days; renew a day early
let tokenCache = null;                          // per isolate; Cloudflare keeps isolates warm for a while

export class QuoteError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function rpc(env, fetchImpl, name, args) {
  const url = (env.SUPABASE_URL || SUPABASE_URL).replace(/\/$/, "");
  const res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, { method: "POST",
    headers: { apikey: env.SUPABASE_KEY || SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!res.ok) throw new QuoteError("The shop database is not reachable right now.", 503);
  return res.json();
}

export async function shiprocketToken(env, fetchImpl, now = Date.now()) {
  if (tokenCache && tokenCache.email === env.SHIPROCKET_EMAIL && tokenCache.exp > now) return tokenCache.token;
  const res = await fetchImpl(`${SR}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`Shiprocket login failed (${res.status})`);
  tokenCache = { email: env.SHIPROCKET_EMAIL, token: data.token, exp: now + TOKEN_TTL_MS };
  return data.token;
}
export const resetTokenCache = () => { tokenCache = null; };

/** Shiprocket's serviceability response -> our options (cheapest first, at most 6). */
export function mapShiprocket(json) {
  const list = json?.data?.available_courier_companies;
  if (!Array.isArray(list)) return [];
  return list.map((c) => {
    const rate = Number(typeof c.rate === "object" && c.rate ? c.rate.rate : c.rate);
    const days = c.estimated_delivery_days ? `${c.estimated_delivery_days} days` : c.etd || "";
    return { code: `sr:${c.courier_company_id}`, label: String(c.courier_name || "Courier").slice(0, 60), price_inr: Math.ceil(rate),
      eta: String(days).slice(0, 40), tracking: true, estimate: false };
  }).filter((o) => /^sr:\d{1,10}$/.test(o.code) && Number.isFinite(o.price_inr) && o.price_inr > 0)
    .sort((a, b) => a.price_inr - b.price_inr).slice(0, 6);
}

export async function shiprocketOptions(env, fetchImpl, { pin, pkg, declared }) {
  const token = await shiprocketToken(env, fetchImpl);
  const q = new URLSearchParams({ pickup_postcode: cleanPin(env.PICKUP_PINCODE), delivery_postcode: pin, cod: "0",
    weight: String(pkg.chargeable_kg), length: String(pkg.length), breadth: String(pkg.breadth), height: String(pkg.height),
    declared_value: String(declared) });
  const res = await fetchImpl(`${SR}/courier/serviceability/?${q}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (res.status === 401) { resetTokenCache(); throw new Error("Shiprocket token expired"); }
  if (!res.ok) throw new Error(`Shiprocket serviceability ${res.status}`);
  return mapShiprocket(await res.json());
}

/**
 * The whole quote: re-reads the artworks from the database (weights, sizes, prices: never from the browser),
 * offers free pickup for pickup PINs, real courier prices when Shiprocket is set up, otherwise the estimate
 * table, and signs every courier option so the database can check the price at checkout.
 */
export async function quote(body, env = {}, fetchImpl = fetch, now = Date.now()) {
  const pin = cleanPin(body?.pin);
  const ids = [...new Set(Array.isArray(body?.items) ? body.items : [])].filter((x) => typeof x === "string" && /^[a-z0-9-]{1,120}$/.test(x));
  if (!isValidPin(pin)) throw new QuoteError("Please enter a valid 6-digit Indian PIN code.");
  if (!ids.length || ids.length > 20) throw new QuoteError("Your cart is empty.");
  const [products, settings] = await Promise.all([rpc(env, fetchImpl, "shop_products", { p_ids: ids }), rpc(env, fetchImpl, "shop_settings", {})]);
  const items = (products || []).filter((p) => p.for_sale && p.status === "available");
  if (items.length !== ids.length) throw new QuoteError("One of these artworks is no longer available.", 409);

  const pkg = packageFor(items);
  const declared = items.reduce((s, p) => s + (p.price_inr || 0), 0);
  const pickupOk = isPickupPin(pin, settings?.pickup_prefixes);
  const pickup = { available: pickupOk, note: settings?.pickup_note || "Free pickup in Mumbai, arranged by phone after payment.",
    option: pickupOk ? { code: "pickup", label: "Free pickup in Mumbai", price_inr: 0, eta: "arranged by phone", tracking: false } : null };

  let options = [], source = "estimate", note = "";
  const fromPin = isValidPin(env.PICKUP_PINCODE) ? cleanPin(env.PICKUP_PINCODE) : FALLBACK_PICKUP_PIN;
  if (env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD && isValidPin(env.PICKUP_PINCODE)) {
    try { options = await shiprocketOptions(env, fetchImpl, { pin, pkg, declared }); source = "shiprocket"; }
    catch { note = "Live courier prices are unavailable just now; showing an estimate."; }
    if (source === "shiprocket" && !options.length) { source = "estimate"; note = "No courier serves this PIN directly; showing an estimate."; }
  }
  if (source === "estimate") options = estimateOptions({ fromPin, toPin: pin, chargeableKg: pkg.chargeable_kg, declared });
  if (env.SHOP_QUOTE_KEY) options = await Promise.all(options.map((o) => signOption(env.SHOP_QUOTE_KEY, { pin, ids }, o, now)));
  return { pin, source, note, pickup, options, default: cheapestTracked(options)?.code || null,
    package: { weight_kg: pkg.weight_kg, chargeable_kg: pkg.chargeable_kg, length: pkg.length, breadth: pkg.breadth, height: pkg.height } };
}

/** Request handler shared by the Pages Function and the local test server. */
export async function handle(request, env, fetchImpl = fetch) {
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  try { return json(await quote(body, env, fetchImpl)); }
  catch (e) { return json({ error: e instanceof QuoteError ? e.message : "Couldn't work out shipping just now." }, e.status || 500); }
}
