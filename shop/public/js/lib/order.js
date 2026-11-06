// Order numbers and statuses (the database writes them; the browser only checks and shows them).

/** MSA-<year>-<5+ digit sequence>, e.g. MSA-2026-00012 (year in India time). */
export const ORDER_NO = /^MSA-\d{4}-\d{5,}$/;
export const isOrderNo = (s) => ORDER_NO.test(String(s ?? ""));
export function formatOrderNo(year, seq) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("bad year");
  if (!Number.isInteger(seq) || seq < 1) throw new Error("bad sequence");
  return `MSA-${year}-${String(seq).padStart(5, "0")}`;
}

/** Statuses in the order they happen, with what the buyer sees. */
export const STATUSES = {
  awaiting_payment: { label: "Awaiting payment", buyer: "Pay by UPI, then enter the 12-digit reference number." },
  payment_submitted: { label: "Payment being checked", buyer: "Thank you! The artist is confirming your payment with her bank." },
  paid: { label: "Paid", buyer: "Payment confirmed. Your artwork is being carefully packed." },
  shipped: { label: "Shipped", buyer: "On its way. Use the tracking number to follow it." },
  delivered: { label: "Delivered", buyer: "Delivered. We hope you love it!" },
  cancelled: { label: "Cancelled", buyer: "This order was cancelled." },
};
export const statusLabel = (s) => STATUSES[s]?.label || s;

/** Timeline steps for an order: done / current / upcoming. Pickup orders have no "shipped" step. */
export function timeline(order) {
  if (!order) return [];
  const steps = order.pickup
    ? ["awaiting_payment", "payment_submitted", "paid", "delivered"]
    : ["awaiting_payment", "payment_submitted", "paid", "shipped", "delivered"];
  if (order.status === "cancelled") {
    const reached = new Set((order.events || []).map((e) => e.status));
    return [...steps.filter((s) => reached.has(s)).map((s) => ({ status: s, state: "done" })), { status: "cancelled", state: "current" }];
  }
  const at = steps.indexOf(order.status);
  return steps.map((s, i) => ({ status: s, state: i < at ? "done" : i === at ? "current" : "upcoming" }));
}
