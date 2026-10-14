import { api, getSession, signOut, friendly } from "../api.js";
import { addressForm, addressText, PHONE } from "../address.js";
import { statusChip } from "../orderview.js";
import { $, esc, renderChrome, formatINR, fmtDate, signInUrl, toast } from "../ui.js";

renderChrome("account");
let addresses = [];

function drawAddresses() {
  $("#addresses").innerHTML = addresses.length ? addresses.map((a) => `<div class="addr">${a.is_default ? '<span class="status">Default</span><br>' : ""}${addressText(a)}
    <div class="actions"><button class="btn btn-small" data-edit="${esc(a.id)}">Edit</button><button class="btn btn-small btn-danger" data-del="${esc(a.id)}">Delete</button></div></div>`).join("")
    : '<p class="muted small">No saved addresses yet.</p>';
}
async function edit(a = {}) {
  $("#add-address").hidden = true;
  const saved = await addressForm($("#address-form"), a);
  $("#add-address").hidden = false; $("#address-form").innerHTML = "";
  if (saved) { addresses = await api.addresses(); drawAddresses(); toast("Address saved"); }
}

async function start() {
  const s = await getSession();
  if (!s) { location.replace(signInUrl("/account")); return; }
  $("#who").textContent = s.user?.email || "";
  const [profile, list, orders, admin] = await Promise.all([api.profile(), api.addresses(), api.myOrders(), api.isAdmin().catch(() => false)]);
  const pf = $("#profile").elements;
  pf.namedItem("name").value = profile?.name || ""; pf.namedItem("phone").value = profile?.phone || "";
  addresses = list || []; drawAddresses();
  $("#orders").innerHTML = orders?.length ? orders.map((o) => `<a class="order-row" href="/order/${encodeURIComponent(o.order_no)}">
      <span><b>${esc(o.order_no)}</b><br><span class="small muted">${esc(fmtDate(o.created_at))} · ${esc(o.items.map((i) => i.title).join(", "))}</span></span>
      <span class="center">${statusChip(o.status)}<br><b>${formatINR(o.total_inr)}</b></span></a>`).join("")
    : '<p class="muted">No orders yet. <a href="/">Browse artworks for sale</a>.</p>';
  $("#admin-link").hidden = !admin;
  $("#account").hidden = false;
}

$("#profile").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, err = f.querySelector(".err"), phone = f.elements.namedItem("phone").value.trim();
  err.hidden = true;
  if (phone && !PHONE.test(phone)) { err.textContent = "Please enter a 10-digit phone number."; err.hidden = false; return; }
  try { await api.saveProfile(f.elements.namedItem("name").value.trim(), phone); toast("Saved"); } catch (ex) { err.textContent = friendly(ex); err.hidden = false; }
});
$("#addresses").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) edit(addresses.find((a) => a.id === ed.dataset.edit));
  if (del && confirm("Delete this address?")) { await api.deleteAddress(del.dataset.del); addresses = await api.addresses(); drawAddresses(); }
});
$("#add-address").addEventListener("click", () => edit());
$("#signout").addEventListener("click", async () => { await signOut(); location.href = "/"; });
start().catch((e) => { $("#notices").innerHTML = `<div class="notice bad"><p>${esc(friendly(e))}</p></div>`; });
