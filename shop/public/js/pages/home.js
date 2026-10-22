import { api, friendly } from "../api.js";
import { MAIN_SITE } from "../config.js";
import { $, esc, imgUrl, renderChrome, formatINR, sizeText, CATEGORY, closedNotice } from "../ui.js";

renderChrome("shop");
let all = [], cat = "all";

function card(p) {
  const tag = p.status === "sold" ? '<span class="tag sold">Sold</span>' : p.status === "reserved" ? '<span class="tag reserved">Reserved</span>' : "";
  const meta = [CATEGORY[p.category] || "", sizeText(p)].filter(Boolean).join(" · ");
  return `<a class="card" href="/p/${encodeURIComponent(p.id)}" data-id="${esc(p.id)}">
    <div class="ph"><img src="${imgUrl(p.id, true)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>
    ${tag}
    <div class="info"><h3>${esc(p.title)}</h3><span class="meta">${esc(meta)}</span>
      <span class="price">${p.status === "sold" ? "Sold" : formatINR(p.price_inr)}</span></div></a>`;
}

function render() {
  const list = all.filter((p) => cat === "all" || p.category === cat);
  $("#products").innerHTML = list.length ? list.map(card).join("") : `<div class="empty" style="grid-column:1/-1">
    <h2>Nothing is for sale just yet</h2>
    <p>New pieces are added here as they become available. Meanwhile, enjoy the <a href="${MAIN_SITE}/">full gallery</a>,
      or write to <a href="mailto:mahasriphoto24@gmail.com">mahasriphoto24@gmail.com</a> about any artwork or a commission.</p></div>`;
}

function chips() {
  const cats = [...new Set(all.map((p) => p.category))];
  if (cats.length < 2) return;
  $("#toolbar").hidden = false;
  $("#chips").innerHTML = [["all", "All"], ...cats.map((c) => [c, CATEGORY[c] || c])].map(([k, l]) =>
    `<button type="button" data-cat="${esc(k)}" aria-pressed="${k === cat}">${esc(l)}</button>`).join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    cat = b.dataset.cat;
    $("#chips").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
}

try {
  const [settings, products] = await Promise.all([api.settings(), api.products()]);
  if (!settings?.payments_open) $("#notices").innerHTML = closedNotice();
  all = products || [];
  chips(); render();
} catch (e) {
  $("#notices").innerHTML = closedNotice();
  $("#products").innerHTML = `<div class="notice bad" style="grid-column:1/-1"><p>${esc(friendly(e))}</p></div>`;
}
