import { api, getSession, shippingQuote, friendly } from "../api.js";
import { readCart, writeCart, clearCart, validateCart } from "../lib/cart.js";
import { cheapestTracked } from "../lib/shipping.js";
import { enquiryMailto } from "../lib/enquiry.js";
import { addressForm, addressText } from "../address.js";
import { $, $$, esc, imgUrl, renderChrome, formatINR, closedNotice, cartChanged, signInUrl, setBusy } from "../ui.js";

renderChrome("cart");
const state = { items: [], subtotal: 0, addresses: [], address: null, quote: null, option: null, open: false };

function step(name) {
  const order = ["address", "delivery", "review", "pay"], at = order.indexOf(name);
  $$("#steps li").forEach((li, i) => { li.className = i < at ? "done" : i === at ? "on" : ""; li.toggleAttribute("aria-current", i === at); });
}
function totals() {
  $("#t-sub").textContent = formatINR(state.subtotal);
  const ship = state.option ? state.option.price_inr : null;
  $("#t-ship").textContent = ship == null ? "—" : ship === 0 ? "Free" : formatINR(ship);
  $("#t-total").textContent = ship == null ? "—" : formatINR(state.subtotal + ship);
}

function drawLines() {
  $("#lines").innerHTML = state.items.map((p) => `<div class="line-item"><img src="${imgUrl(p.id, true)}" alt="" loading="lazy">
    <div><h3>${esc(p.title)}</h3><span class="meta">${esc(p.cert || "")}</span></div><span class="amt">${formatINR(p.price_inr)}</span></div>`).join("");
  $("#abroad-links").innerHTML = state.items.map((p) => `<p><a class="btn" href="${esc(enquiryMailto({ title: p.title, id: p.id, cert: p.cert }))}">✉ Enquire by email: ${esc(p.title)}</a></p>`).join("");
  totals();
}

function drawAddresses() {
  $("#addresses").innerHTML = state.addresses.map((a) => `<label class="choice"><input type="radio" name="addr" value="${esc(a.id)}"${state.address?.id === a.id ? " checked" : ""}>
    <span class="grow">${addressText(a)}</span></label>`).join("");
  if (!state.addresses.length) newAddress(false);
}
async function newAddress(cancel = true) {
  $("#add-address").hidden = true;
  const saved = await addressForm($("#address-form"), {}, { cancel });
  $("#add-address").hidden = false;
  if (!saved) return;
  $("#address-form").innerHTML = "";
  state.addresses = [saved, ...state.addresses.filter((a) => a.id !== saved.id)];
  choose(saved);
}
async function choose(a) {
  state.address = a; state.option = null; state.reviewed = false; drawAddresses(); totals();
  $("#delivery-step").hidden = false; $("#review-step").hidden = true; step("delivery");
  $("#options").innerHTML = '<p class="muted"><span class="spinner" aria-hidden="true"></span> Working out shipping to ' + esc(a.pin) + "…</p>";
  try {
    state.quote = await shippingQuote(a.pin, state.items.map((p) => p.id));
    drawOptions();
  } catch (e) { $("#options").innerHTML = `<p class="err">${esc(friendly(e))}</p><button class="btn" type="button" id="requote">Try again</button>`; }
}

function drawOptions() {
  const q = state.quote, opts = [...(q.pickup?.available ? [q.pickup.option] : []), ...q.options];
  state.option = cheapestTracked(q.options) || opts[0] || null;
  $("#options").innerHTML = (q.source === "estimate" ? `<p class="notice warn small"><strong>Estimate.</strong> Live courier rates aren't connected yet, so these prices are estimates, confirmed with you before dispatch.</p>` : "")
    + opts.map((o) => `<label class="choice"><input type="radio" name="ship" value="${esc(o.code)}"${o === state.option ? " checked" : ""}>
      <span class="grow"><b>${esc(o.label)}</b><small>${esc(o.code === "pickup" ? q.pickup.note : `${o.eta ? `Delivery in about ${o.eta}` : ""}${o.tracking ? " · tracked" : ""}${o.estimate ? " · estimate" : ""}`)}</small></span>
      <span class="amt">${o.price_inr === 0 ? "Free" : formatINR(o.price_inr)}</span></label>`).join("")
    + `<p class="small muted">Parcel: about ${esc(q.package?.chargeable_kg)} kg packed, securely boxed with corner guards and insured in transit.</p>`
    + `<button class="btn btn-solid" type="button" id="to-review">Continue</button>`;
  totals();
}

function review() {
  if (!state.option) return;
  state.reviewed = true;
  $("#review-step").hidden = false; step("review");
  $("#place").disabled = !state.open;
  $("#review-step").scrollIntoView({ block: "start" });
}

async function place() {
  const err = $("#place-err"); err.hidden = true;
  if (!$("#agree").checked) { err.textContent = "Please tick the box to confirm you have read the policies."; err.hidden = false; return; }
  setBusy($("#place"), true, "Placing your order");
  try {
    const o = state.option;
    const order = await api.placeOrder({ items: state.items.map((p) => p.id), addressId: state.address.id,
      shipping: { code: o.code, price_inr: o.price_inr, label: o.label, eta: o.eta, exp: o.exp, sig: o.sig },
      expectedSubtotal: state.subtotal, note: $("#note").value.trim() });
    clearCart(); cartChanged();
    location.href = `/order/${encodeURIComponent(order.order_no)}`;
  } catch (e) {
    err.textContent = friendly(e); err.hidden = false; setBusy($("#place"), false);
    if (["price_changed", "unavailable"].includes(e.code)) start();
    if (e.code === "shipping_quote_invalid") choose(state.address);
  }
}

async function start() {
  const session = await getSession();
  if (!session) {
    $("#notices").innerHTML = `<div class="panel center"><h2>Sign in to check out</h2><p>We'll email you a code: no password needed.
      Your cart is kept.</p><a class="btn btn-solid" href="${signInUrl("/checkout")}">Sign in</a></div>`;
    return;
  }
  const ids = readCart();
  if (!ids.length) {
    $("#notices").innerHTML = `<div class="empty"><h2>Your cart is empty</h2><p><a class="btn" href="/">Browse artworks for sale</a></p></div>`;
    return;
  }
  const [settings, products, addresses] = await Promise.all([api.settings(), api.products(ids), api.addresses()]);
  state.open = !!settings?.payments_open;
  const v = validateCart(ids, products);
  if (v.removed.length) { writeCart(v.items.map((p) => p.id)); cartChanged(); }
  state.items = v.items; state.subtotal = v.subtotal; state.addresses = addresses || [];
  $("#notices").innerHTML = (state.open ? "" : closedNotice())
    + (v.removed.length ? `<div class="notice warn"><p>Removed from your cart: ${v.removed.map((r) => esc(`${r.title || r.id} (${r.reason})`)).join(", ")}.</p></div>` : "");
  if (!state.items.length) return;
  $("#checkout").hidden = false; step("address");
  drawLines();
  state.address = state.addresses.find((a) => a.is_default) || (state.addresses.length === 1 ? state.addresses[0] : null);
  drawAddresses();
  if (state.address) choose(state.address);
}

document.addEventListener("change", (e) => {
  if (e.target.name === "country") {
    const abroad = e.target.value === "abroad";
    $("#abroad").hidden = !abroad;
    $("#address-step").hidden = abroad;
    $("#delivery-step").hidden = abroad || !state.address;
    $("#review-step").hidden = abroad || !state.reviewed;
  }
  if (e.target.name === "addr") choose(state.addresses.find((a) => a.id === e.target.value));
  if (e.target.name === "ship") {
    const q = state.quote;
    state.option = [...(q.pickup?.available ? [q.pickup.option] : []), ...q.options].find((o) => o.code === e.target.value);
    totals();
  }
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#add-address")) newAddress(true);
  if (e.target.closest("#to-review")) review();
  if (e.target.closest("#requote")) choose(state.address);
  if (e.target.closest("#place")) place();
});
start().catch((e) => { $("#notices").innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p></div>`; });
