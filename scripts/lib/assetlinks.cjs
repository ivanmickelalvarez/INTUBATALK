const APP_ID = 'com.intubatalk.mobile';

function createAssetLinks(packageId, certificateSha256) {
  if (packageId !== APP_ID) {
    throw new Error(`Android package ID must be ${APP_ID}.`);
  }
  if (typeof certificateSha256 !== 'string' || !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(certificateSha256)) {
    throw new Error('Certificate fingerprint must be 32 uppercase, colon-separated SHA-256 bytes.');
  }

  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageId,
      sha256_cert_fingerprints: [certificateSha256],
    },
  }];
}

module.exports = { createAssetLinks };
