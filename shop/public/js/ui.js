// Shared page furniture: header, footer, toast, formatting helpers.
import { MAIN_SITE } from "./config.js";
import { readCart } from "./lib/cart.js";
import { currentUser } from "./api.js";
export { formatINR } from "./lib/money.js";

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const imgUrl = (id, thumb = false) => `${MAIN_SITE}/img/${encodeURIComponent(id)}${thumb ? ".t" : ""}.webp`;
export const artUrl = (id) => `${MAIN_SITE}/art/${encodeURIComponent(id)}`;
export const CATEGORY = { paintings: "Painting", oils: "Oil painting", drawings: "Drawing", mandalas: "Mandala", rangoli: "Rangoli & Kolam", crafts: "Craft" };
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** "30 × 40 cm" (width × height, plus depth when it matters). */
export function sizeText(p) {
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const w = n(p.width_cm), h = n(p.height_cm), d = n(p.depth_cm);
  if (!w || !h) return "";
  return `${w} × ${h}${d && d >= 1 ? ` × ${d}` : ""} cm`;
}

const ICON = {
  shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-1.5 12h-13z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 11h11l2-8H6.3"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>',
};

export function renderChrome(active = "") {
  const user = currentUser();
  const cur = (k) => (k === active ? ' aria-current="page"' : "");
  const nav = $("#nav");
  if (nav) nav.innerHTML = `
    <a class="brand" href="/"><img src="/seal.png" alt="" width="34" height="32"><span>Mahalakshmi Srikanth</span><b>Shop</b><span class="sr-only"> — shop home</span></a>
    <nav class="nav-links" aria-label="Shop">
      <a href="/"${cur("shop")}>${ICON.shop}<span class="label">Shop</span></a>
      <a href="/cart"${cur("cart")} aria-label="Cart">${ICON.cart}<span class="label">Cart</span><span class="badge" id="cart-count"></span></a>
      <a href="${user ? "/account" : "/signin"}"${cur("account")}>${ICON.user}<span class="label">${user ? "Account" : "Sign in"}</span></a>
      <a href="${MAIN_SITE}/" title="The full gallery">${ICON.gallery}<span class="label">Gallery</span></a>
    </nav>`;
  const foot = $("#foot");
  if (foot) foot.innerHTML = `
    <img src="/seal.png" alt="" width="48" height="45">
    <p>Original artworks by Mahalakshmi Srikanth, Mumbai · each one of a kind, with a certificate of authenticity.</p>
    <ul>
      <li><a href="${MAIN_SITE}/policies#orders">Orders</a></li>
      <li><a href="${MAIN_SITE}/policies#shipping">Shipping &amp; returns</a></li>
      <li><a href="${MAIN_SITE}/policies#privacy">Privacy</a></li>
      <li><a href="${MAIN_SITE}/policies#terms">Terms &amp; copyright</a></li>
      <li><a href="${MAIN_SITE}/policies#grievance">Grievance officer</a></li>
      <li><a href="mailto:mahasriphoto24@gmail.com">mahasriphoto24@gmail.com</a></li>
    </ul>
    <p class="small">© ${new Date().getFullYear()} Mahalakshmi Srikanth. Prices in Indian rupees, inclusive of all taxes; shipping shown before you pay.</p>
    <p class="love">Made by Ajith, for his only loving Mom <span aria-hidden="true">♥</span></p>`;
  updateBadge();
  addEventListener("storage", updateBadge);
  addEventListener("msa-cart", updateBadge);
}
export function updateBadge() {
  const b = $("#cart-count"); if (!b) return;
  const n = readCart().length;
  b.textContent = n ? String(n) : "";
  b.closest("a")?.setAttribute("aria-label", n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart");
}
export const cartChanged = () => dispatchEvent(new CustomEvent("msa-cart"));

export function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

export const signInUrl = (next = location.pathname + location.search) => `/signin?next=${encodeURIComponent(next)}`;
/** Only same-site paths are allowed as a "next" destination after sign-in. */
export const safeNext = (n) => (typeof n === "string" && /^\/(?!\/)[\w\-/.?=&%]*$/.test(n) ? n : "/account");

export function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(text || "Please wait")}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/** The "payments are not open yet" notice, shown until she saves her UPI ID in admin. */
export const closedNotice = () => `<div class="notice warn" id="payments-closed"><p><strong>Payments are not open yet.</strong>
  You can browse and add artworks to your cart; online checkout opens soon. To buy now, write to
  <a href="mailto:mahasriphoto24@gmail.com">mahasriphoto24@gmail.com</a>.</p></div>`;
