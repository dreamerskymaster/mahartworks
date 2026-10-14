// The cart lives in localStorage (no account needed to browse). It only holds artwork ids: every original is
// one of a kind, so there are no quantities. Prices always come from the server (shop_products), and the
// database checks them again when the order is placed.
export const CART_KEY = "msa-cart";
export const MAX_ITEMS = 20;
const ID = /^[a-z0-9-]{1,120}$/;
const clean = (ids) => [...new Set((ids || []).filter((x) => typeof x === "string" && ID.test(x)))].slice(0, MAX_ITEMS);

export function readCart(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(CART_KEY) || "[]");
    return Array.isArray(v) ? clean(v) : [];
  } catch { return []; }
}
export function writeCart(ids, storage = globalThis.localStorage) {
  const c = clean(ids);
  try { storage?.setItem(CART_KEY, JSON.stringify(c)); } catch { /* storage blocked: the cart lasts for this page */ }
  return c;
}
export const addToCart = (id, storage) => writeCart([...readCart(storage), id], storage);
export const removeFromCart = (id, storage) => writeCart(readCart(storage).filter((x) => x !== id), storage);
export const clearCart = (storage) => writeCart([], storage);

/**
 * Check the cart against what the server says is for sale.
 * products: rows from shop_products (id, title, price_inr, for_sale, sold, status).
 * Returns the items that can be bought, the ones that can't (with a reason), and the subtotal.
 */
export function validateCart(ids, products) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const items = [], removed = [];
  for (const id of clean(ids)) {
    const p = byId.get(id);
    if (!p || (!p.for_sale && !p.sold)) removed.push({ id, title: p?.title, reason: "no longer for sale" });
    else if (p.sold || p.status === "sold") removed.push({ id, title: p.title, reason: "sold" });
    else if (p.status === "reserved") removed.push({ id, title: p.title, reason: "reserved by another buyer" });
    else if (!p.for_sale) removed.push({ id, title: p.title, reason: "no longer for sale" });
    else if (!Number.isInteger(p.price_inr) || p.price_inr <= 0) removed.push({ id, title: p.title, reason: "no price yet" });
    else items.push(p);
  }
  return { items, removed, subtotal: items.reduce((s, p) => s + p.price_inr, 0), ok: items.length > 0 && removed.length === 0 };
}
