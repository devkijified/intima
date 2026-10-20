/**
 * Restores PWA PNG assets from base64 chunks at build time.
 * Runs via `npm run prebuild`. Zero dependencies: PNGs ship as base64
 * JSON (push_files can't carry binary), decoded here with plain Node.
 */
const { readFileSync, writeFileSync, mkdirSync, readdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const root = join(__dirname, '..');
const chunksDir = join(root, 'assets-b64');

const DEST = {
  'icon-192.png': join('public', 'icons', 'icon-192.png'),
  'icon-512.png': join('public', 'icons', 'icon-512.png'),
  'apple-touch-icon.png': join('public', 'icons', 'apple-touch-icon.png'),
  'maskable-512.png': join('public', 'icons', 'maskable-512.png'),
};

for (const f of readdirSync(chunksDir)) {
  if (!f.endsWith('.json')) continue;
  const chunk = JSON.parse(readFileSync(join(chunksDir, f), 'utf8'));
  for (const [name, b64] of Object.entries(chunk)) {
    const dest = DEST[name] || join('public', 'splash', name);
    const full = join(root, dest);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(b64, 'base64'));
    console.log('  restored', dest);
  }
}
console.log('PWA assets restored.');
