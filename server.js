// INTUBATALK — Universal Standalone Node.js HTTP Server & API
// Zero dependencies. Supports local testing, cross-device Wi-Fi, and desktop EXE packaging.

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");

const PORT = parseInt(process.env.PORT || "8788", 10) || 8788;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, ".intubatalk-store.json");

// In-memory data store with optional file persistence
let store = {
  rooms: {},     // room -> { room, name, bed, created_ms, last_seen_ms, caps: [] }
  messages: [],  // [ { id, room, cmid, kind, need, label, sentence, urgent, risk, status, patient, bed, created_ms } ]
  nextId: 1,
};

// Try loading existing state from file
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.rooms && Array.isArray(parsed.messages)) {
      store = parsed;
      store.nextId = store.messages.length ? Math.max(...store.messages.map(m => m.id)) + 1 : 1;
    }
  }
} catch { /* use clean store */ }

function saveStore() {
  try {
    // Keep messages bounded to last 1000
    if (store.messages.length > 1000) {
      store.messages = store.messages.slice(-1000);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch { /* ignore write errors */ }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Browser-enforced safety headers, mirrored from worker.js so the local/EXE
// deployment gets the same policy surface as the edge deployment.
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
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
};

const sendJSON = (res, data, status = 200) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
};

const sendError = (res, message, status = 400) => sendJSON(res, { error: message }, status);

const parseBody = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
  });

const ROOM_RE = /^\d{4}$/;
const generateRoom = () => String(Math.floor(1000 + Math.random() * 9000));

// ── Request hardening (mirrors worker.js) ────────────────────────────────────
// API calls always share the origin with the pages on local/LAN, so discovery
// endpoints require real browser-context headers (Sec-Fetch-Site / same-host
// Origin-Referer). Plain server-to-server clients stay allowed everywhere else,
// but are rate limited per IP.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 180;
const rateBuckets = new Map();

const clientIp = (req) => (req.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "");

const rateLimit = (req) => {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < RATE_WINDOW_MS);
  const allowed = bucket.hits.length < RATE_MAX_REQUESTS;
  if (allowed) bucket.hits.push(now);
  rateBuckets.set(ip, bucket);
  if (rateBuckets.size > 4000) {
    for (const [key, value] of rateBuckets) {
      if (!value.hits.length) rateBuckets.delete(key);
      if (rateBuckets.size <= 3000) break;
    }
  }
  return allowed;
};

const originMatchesRequest = (req, parsedUrl) => {
  const referer = req.headers.referer;
  if (!referer) return false;
  try {
    const r = new URL(referer);
    return r.host === (req.headers.host || parsedUrl.host) && r.protocol === parsedUrl.protocol;
  } catch { return false; }
};

const isBrowserContext = (req) => {
  const site = req.headers["sec-fetch-site"];
  return site === "same-origin" || site === "none";
};

// Returns null when acceptable, else throws a Response-ish handled by handleApi.
const guardRequest = (req, parsedUrl) => {
  if (parsedUrl.pathname === "/api/rooms" || parsedUrl.pathname === "/api/patients/batch") {
    if (isBrowserContext(req) || originMatchesRequest(req, parsedUrl)) return null;
    throw { status: 403, message: "forbidden" };
  }
  return null;
};

// API handlers
async function handleApi(req, res, pathname) {
  const parsedUrl = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(parsedUrl.searchParams);

  try {
    guardRequest(req, parsedUrl);
    if (!rateLimit(req)) return sendJSON(res, { error: "rate limited" }, 429);
  } catch (guard) {
    return sendError(res, guard.message || "forbidden", guard.status || 403);
  }

  // POST /api/session
  if (pathname === "/api/session" && req.method === "POST") {
    const b = await parseBody(req);
    const name = String(b.name ?? "").trim().slice(0, 40) || "Patient";
    const bed = String(b.bed ?? "").trim().slice(0, 12);
    let room = b.room;
    if (ROOM_RE.test(room)) {
      if (!store.rooms[room]) {
        store.rooms[room] = {
          room, name, bed,
          created_ms: Date.now(),
          last_seen_ms: Date.now(),
          caps: [],
        };
      } else {
        store.rooms[room].name = name;
        store.rooms[room].bed = bed;
        store.rooms[room].last_seen_ms = Date.now();
      }
      saveStore();
      return sendJSON(res, { ok: true, room });
    }
    // Allocate new room code
    for (let i = 0; i < 20; i++) {
      room = generateRoom();
      if (!store.rooms[room]) break;
    }
    store.rooms[room] = {
      room, name, bed,
      created_ms: Date.now(),
      last_seen_ms: Date.now(),
      caps: [],
    };
    saveStore();
    return sendJSON(res, { ok: true, room });
  }

  // POST /api/messages
  if (pathname === "/api/messages" && req.method === "POST") {
    const b = await parseBody(req);
    if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
    let kind = String(b.kind ?? "need");
    if (kind === "emergency") kind = "emergency";
    else kind = "request";

    const msgObj = {
      id: store.nextId++,
      room: b.room,
      cmid: String(b.cmid ?? "").slice(0, 40) || null,
      kind,
      need: kind === "emergency" ? "emergency" : String(b.need ?? "").slice(0, 24),
      label: String(b.label ?? "").slice(0, 40),
      sentence: String(b.msg ?? "").slice(0, 500),
      urgent: kind === "emergency" ? 1 : 0,
      risk: kind === "emergency" ? "high" : (String(b.risk ?? "normal") === "high" ? "high" : "normal"),
      status: "new",
      patient: String(b.patientName ?? b.patient ?? "").slice(0, 40) || "Patient",
      bed: String(b.bed ?? "").slice(0, 12),
      created_ms: Date.now(),
    };

    const existing = store.messages.find((m) => m.room === msgObj.room && m.cmid && m.cmid === msgObj.cmid);
    if (existing) return sendJSON(res, { ok: true, id: existing.id, duplicate: true });
    store.messages.push(msgObj);
    saveStore();
    return sendJSON(res, { ok: true, id: msgObj.id });
  }

  // POST /api/ack
  if (pathname === "/api/ack" && req.method === "POST") {
    const b = await parseBody(req);
    if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
    const cmid = String(b.cmid ?? "").slice(0, 40);
    const nurse = String(b.nurse ?? b.nurseName ?? "").slice(0, 40);
    if (cmid) {
      store.messages.forEach((m) => {
        if (m.room === b.room && m.cmid === cmid) {
          m.status = "ack";
          if (nurse) m.nurse = nurse;
        }
      });
    }
    store.messages.push({
      id: store.nextId++,
      room: b.room,
      cmid: cmid || null,
      kind: "ack",
      need: "ack",
      sentence: nurse ? `${nurse} acknowledged` : "Nurse acknowledged",
      status: "ack",
      nurse: nurse || null,
      patient: String(b.patient ?? "").slice(0, 40),
      bed: String(b.bed ?? "").slice(0, 12),
      created_ms: Date.now(),
    });
    saveStore();
    return sendJSON(res, { ok: true, nurse: nurse || null });
  }

  // POST /api/clear
  if (pathname === "/api/clear" && req.method === "POST") {
    const b = await parseBody(req);
    if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
    store.messages.forEach((m) => {
      if (m.room === b.room && m.kind === "emergency") m.status = "cleared";
    });
    store.messages.push({
      id: store.nextId++,
      room: b.room,
      kind: "clear",
      need: "clear",
      sentence: "The patient says they are all right now.",
      patient: String(b.patient ?? "").slice(0, 40),
      bed: String(b.bed ?? "").slice(0, 12),
      created_ms: Date.now(),
    });
    saveStore();
    return sendJSON(res, { ok: true });
  }

  // POST /api/profile
  if (pathname === "/api/profile" && req.method === "POST") {
    const b = await parseBody(req);
    if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
    const r = store.rooms[b.room] || { room: b.room, created_ms: Date.now() };
    r.name = String(b.name ?? "").slice(0, 40) || "Patient";
    r.bed = String(b.bed ?? "").slice(0, 12);
    r.caps = Array.isArray(b.caps) ? b.caps.slice(0, 8) : [];
    r.last_seen_ms = Date.now();
    store.rooms[b.room] = r;
    saveStore();
    return sendJSON(res, { ok: true });
  }

  // POST /api/presence
  if (pathname === "/api/presence" && req.method === "POST") {
    const b = await parseBody(req);
    if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
    const r = store.rooms[b.room];
    if (r) {
      r.name = String(b.name ?? r.name).slice(0, 40) || "Patient";
      r.bed = String(b.bed ?? r.bed).slice(0, 12);
      r.last_seen_ms = Date.now();
      saveStore();
      return sendJSON(res, { ok: true, known: true });
    }
    return sendJSON(res, { ok: true, known: false });
  }

  // GET /api/room (check if a room code exists and get patient metadata)
  if (pathname === "/api/room" && req.method === "GET") {
    const code = query.code || query.room || "";
    if (!ROOM_RE.test(code)) return sendError(res, "bad room");
    const r = store.rooms[code];
    if (!r) return sendJSON(res, { exists: false, room: code });
    return sendJSON(res, {
      exists: true,
      room: r.room,
      name: r.name,
      bed: r.bed,
      online: Date.now() - r.last_seen_ms < 15000,
    });
  }

  // GET /api/rooms (list all known / active rooms)
  if (pathname === "/api/rooms" && req.method === "GET") {
    const list = Object.values(store.rooms).map((r) => ({
      room: r.room,
      name: r.name || "Patient",
      bed: r.bed || "",
      online: Date.now() - (r.last_seen_ms || 0) < 15000,
      last_seen_ms: r.last_seen_ms || 0,
    }));
    return sendJSON(res, { ok: true, rooms: list });
  }

  // POST /api/patients/batch (register or update multiple patients at once)
  if (pathname === "/api/patients/batch" && req.method === "POST") {
    const b = await parseBody(req);
    const list = Array.isArray(b.patients) ? b.patients : [];
    const results = [];
    for (const item of list) {
      const name = String(item.name ?? "").trim().slice(0, 40) || "Patient";
      const bed = String(item.bed ?? "").trim().slice(0, 12);
      let room = String(item.room ?? "").trim();
      if (!ROOM_RE.test(room)) {
        for (let i = 0; i < 20; i++) {
          room = generateRoom();
          if (!store.rooms[room]) break;
        }
      }
      if (!store.rooms[room]) {
        store.rooms[room] = {
          room, name, bed,
          created_ms: Date.now(),
          last_seen_ms: Date.now(),
          caps: [],
        };
      } else {
        store.rooms[room].name = name;
        store.rooms[room].bed = bed;
        store.rooms[room].last_seen_ms = Date.now();
      }
      results.push({ room, name, bed });
    }
    saveStore();
    return sendJSON(res, { ok: true, patients: results });
  }

  // GET /api/poll (supports single room or multiple comma-separated rooms)
  if (pathname === "/api/poll" && req.method === "GET") {
    const rawRooms = query.rooms || query.room || "";
    const after = Math.max(0, parseInt(query.after ?? "0", 10) || 0);
    const roomList = rawRooms.split(",").map(r => r.trim()).filter(r => ROOM_RE.test(r));
    if (!roomList.length) return sendError(res, "bad room");

    const matched = store.messages
      .filter((m) => roomList.includes(m.room) && m.id > after)
      .slice(0, 300);

    const profiles = {};
    for (const rCode of roomList) {
      const r = store.rooms[rCode];
      profiles[rCode] = r ? {
        name: r.name,
        bed: r.bed,
        online: Date.now() - r.last_seen_ms < 15000,
        caps: r.caps || [],
      } : {
        name: "Patient",
        bed: "",
        online: false,
        caps: [],
      };
    }

    const primaryCode = roomList[0];
    const rPrimary = store.rooms[primaryCode];
    const primaryProfile = profiles[primaryCode] || null;

    return sendJSON(res, {
      messages: matched,
      lastId: matched.length ? matched[matched.length - 1].id : after,
      profile: primaryProfile,
      profiles,
      caps: rPrimary?.caps || [],
      now: Date.now(),
    });
  }

  return sendError(res, "not found", 404);
}

// Static file server
function serveStatic(req, res, pathname) {
  let cleanPath = pathname;
  if (cleanPath === "/" || cleanPath === "") cleanPath = "/index.html";
  else if (cleanPath === "/choose") cleanPath = "/choose.html";
  else if (cleanPath === "/nurse") cleanPath = "/nurse.html";
  else if (cleanPath === "/board") cleanPath = "/board.html";
  else if (cleanPath === "/favicon.ico") cleanPath = "/icons/icon.svg";
  else if (cleanPath === "/dual") cleanPath = "/dual.html";
  else if (cleanPath === "/privacy") cleanPath = "/privacy.html";
  else if (cleanPath === "/guidelines") cleanPath = "/guidelines.html";
  else if (cleanPath === "/console") {
    const consoleFile = path.join(__dirname, "INTUBATALK-Test-Console.html");
    if (fs.existsSync(consoleFile)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS });
      return fs.createReadStream(consoleFile).pipe(res);
    }
  }

  let filePath = path.join(PUBLIC_DIR, cleanPath);
  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end("Forbidden");
  }

  const notFound = (res) => {
    const nfPath = path.join(PUBLIC_DIR, "404.html");
    if (fs.existsSync(nfPath)) {
      res.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex",
        ...CORS_HEADERS,
      });
      fs.createReadStream(nfPath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("File Not Found");
    }
  };

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Try appending .html
    if (fs.existsSync(filePath + ".html")) {
      filePath = filePath + ".html";
    } else {
      return notFound(res);
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  // Code assets (html/js/css/manifest/worker/sitemap) must always revalidate, or
  // clients pin old builds for up to an hour after an update ships (e.g. a nurse
  // still sees last month's sign-in flow). Only static artwork (png/webp) caches long.
  const isImmutableArt = ext === ".png" || ext === ".webp";
  res.writeHead(200, {
    "Content-Type": contentType,
    ...CORS_HEADERS,
    ...SECURITY_HEADERS,
    // Camera is needed by the patient's eye-blink camera assist (same-origin only).
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    "Cache-Control": isImmutableArt ? "public, max-age=31536000, immutable" : "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, pathname);
    } catch (err) {
      sendError(res, String(err?.message ?? err), 500);
    }
  } else {
    serveStatic(req, res, pathname);
  }
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function startListening(port, maxAttempts = 10) {
  server.listen(port, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log("\n=======================================================");
    console.log("   INTUBATALK Server Online");
    console.log("=======================================================");
    console.log(` > Local:        http://127.0.0.1:${port}/`);
    console.log(` > Patient:      http://127.0.0.1:${port}/`);
    console.log(` > Nurse:        http://127.0.0.1:${port}/nurse`);
    console.log(` > Dual View:    http://127.0.0.1:${port}/dual`);
    console.log(` > Backup Board: http://127.0.0.1:${port}/board`);
    console.log(` > Wi-Fi / LAN:  http://${localIp}:${port}/`);
    console.log("=======================================================\n");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && maxAttempts > 0) {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      startListening(port + 1, maxAttempts - 1);
    } else {
      console.error("Server failed to start:", err);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  startListening(PORT);
}

module.exports = { server, store };
