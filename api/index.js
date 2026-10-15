const { store, ROOM_RE, generateRoom, CORS, sendJSON, sendError, parseBody } = require("./_db");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    return res.end();
  }

  const parsedUrl = new URL(req.url || "/", "http://localhost");
  let pathname = parsedUrl.pathname.replace(/\/api\/index$/, "");
  if (!pathname.startsWith("/api/")) {
    pathname = "/api" + (pathname.startsWith("/") ? pathname : "/" + pathname);
  }
  const query = Object.fromEntries(parsedUrl.searchParams);

  try {
    // POST /api/session
    if (pathname === "/api/session" && req.method === "POST") {
      const b = await parseBody(req);
      const name = String(b.name ?? "").trim().slice(0, 40) || "Patient";
      const bed = String(b.bed ?? "").trim().slice(0, 12);
      let room = b.room;
      if (ROOM_RE.test(room) && store.rooms[room]) {
        store.rooms[room].name = name;
        store.rooms[room].bed = bed;
        store.rooms[room].last_seen_ms = Date.now();
        return sendJSON(res, { ok: true, room });
      }
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
      return sendJSON(res, { ok: true, id: msgObj.id });
    }

    // POST /api/ack
    if (pathname === "/api/ack" && req.method === "POST") {
      const b = await parseBody(req);
      if (!ROOM_RE.test(b.room)) return sendError(res, "bad room");
      const cmid = String(b.cmid ?? "").slice(0, 40);
      if (cmid) {
        store.messages.forEach((m) => {
          if (m.room === b.room && m.cmid === cmid) m.status = "ack";
        });
      }
      store.messages.push({
        id: store.nextId++,
        room: b.room,
        cmid: cmid || null,
        kind: "ack",
        need: "ack",
        sentence: "Nurse acknowledged",
        status: "ack",
        patient: String(b.patient ?? "").slice(0, 40),
        bed: String(b.bed ?? "").slice(0, 12),
        created_ms: Date.now(),
      });
      return sendJSON(res, { ok: true });
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
        return sendJSON(res, { ok: true, known: true });
      }
      return sendJSON(res, { ok: true, known: false });
    }

    // GET /api/poll
    if (pathname === "/api/poll" && req.method === "GET") {
      const room = query.room || "";
      const after = Math.max(0, parseInt(query.after ?? "0", 10) || 0);
      if (!ROOM_RE.test(room)) return sendError(res, "bad room");

      const matched = store.messages
        .filter((m) => m.room === room && m.id > after)
        .slice(0, 200);

      const r = store.rooms[room];
      const profile = r ? {
        name: r.name,
        bed: r.bed,
        online: Date.now() - r.last_seen_ms < 15000,
      } : null;

      return sendJSON(res, {
        messages: matched,
        lastId: matched.length ? matched[matched.length - 1].id : after,
        profile,
        caps: r?.caps || [],
        now: Date.now(),
      });
    }

    return sendError(res, "not found", 404);
  } catch (err) {
    return sendError(res, String(err?.message ?? err), 500);
  }
};
