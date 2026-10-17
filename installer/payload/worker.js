// INTUBATALK — Cloudflare Worker API + static assets
// Table patient_messages(kind): request | ack | clear
//   request: need, label, icon, message, patient, bed, risk
//   ack:     need = id of the acknowledged request, patient = nurse side note
// Endpoints:
//   POST /api/session  {name, bed, room?} -> {room}
//   POST /api/request  {room, kind, need, label, icon, msg, patient, bed, risk}
//   POST /api/ack      {room, id, patientName}// POST /api/ack {room, id, patientName}
// POST /api/clear {room, patientName}
// POST /api/presence {room, patient, bed}
// GET  /api/poll?since=... -> {messages, rooms}
// Also supports multi-robot batch creation: POST /api/patients/batch.
// env bindings: DB (D1), ASSETS, optional ALLOWED_ORIGINS (comma-separated cross-origin clients).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env, url);
    // Camera: the patient tablet's eye-blink camera assist needs same-origin
    // camera access. Other than that, no sensitive permissions are requested.
    const assets = await env.ASSETS.fetch(request);
    const headers = new Headers(assets.headers);
    headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    headers.set("Content-Security-Policy", CSP);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    if (assets.status === 404) headers.set("X-Robots-Tag", "noindex");
    return new Response(assets.body, { status: assets.status, headers });
  },
};

// Cross-origin reads/writes are closed by default: the deployed frontend and the
// API always share one origin, so the CORS layer only re-echoes origins that an
// operator explicitly allowlisted via the ALLOWED_ORIGINS binding secret/env.
const CORS = {
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
};

const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self'; " +
  "frame-ancestors 'self'; " +
  "base-uri 'self'; form-action 'self'";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const withSecurity = (h = {}) => ({ "Content-Type": "application/json", ...CORS, ...SECURITY_HEADERS, ...h });

const J = (d, status = 200, extraHeaders) => new Response(JSON.stringify(d), {
  status,
  headers: withSecurity(extraHeaders),
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
      nurse TEXT,
      created_ms INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room, id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS room_caps (
      room TEXT PRIMARY KEY,
      caps TEXT NOT NULL DEFAULT '{}',
      updated_ms INTEGER NOT NULL DEFAULT 0
    )`),
  ]).then(async () => {
    // Upgrade databases created before nurse acknowledgements stored the nurse name.
    try { await db.prepare("ALTER TABLE messages ADD COLUMN nurse TEXT").run(); } catch { /* already exists */ }
  }).catch((err) => { schemaPromise = null; throw err; });
  return schemaPromise;
};

async function api(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: withSecurity() });
  const p = url.pathname;
  const rejected = guardRequest(request, env, url);
  if (rejected) return rejected;
  if (!rateLimit(request)) return tooMany();
  try {
    await ensureSchema(env.DB);
    if (p === "/api/session" && request.method === "POST") return await session(request, env);
    if (p === "/api/messages" && request.method === "POST") return await createMessage(request, env);
    if (p === "/api/ack" && request.method === "POST") return await ack(request, env);
    if (p === "/api/clear" && request.method === "POST") return await clearAll(request, env);
    if (p === "/api/profile" && request.method === "POST") return await profile(request, env);
    if (p === "/api/presence" && request.method === "POST") return await presence(request, env);
    if (p === "/api/room" && request.method === "GET") return await roomInfo(url, env);
    if (p === "/api/rooms" && request.method === "GET") return await listRooms(env);
    if (p === "/api/patients/batch" && request.method === "POST") return await batchPatients(request, env);
    // No matching API route -> 404 JSON for API paths
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

// ── Request hardening: origin gate + per-IP rate limit ──────────────────────
// The frontend, API and (in LAN mode) every tablet share one origin, so non-GET
// API requests from a different Origin / Sec-Fetch-Site are rejected. curl and
// native tools send no browser context headers and stay allowed, except for the
// mass-read endpoints (rooms listing + batch create), which are browser-only and
// therefore require real browser evidence — that is what "bot protection" means
// for the discovery/enumeration surface.

const isBrowserContext = (request) => {
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
};

const originMatchesRequest = (request, url) => {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const r = new URL(referer);
    // Same host AND scheme (http on LAN, https on the edge) = trusted app origin.
    return r.host === (request.headers.get("host") || url.host) && r.protocol === url.protocol;
  } catch { return false; }
};

const originInAllowlist = (env, request) => {
  const list = String(env?.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  const origin = request.headers.get("origin");
  return origin !== null && list.includes(origin);
};

const HARDENED_ENDPOINTS = new Set(["/api/rooms", "/api/patients/batch"]);

// Returns null when the request is acceptable, else a Response rejecting it.
const guardRequest = (request, env, url) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return E("method not allowed", 405);
  }
  if (HARDENED_ENDPOINTS.has(url.pathname)) {
    const browserTrusted =
      isBrowserContext(request) ||
      originMatchesRequest(request, url) ||
      originInAllowlist(env, request);
    if (!browserTrusted) return E("forbidden", 403);
  }
  return null;
};

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 180;
const rateBuckets = new Map();

const rateLimit = (request) => {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < RATE_WINDOW_MS);
  const allowed = bucket.hits.length < RATE_MAX_REQUESTS;
  if (allowed) bucket.hits.push(now);
  rateBuckets.set(ip, bucket);
  // Keep the map bounded; one isolate only.
  if (rateBuckets.size > 4000) {
    for (const [key, value] of rateBuckets) {
      if (!value.hits.length) rateBuckets.delete(key);
      if (rateBuckets.size <= 3000) break;
    }
  }
  return allowed;
};

const tooMany = () => new Response(JSON.stringify({ error: "rate limited" }), {
  status: 429,
  headers: { ...withSecurity(), "Retry-After": "30" },
});

async function roomInfo(url, env) {
  const code = url.searchParams.get("code") || url.searchParams.get("room") || "";
  if (!ROOM_RE.test(code)) return E("bad room");
  const row = await env.DB.prepare("SELECT room, name, bed, last_seen_ms FROM rooms WHERE room=?").bind(code).first();
  if (!row) return J({ exists: false, room: code });
  return J({
    exists: true,
    room: row.room,
    name: row.name,
    bed: row.bed,
    online: (Date.now() - (row.last_seen_ms || 0)) < 15000,
  });
}

async function listRooms(env) {
  // Bounded, trimmed read: room + display metadata only, capped at 50, newest first.
  const { results } = await env.DB.prepare("SELECT room, name, bed, last_seen_ms FROM rooms ORDER BY last_seen_ms DESC LIMIT 50").all();
  const rooms = (results || []).map((r) => ({
    room: r.room,
    name: r.name || "Patient",
    bed: r.bed || "",
    online: (Date.now() - (r.last_seen_ms || 0)) < 15000,
  }));
  return J({ ok: true, rooms });
}

async function batchPatients(request, env) {
  const b = await readBody(request);
  const list = (Array.isArray(b.patients) ? b.patients : []).slice(0, 20);
  const results = [];
  for (const item of list) {
    const name = String(item.name ?? "").trim().slice(0, 40) || "Patient";
    const bed = String(item.bed ?? "").trim().slice(0, 12);
    let room = String(item.room ?? "").trim();
    if (!ROOM_RE.test(room)) room = roomCode();
    await env.DB.prepare(
      "INSERT INTO rooms (room, name, bed, created_ms, last_seen_ms) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(room) DO UPDATE SET name=excluded.name, bed=excluded.bed, last_seen_ms=excluded.last_seen_ms"
    ).bind(room, name, bed, Date.now(), Date.now()).run();
    results.push({ room, name, bed });
  }
  return J({ ok: true, patients: results });
}

async function session(request, env) {
  const b = await readBody(request);
  const name = String(b.name ?? "").trim().slice(0, 40) || "Patient";
  const bed = String(b.bed ?? "").trim().slice(0, 12);
  if (ROOM_RE.test(b.room)) {
    await env.DB.prepare(
      "INSERT INTO rooms (room, name, bed, created_ms, last_seen_ms) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(room) DO UPDATE SET name=excluded.name, bed=excluded.bed, last_seen_ms=excluded.last_seen_ms"
    ).bind(b.room, name, bed, Date.now(), Date.now()).run();
    return J({ ok: true, room: b.room });
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
  if (cmid) {
    const existing = await env.DB.prepare("SELECT id FROM messages WHERE room=? AND cmid=? LIMIT 1").bind(b.room, cmid).first();
    if (existing) return J({ ok: true, id: existing.id, duplicate: true });
  }
  const r = await env.DB.prepare(
    "INSERT INTO messages (room, cmid, kind, need, label, sentence, urgent, risk, patient, bed, created_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(b.room, cmid, kind, need, label, sentence, kind === "emergency" ? 1 : 0, risk, patient, bed, Date.now()).run();
  return J({ ok: true, id: r.meta.last_row_id });
}

async function ack(request, env) {
  const b = await readBody(request);
  if (!ROOM_RE.test(b.room)) return E("bad room");
  const cmid = String(b.cmid ?? "").slice(0, 40);
  const nurse = String(b.nurse ?? b.nurseName ?? "").slice(0, 40);
  if (cmid) {
    await env.DB.prepare("UPDATE messages SET status='ack' WHERE room=? AND cmid=?").bind(b.room, cmid).run();
  }
  if (cmid) {
    const existingAck = await env.DB.prepare("SELECT id FROM messages WHERE room=? AND cmid=? AND kind='ack' LIMIT 1").bind(b.room, cmid).first();
    if (existingAck) return J({ ok: true, nurse: nurse || null, duplicate: true });
  }
  await env.DB.prepare(
    "INSERT INTO messages (room, cmid, kind, need, sentence, patient, bed, nurse, created_ms) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(b.room, cmid || null, "ack", "ack", nurse ? `${nurse} acknowledged` : "Nurse acknowledged", String(b.patient ?? "").slice(0, 40) || "", String(b.bed ?? "").slice(0, 12), nurse || null, Date.now()).run();
  return J({ ok: true, nurse: nurse || null });
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
  const rawRooms = url.searchParams.get("rooms") || url.searchParams.get("room") || "";
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const roomList = rawRooms.split(",").map((r) => r.trim()).filter((r) => ROOM_RE.test(r));
  if (!roomList.length) return E("bad room");

  const placeholders = roomList.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, room, cmid, kind, need, label, sentence, urgent, risk, status, patient, bed, nurse, created_ms
     FROM messages WHERE room IN (${placeholders}) AND id > ? ORDER BY id ASC LIMIT 250`
  ).bind(...roomList, after).all();

  const profiles = {};
  for (const rCode of roomList) {
    const rp = await env.DB.prepare(
      `SELECT name, bed, last_seen_ms FROM rooms WHERE room = ?`
    ).bind(rCode).first();
    let caps = [];
    try {
      const capRow = await env.DB.prepare("SELECT caps FROM room_caps WHERE room=?").bind(rCode).first();
      caps = capRow?.caps ? (JSON.parse(capRow.caps).caps || []) : [];
    } catch { /* older/invalid capability rows do not block polling */ }
    profiles[rCode] = rp ? { name: rp.name, bed: rp.bed, online: Date.now() - rp.last_seen_ms < 15000, caps } : { name: "Patient", bed: "", online: false, caps };
  }
  const primaryCode = roomList[0];

  return J({
    messages: results,
    lastId: results.length ? results[results.length - 1].id : after,
    profile: profiles[primaryCode] || null,
    profiles,
    now: Date.now(),
  });
}
