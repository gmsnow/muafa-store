// Generates PWA icons from an inline SVG brand mark.
// Run: node scripts/generate-pwa-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const GREEN = "#16a34a";
const GREEN_DARK = "#15803d";

/** Shopping-bag mark centered inside a size x size canvas. */
function iconSvg({ size, maskable = false }) {
  const scale = size / 512;
  // Maskable icons need ~20% safe-zone padding on all sides.
  const pad = maskable ? 0.62 : 1;
  const cx = 256;
  const cy = maskable ? 268 : 256;
  const s = (v) => Math.round(v * scale * pad);
  const bodyW = s(240);
  const bodyH = s(190);
  const bodyX = Math.round(cx * scale - bodyW / 2);
  const bodyY = Math.round(cy * scale - bodyH / 2 + s(24));
  const handleR = s(58);
  const stroke = s(30);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${GREEN_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : Math.round(110 * scale)}" fill="url(#bg)"/>
  <path d="M ${Math.round(cx * scale - handleR)} ${bodyY} v ${-s(18)} a ${handleR} ${handleR} 0 0 1 ${handleR * 2} 0 v ${s(18)}"
        fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round"/>
  <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${s(34)}" fill="#ffffff"/>
  <circle cx="${Math.round(cx * scale)}" cy="${Math.round(bodyY + bodyH * 0.52)}" r="${s(22)}" fill="${GREEN}"/>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

for (const t of targets) {
  await sharp(Buffer.from(iconSvg(t))).png().toFile(path.join(outDir, t.file));
  console.log("wrote", t.file);
}
