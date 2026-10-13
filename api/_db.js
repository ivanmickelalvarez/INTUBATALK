// Vercel Serverless in-memory & global state engine for INTUBATALK

if (!globalThis.__intubatalk_store) {
  globalThis.__intubatalk_store = {
    rooms: {},
    messages: [],
    nextId: 1,
  };
}

const store = globalThis.__intubatalk_store;

const ROOM_RE = /^\d{4}$/;
const generateRoom = () => String(Math.floor(1000 + Math.random() * 9000));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJSON(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(CORS)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
  });
}

module.exports = {
  store,
  ROOM_RE,
  generateRoom,
  CORS,
  sendJSON,
  sendError,
  parseBody,
};

