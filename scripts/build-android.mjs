import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readAppOrigin } = require('./lib/app-origin.cjs');
const { getBubblewrapBuildArgs, validateTwaManifest } = require('./lib/android-twa.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android-twa');
const manifestPath = path.join(androidDir, 'twa-manifest.json');
const origin = readAppOrigin(path.join(root, 'app-origin.txt'));
if (!fs.existsSync(manifestPath)) throw new Error('Android TWA project is missing. Run npm run android:init after the shared site is published.');

const twaManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
validateTwaManifest(twaManifest, origin);
if (!twaManifest.signingKey?.path || !fs.existsSync(twaManifest.signingKey.path)) {
  throw new Error('Persistent Android signing keystore is missing. Restore the owner-held keystore before building updates.');
}
const bubblewrap = path.join(root, 'node_modules', '@bubblewrap', 'cli', 'bin', 'bubblewrap.js');
const build = spawnSync(process.execPath, [bubblewrap, ...getBubblewrapBuildArgs(androidDir)], {
  cwd: androidDir,
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const builtApk = path.join(androidDir, 'app-release-signed.apk');
if (!fs.existsSync(builtApk)) throw new Error(`Bubblewrap did not create the signed APK at ${builtApk}.`);
const outputDir = path.join(root, 'release', 'android');
fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, 'INTUBATALK-Android.apk');
fs.copyFileSync(builtApk, output);
process.stdout.write(`ANDROID_APK_READY ${output}\n`);
