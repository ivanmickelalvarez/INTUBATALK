import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/icons/icon.svg');
const icons = path.join(root, 'public/icons');

await sharp(source).resize(512, 512).png().toFile(path.join(icons, 'icon-512.png'));

const safeLogo = await sharp(source)
  .resize(410, 410, { fit: 'contain' })
  .png()
  .toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0d1218' } })
  .composite([{ input: safeLogo, gravity: 'center' }])
  .png()
  .toFile(path.join(icons, 'icon-maskable-512.png'));

process.stdout.write('MOBILE_ICONS_OK 512x512\n');
