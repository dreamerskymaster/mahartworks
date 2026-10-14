import { api, friendly } from "../api.js";
import { readCart, addToCart } from "../lib/cart.js";
import { enquiryMailto } from "../lib/enquiry.js";
import { $, esc, imgUrl, artUrl, renderChrome, formatINR, sizeText, CATEGORY, closedNotice, cartChanged, toast } from "../ui.js";

renderChrome("shop");
const id = decodeURIComponent(location.pathname.replace(/^\/p\//, "").replace(/\/$/, ""));
const box = $("#product");

function view(p) {
  document.title = `${p.title} — Mahalakshmi Srikanth Shop`;
  document.querySelector('meta[name="description"]').content =
    `${p.title}: an original ${(CATEGORY[p.category] || "artwork").toLowerCase()} by Mahalakshmi Srikanth, Mumbai${p.price_inr ? `, ${formatINR(p.price_inr)}` : ""}.`;
  const facts = [["Type", CATEGORY[p.category]], ["Medium", p.medium], ["Size", sizeText(p)], ["Certificate", p.cert], ["Artwork ID", p.id]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  const inCart = readCart().includes(p.id);
  const buyable = p.status === "available" && p.for_sale;
  const state = p.status === "sold" ? `<p class="notice"><strong>Sold.</strong> This original has found its home. Similar work can be commissioned —
      <a href="mailto:mahasriphoto24@gmail.com">get in touch</a>.</p>`
    : p.status === "reserved" ? `<p class="notice warn"><strong>Reserved.</strong> Someone is paying for this piece right now. If they don't, it will be available again within two days.</p>` : "";
  box.innerHTML = `<article class="product">
    <div class="gallery-main"><img src="${imgUrl(p.id)}" alt="${esc(p.title)}" decoding="async" fetchpriority="high"></div>
    <div>
      <p class="eyebrow">${esc(CATEGORY[p.category] || "Original artwork")} · one of a kind</p>
      <h1>${esc(p.title)}</h1>
      <p class="bigprice" id="price">${p.status === "sold" ? "Sold" : formatINR(p.price_inr)}</p>
      <p class="small muted">Inclusive of all taxes. Shipping is calculated for your PIN code at checkout; free pickup in Mumbai.</p>
      <dl class="facts">${facts}</dl>
      ${state}
      ${buyable ? `<div class="actions">
        <button class="btn btn-solid" id="buy" type="button">Buy now</button>
        <button class="btn" id="add" type="button" ${inCart ? "hidden" : ""}>Add to cart</button>
        <a class="btn" id="in-cart" href="/cart" ${inCart ? "" : "hidden"}>In your cart · view</a>
      </div>` : ""}
      <p class="small muted" style="margin-top:1rem">Comes with a signed certificate of authenticity (${esc(p.cert || "issued on sale")}).
        <a href="${artUrl(p.id)}">See it in the gallery</a>.</p>
      <div class="abroad">
        <h2 class="h3">Buying from outside India?</h2>
        <p class="small">Online checkout is for delivery within India. From anywhere else, write to her: she will reply with the
          shipping cost and how to pay. Customs duties are paid by the buyer.</p>
        <a class="btn" id="enquire" href="${esc(enquiryMailto({ title: p.title, id: p.id, cert: p.cert }))}">✉ Enquire by email</a>
      </div>
    </div></article>`;
  $("#add")?.addEventListener("click", () => {
    addToCart(p.id); cartChanged(); toast("Added to your cart");
    $("#add").hidden = true; $("#in-cart").hidden = false;
  });
  $("#buy")?.addEventListener("click", () => { addToCart(p.id); cartChanged(); location.href = "/checkout"; });
}

try {
  const [settings, rows] = await Promise.all([api.settings(), api.products([id])]);
  if (!settings?.payments_open) $("#notices").innerHTML = closedNotice();
  const p = (rows || [])[0];
  if (p) view(p);
  else box.innerHTML = `<div class="empty"><h1>Not for sale online</h1>
    <p>This artwork isn't listed in the shop. You can still <a href="${artUrl(id)}">see it in the gallery</a> and ask about it:</p>
    <a class="btn" href="${esc(enquiryMailto({ title: id.replace(/-/g, " "), id }))}">✉ Enquire by email</a></div>`;
} catch (e) {
  box.innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p></div>`;
}
