import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/icons/icon.svg');
const icons = path.join(root, 'public/icons');
const icoOut = path.join(root, 'app.ico');

// Backing color matches the tile's mid tone so the shrunk tile blends seamlessly
// into the maskable/apple safety zone (rounded corners of the tile never reach
// the pointer-safe mask circle anyway, but a matching hue avoids any visible edge).
const BACKING = '#f1ebe1';

const render = async (size) => await sharp(source).resize(size, size).png().toBuffer();

// PWA any-purpose icon
await render(512).then((b) => sharp(b).toFile(path.join(icons, 'icon-512.png')));

// Maskable: shrink to 80% the render keeps the full tile glyph inside the
// 80% content-safe circle, backing color hides the squarish tile edges.
const compositeOnBacking = async (size, shrink) => {
  const inner = await render(shrink);
  return sharp({ create: { width: size, height: size, channels: 4, background: BACKING } })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toBuffer();
};

await compositeOnBacking(512, 410).then((b) => sharp(b).toFile(path.join(icons, 'icon-maskable-512.png')));
await compositeOnBacking(180, 144).then((b) => sharp(b).toFile(path.join(icons, 'apple-touch-icon.png')));

// Windows .ico (DIB/BMP entries for every size — the C# compiler's /win32icon
// parser expects the classic BMP-style entries rather than PNG-compressed ones).
const sizes = [16, 24, 32, 48, 64, 128, 256];

const dibEntry = async (size) => {
  const png = await render(size);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  // Convert top-down RGBA to bottom-up BGRA
  const { width, height } = info;
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((height - 1 - y) * width + x) * 4;
      const dst = (y * width + x) * 4;
      px[dst] = data[src + 2];
      px[dst + 1] = data[src + 1];
      px[dst + 2] = data[src];
      px[dst + 3] = data[src + 3];
    }
  }
  // BITMAPINFOHEADER, biHeight doubled (XOR + AND stride convention for ICO DIBs)
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8);
  header.writeUInt16LE(1, 12);  // planes
  header.writeUInt16LE(32, 14); // bpp
  header.writeUInt32LE(0, 16);  // compression: BI_RGB
  header.writeUInt32LE(px.length, 20);
  const andStride = Math.ceil(width / 32) * 4;
  const and = Buffer.alloc(andStride * height); // all opaque
  return Buffer.concat([header, px, and]);
};

const entries = [];
for (const s of sizes) entries.push({ size: s, data: await dibEntry(s) });

const count = entries.length;
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(count, 4);

let offset = 6 + count * 16;
const table = [];
for (const e of entries) {
  const row = Buffer.alloc(16);
  row.writeUInt8(e.size === 256 ? 0 : e.size, 0); // width (0 = 256)
  row.writeUInt8(e.size === 256 ? 0 : e.size, 1); // height
  row.writeUInt8(0, 2); // palette
  row.writeUInt8(0, 3); // reserved
  row.writeUInt16LE(1, 4);  // planes
  row.writeUInt16LE(32, 6); // bpp
  row.writeUInt32LE(e.data.length, 8);
  row.writeUInt32LE(offset, 12);
  offset += e.data.length;
  table.push(row);
}

fs.writeFileSync(icoOut, Buffer.concat([dir, ...table, ...entries.map((e) => e.data)]));
process.stdout.write(`MOBILE_ICONS_OK 512x512 maskable apple-touch ${sizes.join('/')} ico\n`);
