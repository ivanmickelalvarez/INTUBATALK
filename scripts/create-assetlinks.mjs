import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAssetLinks } = require('./lib/assetlinks.cjs');
const fingerprint = process.argv[2];
if (!fingerprint) throw new Error('Usage: node scripts/create-assetlinks.mjs <SHA256-certificate-fingerprint>');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public/.well-known/assetlinks.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(createAssetLinks('com.intubatalk.mobile', fingerprint), null, 2)}\n`);
process.stdout.write(`ASSETLINKS_WRITTEN ${destination}\n`);
