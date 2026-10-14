import { api, friendly } from "../api.js";
import { readCart, removeFromCart, validateCart } from "../lib/cart.js";
import { $, esc, imgUrl, renderChrome, formatINR, sizeText, CATEGORY, closedNotice, cartChanged } from "../ui.js";

renderChrome("cart");

async function draw() {
  const ids = readCart();
  if (!ids.length) {
    $("#items").innerHTML = `<div class="empty"><h2>Your cart is empty</h2><p><a class="btn" href="/">Browse artworks for sale</a></p></div>`;
    $("#summary").hidden = true;
    return;
  }
  const [settings, products] = await Promise.all([api.settings(), api.products(ids)]);
  $("#notices").innerHTML = settings?.payments_open ? "" : closedNotice();
  const { items, removed, subtotal } = validateCart(ids, products);
  $("#items").innerHTML = items.map((p) => `<div class="line-item">
      <a href="/p/${encodeURIComponent(p.id)}"><img src="${imgUrl(p.id, true)}" alt="" loading="lazy"></a>
      <div><h3><a href="/p/${encodeURIComponent(p.id)}">${esc(p.title)}</a></h3>
        <span class="meta">${esc([CATEGORY[p.category], sizeText(p), p.cert].filter(Boolean).join(" · "))}</span><br>
        <button class="link small" data-remove="${esc(p.id)}">Remove</button></div>
      <span class="amt">${formatINR(p.price_inr)}</span></div>`).join("")
    + (removed.length ? `<div class="notice warn" id="removed"><p><strong>No longer available:</strong></p><ul>${removed.map((r) =>
      `<li>${esc(r.title || r.id)} — ${esc(r.reason)} <button class="link small" data-remove="${esc(r.id)}">Remove</button></li>`).join("")}</ul></div>` : "");
  $("#subtotal").textContent = formatINR(subtotal);
  $("#summary").hidden = !items.length;
  if (settings?.payments_open) $("#to-checkout").removeAttribute("aria-disabled");
  else $("#to-checkout").setAttribute("aria-disabled", "true");
}

$("#items").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]"); if (!b) return;
  removeFromCart(b.dataset.remove); cartChanged(); draw();
});
draw().catch((e) => { $("#items").innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p></div>`; });
