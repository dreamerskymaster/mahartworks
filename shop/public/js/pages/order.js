import { api, getSession, friendly } from "../api.js";
import { buildUpiLink, isValidUtr, cleanUtr } from "../lib/upi.js";
import { isOrderNo } from "../lib/order.js";
import { qrSvg } from "../qr.js";
import { statusChip, timelineHtml, eventsHtml, itemsHtml, shipToHtml, buyerMessage } from "../orderview.js";
import { $, esc, renderChrome, formatINR, fmtDateTime, signInUrl, setBusy, toast } from "../ui.js";

renderChrome("account");
const no = decodeURIComponent(location.pathname.replace(/^\/order\//, "").replace(/\/$/, ""));
const box = $("#order");
const phone = matchMedia("(hover: none) and (pointer: coarse)").matches;

function payPanel(o) {
  if (!o.pay?.vpa) return `<section class="panel"><p class="notice warn">Online payment isn't open right now. Please email
    <a href="mailto:mahasriphoto24@gmail.com">mahasriphoto24@gmail.com</a> with your order number ${esc(o.order_no)}.</p></section>`;
  const link = buildUpiLink({ vpa: o.pay.vpa, payee: o.pay.payee || "Mahalakshmi Srikanth", amount: o.total_inr, orderNo: o.order_no });
  const pay = `<a class="btn btn-solid btn-block" id="upi-link" href="${esc(link)}">Pay ${formatINR(o.total_inr)} with a UPI app</a>`;
  const qr = `<div class="qr" id="qr">${qrSvg(link, `UPI QR code to pay ${formatINR(o.total_inr)}`)}</div>`;
  return `<section class="panel pay" id="pay">
    <p class="eyebrow">Step 4 · Pay by UPI</p>
    <p class="amount" id="pay-amount">${formatINR(o.total_inr)}</p>
    <p class="muted small">to <b>${esc(o.pay.payee || "Mahalakshmi Srikanth")}</b> · note <b>${esc(o.order_no)}</b></p>
    ${phone ? `${pay}<p class="small muted" style="margin:.8rem 0 0">Opens GPay, PhonePe, Paytm or your bank's app with everything filled in.
      Paying from another phone? Scan this code:</p>${qr}`
      : `<p class="small">Scan with any UPI app (GPay, PhonePe, Paytm, BHIM, your bank's app):</p>${qr}<p class="small muted">On a phone? ${pay}</p>`}
    <p class="vpa">UPI ID <code id="vpa">${esc(o.pay.vpa)}</code><button class="btn btn-small" type="button" id="copy-vpa">Copy</button></p>
    <p class="small muted">Please pay the exact amount${o.expires_at ? ` by <b>${esc(fmtDateTime(o.expires_at))}</b>; after that the artwork is released` : ""}.
      Never pay anyone else claiming to represent the artist.</p>
    <form class="utr-form" id="utr-form" novalidate>
      <label class="field"><span>After paying: the 12-digit UPI reference (UTR / UPI Ref No.) from your payment app</span>
        <input id="utr" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="1234 5678 9012" required></label>
      <button class="btn btn-solid btn-block" type="submit" id="utr-btn">I've paid: confirm</button>
      <p class="err" id="utr-err" role="alert" hidden></p>
    </form>
    <p class="small" style="margin-top:1rem"><button class="link" type="button" id="cancel">Cancel this order</button></p>
  </section>`;
}

function view(o) {
  document.title = `Order ${o.order_no} — Vanna Reverie Shop`;
  const tracking = o.tracking_no ? `<p><b>${esc(o.courier || "Courier")}</b> · tracking <code>${esc(o.tracking_no)}</code>
    ${o.tracking_url ? ` · <a href="${esc(o.tracking_url)}" target="_blank" rel="noopener">Track parcel</a>` : ""}</p>` : "";
  box.innerHTML = `<div class="page-head"><p class="eyebrow">Order</p><h1 id="order-no">${esc(o.order_no)}</h1>
      <p>${statusChip(o.status)} <span class="muted">placed ${esc(fmtDateTime(o.created_at))}</span></p>
      <p>${esc(buyerMessage(o.status))}</p></div>
    <div class="two-col"><div>
      ${o.status === "awaiting_payment" ? payPanel(o) : ""}
      ${o.status === "payment_submitted" ? `<section class="panel"><h2>Payment being checked</h2><p>UPI reference <code>${esc(o.utr)}</code>.
        The artist checks every payment in her bank app; you'll see “Paid” here once it's confirmed, usually within a day.</p></section>` : ""}
      <section class="panel"><h2>Progress</h2>${timelineHtml(o)}${tracking}${eventsHtml(o)}</section>
    </div><aside>
      <section class="panel"><h2>Artworks</h2>${itemsHtml(o)}</section>
      <section class="panel"><h2>${o.pickup ? "Pickup" : "Delivering to"}</h2><p class="small">${shipToHtml(o)}</p>
        ${o.pickup ? '<p class="small muted">Free pickup in Mumbai: after payment she will call you to arrange a time and share the address.</p>' : ""}
        ${o.shipping_eta && !o.pickup ? `<p class="small muted">${esc(o.shipping_label || "")} · about ${esc(o.shipping_eta)}</p>` : ""}</section>
    </aside></div>`;
}

async function load() {
  if (!(await getSession())) { location.replace(signInUrl()); return; }
  if (!isOrderNo(no)) throw Object.assign(new Error("We couldn't find that order."), {});
  view(await api.order(no));
}

box.addEventListener("submit", async (e) => {
  if (e.target.id !== "utr-form") return;
  e.preventDefault();
  const err = $("#utr-err"), utr = cleanUtr($("#utr").value);
  err.hidden = true;
  if (!isValidUtr(utr)) { err.textContent = "The UPI reference number has 12 digits. You'll find it in your payment app's transaction details."; err.hidden = false; return; }
  setBusy($("#utr-btn"), true, "Sending");
  try { await api.submitUtr(no, utr); toast("Thank you! We'll confirm your payment soon."); await load(); }
  catch (ex) { err.textContent = friendly(ex); err.hidden = false; setBusy($("#utr-btn"), false); }
});
box.addEventListener("click", async (e) => {
  if (e.target.id === "copy-vpa") {
    try { await navigator.clipboard.writeText($("#vpa").textContent); toast("UPI ID copied"); } catch { toast("UPI ID: " + $("#vpa").textContent); }
  }
  if (e.target.id === "cancel" && confirm("Cancel this order? The artwork will be released for others.")) {
    try { await api.cancelOrder(no); await load(); } catch (ex) { toast(friendly(ex)); }
  }
});
load().catch((e) => { box.innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p><p><a href="/account">Your orders</a></p></div>`; });
