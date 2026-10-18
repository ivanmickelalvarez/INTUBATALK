const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssetLinks } = require('../scripts/lib/assetlinks.cjs');

const fingerprint = '01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF';

test('creates Digital Asset Links for the approved Android app and certificate', () => {
  assert.deepEqual(createAssetLinks('com.intubatalk.mobile', fingerprint), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.intubatalk.mobile',
      sha256_cert_fingerprints: [fingerprint],
    },
  }]);
});

test('rejects malformed Android package IDs and certificate fingerprints', () => {
  assert.throws(() => createAssetLinks('com.example.other', fingerprint), /package/i);
  assert.throws(() => createAssetLinks('com.intubatalk.mobile', fingerprint.toLowerCase()), /fingerprint/i);
  assert.throws(() => createAssetLinks('com.intubatalk.mobile', 'AB:CD'), /fingerprint/i);
});
