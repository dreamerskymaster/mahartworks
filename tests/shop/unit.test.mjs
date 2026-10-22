// Unit tests for the shop's pure logic and the shipping-quote function.   cd tests/shop && npm run test:unit
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { formatINR, upiAmount, parsePrice } from "../../shop/public/js/lib/money.js";
import { isValidPin, isPickupPin, distanceBand, circleOf } from "../../shop/public/js/lib/pin.js";
import { buildUpiLink, isValidUtr, cleanUtr, isValidVpa } from "../../shop/public/js/lib/upi.js";
import { formatOrderNo, isOrderNo, timeline } from "../../shop/public/js/lib/order.js";
import { readCart, writeCart, addToCart, removeFromCart, validateCart, CART_KEY } from "../../shop/public/js/lib/cart.js";
import { packageFor, estimateOptions, cheapestTracked, ESTIMATE_TABLE, insuranceFor } from "../../shop/public/js/lib/shipping.js";
import { quoteMessage, hmacHex, signOption } from "../../shop/public/js/lib/quote.js";
import { enquirySubject, enquiryMailto } from "../../shop/public/js/lib/enquiry.js";
import { quote, mapShiprocket, handle, resetTokenCache, QuoteError } from "../../shop/server/quote.js";

describe("money", () => {
  test("rupees with Indian digit grouping", () => {
    assert.equal(formatINR(999), "₹999");
    assert.equal(formatINR(12500), "₹12,500");
    assert.equal(formatINR(125000), "₹1,25,000");
    assert.equal(formatINR(1250000), "₹12,50,000");
    assert.equal(formatINR(0), "₹0");
  });
  test("UPI amount has two decimals and no grouping", () => {
    assert.equal(upiAmount(12500), "12500.00");
    assert.equal(upiAmount(1299.5), "1299.50");
    assert.equal(upiAmount("180"), "180.00");
    assert.throws(() => upiAmount(0)); assert.throws(() => upiAmount(-5)); assert.throws(() => upiAmount("abc"));
  });
  test("prices typed in admin", () => {
    assert.equal(parsePrice("12,500"), 12500); assert.equal(parsePrice("₹ 8000"), 8000); assert.equal(parsePrice("4999.50"), 5000);
    assert.equal(parsePrice(""), null); assert.ok(Number.isNaN(parsePrice("12k")));
  });
});

describe("PIN codes and Mumbai pickup", () => {
  test("valid PINs are 6 digits not starting with 0", () => {
    for (const p of ["400050", "110001", " 560 001 "]) assert.ok(isValidPin(p), p);
    for (const p of ["040050", "40005", "4000500", "abcdef", "", null]) assert.ok(!isValidPin(p), String(p));
  });
  test("pickup only for Mumbai PINs by default; MMR prefixes are configurable", () => {
    assert.ok(isPickupPin("400050")); assert.ok(isPickupPin("400001"));
    assert.ok(!isPickupPin("401107")); assert.ok(!isPickupPin("421301")); assert.ok(!isPickupPin("110001"));
    assert.ok(isPickupPin("401107", ["400", "401", "421"])); assert.ok(isPickupPin("421301", ["400", " 421 "]));
    assert.ok(!isPickupPin("400050", [])); assert.ok(!isPickupPin("40005", ["400"]));
  });
  test("distance bands from Mumbai", () => {
    assert.equal(distanceBand("400001", "400050"), "local");
    assert.equal(distanceBand("400001", "411001"), "state");      // Pune
    assert.equal(distanceBand("400001", "380001"), "zone");       // Ahmedabad
    assert.equal(distanceBand("400001", "560001"), "zone");       // Bengaluru
    assert.equal(distanceBand("400001", "110001"), "national");   // Delhi
    assert.equal(distanceBand("400001", "781001"), "remote");     // Guwahati
    assert.equal(distanceBand("400001", "190001"), "remote");     // Srinagar
    assert.equal(distanceBand("400001", "744101"), "remote");     // Port Blair
    assert.equal(circleOf("411001"), "Maharashtra");
  });
});

describe("UPI", () => {
  test("pay link has the exact payee, amount, currency and order note", () => {
    assert.equal(buildUpiLink({ vpa: "mahalakshmi@okaxis", amount: 12680, orderNo: "MSA-2026-00012" }),
      "upi://pay?pa=mahalakshmi@okaxis&pn=Mahalakshmi%20Srikanth&am=12680.00&cu=INR&tn=MSA-2026-00012");
  });
  test("payee names are encoded", () => {
    const u = new URL(buildUpiLink({ vpa: "a.b-c@ybl", payee: "M & S (Art)", amount: 5, orderNo: "MSA-2026-00001" }));
    assert.equal(u.searchParams.get("pn"), "M & S (Art)");
    assert.equal(u.searchParams.get("am"), "5.00");
  });
  test("needs a real UPI ID and order number", () => {
    assert.throws(() => buildUpiLink({ vpa: "not a vpa", amount: 5, orderNo: "x" }));
    assert.throws(() => buildUpiLink({ vpa: "a@ok", amount: 5 }));
    assert.ok(isValidVpa("name.surname-1@okhdfcbank")); assert.ok(!isValidVpa("@okaxis")); assert.ok(!isValidVpa("name@"));
  });
  test("UTR is 12 digits; pasted spaces are ignored", () => {
    assert.ok(isValidUtr("123456789012")); assert.ok(isValidUtr("1234 5678 9012"));
    assert.equal(cleanUtr(" 1234 5678 9012 "), "123456789012");
    assert.ok(!isValidUtr("12345678901")); assert.ok(!isValidUtr("12345678901a")); assert.ok(!isValidUtr(""));
  });
});

describe("orders", () => {
  test("order numbers", () => {
    assert.equal(formatOrderNo(2026, 12), "MSA-2026-00012");
    assert.equal(formatOrderNo(2027, 123456), "MSA-2027-123456");
    assert.ok(isOrderNo("MSA-2026-00012")); assert.ok(!isOrderNo("MSA-26-00012")); assert.ok(!isOrderNo("MSA-2026-12"));
    assert.throws(() => formatOrderNo(2026, 0)); assert.throws(() => formatOrderNo(26, 1));
  });
  test("timeline: pickup has no shipping step; cancelled shows what happened", () => {
    assert.deepEqual(timeline({ status: "paid", pickup: true }).map((t) => t.status), ["awaiting_payment", "payment_submitted", "paid", "delivered"]);
    const t = timeline({ status: "shipped" });
    assert.deepEqual(t.map((x) => x.state), ["done", "done", "done", "current", "upcoming"]);
    const c = timeline({ status: "cancelled", events: [{ status: "awaiting_payment" }, { status: "cancelled" }] });
    assert.deepEqual(c.map((x) => x.status), ["awaiting_payment", "cancelled"]);
  });
});

describe("cart", () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
  test("one of each artwork, valid ids only, survives bad storage", () => {
    const s = store();
    addToCart("pongal-kolam", s); addToCart("pongal-kolam", s); addToCart("saibaba-on-canvas", s);
    assert.deepEqual(readCart(s), ["pongal-kolam", "saibaba-on-canvas"]);
    removeFromCart("pongal-kolam", s); assert.deepEqual(readCart(s), ["saibaba-on-canvas"]);
    writeCart(["ok-id", "<script>", "UPPER", 42], s); assert.deepEqual(readCart(s), ["ok-id"]);
    s.setItem(CART_KEY, "{not json"); assert.deepEqual(readCart(s), []);
    assert.deepEqual(readCart(null), []);
  });
  test("validated against the server's products", () => {
    const products = [
      { id: "a", title: "A", price_inr: 5000, for_sale: true, sold: false, status: "available" },
      { id: "b", title: "B", price_inr: 3000, for_sale: true, sold: true, status: "sold" },
      { id: "c", title: "C", price_inr: 2000, for_sale: true, sold: false, status: "reserved" },
      { id: "d", title: "D", price_inr: 1500, for_sale: true, sold: false, status: "available" },
    ];
    const v = validateCart(["a", "b", "c", "d", "gone"], products);
    assert.deepEqual(v.items.map((p) => p.id), ["a", "d"]);
    assert.equal(v.subtotal, 6500);
    assert.deepEqual(Object.fromEntries(v.removed.map((r) => [r.id, r.reason])),
      { b: "sold", c: "reserved by another buyer", gone: "no longer for sale" });
    assert.equal(v.ok, false);
    assert.equal(validateCart(["a"], products).ok, true);
    assert.equal(validateCart([], products).ok, false);
  });
});

describe("shipping fallback table", () => {
  test("packed parcel: allowance and volumetric weight", () => {
    const p = packageFor([{ width_cm: 30, height_cm: 40, depth_cm: 3, weight_kg: 1 }]);
    assert.deepEqual([p.length, p.breadth, p.height], [48, 38, 9]);
    assert.equal(p.weight_kg, 1.75);                       // 1 × 1.15 + 0.6
    assert.equal(p.volumetric_kg, 3.28);                   // 48 × 38 × 9 / 5000
    assert.equal(p.chargeable_kg, 3.5);                    // larger, rounded up to 0.5 kg
    const empty = packageFor([{}]);                        // nothing entered yet: a small framed piece
    assert.deepEqual([empty.length, empty.breadth], [48, 38]);
    const two = packageFor([{ width_cm: 20, height_cm: 20, depth_cm: 2, weight_kg: 0.5 }, { width_cm: 60, height_cm: 90, depth_cm: 4, weight_kg: 3 }]);
    assert.deepEqual([two.length, two.breadth, two.height], [98, 68, 12]);
  });
  test("estimate = slab price by band + insurance, rounded up to ₹10", () => {
    const [sp, ex] = estimateOptions({ fromPin: "400001", toPin: "110001", chargeableKg: 2, declared: 12000 });
    const t = ESTIMATE_TABLE.national;
    assert.equal(sp.code, "est:speed-post");
    assert.equal(sp.price_inr, Math.ceil((t.first + 3 * t.extra + 120) / 10) * 10);   // 140 + 195 + 120 = 455 -> 460
    assert.equal(sp.price_inr, 460);
    assert.ok(ex.price_inr > sp.price_inr);
    assert.equal(sp.band, "national"); assert.ok(sp.estimate && sp.tracking);
    assert.equal(insuranceFor(1000), 50); assert.equal(insuranceFor(25000), 250);
    const near = estimateOptions({ fromPin: "400001", toPin: "400050", chargeableKg: 2, declared: 12000 })[0];
    const far = estimateOptions({ fromPin: "400001", toPin: "781001", chargeableKg: 2, declared: 12000 })[0];
    assert.ok(near.price_inr < sp.price_inr && sp.price_inr < far.price_inr);
    assert.throws(() => estimateOptions({ fromPin: "400001", toPin: "12345", chargeableKg: 1 }));
  });
  test("default is the cheapest tracked option", () => {
    assert.equal(cheapestTracked([{ code: "x", price_inr: 50, tracking: false }, { code: "y", price_inr: 90 }, { code: "z", price_inr: 70 }]).code, "z");
    assert.equal(cheapestTracked([]), null);
  });
});

describe("signed quotes", () => {
  test("message format matches the database (sorted, de-duplicated ids)", () => {
    assert.equal(quoteMessage({ pin: "110001", ids: ["b-x", "a", "b-x"], code: "est:speed-post", price_inr: 180, exp: 1800000000 }),
      "v1|110001|a,b-x|est:speed-post|180|1800000000");
  });
  test("HMAC-SHA256 hex, same as Node's crypto and Postgres pgcrypto hmac()", async () => {
    const msg = "v1|110001|zz-test-second|est:speed-post|180|1800000000";
    assert.equal(await hmacHex("test-quote-key", msg), createHmac("sha256", "test-quote-key").update(msg).digest("hex"));
    // Computed by the Supabase database: encode(extensions.hmac(msg, key, 'sha256'), 'hex')
    assert.equal(await hmacHex("test-quote-key", msg), "abac251f70a8c7112091f0df632be5b605e7264df253c69fe8225f4afc423714");
    // ids sort bytewise, as `order by x collate "C"` does in shop.api_place_order
    assert.equal(quoteMessage({ pin: "1", ids: ["ab", "a-c", "a-b", "b"], code: "c", price_inr: 1, exp: 1 }), "v1|1|a-b,a-c,ab,b|c|1|1");
    const o = await signOption("k", { pin: "110001", ids: ["a"] }, { code: "est:express", price_inr: 300 }, 1_700_000_000_000);
    assert.equal(o.exp, 1_700_000_000 + 1800);
    assert.equal(o.sig, createHmac("sha256", "k").update(`v1|110001|a|est:express|300|${o.exp}`).digest("hex"));
  });
});

describe("international enquiry", () => {
  test("subject names the artwork, id and certificate", () => {
    assert.equal(enquirySubject({ title: "Pongal Kolam", id: "pongal-kolam", cert: "MS-2026-0379" }),
      "Purchase enquiry: Pongal Kolam (ID pongal-kolam, Certificate MS-2026-0379)");
    assert.equal(enquirySubject({ title: "X", id: "x" }), "Purchase enquiry: X (ID x)");
  });
  test("mailto asks for country and address", () => {
    const u = enquiryMailto({ title: "Lakshmi & Lotus", id: "lakshmi-lotus", cert: "MS-2026-0001" });
    assert.ok(u.startsWith("mailto:mahasriphoto24@gmail.com?subject="));
    const q = new URLSearchParams(u.split("?")[1]);
    assert.equal(q.get("subject"), "Purchase enquiry: Lakshmi & Lotus (ID lakshmi-lotus, Certificate MS-2026-0001)");
    assert.match(q.get("body"), /My country: /); assert.match(q.get("body"), /shipping address/);
    assert.match(q.get("body"), /\n/);
  });
});

describe("/api/shipping-quote", () => {
  const PRODUCTS = [{ id: "art-a", title: "A", price_inr: 12000, for_sale: true, status: "available", width_cm: 30, height_cm: 40, depth_cm: 3, weight_kg: 1 },
    { id: "art-b", title: "B", price_inr: 4000, for_sale: true, status: "reserved" }];
  const SETTINGS = { pickup_prefixes: ["400"], pickup_note: "Free pickup in Mumbai." };
  const SR_REPLY = { status: 200, data: { available_courier_companies: [
    { courier_company_id: 10, courier_name: "Delhivery Surface", rate: 212.4, etd: "Oct 20, 2026", estimated_delivery_days: "5" },
    { courier_company_id: 24, courier_name: "Blue Dart Air", rate: { rate: "489.10" }, estimated_delivery_days: "2" },
    { courier_company_id: "bad", courier_name: "Broken", rate: "x" }] } };
  function fakeFetch(log, { srFail = false } = {}) {
    return async (url, init = {}) => {
      log.push(String(url));
      const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
      if (url.includes("/rpc/shop_products")) { const ids = JSON.parse(init.body).p_ids; return ok(PRODUCTS.filter((p) => ids.includes(p.id))); }
      if (url.includes("/rpc/shop_settings")) return ok(SETTINGS);
      if (url.endsWith("/auth/login")) return ok({ token: "sr-token" });
      if (url.includes("/courier/serviceability/")) {
        assert.equal(init.headers.Authorization, "Bearer sr-token");
        const q = new URL(url).searchParams;
        assert.equal(q.get("pickup_postcode"), "400050"); assert.equal(q.get("cod"), "0"); assert.equal(q.get("declared_value"), "12000");
        assert.equal(q.get("weight"), "3.5"); assert.equal(q.get("length"), "48");
        return srFail ? ok({ message: "down" }, 500) : ok(SR_REPLY);
      }
      throw new Error("unexpected fetch " + url);
    };
  }
  const SR_ENV = { SHIPROCKET_EMAIL: "api@example.test", SHIPROCKET_PASSWORD: "pw", PICKUP_PINCODE: "400050", SHOP_QUOTE_KEY: "k" };

  test("no Shiprocket secrets: labelled estimate, unsigned without a key", async () => {
    const r = await quote({ pin: "110001", items: ["art-a"] }, {}, fakeFetch([]));
    assert.equal(r.source, "estimate");
    assert.deepEqual(r.options.map((o) => o.code), ["est:speed-post", "est:express"]);
    assert.ok(r.options.every((o) => o.estimate && !o.sig));
    assert.equal(r.pickup.available, false);
    assert.equal(r.default, "est:speed-post");
  });
  test("Mumbai PIN: free pickup offered alongside couriers", async () => {
    const r = await quote({ pin: "400050", items: ["art-a"] }, {}, fakeFetch([]));
    assert.equal(r.pickup.available, true);
    assert.deepEqual(r.pickup.option, { code: "pickup", label: "Free pickup in Mumbai", price_inr: 0, eta: "arranged by phone", tracking: false });
  });
  test("Shiprocket: real couriers, cheapest first, signed; the login token is reused", async () => {
    resetTokenCache();
    const log = [];
    const r = await quote({ pin: "110001", items: ["art-a"] }, SR_ENV, fakeFetch(log), 1_700_000_000_000);
    assert.equal(r.source, "shiprocket");
    assert.deepEqual(r.options.map((o) => [o.code, o.label, o.price_inr, o.eta]),
      [["sr:10", "Delhivery Surface", 213, "5 days"], ["sr:24", "Blue Dart Air", 490, "2 days"]]);
    assert.equal(r.options[0].sig, createHmac("sha256", "k").update(`v1|110001|art-a|sr:10|213|${r.options[0].exp}`).digest("hex"));
    await quote({ pin: "560001", items: ["art-a"] }, SR_ENV, fakeFetch(log));
    assert.equal(log.filter((u) => u.endsWith("/auth/login")).length, 1);
  });
  test("Shiprocket down: falls back to the estimate and says so", async () => {
    resetTokenCache();
    const r = await quote({ pin: "110001", items: ["art-a"] }, SR_ENV, fakeFetch([], { srFail: true }));
    assert.equal(r.source, "estimate"); assert.match(r.note, /estimate/);
  });
  test("refuses bad PINs and unavailable artworks; prices come from the database", async () => {
    await assert.rejects(quote({ pin: "12345", items: ["art-a"] }, {}, fakeFetch([])), QuoteError);
    await assert.rejects(quote({ pin: "110001", items: [] }, {}, fakeFetch([])), /empty/);
    await assert.rejects(quote({ pin: "110001", items: ["art-a", "art-b"] }, {}, fakeFetch([])), (e) => e.status === 409);
    const res = await handle(new Request("http://x/api/shipping-quote", { method: "POST", body: JSON.stringify({ pin: "110001", items: ["art-a"], price_inr: 1 }) }), {}, fakeFetch([]));
    assert.equal(res.status, 200);
    assert.equal((await handle(new Request("http://x/api/shipping-quote"), {}, fakeFetch([]))).status, 405);
  });
  test("maps Shiprocket replies defensively", () => {
    assert.deepEqual(mapShiprocket({}), []);
    assert.deepEqual(mapShiprocket({ data: { available_courier_companies: [{ courier_company_id: 1, courier_name: "X", rate: 0 }] } }), []);
  });
});
