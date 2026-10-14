// Indian PIN codes (6 digits, never starting with 0) and the free-pickup rule.

export const DEFAULT_PICKUP_PREFIXES = ["400"];   // Mumbai city. Add "401", "421" in admin for the wider MMR.

export const cleanPin = (pin) => String(pin ?? "").replace(/\s/g, "");
export const isValidPin = (pin) => /^[1-9]\d{5}$/.test(cleanPin(pin));

/** True when the PIN starts with one of the pickup prefixes (free local pickup, shipping ₹0). */
export function isPickupPin(pin, prefixes = DEFAULT_PICKUP_PREFIXES) {
  const p = cleanPin(pin);
  if (!isValidPin(p)) return false;
  return (prefixes || []).map((x) => String(x).trim()).filter(Boolean).some((x) => p.startsWith(x));
}

/** Postal circle by the first two digits (good enough for a distance band, not an address check). */
const CIRCLES = [
  [11, 11, "Delhi"], [12, 13, "Haryana"], [14, 16, "Punjab"], [17, 17, "Himachal Pradesh"], [18, 19, "Jammu & Kashmir"],
  [20, 28, "Uttar Pradesh"], [30, 34, "Rajasthan"], [36, 39, "Gujarat"], [40, 44, "Maharashtra"], [45, 48, "Madhya Pradesh"],
  [49, 49, "Chhattisgarh"], [50, 50, "Telangana"], [51, 53, "Andhra Pradesh"], [56, 59, "Karnataka"], [60, 66, "Tamil Nadu"],
  [67, 69, "Kerala"], [70, 74, "West Bengal"], [75, 77, "Odisha"], [78, 78, "Assam"], [79, 79, "North East"],
  [80, 85, "Bihar & Jharkhand"], [90, 99, "Army Post Office"],
];
export function circleOf(pin) {
  const p = cleanPin(pin);
  if (!isValidPin(p)) return null;
  const n = +p.slice(0, 2);
  return (CIRCLES.find(([a, b]) => n >= a && n <= b) || [0, 0, "India"])[2];
}

/**
 * Distance band from the pickup PIN to the buyer's PIN, used by the estimate table:
 * local (same 3-digit sorting district), state (same circle), zone (same first digit or a neighbouring zone),
 * national, remote (North East, J&K, Andaman & Nicobar, Lakshadweep, Army Post Office).
 */
const NEIGHBOURS = { 1: [2, 3], 2: [1, 4, 8], 3: [1, 4], 4: [3, 5, 2], 5: [4, 6], 6: [5], 7: [8], 8: [7, 2] };
export function distanceBand(fromPin, toPin) {
  const a = cleanPin(fromPin), b = cleanPin(toPin);
  if (!isValidPin(a) || !isValidPin(b)) return null;
  if (/^(18|19|78|79|744|682555|9)/.test(b)) return "remote";
  if (a.slice(0, 3) === b.slice(0, 3)) return "local";
  if (circleOf(a) === circleOf(b)) return "state";
  if (a[0] === b[0] || (NEIGHBOURS[a[0]] || []).includes(+b[0])) return "zone";
  return "national";
}
