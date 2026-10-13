// Serve site/ the way Cloudflare Pages does: headers from site/_headers (so the CSP is enforced
// in tests), /policies -> policies.html, /art/<id> -> art/<id>.html, *.html -> pretty URL redirect,
// unknown paths -> 404.html with status 404.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = fileURLToPath(new URL("../../site/", import.meta.url));
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

export async function start() {
  const rules = await headerRules();
  const srv = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith(".html") && path !== "/index.html") { res.writeHead(308, { Location: path.slice(0, -5) }); return res.end(); }
    let file = path === "/" ? "index.html" : path.slice(1);
    if (!extname(file)) file += ".html";
    file = normalize(file).replace(/^(\.\.[/\\])+/, "");
    let full = join(SITE, file), status = 200;
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
