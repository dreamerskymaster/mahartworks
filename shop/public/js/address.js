// The delivery address form (account page and checkout). Addresses are India-only; buyers abroad enquire by email.
import { api, friendly } from "./api.js";
import { isValidPin, cleanPin } from "./lib/pin.js";
import { $, esc, setBusy } from "./ui.js";

export const STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
export const PHONE = /^\+?[0-9][0-9 -]{8,16}[0-9]$/;

export const addressText = (a) => [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.pin}`, `Phone ${a.phone}`]
  .filter(Boolean).map(esc).join("<br>");

/** Renders the form into `box`; resolves with the saved address, or null if cancelled. */
export function addressForm(box, a = {}, { cancel = true } = {}) {
  box.innerHTML = `<form class="addr-form" novalidate>
    <div class="grid2">
      <label class="field"><span>Full name</span><input name="name" autocomplete="name" required value="${esc(a.name)}"></label>
      <label class="field"><span>Phone (for the courier)</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required value="${esc(a.phone)}" placeholder="98765 43210"></label>
    </div>
    <label class="field"><span>House / flat, building, street</span><input name="line1" autocomplete="address-line1" required value="${esc(a.line1)}"></label>
    <label class="field"><span>Area, landmark (optional)</span><input name="line2" autocomplete="address-line2" value="${esc(a.line2)}"></label>
    <div class="grid2">
      <label class="field"><span>PIN code</span><input name="pin" inputmode="numeric" autocomplete="postal-code" maxlength="6" required value="${esc(a.pin)}"></label>
      <label class="field"><span>City</span><input name="city" autocomplete="address-level2" required value="${esc(a.city)}"></label>
    </div>
    <label class="field"><span>State</span><select name="state" autocomplete="address-level1" required>
      <option value="">Choose…</option>${STATES.map((s) => `<option${s === (a.state || "") ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="check field"><input type="checkbox" name="is_default"${a.is_default ? " checked" : ""}> Use as my default address</label>
    <p class="err" role="alert" hidden></p>
    <div class="actions"><button class="btn btn-solid" type="submit">Save address</button>${cancel ? '<button class="btn" type="button" data-cancel>Cancel</button>' : ""}</div>
  </form>`;
  const f = $("form", box), err = $(".err", f);
  return new Promise((resolve) => {
    f.querySelector("[data-cancel]")?.addEventListener("click", () => { box.innerHTML = ""; resolve(null); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      v.pin = cleanPin(v.pin); v.is_default = f.elements.namedItem("is_default").checked;
      const problem = !v.name.trim() ? "Please enter the name for delivery." : !PHONE.test(v.phone.trim()) ? "Please enter a 10-digit phone number."
        : !v.line1.trim() ? "Please enter the address." : !isValidPin(v.pin) ? "Please enter a 6-digit PIN code."
        : !v.city.trim() ? "Please enter the city." : !v.state ? "Please choose the state." : "";
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      const btn = f.querySelector('[type="submit"]');
      setBusy(btn, true, "Saving");
      try { const saved = await api.saveAddress({ ...v, id: a.id || null, country: "IN" }); resolve(saved); }
      catch (ex) { err.textContent = friendly(ex); err.hidden = false; setBusy(btn, false); }
    });
  });
}
