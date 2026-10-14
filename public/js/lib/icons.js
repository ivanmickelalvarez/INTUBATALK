// INTUBATALK inline SVG icon set (stroke style, inherits currentColor).
// All icons are 24x24 viewBox, stroke-based, so they scale and tint cleanly.
export const ICONS = {
  breathing: `<path d="M12 3c-2 3-4 4.5-4 8a4 4 0 0 0 8 0c0-3.5-2-5-4-8z"/><path d="M6 14c0 4 2.7 7 6 7s6-3 6-7"/><path d="M4 21h3M17 21h3"/>`,
  pain: `<path d="M12 21a9 9 0 1 1 9-9"/><path d="M21 12l-4.5 4.5"/><circle cx="9" cy="10" r="1"/><circle cx="13.5" cy="9" r="1"/><path d="M8.5 14.5c1 1 2.5 1.5 4 1.2"/>`,
  thirst: `<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>`,
  suction: `<rect x="10" y="3" width="4" height="8" rx="2"/><path d="M12 11v3"/><path d="M9 14h6l1 3H8l1-3z"/><path d="M8 17l-2 4M16 17l2 4"/>`,
  position: `<path d="M4 15h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path d="M6 15V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/><path d="M9 8h4"/>`,
  nausea: `<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01"/><path d="M8 15.5c1.2-1 2.7-1.5 4-1.5s2.8.5 4 1.5"/>`,
  toilet: `<rect x="8" y="3" width="8" height="7" rx="1"/><path d="M6 10h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6v-2z"/><path d="M12 18v3M9 21h6"/>`,
  anxiety: `<path d="M12 21a9 9 0 1 1 9-9c0 2-1 3-2.5 3H14a2 2 0 0 0-2 2v2.5c0 1-.7 1.5-2 1.5h-.5c-.9 0-1.5-.6-1.5-1.5V12"/><path d="M8 9.5c.8-.8 2-.8 2.8 0M13.2 9.5c.8-.8 2-.8 2.8 0"/>`,
  blink: `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>`,
  write: `<path d="M4 20l1.2-4L16.5 4.7a2.1 2.1 0 0 1 3 3L8.2 19 4 20z"/><path d="M14 6.5l3.5 3.5"/>`,
  alphabet: `<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9l2 6M8 9l-2 6M10.5 13h-3"/><path d="M13.5 15V9h2a1.8 1.8 0 0 1 0 3.6h-2M15.5 12.6L17 15"/>`,
  emergency: `<path d="M12 2L2 20h20L12 2z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/>`,
  speaker: `<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/>`,
  repeat: `<path d="M17 2l4 4-4 4"/><path d="M21 6H8a5 5 0 0 0-5 5"/><path d="M7 22l-4-4 4-4"/><path d="M3 18h13a5 5 0 0 0 5-5"/>`,
  close: `<path d="M18 6L6 18M6 6l12 12"/>`,
  alarmOn: `<path d="M12 3a7 7 0 0 1 7 7v5l2 3H3l2-3v-5a7 7 0 0 1 7-7z"/><path d="M10 21a2 2 0 0 0 4 0"/>`,
  abilities: `<path d="M4 7h16M4 7l4-4M4 7l4 4M20 17H4M20 17l-4-4M20 17l-4 4"/>`,
  board: `<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v3M8 20h8"/><path d="M7 8h7M7 11h10"/>`,
  nurse: `<path d="M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/><path d="M11 7h2M12 6v2"/>`,
  send: `<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>`,
  check: `<path d="M20 6L9 17l-5-5"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M8 21h8"/>`,
  camera: `<rect x="2" y="6" width="15" height="12" rx="3"/><path d="M17 10l5-3v10l-5-3"/><circle cx="9" cy="12" r="3"/>`,
  shield: `<path d="M12 3l7.5 3v5.5c0 4.8-3.2 7.5-7.5 9.5-4.3-2-7.5-4.7-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>`,
  bell: `<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>`,
  mute: `<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M17 3l4 4M21 3l-4 4"/>`,
  voice: `<path d="M12 3c-2 3-4 4.5-4 8a4 4 0 0 0 8 0c0-3.5-2-5-4-8z"/><rect x="6" y="17" width="12" height="4" rx="2"/><path d="M9 19h.01M12 19h.01M15 19h.01"/>`,
  plus: `<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>`,
  arrowLeft: `<path d="M19 12H5M12 19l-7-7 7-7"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
};

// Static SVG builder
export const svg = (name, cls = "") => {
  const body = ICONS[name] || ICONS.bell;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
};
