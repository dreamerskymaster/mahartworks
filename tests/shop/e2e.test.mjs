// Browser tests for the shop on a phone (390 px) and a laptop (1440 px), against tests/shop/server.mjs:
// the real shop files and /api/shipping-quote, with Supabase and the gallery mocked locally (no network).
//   cd tests/shop && npm ci && npm run test:e2e      (CHROME=/path/to/chrome to override)
import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { start, resetDb, getDb, PICKS, OIL, USERS } from "./server.mjs";

const CHROME = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].find(existsSync);
const DEVICES = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [A, B, SOLD, UNPRICED] = PICKS;
let server, browser;

before(async () => {
  server = await start();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await server?.close(); });
beforeEach(() => resetDb());

/** Opens a page; records JS errors, console errors (incl. CSP violations), failed requests and 4xx/5xx. */
async function open(device, path = "/", { as, cart, expect404 = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(DEVICES[device]);
  if (DEVICES[device].isMobile) await p.setUserAgent(PHONE_UA);
  p.problems = [];
  p.on("pageerror", (e) => p.problems.push("JS: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !(expect404 && /404/.test(m.text()))) p.problems.push("console: " + m.text()); });
  p.on("requestfailed", (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText)) p.problems.push(`failed ${r.url()} ${r.failure()?.errorText}`); });
  p.on("response", (r) => { if (r.status() >= 400 && !(expect404 && r.status() === 404 && r.request().resourceType() === "document")) p.problems.push(`${r.status()} ${r.url()}`); });
  const user = as && USERS[as];
  await p.evaluateOnNewDocument((s, c) => {
    if (sessionStorage.getItem("seeded")) return;   // only on the first page, like a real visit
    sessionStorage.setItem("seeded", "1");
    if (s) localStorage.setItem("msa-session", JSON.stringify(s));
    if (c) localStorage.setItem("msa-cart", JSON.stringify(c));
  }, user ? { access_token: `tok-${as}`, refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user } : null, cart || null);
  await p.goto(server.url + path, { waitUntil: "networkidle0" });
  p.ctx = ctx;
  return p;
}
const done = (p) => p.ctx.close();
async function noSideways(p, label) {
  for (const f of [0, 0.5, 1]) {
    await p.evaluate((y) => window.scrollTo(0, document.body.scrollHeight * y), f); await sleep(80);
    const [sw, cw, wide] = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > W + 1).slice(-4)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]}`);
      return [document.documentElement.scrollWidth, W, wide];
    });
    assert.ok(sw <= cw, `${label}: page is ${sw}px wide on a ${cw}px screen; widest: ${wide.join(", ")}`);
  }
}
const text = (p, s) => p.$eval(s, (el) => el.textContent.replace(/\s+/g, " ").trim());

describe("every page loads cleanly and fits the screen", () => {
  const PAGES = [["/", "home"], [`/p/${A.id}`, "product"], ["/cart", "cart"], ["/signin", "sign in"], ["/checkout", "checkout"],
    ["/account", "account", "buyer"], ["/admin", "admin", "admin"], ["/admin", "admin (not admin)", "buyer"], ["/nope", "404"]];
  for (const device of Object.keys(DEVICES)) {
    test(`${device}: no errors, no CSP violations, no sideways scroll`, async () => {
      for (const [path, label, as] of PAGES) {
        const p = await open(device, path, { as, cart: [A.id], expect404: label === "404" });
        await sleep(150);
        await noSideways(p, `${device} ${label}`);
        assert.deepEqual(p.problems, [], `${device} ${label}`);
        await done(p);
      }
    });
  }
});

describe("brand", () => {
  for (const device of Object.keys(DEVICES)) {
    test(`${device}: Vanna Reverie logo in the header and footer, name in every title`, async () => {
      for (const path of ["/", `/p/${A.id}`, "/cart", "/signin", "/nope"]) {
        const p = await open(device, path, { expect404: path === "/nope" });
        const [alt, loaded, foot, title] = await p.evaluate(() => {
          const img = document.querySelector("#nav .brand-logo");
          return [img?.alt, img?.naturalWidth > 0, document.querySelector("#foot .foot-logo")?.naturalWidth > 0, document.title];
        });
        assert.equal(alt, "Vanna Reverie", `${device} ${path}`);
        assert.ok(loaded && foot, `${device} ${path}: logo images load`);
        assert.match(title, /Vanna Reverie/, `${device} ${path}`);
        await done(p);
      }
    });
  }
});

describe("listing and product page", () => {
  test("lists priced and sold works only, with prices and a Sold badge", async () => {
    const p = await open("laptop");
    const cards = await p.$$eval(".card", (cs) => cs.map((c) => ({ id: c.dataset.id, price: c.querySelector(".price").textContent, sold: !!c.querySelector(".tag.sold") })));
    assert.deepEqual(cards.map((c) => c.id).sort(), [A.id, B.id, SOLD.id, OIL.id].sort());
    assert.ok((await p.$$eval("#chips button", (bs) => bs.map((b) => b.textContent))).includes("Oil painting"), "oils has its own filter");
    await p.click('#chips [data-cat="oils"]');
    assert.deepEqual(await p.$$eval(".card", (cs) => cs.map((c) => c.dataset.id)), [OIL.id]);
    assert.equal(cards.find((c) => c.id === A.id).price, "₹12,000");
    assert.ok(cards.find((c) => c.id === SOLD.id).sold);
    assert.ok(!cards.some((c) => c.id === UNPRICED.id), "unpriced artwork must not be listed");
    assert.equal(await p.$("#payments-closed"), null);
    await done(p);
  });
  test("until her UPI ID is set: 'payments are not open yet'", async () => {
    resetDb({ open: false });
    const p = await open("phone");
    assert.match(await text(p, "#payments-closed"), /Payments are not open yet/);
    await done(p);
  });
  test("product page: details, certificate, add to cart", async () => {
    const p = await open("phone", `/p/${A.id}`);
    assert.equal(await text(p, "h1"), A.title);
    assert.equal(await text(p, "#price"), "₹12,000");
    const facts = await text(p, ".facts");
    assert.ok(facts.includes(A.cert) && facts.includes("30 × 40 × 2 cm") && facts.includes("Acrylic on canvas"), facts);
    assert.equal(await p.$eval(".gallery-main img", (i) => i.complete && i.naturalWidth > 0), true);
    await p.tap("#add"); await sleep(150);
    assert.equal(await text(p, "#cart-count"), "1");
    assert.equal(await p.$eval("#in-cart", (a) => a.hidden), false);
    assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem("msa-cart"))), [A.id]);
    await done(p);
  });
  test("oil painting: labelled as such, oil on canvas", async () => {
    const p = await open("laptop", `/p/${OIL.id}`);
    assert.match(await text(p, ".facts"), /Type\s*Oil painting\s*Medium\s*Oil on canvas/);
    assert.match(await text(p, ".eyebrow"), /^Oil painting/);
    await done(p);
  });
  test("international enquiry: mailto with the title, ID and certificate", async () => {
    const p = await open("laptop", `/p/${A.id}`);
    const href = await p.$eval("#enquire", (a) => a.href);
    assert.ok(href.startsWith("mailto:mahasriphoto24@gmail.com?"));
    const q = new URLSearchParams(href.split("?")[1]);
    assert.equal(q.get("subject"), `Purchase enquiry: ${A.title} (ID ${A.id}, Certificate ${A.cert})`);
    assert.match(q.get("body"), /My country: \nMy full shipping address/);
    await done(p);
  });
  test("sold work: no buy buttons", async () => {
    const p = await open("laptop", `/p/${SOLD.id}`);
    assert.equal(await p.$("#buy"), null);
    assert.match(await text(p, ".product"), /Sold\./);
    await done(p);
  });
});

describe("cart", () => {
  test("re-checks the cart with the server: sold items are flagged", async () => {
    const p = await open("laptop", "/cart", { cart: [A.id, SOLD.id] });
    assert.match(await text(p, "#removed"), new RegExp(`${SOLD.title}.*sold`));
    assert.equal(await text(p, "#subtotal"), "₹12,000");
    await done(p);
  });
});

async function checkout(device, pin, { pickup = false } = {}) {
  const p = await open(device, "/checkout", { as: "buyer", cart: [A.id, B.id] });
  const tap = (s) => (DEVICES[device].isMobile ? p.tap(s) : p.click(s));
  await p.waitForSelector(".addr-form");
  await p.type('[name="name"]', "Asha Buyer"); await p.type('[name="phone"]', "9876543210");
  await p.type('[name="line1"]', "12 Lotus Apartments"); await p.type('[name="pin"]', pin);
  await p.type('[name="city"]', pin.startsWith("400") ? "Mumbai" : "New Delhi");
  await p.select('[name="state"]', pin.startsWith("400") ? "Maharashtra" : "Delhi");
  await tap('.addr-form [type="submit"]');
  await p.waitForSelector('#options input[name="ship"]');
  const options = await p.$$eval('#options input[name="ship"]', (is) => is.map((i) => ({ code: i.value, checked: i.checked })));
  if (pickup) await tap('#options input[value="pickup"]');
  await sleep(100);
  const ship = await text(p, "#t-ship"), total = await text(p, "#t-total");
  await tap("#to-review");
  await tap("#agree");
  await tap("#place");
  await p.waitForSelector("#pay", { timeout: 8000 });
  return { p, options, ship, total };
}

describe("checkout to the UPI screen", () => {
  for (const device of Object.keys(DEVICES)) {
    test(`${device}: address → shipping → review → pay → UTR`, async () => {
      const { p, options, ship, total } = await checkout(device, "110001");
      assert.deepEqual(options.map((o) => o.code), ["est:speed-post", "est:express"]);
      assert.ok(options[0].checked, "cheapest tracked option is the default");
      const shipping = Number(ship.replace(/[^\d]/g, ""));
      assert.ok(shipping > 0); assert.equal(total, `₹${(16500 + shipping).toLocaleString("en-IN")}`);
      assert.match(p.url(), /\/order\/MSA-2026-00001$/);
      const link = await p.$eval("#upi-link", (a) => a.getAttribute("href"));
      assert.equal(link, `upi://pay?pa=mahalakshmi@okaxis&pn=Mahalakshmi%20Srikanth&am=${16500 + shipping}.00&cu=INR&tn=MSA-2026-00001`);
      assert.equal(await text(p, "#pay-amount"), total);
      assert.ok(await p.$("#qr svg path"), "QR code drawn");
      assert.equal(await text(p, "#vpa"), "mahalakshmi@okaxis");
      assert.equal(getDb().orders[0].subtotal_inr, 16500, "subtotal computed from the server's prices");
      assert.deepEqual(JSON.parse(await p.evaluate(() => localStorage.getItem("msa-cart"))), [], "cart emptied");
      await p.type("#utr", "1234");
      await p.click("#utr-btn"); await sleep(100);
      assert.match(await text(p, "#utr-err"), /12 digits/);
      await p.$eval("#utr", (i) => { i.value = ""; });
      await p.type("#utr", "4321 8765 0912");
      await p.click("#utr-btn");
      await p.waitForFunction(() => /Payment being checked/.test(document.body.textContent));
      assert.equal(getDb().orders[0].utr, "432187650912");
      assert.equal(getDb().orders[0].status, "payment_submitted");
      await noSideways(p, `${device} order page`);
      assert.deepEqual(p.problems, []);
      await done(p);
    });
  }
  test("Mumbai PIN: free pickup, shipping ₹0", async () => {
    const { p, options, ship, total } = await checkout("phone", "400050", { pickup: true });
    assert.equal(options[0].code, "pickup");
    assert.equal(ship, "Free"); assert.equal(total, "₹16,500");
    assert.match(await p.$eval("#upi-link", (a) => a.getAttribute("href")), /am=16500\.00/);
    assert.equal(getDb().orders[0].pickup, true);
    await done(p);
  });
  test("another country: no checkout, an enquiry email per artwork", async () => {
    const p = await open("phone", "/checkout", { as: "buyer", cart: [A.id] });
    await p.waitForSelector("#checkout:not([hidden])");
    await p.click('input[name="country"][value="abroad"]'); await sleep(100);
    assert.equal(await p.$eval("#address-step", (s) => s.hidden), true);
    const href = await p.$eval("#abroad-links a", (a) => a.href);
    assert.equal(new URLSearchParams(href.split("?")[1]).get("subject"), `Purchase enquiry: ${A.title} (ID ${A.id}, Certificate ${A.cert})`);
    await done(p);
  });
  test("signed out: checkout asks you to sign in", async () => {
    const p = await open("laptop", "/checkout", { cart: [A.id] });
    assert.match(await p.$eval("#notices a", (a) => a.getAttribute("href")), /^\/signin\?next=%2Fcheckout/);
    await done(p);
  });
});

describe("sign in", () => {
  test("email code signs you in and returns you to checkout", async () => {
    const p = await open("phone", "/signin?next=/checkout", { cart: [A.id] });
    await p.type("#email", "buyer@example.test"); await p.tap("#send");
    await p.waitForSelector("#code-form:not([hidden])");
    await p.type("#code", "000000"); await p.tap("#verify"); await sleep(200);
    assert.match(await text(p, "#code-err"), /didn't work/);
    await p.$eval("#code", (i) => { i.value = ""; });
    await p.type("#code", "123456");
    await Promise.all([p.waitForNavigation(), p.tap("#verify")]);
    assert.match(p.url(), /\/checkout$/);
    await done(p);
  });
  test("refuses to redirect off-site after sign-in", async () => {
    const p = await open("laptop", "/signin?next=//evil.example", { as: "buyer" });
    await sleep(200);
    assert.match(p.url(), /\/account$/);
    await done(p);
  });
});

describe("account", () => {
  test("order history with status", async () => {
    const { p } = await checkout("laptop", "110001");
    await p.goto(server.url + "/account", { waitUntil: "networkidle0" });
    assert.match(await text(p, "#orders"), /MSA-2026-00001.*Awaiting payment/);
    assert.match(await text(p, "#addresses"), /Asha Buyer/);
    await done(p);
  });
});

describe("admin", () => {
  test("non-admin sees the gate with their account id", async () => {
    const p = await open("laptop", "/admin", { as: "buyer" });
    assert.match(await text(p, "#gate"), /only for the artist/);
    assert.equal(await text(p, "#my-id"), USERS.buyer.id);
    assert.equal(await p.$eval("#panels", (x) => x.hidden), true);
    await done(p);
  });
  test("orders → mark paid → certificate; prices; import; settings", async () => {
    const { p: buyer } = await checkout("laptop", "110001"); await done(buyer);
    getDb().orders[0].status = "payment_submitted"; getDb().orders[0].utr = "111122223333";
    const p = await open("laptop", "/admin", { as: "admin" });
    p.on("dialog", (d) => d.accept());
    assert.match(await text(p, "#order-list"), /MSA-2026-00001.*Payment being checked/);
    await p.click('[data-order="MSA-2026-00001"]');
    await p.waitForSelector('[data-act="mark_paid"]');
    assert.match(await text(p, "#order-panel"), /111122223333/);
    await p.click('[data-act="mark_paid"]');
    await p.waitForSelector('[data-act="ship"]');
    assert.equal(getDb().orders[0].status, "paid");
    assert.ok(getDb().products.find((x) => x.id === A.id).sold, "paid artwork is sold");
    await p.$eval("#cert-name", (i) => { i.value = "Asha Buyer"; });
    await p.click('[data-act="certificate"]');
    await p.waitForSelector("#cert-print .ms-coa-sheet", { timeout: 8000 });
    assert.equal(await p.$$eval("#cert-print .ms-coa-sheet", (s) => s.length), 2);
    assert.match(await text(p, "#cert-print"), new RegExp(A.cert));
    assert.match(await text(p, "#cert-print"), /Asha Buyer/);
    await p.type("#tracking", "AWB123456"); await p.click('[data-act="ship"]');
    await p.waitForSelector('[data-act="deliver"]');
    assert.equal(getDb().orders[0].tracking_no, "AWB123456");

    await p.click("#tab-products");
    await p.waitForSelector(`form[data-id="${UNPRICED.id}"]`);
    const f = `form[data-id="${UNPRICED.id}"]`;
    await p.type(`${f} [name="price_inr"]`, "9,500"); await p.click(`${f} [name="for_sale"]`); await p.click(`${f} [type="submit"]`);
    await p.waitForFunction(() => /for sale at/.test(document.querySelector("#toast")?.textContent || ""));
    const row = getDb().products.find((x) => x.id === UNPRICED.id);
    assert.equal(row.price_inr, 9500); assert.equal(row.for_sale, true);
    await p.click("#import");
    await p.waitForFunction(() => /Imported:/.test(document.querySelector("#toast")?.textContent || ""), { timeout: 8000 });
    assert.ok(getDb().products.length > 100, "every gallery artwork imported");
    assert.equal(getDb().products.find((x) => x.id === UNPRICED.id).price_inr, 9500, "import keeps prices");
    const oils = getDb().products.filter((x) => x.category === "oils");
    assert.ok(oils.length > 1 && oils.every((x) => x.medium === "Oil on canvas"), "oil paintings default to 'Oil on canvas'");

    await p.click("#tab-settings");
    await p.waitForFunction(() => document.querySelector('[name="upi_vpa"]').value === "mahalakshmi@okaxis");
    await p.$eval('[name="upi_vpa"]', (i) => { i.value = "not a vpa"; });
    await p.click('#settings-form [type="submit"]');
    assert.match(await text(p, "#settings-form .err"), /doesn't look like a UPI ID/);
    await p.$eval('[name="upi_vpa"]', (i) => { i.value = "mahalakshmi@oksbi"; });
    await p.click('#settings-form [type="submit"]'); await sleep(200);
    assert.equal(getDb().settings.upi_vpa, "mahalakshmi@oksbi");
    assert.deepEqual(p.problems, []);
    await done(p);
  });
  test("admin renders on a phone without sideways scroll", async () => {
    const p = await open("phone", "/admin", { as: "admin" });
    await p.tap("#tab-products"); await p.waitForSelector(".prod-admin");
    await noSideways(p, "phone admin products");
    await p.tap("#tab-settings"); await sleep(200);
    await noSideways(p, "phone admin settings");
    assert.deepEqual(p.problems, []);
    await done(p);
  });
});
