// INTUBATALK nurse dashboard. Claymorphism UI, SVG icon set, no emojis.
import { $, $$, esc, fmtClock, fmtAgo, loadJSON, saveJSON } from "./lib/util.js";
import * as audio from "./lib/audio.js";
import { speak, stopSpeech } from "./lib/tts.js";
import { svg } from "./lib/icons.js";
import { startAmbient } from "./lib/ambient.js";
import * as sync from "./lib/sync.js";
import { NEEDS } from "./needs.js";

const LS_FEED_PREFIX = "it_nurse_feed_";
const LS_MUTE = "it_nurse_mute";
const DEMO = "__demo__";

let code = null;
let feed = [];
let mute = loadJSON(LS_MUTE, false);
let lastPatient = null;
let alarmCmid = null;
let titleBase = "INTUBATALK · Nurse Dashboard";
let clockTimer = null;
let currentFilter = "all";

audio.setMuted(mute);

const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* noop */ } };

const iconFor = (r) => {
  if (r.kind === "emergency") return "emergency";
  const n = NEEDS[r.need];
  if (n?.icon) return n.icon;
  if (r.need === "message") return r.label === "Spelled" ? "alphabet" : "write";
  if (r.need === "blink") return "blink";
  if (r.need === "pain") return "pain";
  if (r.need === "call") return "bell";
  return "nurse";
};

// ------------------------------------------------------------------ join screen

function renderJoin() {
  document.title = titleBase;
  $("#codeTag").innerHTML = "code · · · ·";
  $("#main").innerHTML = `
    <section class="clay join-card">
      <nav class="role-nav" aria-label="Role selector" style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span class="badge" style="padding:6px 14px;font-size:13px;font-weight:700;background:var(--accent-soft);color:#235f55">🩺 Nurse Station</span>
        <a class="badge" href="/" style="padding:6px 14px;font-size:13px;font-weight:700;text-decoration:none;color:var(--text-soft)">👤 Switch to Patient Tablet →</a>
        <a class="badge" href="/dual" style="padding:6px 14px;font-size:13px;font-weight:700;text-decoration:none;color:var(--text-soft)">👥 Dual Simulator →</a>
      </nav>
      <h1>Nurse dashboard</h1>
      <p class="hint">On the patient tablet, read the four digit room code in the top bar and type it here. Everything the patient taps lands on this screen.</p>
      <label class="sr-only" for="inRoom">Room code</label>
      <input id="inRoom" inputmode="numeric" maxlength="4" placeholder="····" autocomplete="off">
      <div class="join-err hidden" id="errJoin"></div>
      <button class="btn btn-mint" id="btnJoin" style="padding:16px;font-size:17.5px">Open dashboard</button>
      <button class="btn btn-ghost" id="btnDemo" style="font-size:14px">Demo, no code needed, works in a single browser</button>
    </section>`;
  $("#btnJoin").addEventListener("click", joinRoom);
  $("#inRoom").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
  $("#btnDemo").addEventListener("click", () => startDashboard(DEMO));
}

async function joinRoom() {
  const val = $("#inRoom").value.trim();
  const err = $("#errJoin");
  if (!/^\d{4}$/.test(val)) {
    err.textContent = "Enter the four digit code shown on the patient tablet.";
    err.classList.remove("hidden");
    return;
  }
  try {
    const r = await fetch(`/api/poll?room=${val}&after=0`);
    if (!r.ok) throw new Error("server");
    await r.json();
  } catch {
    err.textContent = "Server unreachable. Demo mode still works in this same browser.";
    err.classList.remove("hidden");
    setTimeout(() => startDashboard(DEMO), 1500);
    return;
  }
  startDashboard(val);
}

// ------------------------------------------------------------------ dashboard

function startDashboard(joinCode) {
  code = joinCode;
  if (code !== DEMO) {
    sync.attach(code);
    feed = loadJSON(LS_FEED_PREFIX + code, []);
  } else {
    feed = [];
  }
  $("#codeTag").innerHTML = code === DEMO ? `demo mode` : `code &nbsp;<b>${esc(code)}</b>`;
  renderDashboard();
  wireDashboardButtons();
  clearInterval(clockTimer);
  clockTimer = setInterval(renderClocks, 5000);
}

function renderFilterBar() {
  const bar = $("#filterBar");
  if (!bar) return;
  const emgCount = feed.filter((r) => r.kind === "emergency" && r.status !== "done").length;
  const activeCount = feed.filter((r) => r.status === "new" || r.status === "ack").length;
  const doneCount = feed.filter((r) => r.status === "done").length;
  bar.innerHTML = `
    <button class="filter-pill ${currentFilter === "all" ? "active" : ""}" data-f="all">All (${feed.length})</button>
    <button class="filter-pill emg-pill ${currentFilter === "emg" ? "active" : ""}" data-f="emg">${svg("emergency")} Emergencies (${emgCount})</button>
    <button class="filter-pill ${currentFilter === "active" ? "active" : ""}" data-f="active">Active (${activeCount})</button>
    <button class="filter-pill ${currentFilter === "done" ? "active" : ""}" data-f="done">Handled (${doneCount})</button>
  `;
  $$(".filter-pill", bar).forEach((b) => {
    b.addEventListener("click", () => {
      currentFilter = b.dataset.f;
      renderFilterBar();
      renderFeed();
    });
  });
}

function renderDashboard() {
  $("#main").innerHTML = `
    <div class="n-cols">
      <section>
        <div class="feed-head">
          <h2>Requests</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="btnClearAll">Mark all handled</button>
            <button class="btn btn-ghost btn-sm" id="btnMute2">${svg(mute ? "mute" : "bell")}${mute ? "Muted" : "Sound on"}</button>
          </div>
        </div>
        <div class="feed-filter-bar" id="filterBar"></div>
        <div class="feed" id="feed"></div>
      </section>
      <aside class="rail">
        <div>
          <h3>Patient Status</h3>
          <div class="clay" id="patientCard" style="padding:0;border-radius:22px;overflow:hidden"><div class="empty" style="border:none;background:none">Waiting for the tablet to come online.</div></div>
        </div>
        <div>
          <h3>Ward Notes</h3>
          <div class="card" style="font-size:13.5px;color:var(--text-soft);display:grid;gap:10px;line-height:1.5">
            <div><b style="color:#a63a3a">Red cards are emergencies.</b> The alarm repeats until you acknowledge.</div>
            <div><b style="color:#2c7d70">Mint stamp means the request is fresh</b> and not yet acknowledged.</div>
            <div><b>Speak</b> at the bedside reads the card aloud.</div>
            <div><b>Eye-blink cards</b> already contain what the patient meant, yes or no.</div>
          </div>
        </div>
      </aside>
    </div>`;
  renderPatientCard();
  renderFeed();
}

function wireDashboardButtons() {
  $("#btnMute").addEventListener("click", () => {
    mute = !mute;
    saveJSON(LS_MUTE, mute);
    audio.setMuted(mute);
    $("#btnMute").innerHTML = `${svg(mute ? "mute" : "bell")}${mute ? "Muted" : "Sound"}`;
    if (mute) { audio.alarmStop(); hideAlarm(); }
  });
  $("#btnMute2")?.addEventListener("click", () => $("#btnMute").click());
  $("#btnTestSound")?.addEventListener("click", () => {
    audio.unlock();
    audio.chime();
    speak("Nurse dashboard alert sound test.");
    toastToast("Audio alert tested.");
  });
  $("#btnClearAll")?.addEventListener("click", () => {
    feed.forEach((r) => { if (r.status !== "done") r.status = "done"; });
    persist(); renderFeed(); toastToast("All marked handled");
  });
}

let toastTimer = null;
function toastToast(text) {
  let t = $("#toastBox");
  if (!t) {
    t = document.createElement("div");
    t.id = "toastBox"; t.className = "ack";
    document.body.appendChild(t);
  }
  t.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// ------------------------------------------------------------------ data

const persist = () => { if (code && code !== DEMO) saveJSON(LS_FEED_PREFIX + code, feed.slice(0, 60)); };

const upsert = (r) => {
  const i = feed.findIndex((x) => x.cmid === r.cmid);
  if (i >= 0) feed[i] = { ...feed[i], ...r, status: r.status || feed[i].status };
  else feed.unshift(r);
  persist();
  renderFeed();
};

// ------------------------------------------------------------------ render

function cardFor(r) {
  const iconName = iconFor(r);
  const emg = r.kind === "emergency";
  const done = r.status === "done";
  const statusWord = r.status === "ack" ? " · acknowledged" : done ? " · handled" : "";
  return `
    <article class="req ${emg ? "emg" : ""} ${!done && r.status === "new" && !emg ? "speaks" : ""} ${done ? "done" : ""}" data-cmid="${esc(r.cmid)}">
      <div class="stamp">${svg(iconName)}</div>
      <div class="bd">
        <div class="who">${emg ? `EMERGENCY, ` : ""}${esc(r.patientName || "Patient")}${r.bed ? `<span class="bedtag">bed ${esc(r.bed)}</span>` : ""}</div>
        <div class="msg">${esc(r.msg)}</div>
        <div class="when">${fmtClock(r.ts)} · ${fmtAgo(r.ts)} ago${statusWord}</div>
        <div class="acts">
          ${r.status === "new"
            ? `<button class="btn btn-mint btn-sm" data-act="ack">${svg("check")}Acknowledge</button>
               <button class="btn btn-sm" data-act="done">Handled</button>
               <button class="btn btn-sm" data-act="speak">${svg("speaker")}Speak</button>`
            : r.status === "ack"
              ? `<button class="btn btn-sm" data-act="done">Mark handled</button>
                 <button class="btn btn-sm" data-act="speak">${svg("speaker")}Speak again</button>`
              : `<button class="btn btn-sm" data-act="speak">${svg("speaker")}Speak again</button>`}
        </div>
      </div>
    </article>`;
}

function renderFeed() {
  renderFilterBar();
  const el = $("#feed");
  if (!el) return;
  if (!feed.length) {
    el.innerHTML = `<div class="empty">No requests yet${code && code !== DEMO ? ` for code ${esc(code)}` : ""}. When the patient taps a tile it appears here within seconds.<br>Keep this tab open, this is the nurse screen.</div>`;
    return;
  }
  let items = feed;
  if (currentFilter === "emg") items = feed.filter((r) => r.kind === "emergency");
  else if (currentFilter === "active") items = feed.filter((r) => r.status === "new" || r.status === "ack");
  else if (currentFilter === "done") items = feed.filter((r) => r.status === "done");

  if (!items.length) {
    el.innerHTML = `<div class="empty">No requests in the "${esc(currentFilter)}" category.<br>Select "All" to view all patient requests.</div>`;
    return;
  }
  el.innerHTML = items.map(cardFor).join("");
  $$("article[data-cmid]").forEach((card, i) => {
    card.style.setProperty("--d", `${Math.min(i, 8) * 55}ms`);
  });
  $$("article[data-cmid] .acts button").forEach((b) => {
    b.addEventListener("click", (e) => {
      const cmid = e.target.closest("article").dataset.cmid;
      const r = feed.find((x) => x.cmid === cmid);
      if (!r) return;
      const act = e.target.dataset.act;
      if (act === "ack") {
        r.status = "ack";
        sync.sendAck(r.cmid);
        audio.blip();
        if (alarmCmid === r.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
        document.title = titleBase;
        upsert(r);
      } else if (act === "done") {
        r.status = "done";
        if (alarmCmid === r.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
        upsert(r);
      } else if (act === "speak") {
        speak(r.msg, { rate: 0.95 });
      }
    });
  });
}

function renderPatientCard() {
  const el = $("#patientCard");
  if (!el) return;
  if (!lastPatient) {
    el.innerHTML = `<div class="empty" style="border-radius:22px">Waiting for the tablet to come online.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="patient ${lastPatient.online ? "online" : ""}">
      <div>
        <div class="nm">${esc(lastPatient.name || "Patient")}</div>
        <div class="sub">Bed ${esc(lastPatient.bed || "?")}${code && code !== DEMO ? ` · code ${esc(code)}` : ""}</div>
      </div>
      <span class="badge ${lastPatient.online ? "ok" : ""}"><span class="dot ${lastPatient.online ? "on" : ""}"></span>${lastPatient.online ? "Online" : "Offline"}</span>
    </div>`;
}

function renderClocks() {
  $$(".req").forEach((cardEl) => {
    const cmid = cardEl.dataset.cmid;
    const r = feed.find((x) => x.cmid === cmid);
    const when = cardEl.querySelector(".when");
    if (r && when) {
      const statusWord = r.status === "ack" ? " · acknowledged" : r.status === "done" ? " · handled" : "";
      when.textContent = `${fmtClock(r.ts)} · ${fmtAgo(r.ts)} ago${statusWord}`;
    }
  });
}

// ------------------------------------------------------------------ emergency overlay

function showAlarm(r) {
  const el = $("#alarm");
  el.style.display = "";
  el.classList.remove("hidden");
  el.innerHTML = `
    <section class="alarm-card">
      <div class="stamp">${svg("emergency")}</div>
      <h2>EMERGENCY</h2>
      <div class="who">${esc(r.patientName || "Patient")}${r.bed ? `, bed ${esc(r.bed)}` : ""}${code && code !== DEMO ? ` · room ${esc(code)}` : ""}</div>
      <div class="sub">The patient pressed the emergency button at ${fmtClock(r.ts)}.</div>
      <div class="act">
        <button class="btn btn-red" id="aAck" style="padding:15px 24px;font-size:17px">${svg("check")}I am on my way, silence alarm</button>
        <button class="btn" id="aRead" style="padding:15px 24px;font-size:17px">${svg("speaker")}Read aloud</button>
      </div>
    </section>`;
  $("#aAck").addEventListener("click", () => {
    const rr = feed.find((x) => x.cmid === r.cmid);
    if (rr && rr.status === "new") { rr.status = "ack"; upsert(rr); }
    sync.sendAck(r.cmid);
    alarmCmid = null;
    audio.alarmStop();
    hideAlarm();
  });
  $("#aRead").addEventListener("click", () => speak(r.msg));
}

const hideAlarm = () => {
  const el = $("#alarm");
  el.classList.add("hidden");
  el.style.display = "none";
  el.innerHTML = "";
};

// hydrate static [data-ic] placeholders in the shell
$$("[data-ic]").forEach((el) => { el.innerHTML = svg(el.dataset.ic); });

// ------------------------------------------------------------------ incoming

function onIncoming(msg) {
  if (code === DEMO) {
    if (!msg.cmid) return;
  } else if (msg.room && msg.room !== code) return;

  const r = {
    cmid: msg.cmid || String(msg.id ?? Date.now()),
    kind: msg.kind === "emergency" ? "emergency" : "need",
    need: msg.need || "message",
    label: msg.label || "",
    msg: msg.msg || msg.message || "",
    risk: msg.risk || (msg.kind === "emergency" ? "high" : "normal"),
    patientName: msg.patientName || msg.patient || "Patient",
    bed: msg.bed || "",
    room: msg.room || code,
    ts: msg.ts || Date.now(),
    status: "new",
  };
  lastPatient = { name: r.patientName, bed: r.bed, online: true };
  renderPatientCard();
  const existing = feed.find((x) => x.cmid === r.cmid);
  if (existing && existing.status !== "new") return;
  if (existing) { existing.status = "ack"; upsert(existing); return; }
  feed.unshift(r);
  persist();
  renderFeed();
  if (!mute) {
    if (r.kind === "emergency") {
      alarmCmid = r.cmid;
      audio.alarmStart();
      showAlarm(r);
      document.title = "EMERGENCY · INTUBATALK";
    } else {
      audio.chime();
      if (r.risk === "high") document.title = "Urgent request · INTUBATALK";
    }
    speak(`${r.patientName || "The patient"} ${r.kind === "emergency" ? "needs help now" : "says"}: ${r.msg}`, { rate: 0.98 });
    if (r.risk === "high") vibrate([120, 60, 120]);
  }
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(r.kind === "emergency" ? "EMERGENCY, patient needs help now" : "INTUBATALK request", {
        body: `${r.patientName}${r.bed ? `, bed ${r.bed}` : ""}: ${r.msg}`,
        tag: r.cmid,
      });
    } catch { /* notification failed */ }
  }
}

function onAck(msg) {
  audio.blip();
  const r = feed.find((x) => x.cmid === msg.cmid);
  if (r && r.status === "new") { r.status = "ack"; upsert(r); }
  if (alarmCmid === msg.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
  document.title = titleBase;
}

function onClear(msg) {
  audio.blip();
  audio.alarmStop();
  alarmCmid = null;
  hideAlarm();
  document.title = titleBase;
  feed.forEach((r) => { if (r.kind === "emergency" && r.status !== "done") r.status = "ack"; });
  persist();
  renderFeed();
  toastToast("The patient says they are okay now. Alarm cleared.");
}

function onProfileUpdate(msg) {
  const p = msg.profile;
  if (!p) return;
  lastPatient = { name: p.name, bed: p.bed, online: !!p.online };
  renderPatientCard();
}

// ------------------------------------------------------------------ boot

sync.on("request", onIncoming);
sync.on("ack", onAck);
sync.on("clear", onClear);
sync.on("profile", onProfileUpdate);

document.addEventListener("click", () => audio.unlock(), { once: true });

if (!("Notification" in window)) $("#btnNotify").disabled = true;
$("#btnNotify").addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  const res = await Notification.requestPermission();
  $("#btnNotify").innerHTML = `${svg("bell")}${res === "granted" ? "Alerts on" : "Alerts blocked"}`;
});
$("#btnAddPatient").addEventListener("click", () => {
  audio.alarmStop();
  alarmCmid = null;
  hideAlarm();
  stopSpeech();
  code = null;
  if (clockTimer) clearInterval(clockTimer);
  renderJoin();
});

startAmbient();
renderJoin();
