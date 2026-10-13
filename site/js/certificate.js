// Certificate of Authenticity for an artwork by Mahalakshmi Srikanth: one print-ready A4 landscape page.
//
//   import { renderCertificate } from "/js/certificate.js";
//   renderCertificate(container, { id, cert, title, category, medium, size, year, imageUrl,
//                                  buyerName, issuedOn, signatureUrl });
//   // then window.print() -> "Save as PDF" gives exactly one page
//
// Only `cert` (MS-YYYY-NNNN, from data.js) and `title` are required; empty fields are left out.
// Her signature is NEVER stored in this repository or on the public site: pass `signatureUrl` at runtime
// (for example a short-lived signed URL from private storage). Without it a blank line is printed for a
// wet signature. Everything is built with DOM methods (no innerHTML), so names and titles are safe.
// No dependencies besides the vendored MIT QR encoder next to this file; CSP-safe (styles go in a <style>).
import { QrCode } from "./qrcodegen.js";

export const ARTIST = "Mahalakshmi Srikanth";
export const PLACE = "Mumbai, India";
export const VERIFY_BASE = "https://mah-artworks.pages.dev/verify/";
export const CERT_PATTERN = /^MS-\d{4}-\d{4,}$/;
const SEAL = new URL("../seal.png", import.meta.url).href;
const CATEGORY = { paintings: "Painting", drawings: "Drawing", mandalas: "Mandala", rangoli: "Rangoli", crafts: "Craft" };
const SVG = "http://www.w3.org/2000/svg";

export const certificateStyles = `
@page { size: A4 landscape; margin: 0; }
.ms-coa-sheet { --navy: #1f2440; --gold: #a9823a; --gold-soft: #d4ae5c; --paper: #fbf7ec; --ink: #1f2440; --muted: #5a5f78;
  --serif: "Cormorant Garamond", "Cormorant", Georgia, "Times New Roman", serif; --sans: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
  container-type: inline-size; position: relative; width: 100%; aspect-ratio: 297 / 210; overflow: hidden; box-sizing: border-box;
  background: var(--paper); color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ms-coa-sheet *, .ms-coa-sheet *::before, .ms-coa-sheet *::after { box-sizing: border-box; }
@media screen { .ms-coa-sheet { box-shadow: 0 1.5cqw 4cqw rgba(15, 18, 40, .25); border-radius: .3cqw; } }
.ms-coa-frame, .ms-coa-ghost { position: absolute; pointer-events: none; }
.ms-coa-frame { inset: 0; width: 100%; height: 100%; }
.ms-coa-ghost { left: 50%; top: 52%; width: 30cqw; transform: translate(-50%, -50%); opacity: .045; }
.ms-coa { position: absolute; inset: 5.4cqw 8.6cqw 5cqw; display: flex; flex-direction: column; font: 400 1.2cqw/1.45 var(--sans); }
.ms-coa p { margin: 0; }
.ms-coa-head { text-align: center; }
.ms-coa-eyebrow { font: 600 .95cqw/1.2 var(--sans); letter-spacing: .38em; text-transform: uppercase; color: var(--gold); }
.ms-coa-h1 { margin: .5cqw 0 0; font: 500 4.5cqw/1.05 var(--serif); letter-spacing: .02em; color: var(--navy); }
.ms-coa-rule { display: block; width: 26cqw; height: 1.6cqw; margin: .5cqw auto 0; }
.ms-coa-body { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 3.6cqw; padding: 1.4cqw 1cqw 1cqw; }
.ms-coa-art { flex: 0 1 auto; margin: 0; max-width: 34cqw; height: 100%; max-height: 31cqw; display: flex; align-items: center; justify-content: center; }
.ms-coa-art img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;
  border: .55cqw solid #fff; outline: .12cqw solid var(--gold); box-shadow: 0 .5cqw 1.4cqw rgba(15, 18, 40, .22); }
.ms-coa-details { flex: 1 1 0; min-width: 0; max-width: 52cqw; }
.ms-coa-body.no-art .ms-coa-details { flex: 0 1 60cqw; text-align: center; }
.ms-coa-title { font: italic 500 3cqw/1.1 var(--serif); color: var(--navy); overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ms-coa-by { margin-top: .3cqw !important; color: var(--muted); font-size: 1.1cqw; }
.ms-coa-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .35cqw 1.6cqw; margin: 1.3cqw 0 0; }
.ms-coa-body.no-art .ms-coa-facts { width: max-content; max-width: 100%; margin-inline: auto; text-align: left; }
.ms-coa-facts dt { font: 600 .82cqw/1.75 var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); white-space: nowrap; }
.ms-coa-facts dd { margin: 0; font-size: 1.2cqw; overflow-wrap: anywhere; }
.ms-coa-facts .ms-coa-no { font-weight: 700; letter-spacing: .1em; }
.ms-coa-issued { margin-top: 1.2cqw !important; font: italic 500 1.7cqw/1.3 var(--serif); }
.ms-coa-issued b { font-weight: 600; }
.ms-coa-statement { margin-top: 1.1cqw !important; font-size: 1.05cqw; line-height: 1.5; color: #3a3f5a; }
.ms-coa-foot { flex: none; display: grid; grid-template-columns: 1fr 1.5fr 1fr; align-items: end; gap: 2cqw; }
.ms-coa-seal { justify-self: start; display: flex; align-items: center; gap: 1cqw; }
.ms-coa-seal img { width: 9.5cqw; height: auto; display: block; }
.ms-coa-seal p { font: 600 .8cqw/1.5 var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); max-width: 9cqw; }
.ms-coa-sign { text-align: center; }
.ms-coa-sign-space { height: 5cqw; display: flex; align-items: flex-end; justify-content: center; }
.ms-coa-sign-space img { max-height: 5cqw; max-width: 22cqw; width: auto; height: auto; display: block; }
.ms-coa-sign-line { display: block; border: 0; border-top: .12cqw solid var(--navy); width: 24cqw; margin: .3cqw auto .4cqw; }
.ms-coa-sign-name { font: 500 1.6cqw/1.2 var(--serif); color: var(--navy); }
.ms-coa-sign-role { font: 600 .78cqw/1.6 var(--sans); letter-spacing: .24em; text-transform: uppercase; color: var(--muted); }
.ms-coa-qr { justify-self: end; display: flex; align-items: center; gap: 1cqw; text-align: right; }
.ms-coa-qr svg { width: 9.5cqw; height: 9.5cqw; display: block; flex: none; }
.ms-coa-qr p { font-size: .82cqw; line-height: 1.5; color: var(--muted); max-width: 14cqw; }
.ms-coa-url { white-space: nowrap; color: var(--navy); }
.ms-coa-qr strong { display: block; font: 700 1.15cqw/1.3 var(--sans); letter-spacing: .08em; color: var(--navy); }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body *:not(:has(.ms-coa-sheet)):not(.ms-coa-sheet):not(.ms-coa-sheet *) { display: none !important; }
  *:has(.ms-coa-sheet) { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; box-shadow: none !important; background: none !important; width: auto !important; max-width: none !important;
    height: auto !important; min-height: 0 !important; transform: none !important; overflow: visible !important; }
  .ms-coa-sheet { width: 297mm !important; height: 209.9mm !important; max-width: none !important; aspect-ratio: auto !important;
    margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-inside: avoid; page-break-inside: avoid; }
  .ms-coa-art img { box-shadow: none !important; }
  .ms-coa-sheet + .ms-coa-sheet { break-before: page; page-break-before: always; }
}
`;

/** Add the certificate styles to a document once (also exported as `certificateStyles`). */
export function injectCertificateStyles(doc = document) {
  if (doc.getElementById("ms-coa-styles")) return;
  const s = doc.createElement("style");
  s.id = "ms-coa-styles";
  s.textContent = certificateStyles;
  doc.head.append(s);
}

export const verifyUrl = (cert, base = VERIFY_BASE) => base + encodeURIComponent(cert);

/** The QR code for `text` as an <svg> (one path, 4-module quiet zone). Medium error correction. */
export function qrSvg(text, { doc = document, label = text } = {}) {
  const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
  const n = qr.size, q = 4, d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.getModule(x, y)) d.push(`M${x + q},${y + q}h1v1h-1z`);
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${n + 2 * q} ${n + 2 * q}`);
  svg.setAttribute("class", "ms-coa-qrcode");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `QR code: ${label}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.dataset.text = text;
  const bg = doc.createElementNS(SVG, "rect");
  bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#fff");
  const p = doc.createElementNS(SVG, "path");
  p.setAttribute("d", d.join("")); p.setAttribute("fill", "#1f2440");
  svg.append(bg, p);
  return svg;
}

/** The QR modules for `text` (true = dark), for tests and other renderers. */
export function qrMatrix(text) {
  const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
  return Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)));
}

const blank = (v) => v === undefined || v === null || String(v).trim() === "";

function formatDate(v) {
  if (blank(v)) return "";
  const d = v instanceof Date ? v : /^\d{4}-\d\d-\d\d$/.test(String(v).trim()) ? new Date(String(v).trim() + "T00:00") : null;
  if (!d || isNaN(d)) return String(v).trim();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** The ornamental border: navy frame, gold rules and corner flourishes (viewBox in millimetres of A4). */
function frame(doc) {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", "ms-coa-frame");
  svg.setAttribute("viewBox", "0 0 297 210");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs) => {
    const n = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
  };
  add("rect", { x: 6, y: 6, width: 285, height: 198, fill: "none", stroke: "#1f2440", "stroke-width": 2.4 });
  add("rect", { x: 9.6, y: 9.6, width: 277.8, height: 190.8, fill: "none", stroke: "#a9823a", "stroke-width": .7 });
  add("rect", { x: 11.2, y: 11.2, width: 274.6, height: 187.6, fill: "none", stroke: "#1f2440", "stroke-width": .25 });
  for (const [cx, cy, sx, sy] of [[11.2, 11.2, 1, 1], [285.8, 11.2, -1, 1], [11.2, 198.8, 1, -1], [285.8, 198.8, -1, -1]]) {
    const t = `translate(${cx} ${cy}) scale(${sx * .8} ${sy * .8})`;
    add("path", { transform: t, fill: "none", stroke: "#a9823a", "stroke-width": .6,
      d: "M0 14 Q0 0 14 0 M3.5 14 Q3.5 3.5 14 3.5 M0 22 L0 14 M14 0 L22 0" });
    add("path", { transform: t, fill: "#a9823a", d: "M7.5 2.8 L9.2 7.5 L7.5 12.2 L5.8 7.5 Z" });
    add("circle", { transform: t, cx: 17.5, cy: 3.5, r: .9, fill: "#a9823a" });
    add("circle", { transform: t, cx: 3.5, cy: 17.5, r: .9, fill: "#a9823a" });
  }
  // little diamonds at the middle of each side
  for (const [x, y] of [[148.5, 9.6], [148.5, 200.4], [9.6, 105], [287.4, 105]]) {
    add("path", { fill: "#1f2440", stroke: "#a9823a", "stroke-width": .4, d: `M${x} ${y - 2.2} L${x + 2.2} ${y} L${x} ${y + 2.2} L${x - 2.2} ${y} Z` });
  }
  return svg;
}

function rule(doc) {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", "ms-coa-rule");
  svg.setAttribute("viewBox", "0 0 160 10");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of [["path", { d: "M2 5 H68 M92 5 H158", stroke: "#a9823a", "stroke-width": .8, fill: "none" }],
    ["path", { d: "M80 .8 L84.2 5 L80 9.2 L75.8 5 Z", fill: "#a9823a" }],
    ["circle", { cx: 71.5, cy: 5, r: 1.3, fill: "#1f2440" }], ["circle", { cx: 88.5, cy: 5, r: 1.3, fill: "#1f2440" }]]) {
    const n = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}

/**
 * Render a Certificate of Authenticity into `container` (its previous content is replaced).
 * @param {HTMLElement} container
 * @param {object} o
 * @param {string} o.cert         certificate number, MS-YYYY-NNNN (required; `cert` in data.js)
 * @param {string} o.title        artwork title (required)
 * @param {string} [o.id]         artwork id (data.js), printed as "Artwork ID"
 * @param {string} [o.category]   "paintings" etc. (data.js `cat`) or any label, e.g. "Acrylic painting"
 * @param {string} [o.medium]     e.g. "Acrylic on canvas"
 * @param {string} [o.size]       e.g. "40 × 50 cm"
 * @param {string|number} [o.year]
 * @param {string} [o.imageUrl]   artwork picture, e.g. "/img/<id>.webp"
 * @param {string} [o.buyerName]  printed as "Issued to …"
 * @param {string|Date} [o.issuedOn]  "YYYY-MM-DD" or a Date, printed as "on 12 October 2026"
 * @param {string} [o.signatureUrl]   her signature image, supplied at runtime from private storage only
 * @param {string} [o.verifyBase]     default "https://mah-artworks.pages.dev/verify/"
 * @param {string} [o.sealUrl]        default: the site's seal.png next to /js/
 * @returns {HTMLElement} the certificate sheet (class "ms-coa-sheet")
 */
export function renderCertificate(container, { id, cert, title, category, medium, size, year, imageUrl, buyerName, issuedOn,
  signatureUrl, verifyBase = VERIFY_BASE, sealUrl = SEAL } = {}) {
  if (!container) throw new Error("renderCertificate: no container");
  cert = String(cert || "").trim();
  if (!CERT_PATTERN.test(cert)) throw new Error(`renderCertificate: "${cert}" is not a certificate number (MS-YYYY-NNNN)`);
  if (blank(title)) throw new Error("renderCertificate: title is required");
  const doc = container.ownerDocument;
  injectCertificateStyles(doc);
  const el = (tag, cls, ...kids) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    n.append(...kids.filter((k) => k !== null && k !== undefined && k !== ""));
    return n;
  };
  const img = (src, alt, cls) => {
    const n = doc.createElement("img");
    n.src = src; n.alt = alt; n.decoding = "async";
    if (cls) n.className = cls;
    return n;
  };
  const url = verifyUrl(cert, verifyBase);
  const cat = blank(category) ? "" : (CATEGORY[String(category).trim()] || String(category).trim());

  const facts = el("dl", "ms-coa-facts");
  for (const [k, v, cls] of [["Category", cat], ["Medium", medium], ["Size", size], ["Year", year], ["Artwork ID", id],
    ["Certificate No.", cert, "ms-coa-no"]]) {
    if (blank(v)) continue;
    facts.append(el("dt", "", k), el("dd", cls || "", String(v).trim()));
  }
  const when = formatDate(issuedOn);
  let issued = null;
  if (!blank(buyerName) || when) {
    issued = el("p", "ms-coa-issued");
    if (!blank(buyerName)) issued.append("Issued to ", el("b", "", String(buyerName).trim()));
    if (when) issued.append(blank(buyerName) ? "Issued on " : " on ", el("b", "", when));
  }
  const statement = el("p", "ms-coa-statement",
    `This is to certify that the artwork described here is an original work, made by hand by ${ARTIST}. ` +
    "The artist retains the copyright in the work, including the right to reproduce it, under the Copyright Act, 1957; " +
    "owning the artwork does not transfer its copyright.");
  const details = el("div", "ms-coa-details", el("p", "ms-coa-title", String(title).trim()),
    el("p", "ms-coa-by", `by ${ARTIST} · ${PLACE}`), facts, issued, statement);
  const body = el("div", "ms-coa-body" + (blank(imageUrl) ? " no-art" : ""),
    blank(imageUrl) ? null : el("figure", "ms-coa-art", img(imageUrl, `${String(title).trim()} by ${ARTIST}`)), details);

  const signSpace = el("div", "ms-coa-sign-space", blank(signatureUrl) ? null : img(signatureUrl, `Signature of ${ARTIST}`, "ms-coa-signature"));
  const foot = el("div", "ms-coa-foot",
    el("div", "ms-coa-seal", img(sealUrl, `MS seal of ${ARTIST}`), el("p", "", "Original artwork")),
    el("div", "ms-coa-sign", signSpace, el("hr", "ms-coa-sign-line"), el("p", "ms-coa-sign-name", ARTIST),
      el("p", "ms-coa-sign-role", "Artist")),
    el("div", "ms-coa-qr", el("p", "", "Certificate No.", el("strong", "", cert), "Scan to verify, or enter the number at ",
      el("span", "ms-coa-url", verifyBase.replace(/^https?:\/\//, "").replace(/\/$/, ""))), qrSvg(url, { doc, label: `verify certificate ${cert}` })));

  const sheet = el("div", "ms-coa-sheet");
  sheet.dataset.cert = cert;
  sheet.append(frame(doc), img(sealUrl, "", "ms-coa-ghost"),
    el("article", "ms-coa",
      el("header", "ms-coa-head", el("p", "ms-coa-eyebrow", `${ARTIST} · ${PLACE}`),
        el("h1", "ms-coa-h1", "Certificate of Authenticity"), rule(doc)),
      body, foot));
  sheet.querySelector(".ms-coa").setAttribute("aria-label", `Certificate of Authenticity ${cert}: ${String(title).trim()}`);
  container.replaceChildren(sheet);
  return sheet;
}

export default renderCertificate;
