// QR code as inline SVG, drawn locally (vendored MIT encoder; no image service sees the payment details).
import { QrCode } from "../vendor/qrcodegen.js";

export function qrSvg(text, label = "QR code") {
  const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
  const n = qr.size, q = 2, d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.getModule(x, y)) d.push(`M${x + q},${y + q}h1v1h-1z`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" role="img" aria-label="${label.replace(/"/g, "&quot;")}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d.join("")}" fill="#000"/></svg>`;
}
