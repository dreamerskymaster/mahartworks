import { api, getSession, friendly, uploadSignature, signatureUrl } from "../api.js";
import { MAIN_SITE } from "../config.js";
import { parsePrice } from "../lib/money.js";
import { isValidVpa } from "../lib/upi.js";
import { statusLabel } from "../lib/order.js";
import { statusChip, timelineHtml, eventsHtml, itemsHtml, shipToHtml } from "../orderview.js";
import { $, $$, esc, imgUrl, renderChrome, formatINR, fmtDateTime, sizeText, CATEGORY, signInUrl, setBusy, toast } from "../ui.js";

renderChrome("account");
const PAGE = 40;
let products = [], shown = PAGE, current = null;

/* ---------- gate ---------- */
async function gate() {
  const s = await getSession();
  if (!s) { $("#gate").innerHTML = `<div class="panel"><p>Please sign in with the artist's account.</p><a class="btn btn-solid" href="${signInUrl("/admin")}">Sign in</a></div>`; return false; }
  if (!(await api.isAdmin())) {
    $("#gate").innerHTML = `<div class="panel"><h2>This page is only for the artist</h2>
      <p>You're signed in as <b>${esc(s.user?.email)}</b>, which isn't an admin account.</p>
      <p class="small muted">Setting up? Ajith adds an admin in Supabase with one line of SQL using this account id:
        <code id="my-id">${esc(s.user?.id)}</code> (see shop/README.md).</p></div>`;
    return false;
  }
  $("#gate").hidden = true; $("#panels").hidden = false;
  return true;
}

/* ---------- tabs ---------- */
$(".tabs").addEventListener("click", (e) => {
  const t = e.target.closest('[role="tab"]'); if (!t) return;
  $$('[role="tab"]').forEach((b) => b.setAttribute("aria-selected", String(b === t)));
  $$('[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== t.getAttribute("aria-controls"); });
  if (t.id === "tab-products" && !products.length) loadProducts();
  if (t.id === "tab-settings") loadSettings();
});

/* ---------- orders ---------- */
async function loadOrders() {
  const list = await api.adminOrders($("#order-filter").value || null);
  $("#order-list").innerHTML = list.length ? list.map((o) => `<button class="admin-order" type="button" data-order="${esc(o.order_no)}">
      <span><b>${esc(o.order_no)}</b> · ${esc(o.name || "")}, ${esc(o.city || "")} ${esc(o.pin || "")}${o.pickup ? " · pickup" : ""}<br>
        <span class="small muted">${esc(o.titles || "")} · ${esc(fmtDateTime(o.created_at))}${o.utr ? ` · UTR ${esc(o.utr)}` : ""}</span></span>
      <span class="center">${statusChip(o.status)}<br><b>${formatINR(o.total_inr)}</b></span></button>`).join("")
    : `<p class="muted">No orders${$("#order-filter").value ? ` with status “${esc(statusLabel($("#order-filter").value))}”` : ""}.</p>`;
}

async function openOrder(no) {
  current = await api.order(no);
  const o = current;
  const act = [];
  if (["awaiting_payment", "payment_submitted"].includes(o.status)) act.push(`<div class="panel"><h3>1. Check the payment</h3>
    <p>Open your bank or UPI app and look for <b>${formatINR(o.total_inr)}</b>${o.utr ? ` with reference <b>${esc(o.utr)}</b>` : ""}
      (note: ${esc(o.order_no)}). Only mark it paid once you can see the money.</p>
    ${o.utr ? "" : '<label class="field"><span>UPI reference, if the buyer told you another way</span><input id="paid-utr" inputmode="numeric"></label>'}
    <button class="btn btn-solid" data-act="mark_paid">I've received ${formatINR(o.total_inr)}: mark paid</button></div>`);
  if (o.status === "paid" && !o.pickup) act.push(`<div class="panel"><h3>2. Ship it</h3>
    <div class="grid2"><label class="field"><span>Courier</span><input id="courier" value="${esc(o.shipping_label || "")}"></label>
    <label class="field"><span>Tracking number (AWB)</span><input id="tracking"></label></div>
    <label class="field"><span>Tracking link (optional, https://…)</span><input id="tracking-url" type="url"></label>
    <button class="btn btn-solid" data-act="ship">Mark shipped</button></div>`);
  if (o.status === "shipped" || (o.status === "paid" && o.pickup)) act.push(`<div class="panel"><h3>${o.pickup ? "2. Picked up?" : "3. Delivered?"}</h3>
    <button class="btn btn-solid" data-act="deliver">${o.pickup ? "Mark collected" : "Mark delivered"}</button></div>`);
  if (["paid", "shipped", "delivered"].includes(o.status)) act.push(`<div class="panel"><h3>Certificate of authenticity</h3>
    <div class="grid2"><label class="field"><span>Buyer's name on the certificate</span><input id="cert-name" value="${esc(o.ship_to?.name || "")}"></label>
    <label class="field"><span>Issued on</span><input id="cert-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div>
    <button class="btn" data-act="certificate">Issue certificate${o.items.length > 1 ? "s" : ""}</button> <span class="small muted" id="cert-msg"></span></div>`);
  if (["awaiting_payment", "payment_submitted", "paid"].includes(o.status)) act.push(`<details class="panel"><summary>Cancel this order</summary>
    <label class="field"><span>Reason${o.status === "paid" ? " (required: refund the buyer first)" : ""}</span><input id="cancel-note"></label>
    <button class="btn btn-danger" data-act="cancel">Cancel order &amp; release the artwork</button></details>`);
  $("#order-detail").innerHTML = `<div class="panel" id="order-panel">
    <p class="small"><button class="link" type="button" id="close-order">← Back to the list</button></p>
    <h2>${esc(o.order_no)} ${statusChip(o.status)}</h2>
    <div class="two-col"><div>${act.join("")}
      <div class="panel"><h3>Note to self</h3><label class="field"><span class="sr-only">Note</span><input id="note" value="${esc(o.admin_note || "")}"></label>
        <button class="btn btn-small" data-act="note">Save note</button></div>
      ${timelineHtml(o)}${eventsHtml(o)}</div>
    <div><dl class="kv">
      <dt>Buyer</dt><dd>${esc(o.buyer_email || "")}</dd>
      <dt>${o.pickup ? "Pickup by" : "Ship to"}</dt><dd>${shipToHtml(o)}</dd>
      <dt>Shipping</dt><dd>${esc(o.pickup ? "Free pickup in Mumbai" : `${o.shipping_label || ""} ${o.shipping_eta ? `(${o.shipping_eta})` : ""}`)}
        ${!o.pickup && !o.shipping_verified ? '<br><span class="err">Price not verified by the server: check it before dispatch.</span>' : ""}</dd>
      ${o.utr ? `<dt>UPI ref</dt><dd><code>${esc(o.utr)}</code></dd>` : ""}
      ${o.buyer_note ? `<dt>Buyer's note</dt><dd>${esc(o.buyer_note)}</dd>` : ""}
      ${o.tracking_no ? `<dt>Tracking</dt><dd>${esc(o.courier || "")} ${esc(o.tracking_no)}</dd>` : ""}
    </dl>${itemsHtml(o)}</div></div></div>`;
  $("#order-list").hidden = true;
  $("#order-detail").scrollIntoView({ block: "start" });
}

async function act(action, btn) {
  const o = current, p = {};
  if (action === "mark_paid") {
    if (!confirm(`Have you seen ${formatINR(o.total_inr)} arrive in your bank or UPI app? Only then mark it paid.`)) return;
    if ($("#paid-utr")?.value) p.utr = $("#paid-utr").value;
  }
  if (action === "ship") Object.assign(p, { courier: $("#courier").value, tracking_no: $("#tracking").value, tracking_url: $("#tracking-url").value });
  if (action === "cancel") { p.note = $("#cancel-note").value; if (!confirm("Cancel this order?")) return; }
  if (action === "note") p.note = $("#note").value;
  if (action === "certificate") return issueCertificates();
  setBusy(btn, true, "Saving");
  try { await api.adminUpdateOrder(o.order_no, action, p); toast("Saved"); await openOrder(o.order_no); loadOrders(); }
  catch (e) { toast(friendly(e)); setBusy(btn, false); }
}

/* ---------- certificates (site/js/certificate.js, loaded from the gallery) ---------- */
async function issueCertificates() {
  const o = current, msg = $("#cert-msg");
  let mod;
  try { mod = await import(`${MAIN_SITE}/js/certificate.js`); }
  catch { msg.textContent = "The certificate tool isn't available on the gallery yet."; return; }
  if (typeof mod.renderCertificate !== "function") { msg.textContent = "The certificate tool isn't available on the gallery yet."; return; }
  const sig = await signatureUrl().catch(() => null);
  const box = $("#cert-print"); box.innerHTML = "";
  const year = (d) => (d ? String(d).slice(0, 4) : "");
  try {
    for (const i of o.items) {
      const wrap = document.createElement("div"); wrap.className = "cert-wrap"; box.append(wrap);
      mod.renderCertificate(wrap, { id: i.id, cert: i.cert, title: i.title, category: i.category, medium: i.medium || "",
        size: sizeText(i), year: year(o.paid_at || o.created_at), imageUrl: imgUrl(i.id), buyerName: $("#cert-name").value.trim(),
        issuedOn: $("#cert-date").value, signatureUrl: sig || undefined });
    }
    msg.innerHTML = `${sig ? "" : "No signature uploaded (Settings), so a line is left to sign by hand. "}<button class="btn btn-small" type="button" id="print">Print / save as PDF</button>`;
  } catch (e) { msg.textContent = `Couldn't make the certificate: ${e.message}`; }
}

$("#order-filter").addEventListener("change", loadOrders);
$("#refresh-orders").addEventListener("click", loadOrders);
$("#orders").addEventListener("click", (e) => {
  const row = e.target.closest("[data-order]"); if (row) return openOrder(row.dataset.order).catch((x) => toast(friendly(x)));
  if (e.target.id === "close-order") { $("#order-detail").innerHTML = ""; $("#order-list").hidden = false; current = null; }
  const b = e.target.closest("[data-act]"); if (b) act(b.dataset.act, b);
  if (e.target.id === "print") print();
});

/* ---------- products ---------- */
async function loadProducts() {
  $("#prod-list").innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Loading…</p>';
  products = await api.adminProducts();
  drawProducts();
}
function filtered() {
  const q = $("#prod-search").value.trim().toLowerCase(), f = $("#prod-filter").value;
  return products.filter((p) => (!q || `${p.title} ${p.cert || ""} ${p.id}`.toLowerCase().includes(q))
    && (f === "all" || (f === "sale" && p.for_sale && !p.sold) || (f === "sold" && p.sold) || (f === "unpriced" && !p.for_sale && !p.sold)));
}
const num = (v) => (v == null ? "" : String(v));
function drawProducts() {
  const list = filtered();
  $("#prod-count").textContent = products.length
    ? `${list.length} of ${products.length} artworks · ${products.filter((p) => p.for_sale && !p.sold).length} for sale`
    : "No artworks yet: press “Import artworks from the gallery”.";
  $("#prod-list").innerHTML = list.slice(0, shown).map((p) => `<form class="prod-admin${p.on_site ? "" : " off-site"}" data-id="${esc(p.id)}">
    <img src="${imgUrl(p.id, true)}" alt="" loading="lazy">
    <div><h3>${esc(p.title)}</h3><span class="small muted">${esc([CATEGORY[p.category], p.cert, p.on_site ? "" : "removed from the gallery"].filter(Boolean).join(" · "))}</span>
      ${p.status !== "available" ? ` <span class="status ${p.status === "sold" ? "delivered" : "awaiting_payment"}">${esc(p.status)}</span>` : ""}</div>
    <div class="fields">
      <label class="check"><input type="checkbox" name="for_sale"${p.for_sale ? " checked" : ""}> For sale</label>
      <label>Price ₹<input name="price_inr" inputmode="numeric" value="${num(p.price_inr)}"></label>
      <label>Medium<input name="medium" value="${esc(p.medium || "")}" placeholder="Acrylic on canvas"></label>
      <label>Width cm<input name="width_cm" inputmode="decimal" value="${num(p.width_cm)}"></label>
      <label>Height cm<input name="height_cm" inputmode="decimal" value="${num(p.height_cm)}"></label>
      <label>Depth cm<input name="depth_cm" inputmode="decimal" value="${num(p.depth_cm)}"></label>
      <label>Weight kg<input name="weight_kg" inputmode="decimal" value="${num(p.weight_kg)}"></label>
      <label class="check"><input type="checkbox" name="sold"${p.sold ? " checked" : ""}> Sold</label>
      <button class="btn btn-small btn-solid" type="submit">Save</button>
    </div></form>`).join("");
  $("#prod-more").hidden = list.length <= shown;
}
$("#prod-search").addEventListener("input", () => { shown = PAGE; drawProducts(); });
$("#prod-filter").addEventListener("change", () => { shown = PAGE; drawProducts(); });
$("#prod-more").addEventListener("click", () => { shown += PAGE; drawProducts(); });
$("#prod-list").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, el = f.elements, btn = f.querySelector('[type="submit"]');
  const price = parsePrice(el.namedItem("price_inr").value);
  const forSale = el.namedItem("for_sale").checked;
  if (Number.isNaN(price)) return toast("The price should be a whole number of rupees, like 12500");
  if (forSale && !price) return toast("Set a price before putting it up for sale");
  const nums = ["width_cm", "height_cm", "depth_cm", "weight_kg"].map((k) => [k, el.namedItem(k).value.trim()]);
  if (nums.some(([, v]) => v && !/^\d+(\.\d+)?$/.test(v))) return toast("Sizes and weight are plain numbers, like 30 or 1.5");
  setBusy(btn, true, "Saving");
  try {
    const saved = await api.adminSaveProduct({ id: f.dataset.id, price_inr: price ?? "", for_sale: forSale, sold: el.namedItem("sold").checked,
      medium: el.namedItem("medium").value, ...Object.fromEntries(nums) });
    products = products.map((p) => (p.id === saved.id ? saved : p));
    toast(saved.for_sale ? `Saved: ${saved.title} is for sale at ${formatINR(saved.price_inr)}` : `Saved: ${saved.title}`);
  } catch (ex) { toast(friendly(ex)); }
  setBusy(btn, false);
});
$("#import").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  setBusy(btn, true, "Importing");
  try {
    const text = await (await fetch(`${MAIN_SITE}/data.js`, { cache: "no-store" })).text();
    const rows = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;\s*$/, ""))
      .map((a) => ({ id: a.id, title: a.title, cat: a.cat, cert: a.cert || null }));
    const r = await api.adminImport(rows);
    toast(`Imported: ${r.added} new, ${r.total} in total${r.removed_from_site ? `, ${r.removed_from_site} no longer in the gallery` : ""}`);
    await loadProducts();
  } catch (ex) { toast(`Import failed: ${friendly(ex)}`); }
  setBusy(btn, false);
});

/* ---------- settings ---------- */
async function loadSettings() {
  const s = await api.adminSettings(), f = $("#settings-form").elements;
  for (const k of ["upi_vpa", "upi_payee_name", "pickup_prefixes", "pickup_note", "payment_window_hours"]) f.namedItem(k).value = s[k] || "";
  $("#signing-state").textContent = s.quote_signing
    ? "Shipping prices are verified by the database (quote signing is on)."
    : "Shipping-quote signing isn't set up yet, so check courier charges on each order (see shop/README.md).";
  showSignature();
}
async function showSignature() {
  const url = await signatureUrl().catch(() => null);
  $("#sig-preview").innerHTML = url ? `<img src="${esc(url)}" alt="Your signature" style="max-width:260px;background:#fff;padding:8px;border-radius:6px">` : '<p class="small muted">No signature uploaded yet.</p>';
}
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, el = f.elements, err = f.querySelector(".err");
  const v = Object.fromEntries(["upi_vpa", "upi_payee_name", "pickup_prefixes", "pickup_note", "payment_window_hours"].map((k) => [k, el.namedItem(k).value.trim()]));
  err.hidden = true;
  if (v.upi_vpa && !isValidVpa(v.upi_vpa)) { err.textContent = "That doesn't look like a UPI ID (for example name@okaxis)."; err.hidden = false; return; }
  try { await api.adminSaveSettings(v); toast(v.upi_vpa ? "Saved: payments are open" : "Saved: payments are closed (no UPI ID)"); }
  catch (ex) { err.textContent = friendly(ex); err.hidden = false; }
});
$("#sig-file").addEventListener("change", async (e) => {
  const file = e.target.files[0], err = $("#sig-err"); err.hidden = true;
  if (!file) return;
  if (file.size > 1024 * 1024) { err.textContent = "Please choose an image under 1 MB."; err.hidden = false; return; }
  try { await uploadSignature(file); toast("Signature saved"); showSignature(); }
  catch (ex) { err.textContent = friendly(ex); err.hidden = false; }
});

if (await gate().catch((e) => { $("#gate").innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p></div>`; return false; })) {
  loadOrders().catch((e) => toast(friendly(e)));
}
