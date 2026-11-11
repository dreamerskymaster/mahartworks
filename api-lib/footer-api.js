// Shared helpers for the footer API (Cloudflare Pages Functions on the vanna-reverie project).
// Bindings, set on the Pages project (not in this public repo): DB = D1 database "vanna-reverie",
// LIST_KEY = secret for the private subscriber list, COUNTER_NAME = "pageviews" (production) / "pageviews-preview".
// _headers does not apply to Function responses, so every response sets its own headers here.

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });

// Browsers send Origin on POST. Refuse posts made from another website (a cheap guard, not real security).
export const sameOrigin = (request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

export const isBot = (request) => /bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(request.headers.get("user-agent") || "");

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
