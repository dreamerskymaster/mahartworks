// /verify: look up a Certificate of Authenticity number in data.js (no server, no form submission).
// Accepts "MS-2024-0007", "ms 2024 0007", "MS20240007" or a pasted /verify/<number> link.
// /verify?n=<number> (where unknown /verify/<number> addresses are sent) checks it straight away.
(() => {
  const ARTIST = "Mahalakshmi Srikanth";
  const art = window.ARTWORKS || [];
  const byCert = new Map(art.filter((a) => a.cert).map((a) => [a.cert, a]));
  const box = document.getElementById("verify");
  if (!box) return;
  const input = document.getElementById("cert-input"), btn = document.getElementById("cert-check");
  const out = document.getElementById("cert-result");
  const email = box.dataset.email || "";

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids);
    return n;
  };

  function normalize(raw) {
    let s = String(raw || "").trim();
    const m = s.match(/MS[\s\-‐-―_.\/]*\d{4}[\s\-‐-―_.\/]*\d{4,}/i);
    if (m) s = m[0];
    const p = s.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^MS(\d{4})(\d{4,})$/);
    return p ? `MS-${p[1]}-${p[2]}` : s.toUpperCase();
  }

  function check(raw) {
    const n = normalize(raw);
    out.replaceChildren();
    if (!n) return;
    const a = byCert.get(n);
    if (a) {
      const link = `/art/${a.id}#certificate`;
      out.append(el("div", { class: "verify-card good" },
        el("a", { href: link, tabindex: "-1", "aria-hidden": "true" },
          el("img", { src: `/img/${a.id}.t.webp`, alt: "", width: "96", height: "96", decoding: "async" })),
        el("div", {},
          el("p", { class: "ok" }, "Genuine certificate"),
          el("p", { class: "t" }, a.title),
          el("p", {}, `Certificate ${n} was issued by ${ARTIST} for this artwork.`),
          el("p", {}, el("a", { href: link, class: "verify-link" }, "View the artwork and its certificate details")))));
    } else {
      const help = email
        ? ["If you were given this number with an artwork, please write to ", el("a", { href: `mailto:${email}?subject=${encodeURIComponent("Certificate check: " + n)}` }, email), " so she can check it."]
        : ["If you were given this number with an artwork, please contact her so she can check it."];
      out.append(el("div", { class: "verify-card bad" },
        el("p", { class: "ok" }, "Not found"),
        el("p", { class: "verify-no" }, `${n} is not a certificate issued by ${ARTIST}.`),
        el("p", {}, ...help)));
    }
    try { history.replaceState(null, "", `/verify?n=${encodeURIComponent(n)}`); } catch { /* file:// or sandboxed */ }
  }

  btn.addEventListener("click", () => check(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(input.value); } });
  input.addEventListener("input", () => { if (byCert.has(normalize(input.value))) check(input.value); else if (!input.value.trim()) out.replaceChildren(); });

  let q = new URLSearchParams(location.search).get("n");
  try { q = q || decodeURIComponent(location.hash.slice(1)); } catch { /* a malformed #fragment */ }
  if (q) { input.value = normalize(q); check(q); }
})();
