import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readAppOrigin } = require('./lib/app-origin.cjs');
const { getBubblewrapUpdateArgs, validateTwaManifest } = require('./lib/android-twa.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android-twa');
const manifestPath = path.join(androidDir, 'twa-manifest.json');
const origin = readAppOrigin(path.join(root, 'app-origin.txt'));

if (fs.existsSync(manifestPath)) {
  throw new Error('android-twa already has a TWA manifest. Use the existing project instead of initializing over it.');
}

const bubblewrap = path.join(root, 'node_modules', '@bubblewrap', 'cli', 'bin', 'bubblewrap.js');
const init = spawnSync(process.execPath, [bubblewrap, 'init', `--manifest=${new URL('/manifest.webmanifest', origin)}`, `--directory=${androidDir}`], {
  cwd: root,
  stdio: 'inherit',
});
if (init.error) throw init.error;
if (init.status !== 0) process.exit(init.status ?? 1);
if (!fs.existsSync(manifestPath)) throw new Error('Bubblewrap completed without creating twa-manifest.json.');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const signingKeyPath = path.join(os.homedir(), '.intubatalk', 'android-release.keystore');
const createdKeyPath = path.resolve(manifest.signingKey?.path ?? '');
if (!fs.existsSync(createdKeyPath)) {
  throw new Error(`Signing keystore was not created at the configured path: ${createdKeyPath}. Re-run init and create the persistent key.`);
}
if (path.resolve(createdKeyPath).toLowerCase() !== path.resolve(signingKeyPath).toLowerCase()) {
  fs.mkdirSync(path.dirname(signingKeyPath), { recursive: true });
  if (fs.existsSync(signingKeyPath)) {
    throw new Error(`A persistent signing key already exists at ${signingKeyPath}; refusing to replace it.`);
  }
  fs.copyFileSync(createdKeyPath, signingKeyPath, fs.constants.COPYFILE_EXCL);
  fs.unlinkSync(createdKeyPath);
}

manifest.host = origin.host;
manifest.startUrl = '/';
manifest.name = 'INTUBATALK';
manifest.launcherName = 'INTUBATALK';
manifest.packageId = 'com.intubatalk.mobile';
manifest.appVersion = '1.0.0';
manifest.appVersionCode = 1;
manifest.display = 'fullscreen';
manifest.orientation = 'any';
manifest.minSdkVersion = 24;
manifest.features = {
  ...manifest.features,
  playBilling: { ...manifest.features?.playBilling, enabled: false },
};
manifest.webManifestUrl = new URL('/manifest.webmanifest', origin).toString();
manifest.signingKey = { path: signingKeyPath, alias: manifest.signingKey?.alias || 'intubatalk' };
manifest.shortcuts = [
  {
    name: 'Patient tablet',
    shortName: 'Patient',
    url: new URL('/', origin).toString(),
    chosenIconUrl: new URL('/icons/icon-512.png', origin).toString(),
  },
  {
    name: 'Nurse dashboard',
    shortName: 'Nurse',
    url: new URL('/nurse', origin).toString(),
    chosenIconUrl: new URL('/icons/icon-512.png', origin).toString(),
  },
];
validateTwaManifest(manifest, origin);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const update = spawnSync(process.execPath, [bubblewrap, ...getBubblewrapUpdateArgs(androidDir)], {
  cwd: androidDir,
  stdio: 'inherit',
});
if (update.error) throw update.error;
if (update.status !== 0) process.exit(update.status ?? 1);
process.stdout.write(`ANDROID_TWA_INITIALIZED ${androidDir}\n`);
