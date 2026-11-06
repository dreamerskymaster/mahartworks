// Rupee amounts. Prices are whole rupees everywhere (the database stores integers).

/** "₹12,500" with Indian digit grouping (12,50,000 for twelve lakh). */
export function formatINR(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return "";
  const neg = v < 0, s = String(Math.abs(v));
  const head = s.slice(0, -3), tail = s.slice(-3);
  const grouped = head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + tail : tail;
  return (neg ? "−₹" : "₹") + grouped;
}

/** The `am` value of a UPI link: rupees with exactly two decimals, no grouping ("12500.00"). */
export function upiAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) throw new Error("UPI amount must be a positive number");
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Parse what she types in the admin price box: "12,500", "₹ 12500", "12500.00" -> 12500; "" -> null. */
export function parsePrice(text) {
  const t = String(text ?? "").replace(/[₹,\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t));
}
