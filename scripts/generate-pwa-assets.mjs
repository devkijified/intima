/**
 * Generates PWA PNG assets from the SVG masters at build time.
 * Runs via `npm run prebuild` so Vercel always ships fresh icons/splashes.
 * Binary PNGs are never committed; push_files can't carry them anyway.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const splashDir = join(root, 'public', 'splash');
mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

const ICON = join(iconsDir, 'icon.svg');
const MASKABLE = join(iconsDir, 'maskable.svg');

async function png(src, out, size, opts = {}) {
  await sharp(src, { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, ...opts })
    .png()
    .toFile(out);
  console.log('  wrote', out);
}

// Splash: burgundy backdrop, gold monogram, wordmark. Rendered per-size.
function splashSvg(w, h) {
  const s = Math.min(w, h) / 512; // scale factor
  const fs = Math.round(120 * s);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#C22A57"/><stop offset="1" stop-color="#8F1D40"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <text x="${w / 2}" y="${h / 2 - 10 * s}" font-family="Georgia, serif" font-size="${fs}" font-weight="bold" fill="#C9A84C" text-anchor="middle">I</text>
  <text x="${w / 2}" y="${h / 2 + 60 * s}" font-family="Georgia, serif" font-size="${Math.round(44 * s)}" fill="#FDF9F6" text-anchor="middle" letter-spacing="${Math.round(8 * s)}">INTIMA</text>
  <text x="${w / 2}" y="${h / 2 + 104 * s}" font-family="Georgia, serif" font-size="${Math.round(22 * s)}" font-style="italic" fill="#FDF9F6" opacity="0.75" text-anchor="middle">Where Elegance Meets Connection</text>
</svg>`;
}

// iOS splash sizes (portrait). Covers modern iPhones.
const SPLASHES = [
  [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
  [1125, 2436], [1242, 2688], [828, 1792], [750, 1334],
];

console.log('Generating PWA assets…');
await png(ICON, join(iconsDir, 'icon-192.png'), 192);
await png(ICON, join(iconsDir, 'icon-512.png'), 512);
await png(ICON, join(iconsDir, 'apple-touch-icon.png'), 180);
await png(MASKABLE, join(iconsDir, 'maskable-512.png'), 512);

for (const [w, h] of SPLASHES) {
  const out = join(splashDir, `splash-${w}x${h}.png`);
  await sharp(Buffer.from(splashSvg(w, h)), { density: 150 }).png().toFile(out);
  console.log('  wrote', out);
}
console.log('PWA assets done.');
