// Procedural audio: soft chimes for requests, harsh alarm for emergencies.
let ctx = null;
let alarmTimer = null;
let alarmNodes = null;
let muted = false;

export const setMuted = (m) => { muted = !!m; };
export const isMuted = () => muted;

// Must be called from a user gesture at least once (iOS/autoplay policies).
export const unlock = () => {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    // Speech synthesis often also needs a priming utterance.
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch { /* no audio available */ }
};

const ensure = () => {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

const tone = (freq, t0, dur, gain = 0.22, type = "sine") => {
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + t0);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + t0 + 0.015);
  g.gain.linearRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0);
  o.stop(c.currentTime + t0 + dur + 0.05);
};

// Two-note friendly chime for a normal request.
export const chime = () => {
  if (muted) return;
  tone(660, 0, 0.16);
  tone(880, 0.14, 0.22);
};

// Short blip — used for acknowledgements.
export const blip = () => {
  if (muted) return;
  tone(520, 0, 0.09, 0.15);
};

// Emergency alarm: repeating two-tone siren until stopped.
export const alarmStart = () => {
  if (muted) return;
  if (alarmTimer) return;
  const blast = () => {
    const c = ensure();
    if (!c || muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    const now = c.currentTime;
    sweep(o.frequency, now, 720, 980);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.02);
    g.gain.setValueAtTime(0.28, now + 0.34);
    g.gain.linearRampToValueAtTime(0.0001, now + 0.38);
    o.connect(g).connect(c.destination);
    o.start(now);
    o.stop(now + 0.42);
    alarmNodes = { o, g };
  };
  const sweep = (param, t, a, b) => {
    param.setValueAtTime(a, t);
    param.linearRampToValueAtTime(b, t + 0.18);
    param.linearRampToValueAtTime(a, t + 0.36);
  };
  blast();
  alarmTimer = setInterval(blast, 900);
};

export const alarmStop = () => {
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
  alarmNodes = null;
};
