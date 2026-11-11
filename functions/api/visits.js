// /api/visits — the footer's "Total views" counter.
//   GET  -> {"total": n}        read only
//   POST -> {"total": n + 1}    one page view (js/footer.js sends it once per page load)
import { json, sameOrigin, isBot } from "../../api-lib/footer-api.js";

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "unavailable" }, 503);
  const name = env.COUNTER_NAME || "pageviews";
  let row;
  if (request.method === "POST" && sameOrigin(request) && !isBot(request)) {
    row = await env.DB.prepare("UPDATE counters SET n = n + 1 WHERE name = ? RETURNING n").bind(name).first();
  } else if (request.method === "GET" || request.method === "POST") {
    row = await env.DB.prepare("SELECT n FROM counters WHERE name = ?").bind(name).first();
  } else {
    return json({ error: "method" }, 405);
  }
  return json({ total: row ? row.n : 0 });
}
