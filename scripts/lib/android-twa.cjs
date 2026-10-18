const path = require('node:path');
const EXPECTED_PACKAGE_ID = 'com.intubatalk.mobile';

function getBubblewrapBuildArgs(androidDir) {
  return ['build', `--manifest=${path.join(androidDir, 'twa-manifest.json')}`];
}

function getBubblewrapUpdateArgs(androidDir) {
  return ['update', '--skipVersionUpgrade', `--manifest=${path.join(androidDir, 'twa-manifest.json')}`];
}

function validateTwaManifest(manifest, origin) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Android TWA manifest must be a JSON object.');
  }
  if (!(origin instanceof URL) || origin.protocol !== 'https:') {
    throw new Error('Android TWA origin must be a valid HTTPS URL.');
  }
  if (manifest.host !== origin.host) {
    throw new Error(`Android TWA host must match the app origin host (${origin.host}).`);
  }
  if (manifest.packageId !== EXPECTED_PACKAGE_ID) {
    throw new Error(`Android TWA package ID must be ${EXPECTED_PACKAGE_ID}.`);
  }
  if (manifest.startUrl !== '/') {
    throw new Error('Android TWA startUrl must open the patient login at /.');
  }
  const versionName = manifest.appVersion || manifest.appVersionName;
  if (typeof versionName !== 'string' || !versionName.trim() || !Number.isInteger(manifest.appVersionCode) || manifest.appVersionCode < 1) {
    throw new Error('Android TWA must have a version name and a positive integer version code.');
  }
  if (!Number.isInteger(manifest.minSdkVersion) || manifest.minSdkVersion < 24) {
    throw new Error('Android TWA minSdkVersion 24 or higher is required by Android Browser Helper.');
  }
  if (manifest.features?.playBilling?.enabled === true) {
    throw new Error('Android TWA must disable the unused Play Billing feature in INTUBATALK.');
  }
  const hasNurseShortcut = Array.isArray(manifest.shortcuts) && manifest.shortcuts.some((shortcut) => {
    try { return new URL(shortcut.url, origin).pathname === '/nurse'; } catch { return false; }
  });
  if (!hasNurseShortcut) {
    throw new Error('Android TWA manifest must include the nurse dashboard shortcut at /nurse.');
  }
  return true;
}

module.exports = { EXPECTED_PACKAGE_ID, getBubblewrapBuildArgs, getBubblewrapUpdateArgs, validateTwaManifest };
