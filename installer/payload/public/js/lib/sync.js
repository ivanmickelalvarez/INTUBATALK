// Sync client for INTUBATALK.
// Primary: shared server API (works across devices on Wi-Fi).
// Fallback: BroadcastChannel between tabs in ONE browser, so a single
// laptop can demo patient ↔ nurse with no network at all.
import { uid } from "./util.js";
import { classifyApiResponse, classifyConnectivityProbe } from "./connection-state.mjs";

const LS_ROOM = "it_room";
const LS_OUTBOX = "it_outbox";
const handlers = { request: [], ack: [], clear: [], profile: [], profiles: [], connection: [] };
let room = null;          // primary room code (for patient tablet)
let rooms = [];           // array of room codes (for multi-patient nurse dashboard)
let pollTimer = null;     // behind null until register/attach
let after = 0;            // last server message id seen
let seenCmids = new Set();
let outbox = [];
let outboxBusy = false;
let outboxTimer = null;

// ---- broadcast channel (single-browser demo) ------------------------------

let channelLocal = null;
try {
  channelLocal = new BroadcastChannel("intubatalk");
  channelLocal.onmessage = (e) => dispatch(e.data || {});
} catch { /* unsupported */ }

const say = (msg) => { try { channelLocal?.postMessage(msg); } catch { /* noop */ } };

try {
  const saved = JSON.parse(localStorage.getItem(LS_OUTBOX) || "[]");
  outbox = Array.isArray(saved) ? saved.slice(-100) : [];
} catch { outbox = []; }

const persistOutbox = () => {
  try { localStorage.setItem(LS_OUTBOX, JSON.stringify(outbox.slice(-100))); } catch { /* private mode */ }
};

const notifyConnection = (ok) => reportConnection(ok);

const post = (path, body) =>
  fetch(`/api${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => {
    const state = classifyApiResponse({
      ok: response.ok,
      status: response.status,
      type: response.type,
      redirected: response.redirected,
      url: response.url,
      contentType: response.headers.get("content-type"),
    });
    if (state !== "live") {
      const error = new Error(`API ${response.status}`);
      error.connectionState = state;
      throw error;
    }
    notifyConnection("live");
    return response;
  }).catch((error) => {
    if (error.connectionState) notifyConnection(error.connectionState);
    else checkConnection();
    throw error;
  });

export async function checkConnection() {
  try {
    const response = await fetch("/manifest.webmanifest?connectivity-check=1", {
      cache: "no-store",
      redirect: "manual",
    });
    reportConnection(classifyConnectivityProbe({
      ok: response.ok,
      status: response.status,
      type: response.type,
      redirected: response.redirected,
    }));
  } catch {
    reportConnection(classifyConnectivityProbe(null));
  }
}

const queuePost = (path, body, key = `${path}:${body.cmid || Date.now()}`) => {
  const existing = outbox.find((item) => item.key === key);
  if (existing) {
    existing.body = body;
    existing.next_ms = Math.min(existing.next_ms, Date.now());
  } else {
    outbox.push({ key, path, body, attempts: 0, next_ms: Date.now() });
    persistOutbox();
  }
  persistOutbox();
  flushOutbox();
};

async function flushOutbox() {
  if (outboxBusy || !outbox.length) return;
  outboxBusy = true;
  try {
    for (const item of [...outbox]) {
      if (item.next_ms > Date.now()) continue;
      try {
        await post(item.path, item.body);
        outbox = outbox.filter((candidate) => candidate.key !== item.key);
        persistOutbox();
      } catch {
        item.attempts = Math.min((item.attempts || 0) + 1, 8);
        item.next_ms = Date.now() + Math.min(30000, 1000 * (2 ** item.attempts));
        persistOutbox();
      }
    }
  } finally {
    outboxBusy = false;
    if (outbox.length) {
      clearTimeout(outboxTimer);
      const next = Math.max(500, Math.min(...outbox.map((item) => Math.max(0, item.next_ms - Date.now()))));
      outboxTimer = setTimeout(flushOutbox, next);
    }
  }
}

// ---- room / registration ---------------------------------------------------

const cacheRead = (k) => { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch { return null; } };

export const getRoom = () => room || rooms[0] || null;
export const getRooms = () => rooms.slice();

// The room code persisted on this device (survives reloads).
export const getRememberedRoom = () => cacheRead(LS_ROOM);

// Patient creates a fresh room for a new session.
export const register = async ({ name, bed, forceNew = true }) => {
  const remembered = forceNew ? undefined : cacheRead(LS_ROOM);
  const r = await post("/session", { name, bed, room: remembered });
  if (!r.ok) throw new Error(`session failed (${r.status})`);
  const data = await r.json();
  room = data.room;
  rooms = [room];
  try {
    localStorage.setItem(LS_ROOM, room);
    sessionStorage.setItem(LS_ROOM, room);
  } catch { /* private mode */ }
  startPolling();
  heartbeat();
  queuePost("/profile", { room, name, bed, caps: profileCache().caps || [] }, `/profile:${room}`);
  return room;
};

// Nurse passively watches a room or list of rooms.
export const attach = (codeOrCodes) => {
  if (Array.isArray(codeOrCodes)) {
    rooms = Array.from(new Set(codeOrCodes.filter(Boolean)));
    room = rooms[0] || null;
  } else if (typeof codeOrCodes === "string" && codeOrCodes.includes(",")) {
    rooms = Array.from(new Set(codeOrCodes.split(",").map(c => c.trim()).filter(Boolean)));
    room = rooms[0] || null;
  } else {
    room = codeOrCodes;
    rooms = codeOrCodes ? [codeOrCodes] : [];
  }
  try { sessionStorage.setItem(LS_ROOM, rooms.join(",")); } catch { /* noop */ }
  startPolling();
};

export const attachRooms = (list) => {
  rooms = Array.from(new Set((list || []).filter(Boolean)));
  room = rooms[0] || null;
  try { sessionStorage.setItem(LS_ROOM, rooms.join(",")); } catch { /* noop */ }
  startPolling();
  pollOnce();
};

export const addRoom = (code) => {
  if (!code) return;
  if (!rooms.includes(code)) rooms.push(code);
  if (!room) room = code;
  try { sessionStorage.setItem(LS_ROOM, rooms.join(",")); } catch { /* noop */ }
  pollOnce();
};

export const removeRoom = (code) => {
  rooms = rooms.filter(c => c !== code);
  if (room === code) room = rooms[0] || null;
  try { sessionStorage.setItem(LS_ROOM, rooms.join(",")); } catch { /* noop */ }
};

// Completely wipe session and profile so app starts fresh from the beginning.
export const clearSession = () => {
  room = null;
  rooms = [];
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
    queuePost("/profile", { room, name: p.name, bed: p.bed, caps: p.caps || [] }, `/profile:${room}`);
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
  if (room) queuePost("/messages", payload, `/messages:${payload.cmid}`);
  say(payload);
  return payload.cmid;
}

export const sendNeed = ({ need, label, msg, risk = "normal" }) =>
  sendItem({ kind: "need", need, label, msg, risk });

export const sendMessage = ({ msg }) => sendNeed({ need: "message", label: "Message", msg, risk: "normal" });

export const sendEmergency = ({ msg = "I need help now." } = {}) =>
  sendItem({ kind: "emergency", msg });

export const sendAck = (cmid, targetRoom, nurseName) => {
  const r = targetRoom || room;
  if (r) queuePost("/ack", { room: r, cmid, nurse: nurseName || undefined }, `/ack:${r}:${cmid}`);
  say({ type: "ack", cmid, room: r, nurse: nurseName || null, ts: Date.now() });
};

export const sendClear = (cmid, targetRoom) => {
  const r = targetRoom || room;
  if (r) queuePost("/clear", { room: r, cmid }, `/clear:${r}:${cmid || "room"}`);
  say({ type: "clear", cmid, room: r, ts: Date.now() });
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
    case "profiles": handlers.profiles.forEach((f) => f(msg)); break;
    case "connection": handlers.connection.forEach((f) => f(msg)); break;
  }
}

export const on = (type, fn) => {
  if (handlers[type]) handlers[type].push(fn);
};

// ---- server polling (online mode) -------------------------------------------------

async function pollOnce() {
  const activeRooms = rooms.length ? rooms : (room ? [room] : []);
  if (!activeRooms.length) return;
  try {
    const query = activeRooms.join(",");
    const r = await fetch(`/api/poll?rooms=${encodeURIComponent(query)}&after=${after}`, { redirect: "manual" });
    const state = classifyApiResponse({
      ok: r.ok,
      status: r.status,
      type: r.type,
      redirected: r.redirected,
      url: r.url,
      contentType: r.headers.get("content-type"),
    });
    if (state !== "live") { reportConnection(state); return; }
    const data = await r.json();
    reportConnection("live");
    for (const m of data.messages || []) {
      after = Math.max(after, m.id);
      const cmid = m.cmid || `s${m.id}`;
      if (m.kind === "request" || m.kind === "emergency") {
        dispatch({
          type: "request",
          cmid,
          kind: m.kind === "emergency" ? "emergency" : "need",
          need: m.need, label: m.label, msg: m.sentence,
          risk: m.risk, patientName: m.patient, bed: m.bed,
          room: m.room, ts: m.created_ms,
        });
      } else if (m.kind === "ack") {
        dispatch({ type: "ack", cmid, room: m.room, nurse: m.nurse, ts: m.created_ms });
      } else if (m.kind === "clear") {
        dispatch({ type: "clear", cmid, room: m.room, ts: m.created_ms });
      }
    }
    if (data.profiles) dispatch({ type: "profiles", profiles: data.profiles, ts: data.now });
    if (data.profile) dispatch({ type: "profile", profile: data.profile, caps: data.caps || [], ts: data.now });
    flushOutbox();
  } catch { /* offline — keep trying */ checkConnection(); }
}

// Connection state derived from poll results (online iff last attempt succeeded).
let connState = null; // null | "online" | "offline"
function reportConnection(ok) {
  const next = ok === true ? "live" : ok === false ? "offline" : ok;
  if (next === connState) return;
  connState = next;
  handlers.connection.forEach((f) => { try { f(ok); } catch { /* listener bug */ } });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, 1500);
  pollOnce();
  flushOutbox();
  setInterval(heartbeat, 6000);
  // keep the dedupe set bounded
  setInterval(() => {
    if (seenCmids.size > 500) seenCmids = new Set([...seenCmids].slice(-200));
  }, 120000);
}

window.addEventListener("online", () => { checkConnection(); flushOutbox(); pollOnce(); });
window.addEventListener("offline", checkConnection);
