// Serves shop/public like Cloudflare Pages does (headers from _headers incl. the CSP, _redirects rewrites, pretty
// URLs, 404.html), runs the real /api/shipping-quote handler, and stands in for everything remote, so the browser
// tests never touch the network:
//   /sb/*    a small in-memory Supabase (Auth, the shop_* RPCs, Storage signed URLs)
//   /main/*  the gallery, served from this repo's site/ (images, data.js, js/certificate.js)
// config.js is rewritten to point at those, and the CSP's remote origins become 'self'.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handle as shippingQuote } from "../../shop/server/quote.js";

const SHOP = fileURLToPath(new URL("../../shop/public/", import.meta.url));
const SITE = fileURLToPath(new URL("../../site/", import.meta.url));
const REMOTE = ["https://mah-artworks.pages.dev", "https://geyyqbgqknyngmbyfjxd.supabase.co"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain" };
export const QUOTE_KEY = "test-quote-key";

/* ---------- fixtures ---------- */
const ART = JSON.parse((await readFile(join(SITE, "data.js"), "utf8")).replace(/^[^=]*=/, "").trim().replace(/;$/, ""));
export const PICKS = ART.filter((a) => a.cert && a.cat !== "oils").slice(0, 4);   // real artworks, so images and data.js exist
export const OIL = ART.find((a) => a.cat === "oils" && a.cert);
export const USERS = { buyer: { id: "11111111-1111-4111-8111-111111111111", email: "buyer@example.test" },
  other: { id: "22222222-2222-4222-8222-222222222222", email: "other@example.test" },
  admin: { id: "33333333-3333-4333-8333-333333333333", email: "artist@example.test" } };
const TOKENS = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [`tok-${k}`, u]));

export function freshDb({ open = true } = {}) {
  const [a, b, c, d] = PICKS;
  const p = (art, extra) => ({ id: art.id, title: art.title, category: art.cat, cert: art.cert, medium: "Acrylic on canvas",
    width_cm: 30, height_cm: 40, depth_cm: 2, weight_kg: 0.8, on_site: true, sold: false, for_sale: true, price_inr: 12000, ...extra });
  return {
    settings: { upi_vpa: open ? "mahalakshmi@okaxis" : null, upi_payee_name: "Mahalakshmi Srikanth", pickup_prefixes: "400",
      pickup_note: "Free pickup in Mumbai: she will call you to arrange a time.", payment_window_hours: "48" },
    products: [p(a, { price_inr: 12000 }), p(b, { price_inr: 4500, medium: "Pencil on paper", category: "drawings" }),
      p(c, { price_inr: 8000, sold: true }), p(d, { for_sale: false, price_inr: null }),
      ...(OIL ? [p(OIL, { price_inr: 25000, medium: "Oil on canvas" })] : [])],
    profiles: {}, addresses: [], orders: [], admins: [USERS.admin.id], seq: 0, signature: false,
  };
}
let db = freshDb();
export const resetDb = (opts) => { db = freshDb(opts); };
export const getDb = () => db;

/* ---------- mock Supabase ---------- */
class E extends Error { constructor(m, status = 400, code = "P0001") { super(m); this.status = status; this.code = code; } }
const now = () => new Date().toISOString();
const status = (p) => p.sold ? "sold"
  : db.orders.some((o) => ["awaiting_payment", "payment_submitted"].includes(o.status) && o.items.some((i) => i.id === p.id)) ? "reserved" : "available";
const pj = (p) => ({ ...p, status: status(p) });
const isAdmin = (u) => !!u && db.admins.includes(u.id);
const orderOut = (o, admin) => {
  const { user_id, buyer_email, admin_note, ...rest } = o;
  const out = { ...rest, total_inr: o.subtotal_inr + o.shipping_inr };
  if (admin) Object.assign(out, { user_id, buyer_email, admin_note, shipping_verified: true });
  return out;
};
const ev = (o, s, by, note) => o.events.push({ at: now(), status: s, by, note });

const RPC = {
  shop_settings: () => ({ payments_open: !!db.settings.upi_vpa, payee: db.settings.upi_payee_name,
    pickup_prefixes: db.settings.pickup_prefixes.split(",").filter(Boolean), pickup_note: db.settings.pickup_note, payment_window_hours: 48 }),
  shop_products: (_, a) => db.products.filter((p) => (p.for_sale || p.sold) && (!a.p_ids || a.p_ids.includes(p.id))).map(pj),
  shop_profile: (u) => ({ email: u.email, ...(db.profiles[u.id] || {}) }),
  shop_save_profile: (u, a) => { db.profiles[u.id] = { name: a.p_name, phone: a.p_phone }; return RPC.shop_profile(u); },
  shop_addresses: (u) => db.addresses.filter((x) => x.user_id === u.id).map(({ user_id, ...x }) => x),
  shop_save_address: (u, { p }) => {
    if ((p.country || "IN") !== "IN") throw new E("shop:india_only");
    if (p.is_default) db.addresses.forEach((x) => { if (x.user_id === u.id) x.is_default = false; });
    let row = p.id && db.addresses.find((x) => x.id === p.id && x.user_id === u.id);
    if (p.id && !row) throw new E("shop:not_found");
    if (!row) { row = { id: `addr-${db.addresses.length + 1}`, user_id: u.id }; db.addresses.push(row); }
    Object.assign(row, { label: p.label || null, name: p.name, phone: p.phone, line1: p.line1, line2: p.line2 || null, city: p.city,
      state: p.state, pin: p.pin, country: "IN", is_default: !!p.is_default });
    const { user_id, ...out } = row; return out;
  },
  shop_delete_address: (u, a) => { const n = db.addresses.length; db.addresses = db.addresses.filter((x) => !(x.id === a.p_id && x.user_id === u.id)); return db.addresses.length < n; },
  shop_place_order: (u, a) => {
    if (!db.settings.upi_vpa) throw new E("shop:payments_closed");
    const addr = db.addresses.find((x) => x.id === a.p_address_id && x.user_id === u.id);
    if (!addr) throw new E("shop:bad_address");
    const items = [...new Set(a.p_items)].map((id) => db.products.find((p) => p.id === id));
    if (items.some((p) => !p || !p.for_sale || status(p) !== "available")) throw new E("shop:unavailable");
    const sub = items.reduce((s, p) => s + p.price_inr, 0);
    if (a.p_expected_subtotal != null && a.p_expected_subtotal !== sub) throw new E(`shop:price_changed:${sub}`);
    const sh = a.p_shipping || {};
    const pickup = sh.code === "pickup";
    if (pickup && !db.settings.pickup_prefixes.split(",").some((x) => addr.pin.startsWith(x))) throw new E("shop:pickup_not_available");
    if (!pickup && !sh.sig) throw new E("shop:shipping_quote_invalid");   // the mock always signs, like production will
    const o = { order_no: `MSA-2026-${String(++db.seq).padStart(5, "0")}`, user_id: u.id, buyer_email: u.email, status: "awaiting_payment",
      subtotal_inr: sub, shipping_inr: pickup ? 0 : sh.price_inr, pickup, shipping_code: sh.code, shipping_label: sh.label, shipping_eta: sh.eta,
      ship_to: { name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, pin: addr.pin, country: "IN" },
      buyer_note: a.p_note, utr: null, courier: null, tracking_no: null, tracking_url: null, created_at: now(),
      expires_at: new Date(Date.now() + 48 * 3600e3).toISOString(), events: [],
      items: items.map((p) => ({ id: p.id, title: p.title, cert: p.cert, price_inr: p.price_inr, medium: p.medium, width_cm: p.width_cm,
        height_cm: p.height_cm, depth_cm: p.depth_cm, category: p.category })) };
    ev(o, "awaiting_payment", "buyer", "Order placed; the artwork is held for you while you pay.");
    db.orders.push(o);
    return orderOut(o, false);
  },
  shop_my_orders: (u) => db.orders.filter((o) => o.user_id === u.id).reverse().map((o) => orderOut(o, false)),
  shop_order: (u, a) => {
    const o = db.orders.find((x) => x.order_no === a.p_order_no);
    if (!o || (o.user_id !== u.id && !isAdmin(u))) throw new E("shop:not_found");
    const out = orderOut(o, isAdmin(u));
    if (["awaiting_payment", "payment_submitted"].includes(o.status)) out.pay = { vpa: db.settings.upi_vpa, payee: db.settings.upi_payee_name };
    return out;
  },
  shop_submit_utr: (u, a) => {
    const utr = String(a.p_utr).replace(/\s/g, "");
    if (!/^\d{12}$/.test(utr)) throw new E("shop:bad_utr");
    const o = db.orders.find((x) => x.order_no === a.p_order_no && x.user_id === u.id);
    if (!o) throw new E("shop:not_found");
    Object.assign(o, { utr, status: "payment_submitted", payment_submitted_at: now(), expires_at: null });
    ev(o, "payment_submitted", "buyer", `UPI reference ${utr} submitted; awaiting confirmation.`);
    return orderOut(o, false);
  },
  shop_cancel_order: (u, a) => {
    const o = db.orders.find((x) => x.order_no === a.p_order_no && x.user_id === u.id);
    if (!o) throw new E("shop:not_found");
    Object.assign(o, { status: "cancelled", cancelled_at: now() }); ev(o, "cancelled", "buyer", "Cancelled by the buyer before paying.");
    return orderOut(o, false);
  },
  shop_is_admin: (u) => isAdmin(u),
  shop_admin_products: (u) => { if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501"); return db.products.map(pj); },
  shop_admin_save_product: (u, { p }) => {
    if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501");
    const row = db.products.find((x) => x.id === p.id);
    Object.assign(row, { price_inr: p.price_inr === "" ? null : Number(p.price_inr), for_sale: p.for_sale, sold: p.sold, medium: p.medium,
      width_cm: p.width_cm ? Number(p.width_cm) : null, height_cm: p.height_cm ? Number(p.height_cm) : null,
      depth_cm: p.depth_cm ? Number(p.depth_cm) : null, weight_kg: p.weight_kg ? Number(p.weight_kg) : null });
    return pj(row);
  },
  shop_admin_import: (u, { p_rows }) => {
    if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501");
    let added = 0;
    for (const r of p_rows) {
      const row = db.products.find((x) => x.id === r.id);
      const medium = r.cat === "oils" ? "Oil on canvas" : null;   // as shop_admin_import does
      if (row) Object.assign(row, { title: r.title, category: r.cat, cert: r.cert || row.cert, on_site: true, medium: row.medium || medium });
      else { added++; db.products.push({ id: r.id, title: r.title, category: r.cat, cert: r.cert, medium, for_sale: false, sold: false, price_inr: null, on_site: true }); }
    }
    return { received: p_rows.length, added, removed_from_site: 0, total: db.products.length };
  },
  shop_admin_orders: (u, a) => {
    if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501");
    return db.orders.filter((o) => !a.p_status || o.status === a.p_status).reverse().map((o) => ({ order_no: o.order_no, status: o.status,
      total_inr: o.subtotal_inr + o.shipping_inr, created_at: o.created_at, name: o.ship_to.name, city: o.ship_to.city, pin: o.ship_to.pin,
      pickup: o.pickup, utr: o.utr, buyer_email: o.buyer_email, titles: o.items.map((i) => i.title).join(", ") }));
  },
  shop_admin_update_order: (u, a) => {
    if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501");
    const o = db.orders.find((x) => x.order_no === a.p_order_no), p = a.p || {};
    if (a.p_action === "mark_paid") { Object.assign(o, { status: "paid", paid_at: now() }); o.items.forEach((i) => { db.products.find((x) => x.id === i.id).sold = true; }); }
    else if (a.p_action === "ship") Object.assign(o, { status: "shipped", shipped_at: now(), courier: p.courier, tracking_no: p.tracking_no, tracking_url: p.tracking_url || null });
    else if (a.p_action === "deliver") Object.assign(o, { status: "delivered", delivered_at: now() });
    else if (a.p_action === "cancel") Object.assign(o, { status: "cancelled", cancelled_at: now() });
    else if (a.p_action === "note") { o.admin_note = p.note; ev(o, null, "admin", p.note); return orderOut(o, true); }
    ev(o, o.status, "admin", p.note || null);
    return orderOut(o, true);
  },
  shop_admin_settings: (u) => { if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501"); return { ...db.settings, quote_signing: true }; },
  shop_admin_save_settings: (u, { p }) => { if (!isAdmin(u)) throw new E("shop:not_admin", 403, "42501"); Object.assign(db.settings, p); return RPC.shop_admin_settings(u); },
};
const PUBLIC_RPC = new Set(["shop_settings", "shop_products"]);
const session = (u) => ({ access_token: `tok-${Object.keys(USERS).find((k) => USERS[k] === u)}`, refresh_token: "r", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u });

async function supabase(req, path, body, res) {
  const send = (data, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
  if (!req.headers.apikey) return send({ message: "No API key found in request" }, 401);
  const user = TOKENS[(req.headers.authorization || "").replace(/^Bearer /, "")] || null;
  if (path === "/auth/v1/otp") return send({});
  if (path === "/auth/v1/verify") return body.token === "123456" ? send(session(USERS.buyer)) : send({ msg: "Token has expired or is invalid" }, 403);
  if (path === "/auth/v1/user") return user ? send(user) : send({ msg: "invalid" }, 401);
  if (path === "/auth/v1/logout") return send(undefined, 204);
  if (path.startsWith("/auth/v1/token")) return send(session(USERS.buyer));
  if (path === "/storage/v1/object/list/shop-private") return send(isAdmin(user) && db.signature ? [{ name: "signature.png" }] : []);
  if (path.startsWith("/storage/v1/object/sign/")) return isAdmin(user) && db.signature ? send({ signedURL: "/object/sign/shop-private/signature.png?token=t" }) : send({ message: "Object not found" }, 400);
  if (path.startsWith("/storage/v1/object/shop-private/")) { if (!isAdmin(user)) return send({ message: "denied" }, 403); db.signature = true; return send({ Key: "shop-private/signature.png" }); }
  const m = path.match(/^\/rest\/v1\/rpc\/(shop_[a-z_]+)$/);
  if (!m || !RPC[m[1]]) return send({ message: "not found" }, 404);
  if (!user && !PUBLIC_RPC.has(m[1])) return send({ code: "42501", message: `permission denied for function ${m[1]}` }, 401);
  try { return send(RPC[m[1]](user, body || {})); }
  catch (e) { return send({ code: e.code, message: e.message }, e.status || 400); }
}

/* ---------- static files, Pages-style ---------- */
async function headerRules() {
  const rules = []; let cur = null;
  for (const line of (await readFile(join(SHOP, "_headers"), "utf8")).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
    const i = line.indexOf(":"); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}
async function rewrites() {
  return (await readFile(join(SHOP, "_redirects"), "utf8")).split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.trim().split(/\s+/)).filter(([, , s]) => s === "200").map(([from, to]) => ({ prefix: from.replace(/\*$/, ""), to }));
}
const matches = (pattern, path) => pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
const isFile = async (f) => { try { return (await stat(f)).isFile(); } catch { return false; } };

export async function start() {
  const rules = await headerRules(), rw = await rewrites();
  const srv = createServer(async (req, res) => {
    const origin = `http://${req.headers.host}`;
    const url = new URL(req.url, origin);
    let path = decodeURIComponent(url.pathname);
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    if (path.startsWith("/sb/")) {
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { /* binary upload */ }
      return supabase(req, path.slice(3), body, res);
    }
    if (path === "/api/shipping-quote") {
      const r = await shippingQuote(new Request(origin + path, { method: req.method, body: req.method === "POST" ? raw : undefined }),
        { SUPABASE_URL: `${origin}/sb`, SUPABASE_KEY: "test-key", SHOP_QUOTE_KEY: QUOTE_KEY });
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
    }
    let root = SHOP;
    if (path.startsWith("/main/")) { root = SITE; path = path.slice(5); }
    else {
      if (path.endsWith(".html") && path !== "/index.html") { res.writeHead(308, { Location: path.slice(0, -5) }); return res.end(); }
      const r = rw.find((x) => path.startsWith(x.prefix) && path.length > x.prefix.length);
      if (r) path = r.to;
    }
    let file = path === "/" ? "index.html" : path.slice(1);
    if (!extname(file)) file += ".html";
    file = normalize(file).replace(/^(\.\.[/\\])+/, "");
    let full = join(root, file), code = 200;
    if (!(await isFile(full))) { code = 404; full = join(SHOP, "404.html"); }
    const headers = { "Content-Type": TYPES[extname(full)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" };
    if (root === SHOP) for (const r of rules) if (matches(r.pattern, url.pathname)) Object.assign(headers, r.headers);
    if (headers["Content-Security-Policy"]) {
      let csp = headers["Content-Security-Policy"].replace("; upgrade-insecure-requests", "");
      for (const o of REMOTE) csp = csp.split(" " + o).join("");
      headers["Content-Security-Policy"] = csp;
    }
    let out = await readFile(full);
    if (root === SHOP && file === "js/config.js") {
      out = String(out).replace(/SUPABASE_URL = "[^"]+"/, `SUPABASE_URL = "${origin}/sb"`).replace(/MAIN_SITE = "[^"]+"/, `MAIN_SITE = "${origin}/main"`);
    }
    res.writeHead(code, headers); res.end(out);
  });
  await new Promise((r) => srv.listen(Number(process.env.PORT) || 0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}
