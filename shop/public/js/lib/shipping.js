// Parcel size and the fallback shipping estimate, used by /api/shipping-quote. When the Shiprocket account is
// connected, real courier prices replace the estimate.
import { distanceBand, isValidPin } from "./pin.js";

// When she hasn't entered a size or weight yet: a small framed piece.
export const DEFAULT_ITEM = { width_cm: 30, height_cm: 40, depth_cm: 3, weight_kg: 1 };

/**
 * Packed parcel for one or more artworks: rigid box, corner guards and bubble wrap add 8 cm to each side,
 * 6 cm of depth and 15% + 0.6 kg of weight. Couriers charge the larger of actual and volumetric weight
 * (L × B × H / 5000, the usual Indian courier rule), rounded up to the next 0.5 kg.
 */
export function packageFor(items) {
  const list = (items && items.length ? items : [{}]).map((p) => ({
    w: Number(p.width_cm) || DEFAULT_ITEM.width_cm, h: Number(p.height_cm) || DEFAULT_ITEM.height_cm,
    d: Number(p.depth_cm) || DEFAULT_ITEM.depth_cm, kg: Number(p.weight_kg) || DEFAULT_ITEM.weight_kg,
  }));
  const length = Math.ceil(Math.max(...list.map((x) => Math.max(x.w, x.h))) + 8);
  const breadth = Math.ceil(Math.max(...list.map((x) => Math.min(x.w, x.h))) + 8);
  const height = Math.ceil(list.reduce((s, x) => s + x.d, 0) + 6);
  const actual = list.reduce((s, x) => s + x.kg, 0) * 1.15 + 0.6;
  const volumetric = (length * breadth * height) / 5000;
  const chargeable = Math.ceil(Math.max(actual, volumetric) * 2) / 2;
  return { length, breadth, height, weight_kg: Math.round(actual * 100) / 100,
    volumetric_kg: Math.round(volumetric * 100) / 100, chargeable_kg: chargeable };
}

// India Post Speed Post–style slabs by distance band, with transit insurance for the artwork. A little
// generous on purpose: it is an estimate, confirmed before dispatch.
export const ESTIMATE_TABLE = {
  //          first 500 g, each extra 500 g, delivery days
  local:    { first: 70,  extra: 30, days: [1, 3] },
  state:    { first: 90,  extra: 40, days: [2, 4] },
  zone:     { first: 120, extra: 55, days: [3, 5] },
  national: { first: 140, extra: 65, days: [4, 7] },
  remote:   { first: 170, extra: 80, days: [6, 10] },
};
export const EXPRESS_FACTOR = 1.8;   // air courier, roughly
export const insuranceFor = (declared) => Math.max(50, Math.ceil((Number(declared) || 0) * 0.01));
const up10 = (n) => Math.ceil(n / 10) * 10;

/** Two estimated options (surface Speed Post, express air) for a PIN, parcel weight and declared value. */
export function estimateOptions({ fromPin, toPin, chargeableKg, declared }) {
  if (!isValidPin(fromPin) || !isValidPin(toPin)) throw new Error("bad PIN");
  const band = distanceBand(fromPin, toPin);
  const t = ESTIMATE_TABLE[band];
  const extraSlabs = Math.max(0, Math.ceil((Number(chargeableKg) || 0.5) / 0.5) - 1);
  const base = t.first + extraSlabs * t.extra;
  const ins = insuranceFor(declared);
  return [
    { code: "est:speed-post", label: "India Post Speed Post", price_inr: up10(base + ins),
      eta: `${t.days[0]}–${t.days[1]} days`, tracking: true, estimate: true, band },
    { code: "est:express", label: "Express courier (air)", price_inr: up10(base * EXPRESS_FACTOR + ins),
      eta: `${Math.max(1, t.days[0] - 1)}–${Math.max(2, t.days[1] - 2)} days`, tracking: true, estimate: true, band },
  ];
}

/** Cheapest option that has tracking: the default choice. */
export const cheapestTracked = (options) =>
  [...(options || [])].filter((o) => o.tracking !== false).sort((a, b) => a.price_inr - b.price_inr)[0] || null;
