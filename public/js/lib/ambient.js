// INTUBATALK ambient background.
// Medically themed, deliberately calm: a slow "breathing" gradient that
// expands and contracts on a restful 7 second rhythm, plus a faint
// scrolling ECG trace and drifting soft orbs on a canvas. Honors
// prefers-reduced-motion and pauses itself when the tab is hidden.
// The trace is driven by a short timer rather than requestAnimationFrame
// so it keeps moving in webviews that throttle or skip rAF.

let started = false;
let loopTimer = null;

const reduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// A stylized ECG beat, one cycle mapped to 0..1 of the period.
// Returns -1..1; 0 is the isoelectric baseline.
const beat = (p) => {
  const g = (c, w) => Math.exp(-((p - c) * (p - c)) / w);
  return (
    0.10 * g(0.16, 0.0022) -   // P wave
    0.14 * g(0.30, 0.00035) +  // Q
    1.00 * g(0.335, 0.00055) - // R spike
    0.26 * g(0.375, 0.00045) + // S
    0.22 * g(0.58, 0.004)      // T wave
  );
};

function startAmbient() {
  if (started) return;
  started = true;
  if (reduced()) return;

  // Idempotency: drop any orphaned layers from a previous instance.
  document.querySelectorAll(".breath-bg, .ambient-canvas").forEach((el) => el.remove());

  // Breathing glow layer
  const glow = document.createElement("div");
  glow.className = "breath-bg";
  glow.setAttribute("aria-hidden", "true");
  document.body.prepend(glow);

  // ECG + drifting orbs canvas layer
  const canvas = document.createElement("canvas");
  canvas.className = "ambient-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0, h = 0;
  let orbs = [];
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    seedOrbs();
  };

  // Slow floating orbs — soft clay-toned circles drifting upward.
  const seedOrbs = () => {
    const count = w < 900 * 2 ? 7 : 12;
    orbs = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (26 + Math.random() * 70) * (Math.min(w, h) / 1500 + 0.4),
      vx: (Math.random() - 0.5) * 6,
      vy: -(4 + Math.random() * 10),
      hue: Math.random() < 0.62 ? "63,167,150" : "217,134,107",
      a: 0.05 + Math.random() * 0.06,
    }));
  };

  resize();
  addEventListener("resize", resize, { passive: true });

  let pointerX = -1, pointerY = -1; // CSS px (-1 = no pointer)
  addEventListener("pointermove", (e) => {
    pointerX = e.clientX; pointerY = e.clientY;
  }, { passive: true });

  const BASE = 0.66;   // baseline at 66% height
  const PERIOD = 0.42; // fraction of the width per beat
  const SPEED = 0.055; // width fractions per second
  let last = performance.now();

  const draw = (now) => {
    if (now === undefined) now = performance.now();
    const dt = Math.min(60, now - last) / 1000;
    last = now;
    ctx.clearRect(0, 0, w, h);

    // --- drifting orbs with pointer parallax ---
    const par = pointerX >= 0 ? 1 : 0;
    for (const o of orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.y + o.r < -40) { o.y = h + o.r + 20; o.x = Math.random() * w; }
      if (o.x + o.r < -40) o.x = w + o.r;
      if (o.x - o.r > w + 40) o.x = -o.r;
      const px = o.x + pointerX * 0.02 * par;
      const py = o.y + pointerY * 0.012 * par;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, o.r);
      grad.addColorStop(0, `rgba(${o.hue}, ${o.a})`);
      grad.addColorStop(1, `rgba(${o.hue}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, o.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- ECG traces ---
    const t = now / 1000;
    const baseline = h * BASE;
    const amp = h * 0.075;
    const lw = Math.max(1, Math.floor(1.4 * (w / 1400) * (h / 900) * 2));

    const traces = [
      { alpha: 0.16, yoff: 0, phase: 0, color: "63, 167, 150" },
      { alpha: 0.08, yoff: h * 0.16, phase: 0.18, color: "217, 134, 107" },
    ];
    for (const tr of traces) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${tr.color}, ${tr.alpha})`;
      ctx.lineWidth = lw * 1.6;
      const shift = (t * SPEED + tr.phase) % PERIOD;
      for (let x = 0; x <= w; x += Math.max(2, w / 900)) {
        const p = ((x / w) + shift) % PERIOD;
        const y = baseline + tr.yoff - beat(p / PERIOD) * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

  let raf = 0;
  const loop = (now) => { draw(now); raf = requestAnimationFrame(loop); };
  const startLoop = () => {
    if (raf || loopTimer) return;
    loopTimer = setInterval(() => draw(), 40); // fallback for throttled rAF
    raf = requestAnimationFrame(loop);
  };
  const stopLoop = () => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  startLoop();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });
}

export { startAmbient };
