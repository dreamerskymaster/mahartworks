// Contact details shown in the "Get in touch" section. Leave a value empty to hide it.
const CONTACT = {
  email: "mahasriphoto24@gmail.com",
  instagram: "mah_artworks",   // handle without @
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
// Paintings the spotlight picks from, one at random per visit.
const SPOTLIGHT = ["Radha Seeing Krishna Reflection", "Kathakali Face Framed", "Panchamukhi Hanuman Painting",
  "Seven Running Horses Framed", "Tirupati Balaji Bead Embellished", "Ardhanarishvara Painting"];
const PAGE = 60;

const art = window.ARTWORKS;
const $ = (s) => document.querySelector(s);
const byTitle = (t) => art.find((a) => a.title === t);
let current = "all", shown = [], limit = PAGE, lbIndex = 0;

const fmtDate = (d) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";

// Reveal anything with .card / .fade / .stamp as it scrolls into view.
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
  });
}, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });

function heroArt() {
  const picks = HERO.map(byTitle).filter(Boolean).slice(0, 5);
  $("#hero-art").innerHTML = picks.map((a) => `<figure><img src="img/${a.id}.t.webp" alt=""></figure>`).join("");
}

function spotlight() {
  const pool = SPOTLIGHT.map(byTitle).filter(Boolean);
  const a = pool[Math.floor(Math.random() * pool.length)];
  const stage = $("#spot-stage");
  $("#spot-dim").src = $("#spot-lit").src = `img/${a.id}.webp`;
  $("#spot-title").textContent = a.title;
  // Keep tall paintings within one screen.
  const fit = () => { stage.style.width = Math.min(760, innerWidth - 32, (innerHeight * 0.78 * a.w) / a.h) + "px"; };
  fit(); addEventListener("resize", fit);

  let r = 110, auto = true, t = 0, raf;
  const set = (x, y) => { stage.style.setProperty("--x", x + "%"); stage.style.setProperty("--y", y + "%"); };
  // A slow wandering light until someone takes over (also the phone experience).
  const wander = () => {
    if (!auto) return;
    t += 0.006;
    set(50 + 32 * Math.sin(t * 1.3), 50 + 30 * Math.sin(t * 0.9 + 1));
    raf = requestAnimationFrame(wander);
  };
  new IntersectionObserver(([e]) => {
    cancelAnimationFrame(raf);
    if (e.isIntersecting && auto) wander();
  }).observe(stage);

  const revealed = () => stage.classList.contains("revealed");
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || revealed()) return;
    auto = false; cancelAnimationFrame(raf);
    const b = stage.getBoundingClientRect();
    set(((e.clientX - b.left) / b.width) * 100, ((e.clientY - b.top) / b.height) * 100);
  });
  stage.addEventListener("pointerleave", () => { if (!revealed()) { auto = true; wander(); } });

  const revealNow = () => {
    auto = false; cancelAnimationFrame(raf);
    stage.classList.add("revealed");
    stage.style.setProperty("--r", "4000px");
    $("#spot-title").classList.add("show");
  };
  // Reduced motion: no suspense, just show the painting.
  if (window.MS_PREFS && MS_PREFS.calm) revealNow();
  document.addEventListener("prefs-change", (e) => { if (e.detail.calm) revealNow(); });

  $("#spot-reveal").addEventListener("click", (e) => {
    e.stopPropagation();
    auto = false; cancelAnimationFrame(raf);
    stage.classList.add("revealed");
    $("#spot-hint").textContent = "…and there it is.";
    const grow = () => {
      r *= 1.06;
      stage.style.setProperty("--r", r + "px");
      if (r < 2400) requestAnimationFrame(grow);
      else $("#spot-title").classList.add("show");
    };
    grow();
  });
}

function filters() {
  $("#filters").innerHTML = CATS.map(([k, label]) => {
    const n = k === "all" ? art.length : art.filter((a) => a.cat === k).length;
    return `<button data-cat="${k}" aria-pressed="${k === current}" aria-selected="${k === current}">${label}<small aria-label="${n} artworks">${n}</small></button>`;
  }).join("");
}

function render() {
  shown = current === "all" ? art : art.filter((a) => a.cat === current);
  $("#grid").innerHTML = shown.slice(0, limit).map((a, i) =>
    `<figure class="card" tabindex="0" role="button" aria-label="Open ${a.title}" data-i="${i}">
       <img src="img/${a.id}.t.webp" alt="${a.title}" width="${a.w}" height="${a.h}" loading="lazy" draggable="false">
       <span>${a.title}</span></figure>`).join("")
    + (shown.length > limit ? `<button class="btn more" id="more">Show more (${shown.length - limit})</button>` : "");
  $("#grid-status").textContent = `Showing ${Math.min(limit, shown.length)} of ${shown.length} artworks`;
  // Stagger cards that arrive together so they unveil one after another.
  $("#grid").querySelectorAll(".card").forEach((c, i) => {
    const d = `${(i % 4) * 140}ms`;
    c.style.transitionDelay = d;
    c.querySelector("img").style.transitionDelay = d;
    io.observe(c);
  });
}

function openLb(i) {
  lbIndex = (i + shown.length) % shown.length;
  const a = shown[lbIndex];
  $("#lb-img").src = `img/${a.id}.webp`;
  $("#lb-img").alt = a.title;
  $("#lb-cap").innerHTML = `${a.title}<small>${fmtDate(a.date)}</small>`;
  if ($("#lightbox").hidden) lastFocus = document.activeElement;
  $("#lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  $(".lb-close").focus();
}
let lastFocus = null;
function closeLb() {
  $("#lightbox").hidden = true; document.body.style.overflow = "";
  if (lastFocus) lastFocus.focus();
}

function contact() {
  const links = [];
  if (CONTACT.email) links.push(`<a class="btn" href="mailto:${CONTACT.email}">✉ ${CONTACT.email}</a>`);
  if (CONTACT.instagram) links.push(`<a class="btn" href="https://instagram.com/${CONTACT.instagram}" target="_blank" rel="noopener">Instagram · @${CONTACT.instagram}</a>`);
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
  const c = e.target.closest(".card");
  if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLb(+c.dataset.i); }
});
$("#lightbox").addEventListener("click", (e) => {
  if (e.target.closest(".lb-prev")) openLb(lbIndex - 1);
  else if (e.target.closest(".lb-next")) openLb(lbIndex + 1);
  else if (e.target.closest(".lb-close") || e.target === e.currentTarget) closeLb();
});
document.addEventListener("keydown", (e) => {
  if ($("#lightbox").hidden) return;
  if (e.key === "Escape") closeLb();
  if (e.key === "Tab") { // keep focus inside the viewer
    const f = [...$("#lightbox").querySelectorAll("button")];
    const i = f.indexOf(document.activeElement);
    e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
  if (e.key === "ArrowLeft") openLb(lbIndex - 1);
  if (e.key === "ArrowRight") openLb(lbIndex + 1);
});
// Discourage casual saving; the watermark is the real protection.
document.addEventListener("contextmenu", (e) => { if (e.target.tagName === "IMG") e.preventDefault(); });
addEventListener("scroll", () => $(".nav").classList.toggle("solid", scrollY > 40), { passive: true });

$("#year").textContent = new Date().getFullYear();
document.querySelectorAll(".fade, .stamp").forEach((el) => io.observe(el));
heroArt(); spotlight(); filters(); render(); contact();
