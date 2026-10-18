const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sw = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
const patientShell = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const nurseShell = fs.readFileSync(path.join(__dirname, '../public/nurse.html'), 'utf8');

test('service worker activates even if Access redirects prevent some shell assets from caching', () => {
  assert.match(sw, /const CACHE = "intubatalk-v29"/);
  assert.match(sw, /Promise\.allSettled\(SHELL\.map/);
  assert.match(sw, /redirect:\s*"manual"/);
  assert.match(sw, /await self\.skipWaiting\(\)/);
});

test('service worker checks navigations online before using the cached app shell', () => {
  assert.match(sw, /if \(e\.request\.mode === "navigate"\)/);
  assert.match(sw, /const response = await fetch\(e\.request\)/);
  assert.match(sw, /caches\.match\("\/"\)/);
});

test('patient and nurse shells refresh when a new service worker takes control', () => {
  for (const html of [patientShell, nurseShell]) {
    assert.match(html, /controllerchange/);
    assert.match(html, /updateViaCache:\s*"none"/);
  }
});
