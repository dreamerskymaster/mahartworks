// /api/subscribe — the footer's Subscribe box. POST {"email": "...", "website": "", "page": "/..."}.
// Saves the address once (a repeat is a quiet success). "website" is a hidden honeypot field: bots fill it, people don't.
import { json, sameOrigin, EMAIL } from "../../api-lib/footer-api.js";

const MAX_SUBSCRIBERS = 20000; // a flood guard well above any real list

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!env.DB) return json({ error: "unavailable" }, 503);
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  if (Number(request.headers.get("content-length") || 0) > 2000) return json({ error: "size" }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "body" }, 400);
  }
  if (body && body.website) return json({ ok: true }); // honeypot: pretend it worked
  const email = String((body && body.email) || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: "email" }, 400);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers").first();
  if (n >= MAX_SUBSCRIBERS) return json({ error: "full" }, 503);
  const page = String((body && body.page) || "").slice(0, 200);
  await env.DB.prepare(
    "INSERT INTO subscribers (email, site, page, country) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
  ).bind(email, new URL(request.url).host, page, (request.cf && request.cf.country) || "").run();
  return json({ ok: true });
}

