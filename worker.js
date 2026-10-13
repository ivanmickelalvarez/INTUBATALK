// INTUBATALK — Cloudflare Worker API + static assets
// Table patient_messages(kind): request | ack | clear
//   request: need, label, icon, message, patient, bed, risk
//   ack:     need = id of the acknowledged request, patient = nurse side note
// Endpoints:
//   POST /api/session  {name, bed, room?} -> {room}
//   POST /api/request  {room, kind, need, label, icon, msg, patient, bed, risk}
//   POST /api/ack      {room, id, patientName}
//   POST /api/clear    {room, patientName}
//   POST /api/presence {room, patient, bed}
//   GET  /api/poll?since=... -> {messages, rooms}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const J = (d, status = 200) => new Response(JSON.stringify(d), {
  status,
  headers: { "Content-Type": "application/json", ...CORS },
});

const E = (m, s = 400) => J({ error: m }, s);

let schemaPromise = null;
const ensureSchema = (db) => {
  schemaPromise ||= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      room TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Patient',
      bed TEXT,
      created_ms INTEGER NOT NULL DEFAULT 0,
      last_seen_ms INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      cmid TEXT,
      kind TEXT NOT NULL,
      need TEXT,
      label TEXT,
      sentence TEXT,
      urgent INTEGER NOT NULL DEFAULT 0,
      risk TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'new',
      patient TEXT,
      bed TEXT,
      created_ms INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room, id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS room_caps (
      room TEXT PRIMARY KEY,
      caps TEXT NOT NULL DEFAULT '{}',
      updated_ms INTEGER NOT NULL DEFAULT 0
    )`),
  ]).catch((err) => { schemaPromise = null; throw err; });
  return schemaPromise;
};

async function api(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const p = url.pathname;
  try {
    await ensureSchema(env.DB);
    if (p === "/api/session" && request.method === "POST") return await session(request, env);
    if (p === "/api/messages" && request.method === "POST") return await createMessage(request, env);
    if (p === "/api/ack" && request.method === "POST") return await ack(request, env);
    if (p === "/api/clear" && request.method === "POST") return await clearAll(request, env);
    if (p === "/api/profile" && request.method === "POST") return await profile(request, env);
    if (p === "/api/presence" && request.method === "POST") return await presence(request, env);
    if (p === "/api/poll" && request.method === "GET") return await poll(env, url);
  } catch (err) {
    return E(String(err?.message ?? err), 500);
  }
  return E("not found", 404);
}

const readBody = async (request) => {
  try { return await request.json(); } catch { return {}; }
};

const ROOM_RE = /^\d{4}$/;

async function session(request, env) {
  const b = await readBody(request);
  const name = String(b.name ?? "").trim().slice(0, 40) || "Patient";
  const bed = String(b.bed ?? "").trim().slice(0, 12);
  if (ROOM_RE.test(b.room)) {
    const upd = await env.DB.prepare("UPDATE rooms SET name=?, bed=?, last_seen_ms=? WHERE room=?")
      .bind(name, bed, Date.now(), b.room).run();
    if (upd.meta.changes > 0) return J({ ok: true, room: b.room });
  }
  // new code, retry in the rare collision case
  for (let i = 0; i < 8; i++) {
    const room = roomCode();
    try {
      await env.DB.prepare("INSERT INTO rooms (room, name, bed, created_ms, last_seen_ms) VALUES (?,?,?,?,?)")
        .bind(room, name, bed, Date.now(), Date.now()).run();
      return J({ ok: true, room });
    } catch (e) { /* unique collision → retry */ }
  }
  return E("could not allocate a room code", 503);
}

const roomCode = () => String(Math.floor(1000 + Math.random() * 9000));

const KINDS = new Set(["request", "emergency"]);
const NEED_KINDS = new Set(["need", "message", "blink"]);

async function createMessage(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  let kind = String(b.kind ?? "need");
  if (kind === "emergency") kind = "emergency";
  else if (NEED_KINDS.has(kind)) kind = "request";
  else return E("bad kind");
  const cmid = String(b.cmid ?? "").slice(0, 40) || null;
  const need = kind === "emergency" ? "emergency" : String(b.need ?? "").slice(0, 24);
  const label = String(b.label ?? "").slice(0, 40);
  const sentence = String(b.msg ?? "").slice(0, 500);
  const risk = kind === "emergency" ? "high" : String(b.risk ?? "normal") === "high" ? "high" : "normal";
  const patient = String(b.patientName ?? b.patient ?? "").slice(0, 40) || "Patient";
  const bed = String(b.bed ?? "").slice(0, 12);
  const r = await env.DB.prepare(
    "INSERT INTO messages (room, cmid, kind, need, label, sentence, urgent, risk, patient, bed, created_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(b.room, cmid, kind, need, label, sentence, kind === "emergency" ? 1 : 0, risk, patient, bed, Date.now()).run();
  return J({ ok: true, id: r.meta.last_row_id });
}

async function ack(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  const cmid = String(b.cmid ?? "").slice(0, 40);
  if (cmid) {
    await env.DB.prepare("UPDATE messages SET status='ack' WHERE room=? AND cmid=?").bind(b.room, cmid).run();
  }
  await env.DB.prepare(
    "INSERT INTO messages (room, cmid, kind, need, sentence, patient, bed, created_ms) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(b.room, cmid || null, "ack", "ack", "Nurse acknowledged", String(b.patient ?? "").slice(0, 40) || "", String(b.bed ?? "").slice(0, 12), Date.now()).run();
  return J({ ok: true });
}

async function clearAll(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  await env.DB.prepare("UPDATE messages SET status='cleared' WHERE room=? AND kind='emergency' AND status IN ('new','ack')")
    .bind(b.room).run();
  await env.DB.prepare(
    "INSERT INTO messages (room, kind, need, sentence, patient, bed, created_ms) VALUES (?,?,?,?,?,?,?)"
  ).bind(b.room, "clear", "clear", "The patient says they are all right now.", String(b.patient ?? "").slice(0, 40) || "", String(b.bed ?? "").slice(0, 12), Date.now()).run();
  return J({ ok: true });
}

async function profile(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  const val = JSON.stringify({
    name: String(b.name ?? "").slice(0, 40) || "Patient",
    bed: String(b.bed ?? "").slice(0, 12),
    caps: Array.isArray(b.caps) ? b.caps.slice(0, 8) : [],
  });
  await env.DB.prepare(
    "INSERT INTO rooms (room, name, bed, created_ms, last_seen_ms) VALUES (?,?,?,?,?) " +
    "ON CONFLICT(room) DO UPDATE SET name=excluded.name, bed=excluded.bed, last_seen_ms=excluded.last_seen_ms"
  ).bind(b.room, String(b.name ?? "").slice(0, 40) || "Patient", String(b.bed ?? "").slice(0, 12), Date.now(), Date.now()).run();
  await env.DB.prepare(
    "INSERT INTO room_caps (room, caps, updated_ms) VALUES (?,?,?) " +
    "ON CONFLICT(room) DO UPDATE SET caps=excluded.caps, updated_ms=excluded.updated_ms"
  ).bind(b.room, val, Date.now()).run();
  return J({ ok: true });
}

async function presence(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  const upd = await env.DB.prepare("UPDATE rooms SET name=?, bed=?, last_seen_ms=? WHERE room=?")
    .bind(String(b.name ?? "").slice(0, 40) || "Patient", String(b.bed ?? "").slice(0, 12), Date.now(), b.room).run();
  return J({ ok: true, known: upd.meta.changes > 0 });
}

async function poll(env, url) {
  const room = url.searchParams.get("room") || "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  if (!ROOM_RE.test(room)) return E("bad room");
  const { results } = await env.DB.prepare(
    `SELECT id, cmid, kind, need, label, sentence, urgent, risk, status, patient, bed, created_ms
     FROM messages WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 200`
  ).bind(room, after).all();
  const rp = await env.DB.prepare(
    `SELECT name, bed, last_seen_ms FROM rooms WHERE room = ?`
  ).bind(room).first();
  const capsRow = await env.DB.prepare("SELECT caps FROM room_caps WHERE room = ?").bind(room).first();
  let caps = [];
  try { caps = capsRow ? JSON.parse(capsRow.caps).caps ?? [] : []; } catch { caps = []; }
  return J({
    messages: results,
    lastId: results.length ? results[results.length - 1].id : after,
    profile: rp ? { name: rp.name, bed: rp.bed, online: Date.now() - rp.last_seen_ms < 15000 } : null,
    caps,
    now: Date.now(),
  });
}
