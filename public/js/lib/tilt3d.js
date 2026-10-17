// INTUBATALK 3D interaction layer.
// Pointer-driven clay tilt: cards lean toward the cursor with a gyroscope-style
// parallax, a glare highlight tracks the pointer, and everything dispatches in a
// single rAF per frame. Honors prefers-reduced-motion and is touch-friendly.
//
// Usage: auto-inits on import for [data-tilt] elements; call Tilt.attach(el)
// for dynamically rendered cards.

const reduced = () => {
  // Mirror ambient.js: ?motion=full forces the 3D tilt on for testing/kiosks.
  try {
    if (new URLSearchParams(location.search).get("motion") === "full") return false;
  } catch { /* keep default behavior */ }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
};

const MAX_YAW = 6;   // degrees of horizontal lean
const MAX_PITCH = 8; // degrees of vertical lean

const attached = new WeakSet();

function attach(el, { max = 1 } = {}) {
  if (!el || attached.has(el) || reduced()) return;
  if (window.matchMedia?.("(hover: none)").matches) return; // pointer devices only
  attached.add(el);

  let frame = 0;
  let rx = 0, ry = 0;      // current rotation
  let trx = 0, try_ = 0;   // target rotation
  let mx = 0.5, my = 0.35; // glare position

  const step = () => {
    frame = 0;
    rx += (trx - rx) * 0.12;   // slightly slower ease = heavier, more physical clay
    ry += (try_ - ry) * 0.12;
    // Depth: inner layers pushed away on the leaning side for layered parallax.
    const tz = -(Math.abs(rx) + Math.abs(ry)) * 0.6;
    el.style.transform =
      `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${tz.toFixed(2)}px)`;
    // Light comes from top-left: leaning into the light lowers the azimuth,
    // leaning away stretches the shadow. Synthesized, not baked.
    const shX = (-ry * 1.4).toFixed(1);
    const shY = (rx * 1.4 + 14).toFixed(1);
    el.style.setProperty("--tilt-shadow-x", `${shX}px`);
    el.style.setProperty("--tilt-shadow-y", `${shY}px`);
    // Glare quadrant: pointer position pushed slightly toward the light source
    // so the sheen stays believable rather than mirroring the cursor exactly.
    el.style.setProperty("--glare-x", `${(mx * 100).toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${(my * 100).toFixed(1)}%`);
    if (Math.abs(trx - rx) > 0.05 || Math.abs(try_ - ry) > 0.05) schedule();
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(step); };

  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // rotateY from horizontal position (positive right), rotateX inverted from vertical
    try_ = (px - 0.5) * 2 * MAX_YAW * max;
    trx = (0.5 - py) * 2 * MAX_PITCH * max;
    mx = px; my = py;
    schedule();
  });
  el.addEventListener("pointerleave", () => {
    trx = 0; try_ = 0;
    schedule();
  });
}

// Auto-init for anything already in the DOM, including inside dialogs.
const init = () => {
  if (reduced()) return;
  document.querySelectorAll("[data-tilt]").forEach((el) => attach(el));
};

let booted = false;
export function startTilt() {
  if (booted) return;
  booted = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}

export { attach, init };
