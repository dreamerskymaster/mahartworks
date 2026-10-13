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
const CAT_LABEL = Object.fromEntries(CATS);
const HERO = ["Kathakali Face Framed", "Radha Seeing Krishna Reflection", "Panchamukhi Hanuman Painting",
  "Madhubani Peacock", "Lakshmi On Lotus", "Warli Village Scene Framed"];
// Paintings the spotlight picks from (titles; any that were renamed away are skipped).
const SPOTLIGHT = ["Radha Seeing Krishna Reflection", "Kathakali Face Framed", "Panchamukhi Hanuman Painting",
  "Seven Running Horses Framed", "Tirupati Balaji Bead Embellished", "Ardhanarishvara Painting"];
const PAGE = 48;

const art = window.ARTWORKS || [];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const byTitle = (t) => art.find((a) => a.title === t);
const calm = () => document.documentElement.classList.contains("calm");
const touchFirst = matchMedia("(hover: none)").matches;
let current = "all", query = "", shown = [], limit = PAGE, lbIndex = 0, lastFocus = null;

const fmtDate = (d) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";

// Reveal anything with .card / .fade / .stamp as it scrolls into view.
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
  });
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- nav ---------- */
function nav() {
  const bar = $(".nav"), btn = $("#menu-btn");
  const setOpen = (v) => {
    bar.classList.toggle("open", v);
    btn.setAttribute("aria-expanded", String(v));
    btn.setAttribute("aria-label", v ? "Close menu" : "Open menu");
  };
  btn.addEventListener("click", () => setOpen(!bar.classList.contains("open")));
  $("#site-menu").addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bar.classList.contains("open")) { setOpen(false); btn.focus(); } });
  document.addEventListener("click", (e) => { if (bar.classList.contains("open") && !bar.contains(e.target)) setOpen(false); });
  const onScroll = () => {
    bar.classList.toggle("solid", scrollY > 30);
    const tb = $("#toolbar");
    tb.classList.toggle("stuck", tb.getBoundingClientRect().top <= bar.offsetHeight + 1 && scrollY > 200);
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // Highlight the section in view.
  const links = [...document.querySelectorAll("#site-menu a")];
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((l) => l.classList.toggle("active", l.hash === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((l) => { const s = document.querySelector(l.hash); if (s) spy.observe(s); });
}

/* ---------- hero + stats ---------- */
function heroArt() {
  const picks = HERO.map(byTitle).filter(Boolean);
  for (const a of art) { if (picks.length >= 5) break; if (a.cat === "paintings" && !picks.includes(a)) picks.push(a); }
  $("#hero-art").innerHTML = picks.slice(0, 5).map((a, i) =>
    `<figure><img src="img/${a.id}.t.webp" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></figure>`).join("");
  $("#stat-works").textContent = art.length;
  $("#stat-forms").textContent = new Set(art.map((a) => a.cat)).size;
}

/* ---------- spotlight: a painting in the dark, lit by your cursor or finger ---------- */
function spotlight() {
  const stage = $("#spot-stage"), hint = $("#spot-hint"), title = $("#spot-title");
  const reveal = $("#spot-reveal"), next = $("#spot-next");
  let pool = SPOTLIGHT.map(byTitle).filter(Boolean);
  if (!pool.length) pool = art.filter((a) => a.cat === "paintings").slice(0, 6);
  if (!pool.length) { $("#spotlight").hidden = true; return; }
  let idx = Math.floor(Math.random() * pool.length), a, base = 110, r = 110, x = 50, y = 50, t = 0, raf = 0, auto = true;
  const HINT = touchFirst ? "Drag your finger across the canvas…" : "Move your cursor across the canvas…";

  const set = (nx, ny) => {
    x = Math.max(0, Math.min(100, nx)); y = Math.max(0, Math.min(100, ny));
    stage.style.setProperty("--x", x + "%"); stage.style.setProperty("--y", y + "%");
  };
  const fit = () => {
    if (!a) return;
    const sec = stage.parentElement, cs = getComputedStyle(sec);
    const room = sec.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);   // inside the margins
    const w = Math.min(760, room, (innerHeight * 0.68 * a.w) / a.h);
    stage.style.width = Math.round(w) + "px";
    stage.style.aspectRatio = `${a.w} / ${a.h}`;       // known size before the image arrives: no jump
    base = Math.max(70, Math.min(140, w * 0.2));
    if (!stage.classList.contains("revealed")) { r = base; stage.style.setProperty("--r", r + "px"); }
  };
  const stopWander = () => { auto = false; cancelAnimationFrame(raf); };
  const wander = () => {             // a slow drifting light until someone takes over
    cancelAnimationFrame(raf);
    if (!auto || calm() || stage.classList.contains("revealed")) return;
    const step = () => {
      t += 0.006;
      set(50 + 32 * Math.sin(t * 1.3), 50 + 30 * Math.sin(t * 0.9 + 1));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const load = (i) => {
    idx = (i + pool.length) % pool.length; a = pool[idx];
    stage.classList.remove("revealed");
    $("#spot-dim").src = $("#spot-lit").src = `img/${a.id}.webp`;
    title.textContent = a.title; title.classList.remove("show");
    hint.textContent = HINT;
    reveal.hidden = false; next.hidden = true;
    auto = true; set(50, 50); fit(); wander();
  };
  const fromPoint = (cx, cy) => {
    if (stage.classList.contains("revealed")) return;
    stopWander();
    const b = stage.getBoundingClientRect();
    set(((cx - b.left) / b.width) * 100, ((cy - b.top) / b.height) * 100);
  };

  stage.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") fromPoint(e.clientX, e.clientY); });
  stage.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") { auto = true; wander(); } });
  // Touch: the light follows the finger; the page can still scroll.
  const onTouch = (e) => { const p = e.touches[0]; if (p) fromPoint(p.clientX, p.clientY); };
  stage.addEventListener("touchstart", onTouch, { passive: true });
  stage.addEventListener("touchmove", onTouch, { passive: true });
  stage.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] }[e.key];
    if (d && !stage.classList.contains("revealed")) { e.preventDefault(); stopWander(); set(x + d[0], y + d[1]); }
    if (e.key === "Enter") reveal.click();
  });

  reveal.addEventListener("click", () => {
    stopWander();
    hint.textContent = "…and there it is.";
    reveal.hidden = true; next.hidden = false;
    const done = () => { stage.classList.add("revealed"); title.classList.add("show"); };
    if (calm()) return done();
    const grow = () => {
      r *= 1.07; stage.style.setProperty("--r", r + "px");
      if (r < stage.offsetWidth * 1.6) requestAnimationFrame(grow); else done();
    };
    grow();
  });
  next.addEventListener("click", () => load(idx + 1));
  document.addEventListener("prefs-change", () => (calm() ? stopWander() : (auto = true, wander())));
  new IntersectionObserver(([e]) => (e.isIntersecting ? wander() : cancelAnimationFrame(raf))).observe(stage);
  addEventListener("resize", fit);
  load(idx);
}

/* ---------- gallery ---------- */
function matches(a) {
  if (current !== "all" && a.cat !== current) return false;
  if (!query) return true;
  const hay = (a.title + " " + CAT_LABEL[a.cat]).toLowerCase();
  return query.split(/\s+/).every((w) => hay.includes(w));
}

function filters() {
  $("#filters").innerHTML = CATS.map(([k, label]) => {
    const n = k === "all" ? art.length : art.filter((a) => a.cat === k).length;
    if (!n) return "";
    return `<button type="button" data-cat="${k}" aria-pressed="${k === current}">${label}<small>${n}</small></button>`;
  }).join("");
}

function render() {
  shown = art.filter(matches);
  const page = shown.slice(0, limit);
  $("#grid").innerHTML = page.map((a, i) =>
    `<figure class="card" tabindex="0" role="button" aria-label="Open ${esc(a.title)}" data-i="${i}">
       <div class="frame"><img src="img/${a.id}.t.webp" alt="${esc(a.title)}" width="${a.w}" height="${a.h}" loading="lazy" decoding="async" draggable="false"></div>
       <figcaption>${esc(a.title)}</figcaption></figure>`).join("")
    + (shown.length > limit ? `<button type="button" class="btn more" id="more">Show more · ${shown.length - limit} left</button>` : "");
  $("#grid-status").textContent = shown.length
    ? `Showing ${page.length} of ${shown.length} artwork${shown.length === 1 ? "" : "s"}${query ? ` for “${query}”` : ""}`
    : "";
  $("#empty").hidden = shown.length > 0;
  // Stagger cards that arrive together so they unveil one after another.
  $("#grid").querySelectorAll(".card").forEach((c, i) => {
    const d = `${(i % 4) * 120}ms`;
    c.querySelector(".frame").style.transitionDelay = d;
    c.querySelector("img").style.transitionDelay = d;
    io.observe(c);
  });
}

function gallery() {
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    current = b.dataset.cat; limit = PAGE; filters(); render();
    b.scrollIntoView?.({ block: "nearest", inline: "center" });
  });
  let tmr;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => { query = e.target.value.trim().toLowerCase(); limit = PAGE; render(); }, 150);
  });
  $("#clear-search").addEventListener("click", () => { $("#search").value = ""; query = ""; current = "all"; filters(); render(); });
  $("#grid").addEventListener("click", (e) => {
    if (e.target.id === "more") { limit += PAGE; render(); return; }
    const c = e.target.closest(".card"); if (c) openLb(+c.dataset.i);
  });
  $("#grid").addEventListener("keydown", (e) => {
    const c = e.target.closest(".card");
    if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLb(+c.dataset.i); }
  });
}

/* ---------- viewer ---------- */
function openLb(i) {
  if (!shown.length) return;
  lbIndex = (i + shown.length) % shown.length;
  const a = shown[lbIndex], img = $("#lb-img");
  img.classList.add("loading");
  img.onload = () => img.classList.remove("loading");
  img.src = `img/${a.id}.webp`;
  img.alt = a.title;
  $("#lb-cap").innerHTML = `${esc(a.title)}<small>${[CAT_LABEL[a.cat], fmtDate(a.date)].filter(Boolean).join(" · ")}</small>`;
  $("#lb-count").textContent = `${lbIndex + 1} / ${shown.length}`;
  [lbIndex - 1, lbIndex + 1].forEach((j) => { const n = shown[(j + shown.length) % shown.length]; new Image().src = `img/${n.id}.webp`; });
  history.replaceState(null, "", `#art/${a.id}`);
  if ($("#lightbox").hidden) {
    lastFocus = document.activeElement;
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    $(".lb-close").focus();
  }
}
function closeLb() {
  $("#lightbox").hidden = true; document.body.style.overflow = "";
  history.replaceState(null, "", location.pathname + location.search);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
function openFromHash() {
  const m = location.hash.match(/^#art\/([\w-]+)$/);
  if (!m) return;
  const a = art.find((x) => x.id === m[1]);
  if (!a) return;
  current = "all"; query = ""; filters(); render();
  openLb(shown.indexOf(a));
}

function viewer() {
  const lb = $("#lightbox");
  lb.addEventListener("click", (e) => {
    if (e.target.closest(".lb-prev")) openLb(lbIndex - 1);
    else if (e.target.closest(".lb-next")) openLb(lbIndex + 1);
    else if (e.target.closest(".lb-share")) share();
    else if (e.target.closest(".lb-close") || e.target === lb || e.target.tagName === "FIGURE") closeLb();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") openLb(lbIndex - 1);
    if (e.key === "ArrowRight") openLb(lbIndex + 1);
    if (e.key === "Tab") {                       // keep focus inside the viewer
      const f = [...lb.querySelectorAll("button")];
      const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  // Swipe left / right on phones.
  let sx = 0, sy = 0;
  lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) openLb(lbIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener("hashchange", openFromHash);
}

async function share() {
  const a = shown[lbIndex];
  const url = `${location.origin}${location.pathname}#art/${a.id}`;
  const data = { title: `${a.title} — Mahalakshmi Srikanth`, text: `${a.title} by Mahalakshmi Srikanth`, url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    toast("Copy this link: " + url);
  }
}

/* ---------- contact ---------- */
function contact() {
  const links = [];
  if (CONTACT.email) links.push(`<a class="btn btn-solid" href="mailto:${CONTACT.email}?subject=${encodeURIComponent("Enquiry about your artwork")}">✉&nbsp; ${CONTACT.email}</a>`);
  if (CONTACT.instagram) links.push(`<a class="btn" href="https://instagram.com/${CONTACT.instagram}" target="_blank" rel="noopener">Instagram · @${CONTACT.instagram}</a>`);
  $("#contact-links").innerHTML = links.join("");
  if (!links.length) $("#contact").hidden = true;
}

document.querySelectorAll(".fade, .stamp").forEach((el) => io.observe(el));
nav(); heroArt(); spotlight(); filters(); render(); gallery(); viewer(); contact(); openFromHash();
