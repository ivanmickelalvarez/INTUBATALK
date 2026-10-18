const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTwaManifest, getBubblewrapBuildArgs, getBubblewrapUpdateArgs } = require('../scripts/lib/android-twa.cjs');
const path = require('node:path');

const valid = {
  host: 'intubatalk.intubatalk.workers.dev',
  startUrl: '/',
  packageId: 'com.intubatalk.mobile',
  appVersion: '1.0.0',
  appVersionCode: 1,
  minSdkVersion: 24,
  shortcuts: [{ name: 'Nurse dashboard', url: 'https://intubatalk.intubatalk.workers.dev/nurse' }],
};

test('accepts the approved host and stable TWA identity', () => {
  assert.equal(validateTwaManifest(valid, new URL('https://intubatalk.intubatalk.workers.dev')), true);
});

test('rejects a TWA project pointed at a different host or package', () => {
  assert.throws(() => validateTwaManifest({ ...valid, host: 'other.example' }, new URL('https://intubatalk.intubatalk.workers.dev')), /host/);
  assert.throws(() => validateTwaManifest({ ...valid, packageId: 'com.other.app' }, new URL('https://intubatalk.intubatalk.workers.dev')), /package/);
});

test('rejects a TWA project that opens outside the patient login route or has the wrong version', () => {
  assert.throws(() => validateTwaManifest({ ...valid, startUrl: '/nurse' }, new URL('https://intubatalk.intubatalk.workers.dev')), /startUrl/);
  assert.throws(() => validateTwaManifest({ ...valid, appVersionCode: 0 }, new URL('https://intubatalk.intubatalk.workers.dev')), /version/);
});

test('rejects Android versions below the Browser Helper minimum API level', () => {
  assert.throws(() => validateTwaManifest({ ...valid, minSdkVersion: 21 }, new URL('https://intubatalk.intubatalk.workers.dev')), /minSdkVersion 24/);
});

test('rejects a TWA project without the nurse dashboard shortcut', () => {
  assert.throws(() => validateTwaManifest({ ...valid, shortcuts: [] }, new URL('https://intubatalk.intubatalk.workers.dev')), /nurse/);
});

test('accepts a later positive Android version code for signed updates', () => {
  assert.equal(validateTwaManifest({ ...valid, appVersion: '1.0.0', appVersionCode: 2 }, new URL('https://intubatalk.intubatalk.workers.dev')), true);
});

test('rejects the unused Play Billing dependency in INTUBATALK', () => {
  assert.throws(() => validateTwaManifest({ ...valid, features: { playBilling: { enabled: true } } }, new URL('https://intubatalk.intubatalk.workers.dev')), /Play Billing/);
});

test('build command points Bubblewrap at the TWA manifest file', () => {
  const androidDir = path.resolve('android-twa');
  assert.deepEqual(getBubblewrapBuildArgs(androidDir), [
    'build',
    `--manifest=${path.join(androidDir, 'twa-manifest.json')}`,
  ]);
});

test('project update command points Bubblewrap at the TWA manifest file', () => {
  const androidDir = path.resolve('android-twa');
  assert.deepEqual(getBubblewrapUpdateArgs(androidDir), [
    'update',
    '--skipVersionUpgrade',
    `--manifest=${path.join(androidDir, 'twa-manifest.json')}`,
  ]);
});
