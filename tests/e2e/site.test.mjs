// Browser tests for the portfolio on phones, a tablet and a laptop.
//   cd tests/e2e && npm ci && npm test        (CHROME=/path/to/chrome to override)
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
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
