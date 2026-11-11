// /api/subscribers?key=<LIST_KEY> — her private list of Subscribe-box sign-ups (the link is in Claude memory and
// was emailed to her; the key is a Pages secret, never in this repo). Wrong or missing key: a plain 404.
//   GET              the list, with every address in one box to copy into Gmail's Bcc
//   GET &format=csv  the same as a CSV download
//   POST key+remove  takes one address off the list (someone asked to unsubscribe)
const page = (body, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
const notFound = () => new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function keyOk(given, want) {
  if (!given || !want) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(want))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function onRequest({ request, env }) {
  if (!env.DB) return notFound();
  const url = new URL(request.url);
  let form = null;
  if (request.method === "POST") form = await request.formData().catch(() => null);
  const key = (form && form.get("key")) || url.searchParams.get("key") || "";
  if (!(await keyOk(String(key), env.LIST_KEY))) return notFound();

  if (request.method === "POST") {
    const gone = String((form && form.get("remove")) || "").trim().toLowerCase();
    if (gone) await env.DB.prepare("DELETE FROM subscribers WHERE email = ?").bind(gone).run();
    return Response.redirect(`${url.origin}${url.pathname}?key=${encodeURIComponent(key)}&removed=${encodeURIComponent(gone)}`, 303);
  }
  if (request.method !== "GET") return notFound();

  const { results } = await env.DB.prepare("SELECT email, created_at, country FROM subscribers ORDER BY created_at DESC").all();
  if (url.searchParams.get("format") === "csv") {
    const csv = ["email,subscribed_utc,country", ...results.map((r) => `${r.email},${r.created_at},${r.country || ""}`)].join("\n");
    return new Response(csv + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="vanna-reverie-subscribers.csv"', "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  const removed = url.searchParams.get("removed");
  const k = esc(key);
  const rows = results
    .map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.country || "")}</td>
      <td><form method="post"><input type="hidden" name="key" value="${k}"><input type="hidden" name="remove" value="${esc(r.email)}"><button>Remove</button></form></td></tr>`)
    .join("");
  return page(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Subscribers — Vanna Reverie</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 760px; background: #faf6ee; color: #1f2440; }
  h1 { font-size: 1.4rem; margin: .2rem 0 .6rem; } p { margin: .5rem 0; }
  textarea { width: 100%; box-sizing: border-box; min-height: 7rem; font: inherit; padding: .5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: .95rem; }
  th, td { text-align: left; padding: .45rem .3rem; border-bottom: 1px solid #ddd3bc; word-break: break-all; }
  button { font: inherit; padding: .25rem .7rem; } .note { background: #efe6cf; padding: .6rem .8rem; border-radius: 8px; }
  a { color: #8a6420; }
</style></head><body>
<h1>Vanna Reverie — subscribers (${results.length})</h1>
<p>People who typed their email in the <strong>Subscribe</strong> box at the bottom of your website. Keep this link private.</p>
${removed ? `<p class="note">Removed ${esc(removed)}.</p>` : ""}
<p><strong>To email them all:</strong> press and hold in the box below, Select All, Copy. In Gmail, write your email and paste into <strong>Bcc</strong> (not To), so nobody sees the others' addresses.</p>
<textarea readonly>${esc(results.map((r) => r.email).join(", "))}</textarea>
<p><a href="?key=${encodeURIComponent(key)}&amp;format=csv">Download as a spreadsheet (CSV)</a></p>
<p>If someone asks to stop getting your emails, press <strong>Remove</strong> next to their address.</p>
<table><thead><tr><th>Email</th><th>Joined</th><th>Country</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">No subscribers yet.</td></tr>'}</tbody></table>
</body></html>`);
}
