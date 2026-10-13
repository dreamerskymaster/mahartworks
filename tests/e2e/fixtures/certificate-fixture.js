// Test-only: renders a sample certificate for site.test.mjs. The signature is a made-up test squiggle,
// never her real one (that is only ever supplied at runtime from private storage).
import { renderCertificate } from "/js/certificate.js";

const variant = new URLSearchParams(location.search).get("variant") || "full";
const a = (window.ARTWORKS || []).find((x) => x.cat === "paintings" && x.date) || window.ARTWORKS[0];
const opts = {
  full: { id: a.id, cert: a.cert, title: a.title, category: a.cat, medium: "Acrylic on canvas", size: "40 × 50 cm",
    year: a.date.slice(0, 4), imageUrl: `/img/${a.id}.webp`, buyerName: "Test Buyer", issuedOn: "2026-10-12",
    signatureUrl: "/__fixtures__/test-signature.svg" },
  minimal: { cert: a.cert, title: a.title },
  long: { id: a.id, cert: a.cert, category: a.cat, medium: "Acrylic, gold leaf and glass beads on stretched cotton canvas",
    size: "120 × 90 cm (framed 130 × 100 cm)", year: "2024", imageUrl: `/img/${a.id}.webp`,
    title: "Radha and Krishna on the Banks of the Yamuna at Dusk, with Peacocks, Lotuses and the Full Moon Rising Over Vrindavan",
    buyerName: "Dr. Venkataraghavan Subramaniam Iyer-Krishnamurthy and Family", issuedOn: new Date(2026, 9, 12) },
}[variant];

const sheet = renderCertificate(document.getElementById("cert"), opts);
window.certOptions = opts;
Promise.all([document.fonts.ready, ...[...sheet.querySelectorAll("img")].map((i) => i.decode().catch(() => {}))])
  .then(() => { window.certReady = true; });
