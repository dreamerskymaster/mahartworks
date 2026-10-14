// A small client for the parts of Supabase the shop uses: Auth (email code / magic link, later Google),
// the shop_* database functions (PostgREST RPC) and private Storage (her signature). Plain fetch, no SDK:
// the whole shop needs about a dozen calls, and this keeps it dependency-free and easy to test.
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const SESSION_KEY = "msa-session";
const base = () => SUPABASE_URL.replace(/\/$/, "");

/** An error from the shop's database functions: `code` is the part after "shop:" (e.g. "unavailable"). */
export class ShopError extends Error {
  constructor(message, code, detail) { super(message); this.code = code; this.detail = detail; }
}
const FRIENDLY = {
  sign_in_required: "Please sign in first.",
  payments_closed: "Online payments are not open yet. Please check back soon.",
  unavailable: "Sorry, one of these artworks has just been reserved or sold.",
  price_changed: "A price changed while you were checking out. Please review your order again.",
  bad_address: "Please choose a delivery address.",
  india_only: "Online checkout is for addresses in India. From abroad, please enquire by email.",
  pickup_not_available: "Free pickup is only for Mumbai addresses.",
  shipping_quote_invalid: "The shipping price has expired. Please choose shipping again.",
  bad_shipping: "Please choose a shipping option.",
  bad_cart: "Your cart is empty.",
  too_many_open_orders: "You have unpaid orders already. Please pay or cancel those first.",
  bad_utr: "The UPI reference number has 12 digits. Please check it in your payment app.",
  utr_used: "That UPI reference number is already on another order. Please check it.",
  not_found: "We couldn't find that order.",
  not_admin: "This page is only for the artist.",
  bad_vpa: "That doesn't look like a UPI ID (for example name@okbank).",
};
export const friendly = (e) => (e instanceof ShopError && FRIENDLY[e.code]) || e?.message || "Something went wrong. Please try again.";

/* ---------- session ---------- */
function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function saveSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  dispatchEvent(new CustomEvent("msa-auth"));
}
const fromAuthResponse = (r) => ({
  access_token: r.access_token, refresh_token: r.refresh_token,
  expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (Number(r.expires_in) || 3600),
  user: r.user ? { id: r.user.id, email: r.user.email } : null,
});

async function authFetch(path, { method = "POST", body, token, query = "" } = {}) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base()}/auth/v1/${path}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ShopError(data.msg || data.error_description || data.message || `Sign-in error (${res.status})`, "auth", data);
  return data;
}

let refreshing = null;
/** The current session, refreshed if it's about to expire; null when signed out. */
export async function getSession() {
  const s = readSession();
  if (!s?.access_token) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  refreshing ||= authFetch("token", { query: "?grant_type=refresh_token", body: { refresh_token: s.refresh_token } })
    .then((r) => { const n = fromAuthResponse(r); n.user ||= s.user; saveSession(n); return n; })
    .catch(() => { saveSession(null); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
export const currentUser = () => readSession()?.user || null;

/** Magic links and Google sign-in come back with tokens in the URL hash. */
export async function completeRedirectSignIn() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("error_description")) {
    history.replaceState(null, "", location.pathname + location.search);
    throw new ShopError(h.get("error_description").replace(/\+/g, " "), "auth");
  }
  if (!h.get("access_token")) return null;
  history.replaceState(null, "", location.pathname + location.search);
  const user = await authFetch("user", { method: "GET", token: h.get("access_token") });
  const s = fromAuthResponse({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"),
    expires_in: h.get("expires_in"), expires_at: Number(h.get("expires_at")) || undefined, user });
  saveSession(s);
  return s;
}

/** Emails a 6-digit code (and a sign-in link). New emails get an account automatically. */
export const sendCode = (email, redirectTo) =>
  authFetch("otp", { query: `?redirect_to=${encodeURIComponent(redirectTo)}`, body: { email, create_user: true } });

export async function verifyCode(email, token) {
  const r = await authFetch("verify", { body: { type: "email", email, token } });
  const s = fromAuthResponse(r); saveSession(s); return s;
}

/** Google sign-in (a later step: needs the Google provider switched on in Supabase, see shop/README.md). */
export const googleSignInUrl = (redirectTo) =>
  `${base()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

export async function signOut() {
  const s = readSession();
  saveSession(null);
  if (s?.access_token) await authFetch("logout", { token: s.access_token }).catch(() => {});
}

/* ---------- database functions ---------- */
export async function rpc(name, args = {}) {
  const s = await getSession();
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" };
  if (s) headers.Authorization = `Bearer ${s.access_token}`;
  let res;
  try {
    res = await fetch(`${base()}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
  } catch {
    throw new ShopError("Can't reach the shop right now. Please check your connection and try again.", "network");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.ok) return data;
  const msg = String(data?.message || "");
  const m = msg.match(/^shop:([a-z_]+)(?::(.*))?$/);
  if (m) throw new ShopError(msg, m[1], m[2]);
  if (res.status === 401 || data?.code === "PGRST301") { saveSession(null); throw new ShopError("Please sign in again.", "sign_in_required"); }
  if (data?.code === "42501") throw new ShopError(msg, "not_admin");
  throw new ShopError(msg || `Request failed (${res.status})`, "server", data);
}

export const api = {
  settings: () => rpc("shop_settings"),
  products: (ids = null) => rpc("shop_products", ids ? { p_ids: ids } : {}),
  profile: () => rpc("shop_profile"),
  saveProfile: (name, phone) => rpc("shop_save_profile", { p_name: name, p_phone: phone }),
  addresses: () => rpc("shop_addresses"),
  saveAddress: (a) => rpc("shop_save_address", { p: a }),
  deleteAddress: (id) => rpc("shop_delete_address", { p_id: id }),
  placeOrder: ({ items, addressId, shipping, expectedSubtotal, note }) => rpc("shop_place_order",
    { p_items: items, p_address_id: addressId, p_shipping: shipping, p_expected_subtotal: expectedSubtotal, p_note: note || null }),
  myOrders: () => rpc("shop_my_orders"),
  order: (no) => rpc("shop_order", { p_order_no: no }),
  submitUtr: (no, utr) => rpc("shop_submit_utr", { p_order_no: no, p_utr: utr }),
  cancelOrder: (no) => rpc("shop_cancel_order", { p_order_no: no }),
  isAdmin: () => rpc("shop_is_admin"),
  adminProducts: () => rpc("shop_admin_products"),
  adminSaveProduct: (p) => rpc("shop_admin_save_product", { p }),
  adminImport: (rows) => rpc("shop_admin_import", { p_rows: rows }),
  adminOrders: (status = null) => rpc("shop_admin_orders", { p_status: status }),
  adminUpdateOrder: (no, action, p = {}) => rpc("shop_admin_update_order", { p_order_no: no, p_action: action, p }),
  adminSettings: () => rpc("shop_admin_settings"),
  adminSaveSettings: (p) => rpc("shop_admin_save_settings", { p }),
};

/** Shipping options for a PIN, from the shop's own /api/shipping-quote (Shiprocket or the estimate table). */
export async function shippingQuote(pin, items) {
  const res = await fetch("/api/shipping-quote", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, items }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ShopError(data.error || "Couldn't get shipping prices. Please try again.", "shipping");
  return data;
}

/* ---------- her signature (private Storage bucket, admins only) ---------- */
const SIGNATURE = "shop-private/signature.png";
export async function uploadSignature(file) {
  const s = await getSession();
  const res = await fetch(`${base()}/storage/v1/object/${SIGNATURE}`, { method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s?.access_token}`, "x-upsert": "true", "Content-Type": file.type || "image/png" },
    body: file });
  if (!res.ok) throw new ShopError((await res.json().catch(() => ({}))).message || "Upload failed", "storage");
}
/** A link to the signature that works for 10 minutes, or null when none has been uploaded. */
export async function signatureUrl() {
  const s = await getSession();
  if (!s) return null;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" };
  // List first: asking to sign a file that doesn't exist is an HTTP error (noisy in the console).
  const list = await fetch(`${base()}/storage/v1/object/list/shop-private`, { method: "POST", headers,
    body: JSON.stringify({ prefix: "", search: "signature.png", limit: 5 }) });
  if (!list.ok || !(await list.json()).some((o) => o.name === "signature.png")) return null;
  const res = await fetch(`${base()}/storage/v1/object/sign/${SIGNATURE}`, { method: "POST", headers,
    body: JSON.stringify({ expiresIn: 600 }) });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return signedURL ? `${base()}/storage/v1${signedURL}` : null;
}
