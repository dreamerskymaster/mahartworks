// Serve site/ the way Cloudflare Pages does: headers from site/_headers (so the CSP is enforced
// in tests), redirects from site/_redirects (/verify/<number> -> /art/<id>#certificate), /policies ->
// policies.html, /art/<id> -> art/<id>.html, *.html -> pretty URL redirect, unknown paths -> 404.html with
// status 404. Test-only pages from tests/e2e/fixtures/ are served under /__fixtures__/ (never published).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = fileURLToPath(new URL("../../site/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain" };

async function headerRules() {
  const rules = []; let cur = null;
  for (const line of (await readFile(join(SITE, "_headers"), "utf8")).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
    const i = line.indexOf(":"); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}
const matches = (pattern, path) => pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;

/** _redirects lines: "source destination [code]". Like Pages: the first matching rule wins; sources may end
 *  in a splat (*, used as :splat in the destination) or have :placeholder segments. */
async function redirectRules() {
  let text = "";
  try { text = await readFile(join(SITE, "_redirects"), "utf8"); } catch { return []; }
  return text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [from, to, code] = l.split(/\s+/);
    const names = [];
    const re = new RegExp("^" + from.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, n) => { names.push(n); return "([^/]+)"; })
      .replace(/\*$/, () => { names.push("splat"); return "(.*)"; }) + "$");
    return { re, names, to, code: +code || 302 };
  });
}
function redirect(rules, path) {
  for (const r of rules) {
    const m = path.match(r.re);
    if (m) return { code: r.code, location: r.names.reduce((to, n, i) => to.replaceAll(":" + n, m[i + 1]), r.to) };
  }
  return null;
}

export async function start() {
  const rules = await headerRules();
  const redirects = await redirectRules();
  const srv = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const to = redirect(redirects, path);
    if (to) { res.writeHead(to.code, { Location: to.location }); return res.end(); }
    if (path.endsWith(".html") && path !== "/index.html") { res.writeHead(308, { Location: path.slice(0, -5) }); return res.end(); }
    let root = SITE;
    if (path.startsWith("/__fixtures__/")) { root = FIXTURES; path = path.slice("/__fixtures__".length); }
    let file = path === "/" ? "index.html" : path.slice(1);
    if (!extname(file)) file += ".html";
    file = normalize(file).replace(/^(\.\.[/\\])+/, "");
    let full = join(root, file), status = 200;
    const isFile = async (f) => { try { return (await stat(f)).isFile(); } catch { return false; } };
    if (!(await isFile(full))) {   // like Pages: with a 404.html, unknown paths are 404s; without one, the app
      status = (await isFile(join(SITE, "404.html"))) ? 404 : 200;
      full = join(SITE, status === 404 ? "404.html" : "index.html");
    }
    const headers = { "Content-Type": TYPES[extname(full)] || "application/octet-stream" };
    for (const r of rules) if (matches(r.pattern, path)) Object.assign(headers, r.headers);
    if (headers["Content-Security-Policy"])   // tests run on plain http
      headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace("; upgrade-insecure-requests", "");
    res.writeHead(status, headers); res.end(await readFile(full));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}
