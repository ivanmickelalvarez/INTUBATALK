// Text-to-speech via the Web Speech API — no network service needed.
// Patients and nurses can both hear the request out loud.
let voice = null;

const talkTimer = { id: 0, started: 0 };

const DEFAULT_VOICE_CHECK = () => {
  if (!("speechSynthesis" in window)) return false;
  const vs = speechSynthesis.getVoices();
  if (!vs.length && speechSynthesis.onvoiceschanged) {
    return new Promise((res) => {
      speechSynthesis.onvoiceschanged = () => { pickVoice(); res(true); };
      setTimeout(() => { pickVoice(); res(true); }, 600);
    });
  }
  pickVoice();
  return true;
};

const pickVoice = () => {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  if (!vs.length) return;
  const en = vs.filter((v) => /^en(-|_|$)/i.test(v.lang) || /english/i.test(v.name));
  voice =
    en.find((v) => /natural|neural|online/i.test(v.name)) ||
    en.find((v) => /^(en[-_]?(US|GB)|english)/i.test(v.lang) && /female|zira|aria|samantha/i.test(v.name)) ||
    en.find((v) => /en[-_]us/i.test(v.lang)) ||
    en[0] || vs[0] || null;
};

if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export const ttsAvailable = () => "speechSynthesis" in window;

// rate: 0..2 (1 = normal). Patients can enable a slower "easy listening" rate.
export const speak = async (text, { rate = 1, interrupt = true } = {}) => {
  if (!("speechSynthesis" in window) || !text) return;
  await DEFAULT_VOICE_CHECK();
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  if (voice) u.voice = voice;
  u.rate = Math.max(0.1, Math.min(2, rate));
  u.pitch = 1;
  u.volume = 1;
  u.onstart = () => { talkTimer.started = Date.now(); };
  u.onend = () => { talkTimer.id = 0; };
  u.onerror = () => { talkTimer.id = 0; };
  speechSynthesis.speak(u);
};

export const stopSpeech = () => {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  talkTimer.id = 0;
};

export const talkActive = () => talkTimer.started > 0 && Date.now() - talkTimer.started < 15000;
