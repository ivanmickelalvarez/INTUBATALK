const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readAppOrigin } = require('../scripts/lib/app-origin.cjs');

function withOriginFile(contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'intubatalk-origin-'));
  const file = path.join(directory, 'app-origin.txt');
  try {
    if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
    callback(file);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('reads a single HTTPS origin with an optional trailing slash', () => {
  withOriginFile('https://care.example/\n', (file) => {
    assert.equal(readAppOrigin(file).origin, 'https://care.example');
  });
});

test('rejects non-origin or unsafe release configuration', () => {
  for (const value of [
    'http://care.example\n',
    'https://user:pass@care.example\n',
    'https://care.example/app\n',
    'https://care.example?room=1\n',
    'https://care.example#fragment\n',
    'https://care.example\nhttps://other.example\n',
    '\n',
  ]) {
    withOriginFile(value, (file) => assert.throws(() => readAppOrigin(file), /origin/i, value));
  }
});

test('rejects a missing origin file', () => {
  withOriginFile(undefined, (file) => assert.throws(() => readAppOrigin(file), /origin/i));
});
