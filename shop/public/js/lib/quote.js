// Signed shipping quotes. /api/shipping-quote signs each option it offers; shop.api_place_order in the database
// recomputes the same HMAC-SHA256 with the key kept in Supabase Vault (`shop_quote_key`), so a buyer can't edit
// the shipping price. The message format must match the database function exactly.
export const QUOTE_TTL_SECONDS = 30 * 60;

export function quoteMessage({ pin, ids, code, price_inr, exp }) {
  return ["v1", pin, [...new Set(ids)].sort().join(","), code, String(price_inr), String(exp)].join("|");
}

export async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signOption(key, { pin, ids }, option, now = Date.now()) {
  const exp = Math.floor(now / 1000) + QUOTE_TTL_SECONDS;
  const sig = await hmacHex(key, quoteMessage({ pin, ids, code: option.code, price_inr: option.price_inr, exp }));
  return { ...option, exp, sig };
}
