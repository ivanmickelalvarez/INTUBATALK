// Sync client for INTUBATALK.
// Primary: shared server API (works across devices on Wi-Fi).
// Fallback: BroadcastChannel between tabs in ONE browser, so a single
// laptop can demo patient ↔ nurse with no network at all.
import { uid } from "./util.js";

const LS_ROOM = "it_room";
const handlers = { request: [], ack: [], clear: [], profile: [] };
let room = null;          // room code this page is attached to
let pollTimer = null;     // behind null until register/attach
let after = 0;            // last server message id seen
let seenCmids = new Set();

// ---- broadcast channel (single-browser demo) ------------------------------

let channelLocal = null;
try {
  channelLocal = new BroadcastChannel("intubatalk");
  channelLocal.onmessage = (e) => dispatch(e.data || {});
} catch { /* unsupported */ }

const say = (msg) => { try { channelLocal?.postMessage(msg); } catch { /* noop */ } };

const post = (path, body) =>
  fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// ---- room / registration ---------------------------------------------------

const cacheRead = (k) => { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch { return null; } };

export const getRoom = () => room;

// The room code persisted on this device (survives reloads).
export const getRememberedRoom = () => cacheRead(LS_ROOM);

// Patient creates a fresh room (or resumes a remembered one).
export const register = async ({ name, bed }) => {
  const remembered = cacheRead(LS_ROOM);
  const r = await post("/session", { name, bed, room: remembered || undefined });
  if (!r.ok) throw new Error(`session failed (${r.status})`);
  const data = await r.json();
  room = data.room;
  try {
    localStorage.setItem(LS_ROOM, room);
    sessionStorage.setItem(LS_ROOM, room);
  } catch { /* private mode */ }
  startPolling();
  heartbeat();
  return room;
};

// Nurse passively watches a room without creating a session.
export const attach = (code) => {
  room = code;
  try { sessionStorage.setItem(LS_ROOM, code); } catch { /* noop */ }
  startPolling();
};

// Completely wipe session and profile so app starts fresh from the beginning.
export const clearSession = () => {
  room = null;
  profile = null;
  try {
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem("it_profile");
    sessionStorage.removeItem(LS_ROOM);
    sessionStorage.removeItem("it_profile");
  } catch { /* noop */ }
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
};

// ---- profile (customer + capabilities) --------------------------------------

let profile = null;
try { profile = JSON.parse(localStorage.getItem("it_profile") || "null"); } catch { profile = null; }

export const loadProfile = () => profile;
export const profileCache = () => profile || { name: "Patient", bed: "", caps: [] };

export function saveProfile(p) {
  profile = p;
  try { localStorage.setItem("it_profile", JSON.stringify(p)); } catch { /* full */ }
  if (room) {
    post("/profile", { room, name: p.name, bed: p.bed, caps: p.caps || [] }).catch(() => {});
  }
  say({ type: "profile", profile: p, ts: Date.now() });
}

export const heartbeat = () => {
  if (!room) return;
  post("/presence", { room, name: profileCache().name, bed: profileCache().bed }).catch(() => {});
};

// ---- sending ------------------------------------------------------------------

export function sendItem({ kind = "need", need = "message", label = "Message", msg, risk = "normal" }) {
  const p = profileCache();
  const payload = {
    room, cmid: uid(), kind,
    need: kind === "emergency" ? "emergency" : need,
    label: kind === "emergency" ? "EMERGENCY / HELP" : label,
    msg, risk: kind === "emergency" ? "high" : risk,
    patientName: p.name, bed: p.bed, ts: Date.now(),
  };
  seenCmids.add(payload.cmid);
  if (room) post("/messages", payload).catch(() => {});
  say(payload);
  return payload.cmid;
}

export const sendNeed = ({ need, label, msg, risk = "normal" }) =>
  sendItem({ kind: "need", need, label, msg, risk });

export const sendMessage = ({ msg }) => sendNeed({ need: "message", label: "Message", msg, risk: "normal" });

export const sendEmergency = ({ msg = "I need help now." } = {}) =>
  sendItem({ kind: "emergency", msg });

export const sendAck = (cmid) => {
  if (room) post("/ack", { room, cmid }).catch(() => {});
  say({ type: "ack", cmid, ts: Date.now() });
};

export const sendClear = (cmid) => {
  if (room) post("/clear", { room, cmid }).catch(() => {});
  say({ type: "clear", cmid, ts: Date.now() });
};

// ---- receiving ------------------------------------------------------------------

function dispatch(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === "request" && msg.cmid && seenCmids.has(msg.cmid)) return;
  if (msg.type === "request" && msg.cmid) seenCmids.add(msg.cmid);
  switch (msg.type) {
    case "request": handlers.request.forEach((f) => f(msg)); break;
    case "ack": handlers.ack.forEach((f) => f(msg)); break;
    case "clear": handlers.clear.forEach((f) => f(msg)); break;
    case "profile": handlers.profile.forEach((f) => f(msg)); break;
  }
}

export const on = (type, fn) => {
  if (handlers[type]) handlers[type].push(fn);
};

// ---- server polling (online mode) -------------------------------------------------

async function pollOnce() {
  if (!room) return;
  try {
    const r = await fetch(`/api/poll?room=${room}&after=${after}`);
    if (!r.ok) return;
    const data = await r.json();
    for (const m of data.messages || []) {
      after = Math.max(after, m.id);
      const cmid = m.cmid || `s${m.id}`;
      if (m.kind === "request" || m.kind === "emergency") {
        // dispatch() owns the seen-set: it skips + marks, then fans out.
        dispatch({
          type: "request",
          cmid,
          kind: m.kind === "emergency" ? "emergency" : "need",
          need: m.need, label: m.label, msg: m.sentence,
          risk: m.risk, patientName: m.patient, bed: m.bed,
          room: m.room, ts: m.created_ms,
        });
      } else if (m.kind === "ack") {
        dispatch({ type: "ack", cmid, ts: m.created_ms });
      } else if (m.kind === "clear") {
        dispatch({ type: "clear", cmid, ts: m.created_ms });
      }
    }
    if (data.profile) dispatch({ type: "profile", profile: data.profile, caps: data.caps || [], ts: data.now });
  } catch { /* offline — keep trying */ }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, 1500);
  pollOnce();
  setInterval(heartbeat, 6000);
  // keep the dedupe set bounded
  setInterval(() => {
    if (seenCmids.size > 500) seenCmids = new Set([...seenCmids].slice(-200));
  }, 120000);
}
