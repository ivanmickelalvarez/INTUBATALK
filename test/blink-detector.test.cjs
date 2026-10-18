const test = require('node:test');
const assert = require('node:assert/strict');

test('counts one eye closure only after the eyelids reopen', async () => {
  const { createBlinkDetector, readEyeBlinkScores } = await import('../public/js/lib/blink-detector.mjs');
  const detector = createBlinkDetector();

  assert.equal(detector.push({ left: 0.02, right: 0.01 }, 0), false);
  assert.equal(detector.push({ left: 0.82, right: 0.86 }, 100), false);
  assert.equal(detector.push({ left: 0.04, right: 0.02 }, 210), true);
  assert.deepEqual(readEyeBlinkScores([
    { categoryName: 'eyeBlinkLeft', score: 0.82 },
    { categoryName: 'eyeBlinkRight', score: 0.86 },
  ]), { left: 0.82, right: 0.86 });
});

test('does not count an eye that stays closed too long or a missing face', async () => {
  const { createBlinkDetector } = await import('../public/js/lib/blink-detector.mjs');
  const detector = createBlinkDetector();

  detector.push({ left: 0.02, right: 0.02 }, 0);
  detector.push({ left: 0.9, right: 0.9 }, 100);
  assert.equal(detector.push({ left: 0.02, right: 0.02 }, 900), false);

  detector.push({ left: 0.9, right: 0.9 }, 1000);
  assert.equal(detector.push(null, 1100), false);
  assert.equal(detector.push({ left: 0.02, right: 0.02 }, 1200), false);
});

test('maps one and two deliberate blinks to the agreed answers', async () => {
  const { answerForBlinkCount } = await import('../public/js/lib/blink-detector.mjs');

  assert.equal(answerForBlinkCount(1), 'yes');
  assert.equal(answerForBlinkCount(2), 'no');
  assert.equal(answerForBlinkCount(0), null);
  assert.equal(answerForBlinkCount(3), null);
});

test('accurately scores optical eye closure and triggers detector upon reopening', async () => {
  const { createBlinkDetector, analyzeEyeBox } = await import('../public/js/lib/blink-detector.mjs');

  const w = 30, h = 20;
  const openPixels = new Uint8Array(w * h);
  const closedPixels = new Uint8Array(w * h);

  // Synthetic open eye: pupil in center, sclera sides, skin surround
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 15, dy = y - 10;
      if (dx * dx + dy * dy < 12) openPixels[y * w + x] = 25; // pupil
      else if (Math.abs(dy) < 5 && Math.abs(dx) < 11) openPixels[y * w + x] = 215; // sclera
      else openPixels[y * w + x] = 140; // skin
    }
  }

  // Synthetic closed eye: uniform eyelid skin tone
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      closedPixels[y * w + x] = 138;
    }
  }

  const baseline = analyzeEyeBox(openPixels, null, w, h);
  assert.ok(baseline.std > 20, 'Open eye should have high contrast baseline');

  const openResult = analyzeEyeBox(openPixels, baseline, w, h);
  assert.ok(openResult.score < 0.15, 'Open eye should score near 0 for closure');

  const closedResult = analyzeEyeBox(closedPixels, baseline, w, h);
  assert.ok(closedResult.score > 0.65, 'Closed eye should score > 0.65 closure threshold');

  const detector = createBlinkDetector();
  assert.equal(detector.push({ left: openResult.score, right: openResult.score }, 0), false);
  assert.equal(detector.push({ left: closedResult.score, right: closedResult.score }, 120), false);
  assert.equal(detector.push({ left: openResult.score, right: openResult.score }, 260), true);
});
