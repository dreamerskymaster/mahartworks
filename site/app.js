// Contact details shown in the "Get in touch" section. Leave a value empty to hide it.
const CONTACT = {
  email: "",
  instagram: "",   // handle without @
};

const CATS = [
  ["all", "All"],
  ["paintings", "Paintings"],
  ["drawings", "Drawings & Sketches"],
  ["mandalas", "Mandalas"],
  ["rangoli", "Rangoli & Kolam"],
  ["crafts", "Crafts"],
];
const HERO = ["Kathakali Face Framed", "Radha Seeing Krishna Reflection", "Panchamukhi Hanuman Painting",
  "Madhubani Peacock", "Lakshmi On Lotus", "Warli Village Scene Framed"];
const PAGE = 60;

const art = window.ARTWORKS;
const $ = (s) => document.querySelector(s);
let current = "all", shown = [], limit = PAGE, lbIndex = 0;

const fmtDate = (d) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";

function heroArt() {
  const picks = HERO.map((t) => art.find((a) => a.title === t)).filter(Boolean).slice(0, 5);
  $("#hero-art").innerHTML = picks.map((a) => `<img src="img/${a.id}.t.webp" alt="">`).join("");
}

function filters() {
  $("#filters").innerHTML = CATS.map(([k, label]) => {
    const n = k === "all" ? art.length : art.filter((a) => a.cat === k).length;
    return `<button role="tab" data-cat="${k}" aria-selected="${k === current}">${label}<small>${n}</small></button>`;
  }).join("");
}

function render() {
  shown = current === "all" ? art : art.filter((a) => a.cat === current);
  $("#grid").innerHTML = shown.slice(0, limit).map((a, i) =>
    `<figure class="card" tabindex="0" data-i="${i}">
       <img src="img/${a.id}.t.webp" alt="${a.title}" width="${a.w}" height="${a.h}" loading="lazy" draggable="false">
       <span>${a.title}</span></figure>`).join("")
    + (shown.length > limit ? `<button class="btn more" id="more">Show more (${shown.length - limit})</button>` : "");
}

function openLb(i) {
  lbIndex = (i + shown.length) % shown.length;
  const a = shown[lbIndex];
  $("#lb-img").src = `img/${a.id}.webp`;
  $("#lb-img").alt = a.title;
  $("#lb-cap").innerHTML = `${a.title}<small>${fmtDate(a.date)}</small>`;
  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeLb() { $("#lightbox").hidden = true; document.body.style.overflow = ""; }

function contact() {
  const links = [];
  if (CONTACT.email) links.push(`<a class="btn" href="mailto:${CONTACT.email}">Email</a>`);
  if (CONTACT.instagram) links.push(`<a class="btn" href="https://instagram.com/${CONTACT.instagram}" target="_blank" rel="noopener">Instagram</a>`);
  $("#contact-links").innerHTML = links.join("");
  if (!links.length) $("#contact").hidden = true;
}

$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  current = b.dataset.cat; limit = PAGE; filters(); render();
});
$("#grid").addEventListener("click", (e) => {
  if (e.target.id === "more") { limit += PAGE; render(); return; }
  const c = e.target.closest(".card"); if (c) openLb(+c.dataset.i);
});
$("#grid").addEventListener("keydown", (e) => {
  const c = e.target.closest(".card"); if (c && e.key === "Enter") openLb(+c.dataset.i);
});
$("#lightbox").addEventListener("click", (e) => {
  if (e.target.closest(".lb-prev")) openLb(lbIndex - 1);
  else if (e.target.closest(".lb-next")) openLb(lbIndex + 1);
  else if (e.target.closest(".lb-close") || e.target === e.currentTarget) closeLb();
});
document.addEventListener("keydown", (e) => {
  if ($("#lightbox").hidden) return;
  if (e.key === "Escape") closeLb();
  if (e.key === "ArrowLeft") openLb(lbIndex - 1);
  if (e.key === "ArrowRight") openLb(lbIndex + 1);
});
// Discourage casual saving; the watermark is the real protection.
document.addEventListener("contextmenu", (e) => { if (e.target.tagName === "IMG") e.preventDefault(); });

$("#year").textContent = new Date().getFullYear();
heroArt(); filters(); render(); contact();
