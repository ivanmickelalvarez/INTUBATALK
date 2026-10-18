const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

test('manifest mobile icons exist as 512px PNGs with the correct purpose', async () => {
  const icons = new Map(manifest.icons.map((icon) => [icon.src, icon]));
  for (const [src, purpose] of [
    ['/icons/icon-512.png', 'any'],
    ['/icons/icon-maskable-512.png', 'maskable'],
  ]) {
    const icon = icons.get(src);
    assert.ok(icon, `manifest must include ${src}`);
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.sizes, '512x512');
    assert.equal(icon.purpose, purpose);
    const metadata = await sharp(path.join(root, 'public', src.slice(1))).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.match(serviceWorker, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(serviceWorker, /intubatalk-v\d+/);
});

test('manifest provides an Android shortcut to the nurse dashboard with installable icons', () => {
  const nurseShortcut = manifest.shortcuts.find((shortcut) => shortcut.url === '/nurse');
  assert.ok(nurseShortcut, 'manifest must keep the nurse dashboard shortcut');
  assert.ok(nurseShortcut.icons?.some((icon) => icon.src === '/icons/icon-512.png'), 'Bubblewrap requires a shortcut icon');
});
