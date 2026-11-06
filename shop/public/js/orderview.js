// Order pieces shared by the buyer's order page and the admin order detail.
import { timeline, statusLabel, STATUSES } from "./lib/order.js";
import { esc, imgUrl, formatINR, fmtDateTime } from "./ui.js";

export const statusChip = (s) => `<span class="status ${esc(s)}">${esc(statusLabel(s))}</span>`;

export function timelineHtml(order) {
  const when = { awaiting_payment: order.created_at, payment_submitted: order.payment_submitted_at, paid: order.paid_at,
    shipped: order.shipped_at, delivered: order.delivered_at, cancelled: order.cancelled_at };
  const label = (s) => s === "delivered" && order.pickup ? "Collected" : statusLabel(s);
  return `<ol class="timeline" aria-label="Order progress">${timeline(order).map((t) => `<li class="${t.state}"${t.state === "current" ? ' aria-current="step"' : ""}>
    ${esc(label(t.status))}${when[t.status] && t.state !== "upcoming" ? `<time datetime="${esc(when[t.status])}">${esc(fmtDateTime(when[t.status]))}</time>` : ""}</li>`).join("")}</ol>`;
}

export function eventsHtml(order) {
  return `<details><summary class="small">History (${order.events.length})</summary><ul class="small muted">${order.events.map((e) =>
    `<li>${esc(fmtDateTime(e.at))} · ${esc(e.by)}${e.status ? ` · ${esc(statusLabel(e.status))}` : ""}${e.note ? ` — ${esc(e.note)}` : ""}</li>`).join("")}</ul></details>`;
}

export function itemsHtml(order) {
  return order.items.map((i) => `<div class="line-item"><a href="/p/${encodeURIComponent(i.id)}"><img src="${imgUrl(i.id, true)}" alt="" loading="lazy"></a>
    <div><h3>${esc(i.title)}</h3><span class="meta">${esc([i.cert, i.medium].filter(Boolean).join(" · "))}</span></div>
    <span class="amt">${formatINR(i.price_inr)}</span></div>`).join("")
    + `<div class="totals"><div><span>Artworks</span><b>${formatINR(order.subtotal_inr)}</b></div>
      <div><span>${esc(order.pickup ? "Pickup in Mumbai" : order.shipping_label || "Shipping")}</span><b>${order.shipping_inr ? formatINR(order.shipping_inr) : "Free"}</b></div>
      <div class="grand"><span>Total</span><b>${formatINR(order.total_inr)}</b></div></div>`;
}

export function shipToHtml(order) {
  const a = order.ship_to || {};
  return [a.name, a.line1, a.line2, [a.city, a.state, a.pin].filter(Boolean).join(", "), a.phone && `Phone ${a.phone}`]
    .filter(Boolean).map(esc).join("<br>");
}

export const buyerMessage = (s) => STATUSES[s]?.buyer || "";
