// INTUBATALK need catalog and capability definitions.
// icon: key into public/js/lib/icons.js (stroke SVG, no emojis).
// risk: "high" routes a red/priority path with alarms on the nurse side.
export const NEEDS = {
  breathing: {
    icon: "breathing", label: "Breathing", msg: "I need help with my breathing.", risk: "high",
    vars: [
      "I cannot get enough air.",
      "The tube feels blocked, please check it.",
      "Please sit me up more.",
      "The ventilator alarm keeps going.",
    ],
  },
  pain: {
    icon: "pain", label: "Pain", msg: "I am in pain.", risk: "high",
    vars: [
      "The pain is getting worse.",
      "My throat hurts from the tube.",
      "The pain is worse when you touch me here.",
    ],
  },
  thirst: {
    icon: "thirst", label: "Thirst", msg: "I am thirsty.", risk: "normal",
    vars: [
      "My mouth is dry, may I have ice chips?",
      "Please moisten my lips.",
      "Please use the saline spray or swab.",
      "One small sip of water if the doctor allows it.",
    ],
  },
  suction: {
    icon: "suction", label: "Suction", msg: "I need suctioning.", risk: "high",
    vars: [
      "There are secretions in my throat right now.",
      "Suction failed last time, please try again.",
      "I will gag, please go slowly.",
    ],
  },
  position: {
    icon: "position", label: "Reposition", msg: "Please move me into a comfortable position.", risk: "normal",
    vars: [
      "Please turn me to my left side.",
      "Please turn me to my right side.",
      "Please raise the head of the bed a little.",
      "Something is digging into my skin.",
      "My arm is stuck, please free it.",
    ],
  },
  nausea: {
    icon: "nausea", label: "Nausea", msg: "I feel nauseous.", risk: "normal",
    vars: [
      "I feel like vomiting, please help me turn.",
      "The feeding makes me feel sick.",
      "Please give me anti-nausea medicine.",
    ],
  },
  toilet: {
    icon: "toilet", label: "Toilet", msg: "I need help with the toilet.", risk: "high",
    vars: [
      "I need the bedpan now, please.",
      "I need the urinal now, please.",
      "Please clean my diaper.",
      "I feel pressure, please give me a minute.",
    ],
  },
  anxiety: {
    icon: "anxiety", label: "Anxiety", msg: "I feel anxious. Please stay with me.", risk: "normal",
    vars: [
      "Please dim the lights.",
      "There is too much noise, please hush the room.",
      "Please hold my hand for a moment.",
      "Please tell me what is happening, I am scared.",
    ],
  },
  blink: {
    icon: "blink", label: "Eye-blink", msg: "", risk: "normal",
  },
  write: {
    icon: "write", label: "Write", msg: "", risk: "normal",
  },
  alphabet: {
    icon: "alphabet", label: "Alphabet", msg: "", risk: "normal",
  },
};

export const NEED_KEYS = Object.keys(NEEDS);

// Capabilities for the adaptive assessment. icon: key into icons.js
export const CAPS = [
  { key: "touch", label: "Touch screen", icon: "position" },
  { key: "fingers", label: "Move fingers", icon: "write" },
  { key: "write", label: "Write or draw", icon: "write" },
  { key: "blink", label: "Blink clearly", icon: "blink" },
  { key: "eyes", label: "Move eyes and gaze", icon: "blink" },
  { key: "onlyyesno", label: "Yes and no only", icon: "check" },
];

export const CAPS_BY_KEY = Object.fromEntries(CAPS.map((c) => [c.key, c]));
export const CAPS_ORDER = CAPS.map((c) => c.key);
export const DEFAULT_PROFILE = {
  name: "",
  bed: "",
  caps: [],
  slowTts: false,
};
