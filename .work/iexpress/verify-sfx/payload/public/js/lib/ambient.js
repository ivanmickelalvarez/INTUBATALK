// INTUBATALK ambient background.
// Medically themed, deliberately calm: a slow "breathing" gradient that
// expands and contracts on a restful 7 second rhythm, plus a faint
// scrolling ECG trace, a 3D plane carousel and drifting soft orbs on a
// canvas. The whole scene leans with the pointer for a gentle parallax
// depth. Honors prefers-reduced-motion and pauses itself when the tab
// is hidden.
//
// Page theme: body classes .patient-tablet / .nurse-dashboard tint the
// plane palette; the motion is shared.

let started = false;
let rAF = null;

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

const reduced = () => {
  // Testing / kiosk escape hatch: ?motion=full forces the scene on even
  // when the device asks for reduced motion.
  try {
    if (new URLSearchParams(location.search).get("motion") === "full") return false;
  } catch { /* keep default behavior */ }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
};

function startAmbient() {
  if (started) return;
  started = true;
  if (reduced()) return;

  // Idempotency: drop any orphaned layers from a previous instance.
  document
    .querySelectorAll(".breath-bg, .ambient-canvas, .ambient-plane-container")
    .forEach((el) => el.remove());
  document.getElementById("ambient-keyframes")?.remove();

  // --- Page-scoped palette -------------------------------------------------
  // Nurse: blue-forward; patient (and default): mint-forward.
  const isNurse = document.body.classList.contains("nurse-dashboard");
  const palette = isNurse
    ? ["63,127,167", "63,167,150", "217,134,107"]
    : ["63,167,150", "217,134,107", "63,127,167"];

  // --- Layer 1: fixed CSS gradient stage (cheap, always smooth) ------------
  const glow = document.createElement("div");
  glow.className = "breath-bg";
  glow.setAttribute("aria-hidden", "true");
  glow.style.animation = "breathe 7s ease-in-out infinite";
  document.body.prepend(glow);

  // --- Layer 2: CSS 3D plane carousel (GPU compositing) --------------------
  const stage = document.createElement("div");
  stage.className = "ambient-plane-container";
  stage.setAttribute("aria-hidden", "true");
  document.body.prepend(stage);

  for (let i = 0; i < 3; i++) {
    const plane = document.createElement("span");
    plane.className = "ambient-plane";
    plane.style.background =
      "radial-gradient(circle, rgba(" + palette[i] + ", .10), transparent 70%)";
    plane.style.animationDelay = (i * -6.6) + "s";
    stage.appendChild(plane);
  }

  // Shared keyframes for the carousel + breathing glow.
  if (!document.getElementById("ambient-keyframes")) {
    const style = document.createElement("style");
    style.id = "ambient-keyframes";
    style.textContent =
      "@keyframes orbit {" +
      "  0%, 100% { transform: translate(-50%, -50%) rotateY(0deg) rotateX(12deg) translateZ(0px); }" +
      "  33%      { transform: translate(-50%, -50%) rotateY(120deg) rotateX(30deg) translateZ(90px); }" +
      "  66%      { transform: translate(-50%, -50%) rotateY(240deg) rotateX(-14deg) translateZ(-70px); }" +
      "}" +
      "@keyframes breathe {" +
      "  0%, 100% { transform: scale(1); opacity: .75; }" +
      "  50%      { transform: scale(1.08); opacity: 1; }" +
      "}";
    document.head.appendChild(style);
  }

  // --- Layer 3: canvas — ECG traces, orbs, dash flow ------------------------
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

  // Slow floating orbs — soft circles drifting upward.
  const seedOrbs = () => {
    const count = w < 900 * 2 ? 7 : 12;
    orbs = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (26 + Math.random() * 70) * (Math.min(w, h) / 1500 + 0.4),
      vx: (Math.random() - 0.5) * 6,
      vy: -(4 + Math.random() * 10),
      hue: palette[Math.floor(Math.random() * palette.length)],
      a: 0.05 + Math.random() * 0.06,
    }));
  };

  resize();
  addEventListener("resize", resize, { passive: true });

  // Pointer parallax state (CSS px, -1 = no pointer).
  let pointerX = -1, pointerY = -1;
  let tiltX = 0, tiltY = 0;
  let stageFrame = 0;
  let swayT = Math.random() * 100;

  const applyStageTilt = () => {
    if (stageFrame) return;
    stageFrame = requestAnimationFrame(() => {
      stageFrame = 0;
      swayT += 0.008;
      const leanX = tiltX * 2.6;   // degrees
      const leanY = tiltY * 1.8;
      const swayY = Math.sin(swayT * 0.7) * 2.2;
      const swayX = Math.cos(swayT * 0.55) * 1.4;
      stage.style.transform =
        "perspective(1100px) rotateY(" + (swayY + leanX).toFixed(2) + "deg)" +
        " rotateX(" + (swayX + leanY).toFixed(2) + "deg)";
    });
  };

  addEventListener("pointermove", (e) => {
    pointerX = e.clientX; pointerY = e.clientY;
    tiltX = e.clientX / innerWidth - 0.5;
    tiltY = e.clientY / innerHeight - 0.5;
    applyStageTilt();
  }, { passive: true });
  addEventListener("pointerleave", () => { pointerX = -1; pointerY = -1; });

  const BASE = 0.66;   // baseline at 66% height
  const PERIOD = 0.42; // fraction of the width per beat
  const SPEED = 0.055; // width fractions per second

  const draw = (now) => {
    if (now === undefined) now = performance.now();
    const t = now / 1000;

    ctx.clearRect(0, 0, w, h);

    // --- drifting orbs with pointer parallax ---
    const par = pointerX >= 0 ? 1 : 0;
    for (const o of orbs) {
      o.x += o.vx * 0.016;
      o.y += o.vy * 0.016;
      if (o.y + o.r < -40) { o.y = h + o.r + 20; o.x = Math.random() * w; }
      if (o.x + o.r < -40) o.x = w + o.r;
      if (o.x - o.r > w + 40) o.x = -o.r;
      // Depth illusion: bigger orbs shift more with the pointer.
      const depth = o.r / 80;
      const px = o.x + tiltX * 60 * depth * par;
      const py = o.y + tiltY * 36 * depth * par;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, o.r);
      grad.addColorStop(0, "rgba(" + o.hue + ", " + o.a + ")");
      grad.addColorStop(1, "rgba(" + o.hue + ", 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, o.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- faint dash flow field (alive texture between beats) ---
    const t2 = t * 0.5;
    ctx.strokeStyle = "rgba(" + palette[0] + ", .05)";
    ctx.lineWidth = Math.max(1, w / 1400);
    for (let i = 0; i < 9; i++) {
      const y = h * (0.18 + i * 0.075);
      const off = Math.sin(t2 * 0.7 + i * 1.3) * 30;
      ctx.beginPath();
      ctx.moveTo(w * 0.1 + off, y);
      ctx.lineTo(w * 0.9 + off * 1.6, y + 6);
      ctx.stroke();
    }

    // --- ECG traces (one heartbeat rhythm, two faint layers) ---
    const baseline = h * BASE;
    const amp = h * 0.075;
    const lw = Math.max(1, Math.floor(1.4 * (w / 1400) * (h / 900) * 2));
    const traces = [
      { alpha: 0.16, yoff: 0, phase: 0, color: palette[0] },
      { alpha: 0.08, yoff: h * 0.16, phase: 0.18, color: palette[1] },
    ];
    for (const tr of traces) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(" + tr.color + ", " + tr.alpha + ")";
      ctx.lineWidth = lw * 1.6;
      const shift = (t * SPEED + tr.phase) % PERIOD;
      for (let x = 0; x <= w; x += Math.max(2, w / 900)) {
        const p = ((x / w) + shift) % PERIOD;
        const y = baseline + tr.yoff + tiltY * 12 * par - beat(p / PERIOD) * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

  const loop = (now) => {
    draw(now);
    applyStageTilt();
    rAF = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (rAF) return;
    rAF = requestAnimationFrame(loop);
  };
  const stopLoop = () => {
    if (rAF) { cancelAnimationFrame(rAF); rAF = null; }
  };

  startLoop();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });
}

export { startAmbient };
