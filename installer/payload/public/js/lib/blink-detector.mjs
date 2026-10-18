const CLOSE_THRESHOLD = 0.62;
const OPEN_THRESHOLD = 0.28;
const MIN_CLOSED_MS = 45;
const MAX_CLOSED_MS = 750;

export function readEyeBlinkScores(categories) {
  if (!Array.isArray(categories)) return null;
  let left = null;
  let right = null;

  for (const category of categories) {
    if (category?.categoryName === "eyeBlinkLeft") left = category.score;
    if (category?.categoryName === "eyeBlinkRight") right = category.score;
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { left, right };
}

export function createBlinkDetector({
  closeThreshold = CLOSE_THRESHOLD,
  openThreshold = OPEN_THRESHOLD,
  minClosedMs = MIN_CLOSED_MS,
  maxClosedMs = MAX_CLOSED_MS,
} = {}) {
  let closedAt = null;
  let ignoreUntilOpen = false;
  let lastTime = -Infinity;

  const reset = () => {
    closedAt = null;
    ignoreUntilOpen = false;
    lastTime = -Infinity;
  };

  const push = (scores, now) => {
    if (!scores || !Number.isFinite(scores.left) || !Number.isFinite(scores.right) || !Number.isFinite(now) || now < lastTime) {
      reset();
      return false;
    }
    lastTime = now;

    const blinkScore = Math.max(scores.left, scores.right);
    if (ignoreUntilOpen) {
      if (blinkScore <= openThreshold) ignoreUntilOpen = false;
      return false;
    }

    if (closedAt === null) {
      if (blinkScore >= closeThreshold) closedAt = now;
      return false;
    }

    if (blinkScore > openThreshold) {
      if (now - closedAt > maxClosedMs) {
        closedAt = null;
        ignoreUntilOpen = true;
      }
      return false;
    }

    const closedFor = now - closedAt;
    closedAt = null;
    return closedFor >= minClosedMs && closedFor <= maxClosedMs;
  };

  return { push, reset };
}

export function answerForBlinkCount(count) {
  if (count === 1) return "yes";
  if (count === 2) return "no";
  return null;
}

export function computeLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function analyzeEyeBox(pixels, baseline, width, height) {
  if (!pixels || pixels.length === 0) return { mean: 0, std: 0, diff: 0, score: 0 };
  const n = pixels.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += pixels[i];
  const mean = sum / n;

  let varSum = 0;
  let diffSum = 0;
  const basePixels = baseline?.pixels;
  for (let i = 0; i < n; i++) {
    const d = pixels[i] - mean;
    varSum += d * d;
    if (basePixels && i < basePixels.length) {
      diffSum += Math.abs(pixels[i] - basePixels[i]);
    }
  }
  const std = Math.sqrt(varSum / n);
  if (!baseline || !Number.isFinite(baseline.std) || baseline.std <= 0.1) {
    return { mean, std, diff: 0, score: 0, pixels: new Uint8Array(pixels) };
  }

  const diff = diffSum / n;
  const contrastDrop = Math.max(0, 1 - std / Math.max(baseline.std, 1));
  const diffNorm = Math.min(1, diff / 25);
  const score = Math.max(0, Math.min(1, 0.55 * contrastDrop + 0.45 * diffNorm));
  return { mean, std, diff, score, pixels: new Uint8Array(pixels) };
}

export function extractEyeBoxPixels(ctx, box, canvasWidth, canvasHeight) {
  if (!ctx || !box || canvasWidth <= 0 || canvasHeight <= 0) return null;
  const x0 = Math.max(0, Math.floor(box.x * canvasWidth));
  const y0 = Math.max(0, Math.floor(box.y * canvasHeight));
  const w = Math.min(canvasWidth - x0, Math.ceil(box.w * canvasWidth));
  const h = Math.min(canvasHeight - y0, Math.ceil(box.h * canvasHeight));
  if (w <= 2 || h <= 2) return null;

  const imgData = ctx.getImageData(x0, y0, w, h);
  const data = imgData.data;
  const total = w * h;
  const pixels = new Uint8Array(total);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    pixels[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return { pixels, width: w, height: h };
}

export function measureFrameEyeScores(ctx, canvas, eyeBoxes, baseline) {
  if (!ctx || !canvas || !eyeBoxes) return null;
  const cW = canvas.width;
  const cH = canvas.height;

  let leftMetrics = null;
  let rightMetrics = null;

  if (eyeBoxes.left) {
    const leftExt = extractEyeBoxPixels(ctx, eyeBoxes.left, cW, cH);
    if (leftExt) {
      leftMetrics = analyzeEyeBox(leftExt.pixels, baseline?.left, leftExt.width, leftExt.height);
    }
  }

  if (eyeBoxes.right) {
    const rightExt = extractEyeBoxPixels(ctx, eyeBoxes.right, cW, cH);
    if (rightExt) {
      rightMetrics = analyzeEyeBox(rightExt.pixels, baseline?.right, rightExt.width, rightExt.height);
    }
  }

  const leftScore = leftMetrics ? leftMetrics.score : null;
  const rightScore = rightMetrics ? rightMetrics.score : null;

  if (leftScore === null && rightScore === null) return null;
  return {
    left: leftScore !== null ? leftScore : rightScore,
    right: rightScore !== null ? rightScore : leftScore,
    leftMetrics,
    rightMetrics,
  };
}
