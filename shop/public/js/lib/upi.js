// UPI payment links (NPCI "upi://pay" deep links). Opening one on a phone offers GPay, PhonePe, Paytm, BHIM
// or the bank's own app, with the payee, amount and note already filled in. Nothing here moves money:
// she confirms each payment in her bank app and marks the order paid by hand.
import { upiAmount } from "./money.js";

export const isValidVpa = (vpa) => /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(String(vpa ?? "").trim());

/** UTR / UPI reference number: 12 digits. Spaces people copy along with it are ignored. */
export const cleanUtr = (utr) => String(utr ?? "").replace(/\s/g, "");
export const isValidUtr = (utr) => /^\d{12}$/.test(cleanUtr(utr));

// encodeURIComponent, plus the few characters it leaves alone that some UPI apps choke on.
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * upi://pay?pa=<VPA>&pn=<payee>&am=<amount>&cu=INR&tn=<order no>
 * The note (tn) is the order number, so the payment shows it in her bank app's history.
 */
export function buildUpiLink({ vpa, payee = "Mahalakshmi Srikanth", amount, orderNo }) {
  if (!isValidVpa(vpa)) throw new Error("A valid UPI ID is needed");
  if (!orderNo) throw new Error("The order number is needed");
  const parts = [["pa", String(vpa).trim()], ["pn", payee], ["am", upiAmount(amount)], ["cu", "INR"], ["tn", orderNo]];
  return "upi://pay?" + parts.map(([k, v]) => `${k}=${k === "pa" ? v : enc(v)}`).join("&");
}
