// Browser tests for the portfolio on phones, a tablet and a laptop.
//   cd tests/e2e && npm ci && npm test        (CHROME=/path/to/chrome to override)
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import jsQR from "jsqr";
import { start } from "./server.mjs";

const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].find(existsSync);
const DEVICES = {
  phoneSmall: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, browser;

before(async () => {
  server = await start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await server?.close(); });

/** Open a page on a device; collects JS errors, console errors (incl. CSP), failed and 4xx/5xx requests. */
async function open(device, { path = "/", reduce = false, before: pre } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const vp = DEVICES[device];
  await p.setViewport(vp);
  if (vp.isMobile) await p.setUserAgent(PHONE_UA);
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }]);
  p.problems = [];
  p.on("pageerror", (e) => p.problems.push("JS: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") p.problems.push("console: " + m.text()); });
  p.on("requestfailed", (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText)) p.problems.push(`failed ${r.url()} ${r.failure()?.errorText}`); });
  p.on("response", (r) => { if (r.status() >= 400) p.problems.push(`${r.status()} ${r.url()}`); });
  if (pre) await pre(p, ctx);
  await p.goto(server.url + path, { waitUntil: "networkidle0" });
  // The site scrolls smoothly for people; tests need positions that are final straight away.
  await p.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  p.ctx = ctx;
  return p;
}
const done = (p) => p.ctx.close();
const lightAt = (p) => p.$eval("#spot-stage", (el) => [parseFloat(el.style.getPropertyValue("--x")), parseFloat(el.style.getPropertyValue("--y"))]);
async function toStage(p) {
  await p.$eval("#spot-stage", (el) => el.scrollIntoView({ block: "center" }));
  await sleep(400);
  return (await p.$("#spot-stage")).boundingBox();
}

describe("loads cleanly", () => {
  for (const device of Object.keys(DEVICES)) {
    test(`home and policies on ${device}: no errors, no broken files`, async () => {
      for (const path of ["/", "/policies"]) {
        const p = await open(device, { path });
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(300);
        assert.deepEqual(p.problems, [], `${device} ${path}`);
        await done(p);
      }
    });
  }
});

describe("fits the screen", () => {
  for (const device of Object.keys(DEVICES)) {
    test(`no sideways scrolling on ${device}`, async () => {
      for (const path of ["/", "/policies"]) {
        const p = await open(device, { path });
        for (const y of [0, 0.25, 0.5, 0.75, 1]) {
          await p.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), y); await sleep(150);
          const [sw, cw, wide] = await p.evaluate(() => {
            const W = document.documentElement.clientWidth;
            const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > W + 1)
              .slice(-6).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]} →${Math.round(el.getBoundingClientRect().right)}`);
            return [document.documentElement.scrollWidth, W, wide];
          });
          assert.ok(sw <= cw, `${device} ${path} at ${y * 100}%: page is ${sw}px wide on a ${cw}px screen; widest: ${wide.join(", ")}`);
        }
        await done(p);
      }
    });
  }
  test("headline is not clipped on a phone", async () => {
    const p = await open("phone"); await sleep(2200);
    const clipped = await p.$$eval(".hero h1 .reveal-line", (ls) => ls.some((l) => l.firstElementChild.getBoundingClientRect().bottom > l.getBoundingClientRect().bottom + 1));
    assert.equal(clipped, false); await done(p);
  });
});

describe("navigation", () => {
  test("phone: menu button opens and closes the menu", async () => {
    const p = await open("phone");
    const vis = () => p.$eval("#site-menu", (m) => getComputedStyle(m).visibility);
    assert.equal(await p.$eval("#menu-btn", (b) => getComputedStyle(b).display !== "none"), true);
    assert.equal(await vis(), "hidden");
    await p.tap("#menu-btn"); await sleep(350);
    assert.equal(await vis(), "visible");
    assert.equal(await p.$eval("#menu-btn", (b) => b.getAttribute("aria-expanded")), "true");
    await p.tap('#site-menu a[href="#gallery"]'); await sleep(350);
    assert.equal(await vis(), "hidden");
    await done(p);
  });
  test("laptop: links shown, no menu button", async () => {
    const p = await open("laptop");
    assert.equal(await p.$eval("#menu-btn", (b) => getComputedStyle(b).display), "none");
    assert.equal(await p.$eval("#site-menu", (m) => getComputedStyle(m).visibility), "visible");
    await done(p);
  });
});

describe("spotlight easter egg", () => {
  test("laptop: the light follows the cursor", async () => {
    const p = await open("laptop"); const b = await toStage(p);
    await p.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.3, { steps: 5 }); await sleep(80);
    const [x, y] = await lightAt(p);
    assert.ok(Math.abs(x - 20) < 2 && Math.abs(y - 30) < 2, `light at ${x},${y}`);
    await done(p);
  });
  test("phone: the light follows the finger", async () => {
    const p = await open("phone"); const b = await toStage(p);
    assert.match(await p.$eval("#spot-hint", (h) => h.textContent), /finger/);
    await p.touchscreen.touchStart(b.x + b.width * 0.25, b.y + b.height * 0.25);
    await p.touchscreen.touchMove(b.x + b.width * 0.75, b.y + b.height * 0.6);
    await p.touchscreen.touchEnd(); await sleep(80);
    const [x, y] = await lightAt(p);
    assert.ok(Math.abs(x - 75) < 3 && Math.abs(y - 60) < 3, `light at ${x},${y}`);
    await done(p);
  });
  test("reduced motion: still playable (not auto-revealed), light follows the cursor", async () => {
    const p = await open("laptop", { reduce: true }); const b = await toStage(p);
    assert.equal(await p.$eval("#spot-stage", (s) => s.classList.contains("revealed")), false);
    await p.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.8, { steps: 3 }); await sleep(80);
    const [x] = await lightAt(p); assert.ok(Math.abs(x - 80) < 2, `light at ${x}`);
    await done(p);
  });
  test("keyboard: arrow keys move the light", async () => {
    const p = await open("laptop", { reduce: true }); await toStage(p);
    await p.focus("#spot-stage"); const [x0] = await lightAt(p);
    await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
    const [x1] = await lightAt(p); assert.ok(x1 > x0 + 10, `${x0} -> ${x1}`);
    await done(p);
  });
  for (const device of ["phoneSmall", "tablet", "laptop"]) {
    test(`every spotlight painting fits on ${device} (it picks one at random)`, async () => {
      const p = await open(device); await toStage(p);
      const n = await p.evaluate(() => SPOTLIGHT.filter((t) => ARTWORKS.some((a) => a.title === t)).length || 6);
      for (let i = 0; i < n; i++) {
        const r = await p.evaluate(() => {
          const st = document.querySelector("#spot-stage"), sec = st.parentElement, cs = getComputedStyle(sec), b = st.getBoundingClientRect();
          return { title: document.querySelector("#spot-title").textContent, right: b.right, left: b.left, h: b.height,
            inner: sec.getBoundingClientRect().right - parseFloat(cs.paddingRight), W: document.documentElement.clientWidth,
            sw: document.documentElement.scrollWidth, H: innerHeight };
        });
        assert.ok(r.right <= r.inner + 1 && r.left >= 0, `${device} "${r.title}": stage ${Math.round(r.left)}..${Math.round(r.right)}, margin at ${Math.round(r.inner)}`);
        assert.ok(r.sw <= r.W, `${device} "${r.title}": page ${r.sw}px on ${r.W}px`);
        assert.ok(r.h <= r.H * 0.7 + 2, `${device} "${r.title}": ${Math.round(r.h)}px tall on a ${r.H}px screen`);
        await p.click("#spot-reveal"); await sleep(1300); await p.click("#spot-next"); await sleep(200);
      }
      await done(p);
    });
  }
  test("reveal shows the title; 'Try another painting' hides it again", async () => {
    const p = await open("laptop"); await toStage(p);
    const t0 = await p.$eval("#spot-title", (t) => t.textContent);
    await p.click("#spot-reveal"); await sleep(1500);
    assert.equal(await p.$eval("#spot-stage", (s) => s.classList.contains("revealed")), true);
    assert.ok(t0.length > 2);
    assert.equal(await p.$eval("#spot-next", (b) => b.hidden), false);
    await p.click("#spot-next"); await sleep(200);
    assert.equal(await p.$eval("#spot-stage", (s) => s.classList.contains("revealed")), false);
    assert.notEqual(await p.$eval("#spot-title", (t) => t.textContent), t0);
    await done(p);
  });
});

describe("gallery", () => {
  test("shows the first page, stats match the collection", async () => {
    const p = await open("laptop");
    const [total, cards, works] = await p.evaluate(() => [ARTWORKS.length, document.querySelectorAll("#grid .card").length, +document.querySelector("#stat-works").textContent]);
    assert.ok(total > 100, `only ${total} artworks`);
    assert.equal(cards, Math.min(48, total));
    assert.equal(works, total);
    await p.click("#more"); await sleep(100);
    assert.equal(await p.$$eval("#grid .card", (c) => c.length), Math.min(96, total));
    await done(p);
  });
  test("category filter shows only that category", async () => {
    const p = await open("laptop");
    await p.click('#filters [data-cat="rangoli"]'); await sleep(100);
    const r = await p.evaluate(() => ({ cats: [...new Set(shown.map((a) => a.cat))], n: shown.length,
      chip: +document.querySelector('#filters [data-cat="rangoli"] small').textContent,
      pressed: document.querySelector('#filters [data-cat="rangoli"]').getAttribute("aria-pressed") }));
    assert.deepEqual(r.cats, ["rangoli"]); assert.equal(r.n, r.chip); assert.equal(r.pressed, "true");
    await done(p);
  });
  test("search finds titles, shows a friendly empty state, and clears", async () => {
    const p = await open("phone");
    await p.type("#search", "ganesha"); await sleep(400);
    const titles = await p.evaluate(() => shown.map((a) => a.title));
    assert.ok(titles.length > 0 && titles.every((t) => /ganesha/i.test(t)), titles.slice(0, 5).join(", "));
    await p.$eval("#search", (s) => { s.value = ""; }); await p.type("#search", "zzzqqq"); await sleep(400);
    assert.equal(await p.$eval("#empty", (e) => e.hidden), false);
    await p.$eval("#clear-search", (b) => b.scrollIntoView({ block: "center" })); await sleep(100);
    await p.tap("#clear-search"); await sleep(150);
    assert.equal(await p.evaluate(() => shown.length), await p.evaluate(() => ARTWORKS.length));
    await done(p);
  });
  test("phone: titles are visible without hover", async () => {
    const p = await open("phone");
    await p.$eval("#grid", (g) => g.scrollIntoView()); await sleep(1800);
    const cap = await p.$eval("#grid .card figcaption", (c) => { const s = getComputedStyle(c); return [s.opacity, s.position]; });
    assert.deepEqual(cap, ["1", "static"]); await done(p);
  });
  test("thumbnails actually load", async () => {
    const p = await open("phone");
    await p.$eval("#grid", (g) => g.scrollIntoView()); await sleep(1500);
    const bad = await p.$$eval("#grid .card img", (imgs) => imgs.slice(0, 8).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    assert.deepEqual(bad, []); assert.deepEqual(p.problems, []);
    await done(p);
  });
});

describe("artwork viewer", () => {
  test("laptop: opens, arrows step through, Escape closes", async () => {
    const p = await open("laptop");
    await p.$eval("#grid .card", (c) => c.click()); await sleep(600);
    assert.equal(await p.$eval("#lightbox", (l) => l.hidden), false);
    assert.ok(await p.$eval("#lb-img", (i) => i.naturalWidth) > 0);
    assert.match(await p.$eval("#lb-count", (c) => c.textContent), /^1 \/ \d+$/);
    assert.match(await p.evaluate(() => location.hash), /^#art\//);
    await p.keyboard.press("ArrowRight"); await sleep(150);
    assert.match(await p.$eval("#lb-count", (c) => c.textContent), /^2 \//);
    await p.keyboard.press("Escape"); await sleep(100);
    assert.equal(await p.$eval("#lightbox", (l) => l.hidden), true);
    assert.equal(await p.evaluate(() => location.hash), "");
    await done(p);
  });
  test("phone: swipe left goes to the next artwork", async () => {
    const p = await open("phone");
    await p.$eval("#grid .card", (c) => c.click()); await sleep(500);
    await p.touchscreen.touchStart(300, 400); await p.touchscreen.touchMove(120, 410); await p.touchscreen.touchEnd(); await sleep(150);
    assert.match(await p.$eval("#lb-count", (c) => c.textContent), /^2 \//);
    await done(p);
  });
  test("a shared link opens that artwork", async () => {
    const p0 = await open("laptop");
    const a = await p0.evaluate(() => ARTWORKS[10]); await done(p0);
    const p = await open("phone", { path: `/#art/${a.id}` }); await sleep(400);
    assert.equal(await p.$eval("#lightbox", (l) => l.hidden), false);
    assert.match(await p.$eval("#lb-cap", (c) => c.textContent), new RegExp(a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await done(p);
  });
  test("share copies the link when the device has no share sheet", async () => {
    const p = await open("laptop", { before: async (pg, ctx) => {
      await ctx.overridePermissions(server.url, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
      await pg.evaluateOnNewDocument(() => Object.defineProperty(navigator, "share", { value: undefined }));
    } });
    await p.$eval("#grid .card", (c) => c.click()); await sleep(300);
    await p.click("#lb-share"); await sleep(200);
    assert.match(await p.$eval("#toast", (t) => t.textContent), /Link copied|Copy this link/);
    await done(p);
  });
});

/** Is anything wider than the screen, at a few scroll positions? Returns the first problem, or "". */
async function sideways(p) {
  for (const y of [0, 0.5, 1]) {
    await p.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), y); await sleep(150);
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) return `page is ${sw}px wide on a ${cw}px screen at ${y * 100}%`;
  }
  return "";
}

describe("artwork and category pages (for search engines)", () => {
  let art;
  before(async () => {
    const p = await open("laptop"); art = await p.evaluate(() => ARTWORKS.slice(0, 12)); await done(p);
  });
  for (const device of ["phone", "laptop"]) {
    test(`artwork page on ${device}: loads cleanly, fits, enquiry names the ID, opens in the gallery`, async () => {
      const a = art.find((x) => x.cat === "rangoli") || art[0];
      const p = await open(device, { path: `/art/${a.id}` });
      assert.equal(await p.$eval("h1", (h) => h.textContent), a.title);
      assert.equal(await p.$eval(".art-figure img", (i) => i.complete && i.naturalWidth > 0), true, "artwork image loads");
      assert.equal(await p.$eval('link[rel="canonical"]', (l) => l.href), `https://mah-artworks.pages.dev/art/${a.id}`);
      const mail = decodeURIComponent(await p.$eval(".art-cta a[href^='mailto:']", (l) => l.href));
      assert.ok(mail.includes(`(ID ${a.id})`) && mail.includes(a.title), mail);
      assert.ok(await p.$$eval(".related .tiles a", (l) => l.length) > 0, "related artworks");
      assert.equal(await p.$eval(".a11y-btn", (b) => !!b), true, "Display button, like every page");
      assert.equal(await sideways(p), "", device);
      await p.evaluate(() => window.scrollTo(0, 0)); await sleep(100);
      assert.deepEqual(p.problems, [], `${device} /art/${a.id}`);
      await p.$eval(`.art-cta a[href="/#art/${a.id}"]`, (l) => l.scrollIntoView({ block: "center" })); await sleep(100);
      await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click(`.art-cta a[href="/#art/${a.id}"]`)]);
      await sleep(400);
      assert.equal(await p.$eval("#lightbox", (l) => l.hidden), false, "gallery viewer opens");
      assert.match(await p.$eval("#lb-cap", (c) => c.textContent), new RegExp(a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await done(p);
    });
    test(`category page on ${device}: loads cleanly, fits, lists every artwork as a link`, async () => {
      const p = await open(device, { path: "/rangoli" });
      const [links, total, h1] = await p.evaluate(() => [document.querySelectorAll(".tiles a[href^='/art/']").length,
        +document.querySelector('.cat-nav a[aria-current="page"] small').textContent, document.querySelector("h1").textContent]);
      assert.equal(h1, "Rangoli & Kolam");
      assert.ok(links > 20 && links === total, `${links} links, ${total} in the chip`);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(500);
      assert.equal(await sideways(p), "", device);
      assert.deepEqual(p.problems, [], `${device} /rangoli`);
      const first = await p.$eval(".tiles a", (l) => l.getAttribute("href"));
      await p.$eval(".tiles a", (l) => l.scrollIntoView({ block: "center" })); await sleep(100);
      await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click(".tiles a")]);
      assert.equal(new URL(p.url()).pathname, first);
      assert.equal(await p.$eval("h1", (h) => h.textContent.length > 0), true);
      await done(p);
    });
  }
  test("home page links every category; a removed artwork's address is a 404", async () => {
    const p = await open("phone");
    const cats = await p.$$eval("footer .foot-cats a", (l) => l.map((a) => a.getAttribute("href")));
    assert.deepEqual(cats, ["/paintings", "/oils", "/drawings", "/mandalas", "/rangoli", "/crafts"].filter((c) => cats.includes(c)));
    assert.ok(cats.length >= 4, cats.join(", "));
    const r = await fetch(server.url + "/art/no-such-artwork");
    assert.equal(r.status, 404);
    assert.match(await r.text(), /noindex/);
    await done(p);
  });
});

describe("display settings and accessibility", () => {
  test("dark / light choice applies and is remembered", async () => {
    const p = await open("phone");
    await p.tap(".a11y-btn"); await sleep(100);
    await p.$eval('#a11y-panel input[name="theme"][value="dark"]', (i) => i.click());
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "dark");
    await p.reload({ waitUntil: "networkidle0" });
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "dark");
    await done(p);
  });
  test("larger text does not break the phone layout", async () => {
    const p = await open("phone", { before: (pg) => pg.evaluateOnNewDocument(() => localStorage.setItem("ms-prefs", JSON.stringify({ size: "1.3" }))) });
    const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `${sw} > ${cw}`); await done(p);
  });
  test("images have alt text, buttons have names, one h1, lang set", async () => {
    const p = await open("laptop");
    const r = await p.evaluate(() => ({
      noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.src),
      noName: [...document.querySelectorAll("button")].filter((b) => !(b.getAttribute("aria-label") || b.textContent.trim())).map((b) => b.outerHTML.slice(0, 80)),
      h1: document.querySelectorAll("h1").length, lang: document.documentElement.lang }));
    assert.deepEqual(r.noAlt, []); assert.deepEqual(r.noName, []); assert.equal(r.h1, 1); assert.equal(r.lang, "en");
    await done(p);
  });
  test("contact, copyright and the dedication are present", async () => {
    const p = await open("phone");
    const r = await p.evaluate(() => ({ links: [...document.querySelectorAll("#contact-links a")].map((a) => a.href),
      foot: document.querySelector("footer").textContent }));
    assert.ok(r.links.some((l) => l.startsWith("mailto:mahasriphoto24@gmail.com")));
    assert.ok(r.links.includes("https://instagram.com/mah_artworks"));
    assert.match(r.foot, /Made by Ajith, for his only loving Mom/);
    assert.match(r.foot, new RegExp(`© ${new Date().getFullYear()} Mahalakshmi Srikanth`));
    await done(p);
  });
});

describe("brand (Vanna Reverie)", () => {
  // 900 and 1024 sit between the dropdown menu (<= 860) and the wide laptop, where the header is tightest.
  const sizes = { ...DEVICES, narrowLaptop: { width: 900, height: 700, deviceScaleFactor: 1 },
    smallLaptop: { width: 1024, height: 700, deviceScaleFactor: 1 } };
  for (const [name, vp] of Object.entries(sizes)) {
    test(`header logo loads and fits on ${name}`, async () => {
      DEVICES[name] ||= vp;
      for (const path of ["/", "/policies", "/paintings", "/verify"]) {
        const p = await open(name, { path });
        const r = await p.evaluate(() => {
          const logo = document.querySelector(".nav .brand-logo"), nav = document.querySelector(".nav");
          const W = document.documentElement.clientWidth, box = logo.getBoundingClientRect();
          const overlap = [...nav.querySelectorAll(".menu a, .menu-btn, .a11y-btn")].filter((el) => {
            const b = el.getBoundingClientRect(); return b.width && b.left < box.right && b.right > box.left && b.top < box.bottom && b.bottom > box.top; });
          return { loaded: logo.complete && logo.naturalWidth > 0, alt: logo.alt, h: box.height, right: box.right, W,
            navWide: [...nav.querySelectorAll("*")].some((el) => el.getBoundingClientRect().right > W + 1),
            name: document.querySelector(".nav .brand").textContent.replace(/\s+/g, " ").trim(), overlap: overlap.length };
        });
        assert.ok(r.loaded, `${name} ${path}: wordmark did not load`);
        assert.equal(r.alt, "Vanna Reverie");
        assert.match(r.name, /Mahalakshmi Srikanth.*home/, "the link names her and says it goes home");
        assert.ok(r.h >= 36 && r.h <= 48, `${name} ${path}: logo is ${r.h}px tall`);
        assert.ok(!r.navWide && r.right <= r.W, `${name} ${path}: header wider than the screen`);
        assert.equal(r.overlap, 0, `${name} ${path}: logo overlaps the menu`);
        assert.deepEqual(p.problems, [], `${name} ${path}`);
        await done(p);
      }
    });
  }
  test("footer shows the full logo with the tagline; the seal still signs the About letter", async () => {
    const p = await open("phone");
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(300);
    const r = await p.evaluate(() => {
      const f = document.querySelector("footer .foot-logo");
      return { ok: f.complete && f.naturalWidth > 0, alt: f.alt, w: f.getBoundingClientRect().width,
        stamp: !!document.querySelector("#about img.stamp"), title: document.title };
    });
    assert.ok(r.ok, "footer logo did not load"); assert.equal(r.alt, "Vanna Reverie — Every Stroke Tells a Story");
    assert.ok(r.w > 150 && r.w <= 280, `footer logo ${r.w}px wide`);
    assert.ok(r.stamp, "her MS stamp on the About letter"); assert.match(r.title, /^Vanna Reverie .*Mahalakshmi Srikanth/);
    await done(p);
  });
  test("dark theme: the logo sits on its cream paper", async () => {
    const p = await open("laptop", { before: (pg) => pg.evaluateOnNewDocument(() => localStorage.setItem("ms-prefs", JSON.stringify({ theme: "dark" }))) });
    const [logoBg, navBg] = await p.evaluate(() => [getComputedStyle(document.querySelector(".brand-logo")).backgroundColor,
      getComputedStyle(document.body).backgroundColor]);
    assert.equal(logoBg, "rgb(246, 240, 226)"); assert.notEqual(logoBg, navBg);
    await done(p);
  });
});

/** PDF pages and page size, from the uncompressed page dictionaries Chrome writes. */
function pdfPages(buf) {
  const s = Buffer.from(buf).toString("latin1");
  const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [+m[1], +m[2]]);
  return { pages: (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length, count: +(s.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/s) || s.match(/\/Count\s+(\d+)/) || [])[1], boxes };
}
const fixture = (variant) => `/__fixtures__/certificate?variant=${variant}`;
async function openCert(device, variant) {
  const p = await open(device, { path: fixture(variant) });
  await p.waitForFunction(() => window.certReady === true, { timeout: 10000 });
  return p;
}

describe("certificates of authenticity", () => {
  let real;
  before(async () => {
    const p = await open("laptop"); real = await p.evaluate(() => ARTWORKS.filter((a) => a.date).slice(0, 3)); await done(p);
  });

  test("renderer: draws a full certificate without errors", async () => {
    const p = await openCert("laptop", "full");
    const o = await p.evaluate(() => window.certOptions);
    const r = await p.evaluate(() => {
      const s = document.querySelector(".ms-coa-sheet");
      return { h1: s.querySelector("h1").textContent, title: s.querySelector(".ms-coa-title").textContent,
        facts: [...s.querySelectorAll(".ms-coa-facts dt")].map((d) => d.textContent),
        issued: s.querySelector(".ms-coa-issued")?.textContent, statement: s.querySelector(".ms-coa-statement").textContent,
        imgs: [...s.querySelectorAll("img")].map((i) => [i.getAttribute("src"), i.complete && i.naturalWidth > 0]),
        qr: !!s.querySelector(".ms-coa-qr svg path"), cert: s.dataset.cert, text: s.textContent };
    });
    assert.equal(r.h1, "Certificate of Authenticity");
    assert.equal(r.title, o.title); assert.equal(r.cert, o.cert);
    assert.deepEqual(r.facts, ["Category", "Medium", "Size", "Year", "Artwork ID", "Certificate No."]);
    assert.equal(r.issued, "Issued to Test Buyer on 12 October 2026");
    assert.match(r.statement, /original work.*Mahalakshmi Srikanth.*copyright.*Copyright Act, 1957/s);
    assert.ok(r.imgs.every(([, ok]) => ok), JSON.stringify(r.imgs));
    for (const want of [o.imageUrl, "/__fixtures__/test-signature.svg"]) assert.ok(r.imgs.some(([src]) => src === want), want);
    assert.ok(r.imgs.some(([src]) => /\/seal\.png$/.test(src)), "MS seal");
    assert.ok(r.qr, "QR code");
    assert.match(r.text, new RegExp(o.cert));
    assert.deepEqual(p.problems, []);
    await done(p);
  });

  for (const variant of ["full", "minimal", "long"]) {
    test(`renderer: "${variant}" prints as exactly one A4 landscape page`, async () => {
      const p = await openCert("laptop", variant);
      const pdf = pdfPages(await p.pdf({ format: "A4", landscape: true, printBackground: true }));
      assert.equal(pdf.pages, 1, `${variant}: ${pdf.pages} pages`);
      assert.ok(pdf.boxes.length >= 1);
      for (const [w, h] of pdf.boxes) assert.ok(Math.abs(w - 841.89) < 2 && Math.abs(h - 595.28) < 2, `page ${w}×${h} pt is not A4 landscape`);
      // nothing spills out of the sheet when printed
      await p.emulateMediaType("print");
      const spill = await p.evaluate(() => {
        const s = document.querySelector(".ms-coa-sheet").getBoundingClientRect();
        return [...document.querySelectorAll(".ms-coa *")].filter((el) => { const b = el.getBoundingClientRect();
          return b.width && (b.right > s.right + 1 || b.bottom > s.bottom + 1 || b.left < s.left - 1); }).map((el) => el.className.baseVal ?? el.className);
      });
      assert.deepEqual(spill, [], `${variant}: content outside the page`);
      const hidden = await p.evaluate(() => getComputedStyle(document.querySelector(".toolbar")).display);
      assert.equal(hidden, "none", "the rest of the page is not printed");
      await done(p);
    });
  }

  test("renderer: the QR code scans to the verify address", async () => {
    const p = await openCert("laptop", "full");
    const cert = await p.evaluate(() => window.certOptions.cert);
    const px = await p.evaluate(async () => {
      const svg = document.querySelector(".ms-coa-qr svg").cloneNode(true);
      svg.setAttribute("width", "400"); svg.setAttribute("height", "400");
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();
      const c = document.createElement("canvas"); c.width = c.height = 400;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 400); g.drawImage(img, 0, 0, 400, 400);
      return Array.from(g.getImageData(0, 0, 400, 400).data);
    });
    const code = jsQR(Uint8ClampedArray.from(px), 400, 400);
    assert.ok(code, "QR code could not be read");
    assert.equal(code.data, `https://mah-artworks.pages.dev/verify/${cert}`);
    // the encoder itself, on a known vector: "HELLO WORLD" at medium error correction is a version-1 (21×21) symbol
    const m = await p.evaluate(async () => (await import("/js/certificate.js")).qrMatrix("HELLO WORLD"));
    assert.equal(m.length, 21);
    assert.deepEqual(m[0].slice(0, 7), [true, true, true, true, true, true, true], "finder pattern");
    await done(p);
  });

  test("renderer: empty optional fields are left out; bad input is refused; text is not HTML", async () => {
    const p = await openCert("laptop", "minimal");
    const r = await p.evaluate(() => {
      const s = document.querySelector(".ms-coa-sheet");
      return { facts: [...s.querySelectorAll(".ms-coa-facts dt")].map((d) => d.textContent), issued: !!s.querySelector(".ms-coa-issued"),
        art: !!s.querySelector(".ms-coa-art"), sig: !!s.querySelector(".ms-coa-signature"), line: !!s.querySelector(".ms-coa-sign-line"),
        text: s.textContent };
    });
    assert.deepEqual(r.facts, ["Certificate No."]);
    assert.equal(r.issued, false); assert.equal(r.art, false); assert.equal(r.sig, false);
    assert.equal(r.line, true, "a blank line for a wet signature");
    assert.doesNotMatch(r.text, /undefined|null|Issued/);
    const errs = await p.evaluate(async () => {
      const { renderCertificate } = await import("/js/certificate.js");
      const box = document.createElement("div"); document.body.append(box);
      const out = [];
      for (const o of [{ cert: "MS-24-1", title: "x" }, { cert: "MS-2024-0001", title: " " }])
        try { renderCertificate(box, o); out.push("rendered"); } catch (e) { out.push(e.message); }
      renderCertificate(box, { cert: "MS-2024-0001", title: "<img src=x onerror=alert(1)>", buyerName: "<b>Bold</b>", medium: "", size: null, issuedOn: "2026-01-05" });
      out.push(box.querySelector(".ms-coa-title").textContent, box.querySelectorAll(".ms-coa img").length, box.querySelector(".ms-coa-issued").textContent,
        [...box.querySelectorAll("dt")].map((d) => d.textContent).join("|"));
      return out;
    });
    assert.match(errs[0], /not a certificate number/); assert.match(errs[1], /title is required/);
    assert.equal(errs[2], "<img src=x onerror=alert(1)>");
    assert.equal(errs[4], "Issued to <b>Bold</b> on 5 January 2026");
    assert.equal(errs[5], "Certificate No.");
    await done(p);
  });

  for (const device of ["phone", "laptop"]) {
    test(`renderer fits the screen on ${device}`, async () => {
      const p = await openCert(device, "long");
      assert.equal(await sideways(p), "", device);
      await done(p);
    });
  }

  test("artwork page shows its certificate number", async () => {
    const a = real[0];
    const p = await open("phone", { path: `/art/${a.id}` });
    const r = await p.evaluate(() => ({ no: document.querySelector("#certificate .coa-no strong")?.textContent,
      text: document.querySelector("#certificate")?.textContent, fact: document.querySelector('.art-facts a[href="#certificate"]')?.textContent }));
    assert.equal(r.no, a.cert); assert.equal(r.fact, a.cert);
    assert.match(r.text, /Each original is accompanied by a Certificate of Authenticity signed by the artist/);
    assert.deepEqual(p.problems, []);
    await done(p);
  });

  test("/verify finds a real number (typed loosely) and links to the artwork", async () => {
    const a = real[1];
    const p = await open("phone", { path: "/verify" });
    await p.type("#cert-input", a.cert.toLowerCase().replaceAll("-", " ")); await p.tap("#cert-check"); await sleep(150);
    const r = await p.evaluate(() => ({ ok: document.querySelector("#cert-result .ok")?.textContent, t: document.querySelector("#cert-result .t")?.textContent,
      link: document.querySelector("#cert-result .verify-link")?.getAttribute("href"), q: location.search }));
    assert.equal(r.ok, "Genuine certificate"); assert.equal(r.t, a.title);
    assert.equal(r.link, `/art/${a.id}#certificate`);
    assert.equal(r.q, `?n=${a.cert}`);
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.tap("#cert-result .verify-link")]);
    assert.equal(new URL(p.url()).pathname, `/art/${a.id}`);
    assert.deepEqual(p.problems, []);
    await done(p);
  });

  test("/verify rejects a number that was never issued", async () => {
    const p = await open("laptop", { path: "/verify?n=MS-1999-9999" });
    const r = await p.evaluate(() => ({ input: document.querySelector("#cert-input").value, text: document.querySelector("#cert-result").textContent,
      mail: document.querySelector("#cert-result a[href^='mailto:']")?.getAttribute("href") }));
    assert.equal(r.input, "MS-1999-9999");
    assert.match(r.text, /MS-1999-9999 is not a certificate issued by Mahalakshmi Srikanth/);
    assert.match(r.mail || "", /^mailto:mahasriphoto24@gmail\.com\?subject=Certificate%20check/);
    assert.doesNotMatch(r.text, /Genuine/);
    await done(p);
  });

  test("/verify/<number> redirects to the artwork's certificate; an unknown number to the lookup page", async () => {
    const a = real[2];
    let r = await fetch(`${server.url}/verify/${a.cert}`, { redirect: "manual" });
    assert.equal(r.status, 301); assert.equal(r.headers.get("location"), `/art/${a.id}#certificate`);
    r = await fetch(`${server.url}/verify/MS-1999-9999`, { redirect: "manual" });
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/verify?n=MS-1999-9999");
    const p = await open("phone", { path: `/verify/${a.cert}` });
    assert.equal(new URL(p.url()).pathname, `/art/${a.id}`);
    assert.equal(new URL(p.url()).hash, "#certificate");
    assert.equal(await p.$eval("#certificate .coa-no strong", (s) => s.textContent), a.cert);
    await done(p);
    const q = await open("phone", { path: "/verify/MS-1999-9999" });
    assert.match(await q.$eval("#cert-result", (s) => s.textContent), /not a certificate issued/);
    await done(q);
    assert.equal((await fetch(`${server.url}/no/such/page`)).status, 404, "unknown paths are still 404s");
  });

  for (const device of ["phone", "laptop"]) {
    test(`verify page on ${device}: loads cleanly, fits, Display button`, async () => {
      const p = await open(device, { path: `/verify?n=${real[0].cert}` });
      assert.equal(await p.$eval("h1", (h) => h.textContent), "Verify a certificate");
      assert.equal(await p.$eval(".a11y-btn", (b) => !!b), true);
      assert.equal(await sideways(p), "", device);
      assert.deepEqual(p.problems, [], device);
      await done(p);
    });
  }

  test("the gallery viewer shows the certificate number", async () => {
    const a = real[0];
    const p = await open("laptop", { path: `/#art/${a.id}` }); await sleep(400);
    assert.equal(await p.$eval("#lb-cap .lb-cert", (c) => c.textContent), `Certificate ${a.cert}`);
    await done(p);
  });
});

describe("shop links (the shop is a separate site, opened in a new tab)", () => {
  test("viewer: 'Buy / check availability' opens the artwork in the shop", async () => {
    const a = (await (async () => { const p = await open("laptop"); const x = await p.evaluate(() => ARTWORKS[0]); await done(p); return x; })());
    const p = await open("phone", { path: `/#art/${a.id}` }); await sleep(400);
    const buy = await p.$eval("#lb-cap .lb-buy", (l) => ({ href: l.href, target: l.target, rel: l.rel }));
    assert.deepEqual(buy, { href: `https://mah-artworks-shop.pages.dev/p/${a.id}`, target: "_blank", rel: "noopener" });
    assert.equal(await sideways(p), "", "phone viewer with the buy link");
    await done(p);
  });
  test("menu and footer link to the shop in a new tab", async () => {
    const p = await open("laptop");
    const links = await p.$$eval('a[href="https://mah-artworks-shop.pages.dev/"]', (ls) => ls.map((l) => [l.closest("nav, footer").tagName, l.target, l.rel]));
    assert.deepEqual(links, [["NAV", "_blank", "noopener"], ["FOOTER", "_blank", "noopener"]]);
    assert.deepEqual(p.problems, []);
    await done(p);
  });
});
