// /api/unsubscribe — POST {"email": "..."} deletes that address from the Subscribe-box list (site/unsubscribe.html).
// Always answers {"ok": true} for a valid address, listed or not, so nobody can use it to find out who subscribed.
import { json, sameOrigin, EMAIL } from "../../api-lib/footer-api.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!env.DB) return json({ error: "unavailable" }, 503);
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  if (Number(request.headers.get("content-length") || 0) > 1000) return json({ error: "size" }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "body" }, 400);
  }
  const email = String((body && body.email) || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: "email" }, 400);
  await env.DB.prepare("DELETE FROM subscribers WHERE email = ?").bind(email).run();
  return json({ ok: true });
}
