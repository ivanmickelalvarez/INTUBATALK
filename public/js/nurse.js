// INTUBATALK nurse dashboard.
// Multi-Nurse & Multi-Patient monitoring system with clinical Claymorphism UI.
import { $, $$, esc, fmtClock, fmtAgo, loadJSON, saveJSON } from "./lib/util.js";
import * as audio from "./lib/audio.js";
import { speak, stopSpeech, ttsAvailable, DEFAULT_VOICE_CHECK, talkActive } from "./lib/tts.js";
import { svg } from "./lib/icons.js";
import { startAmbient } from "./lib/ambient.js";
import * as sync from "./lib/sync.js";
import { NEEDS } from "./needs.js";

const LS_NURSES = "it_nurses";
const LS_ACTIVE_NURSE = "it_active_nurse_id";
const LS_FEED_PREFIX = "it_nurse_feed_";
const LS_MUTE = "it_nurse_mute";
const DEMO = "__demo__";

// State
let nurses = loadJSON(LS_NURSES, []);

// ------------------------------------------------------------------ show patient status rail

function showPatientStatusRail() {
  const rail = $("#patientStatusRail");
  if (!rail) return rail;
  rail.classList.remove("hidden");
  document.querySelector(".n-app")?.classList.add("has-rail");
  const nurseEl = $("#patientStatusNurse");
  if (nurseEl) {
    nurseEl.textContent = currentNurse
      ? `${currentNurse.name} · ${(currentNurse.rooms || []).length} patient${(currentNurse.rooms || []).length === 1 ? "" : "s"}`
      : "";
  }
  return rail;
}

function hidePatientStatusRail() {
  const rail = $("#patientStatusRail");
  if (rail) rail.classList.add("hidden");
  document.querySelector(".n-app")?.classList.remove("has-rail");
}
let activeNurseId = localStorage.getItem(LS_ACTIVE_NURSE) || (nurses[0]?.id || null);
let currentNurse = nurses.find((n) => n.id === activeNurseId) || null;

let rooms = currentNurse ? (currentNurse.rooms || []) : [];
let patients = {}; // room -> { room, name, bed, online, caps, unhandledCount }
let feed = [];

let mute = loadJSON(LS_MUTE, false);
let alarmCmid = null;
let titleBase = "INTUBATALK · Nurse Dashboard";
let clockTimer = null;

let currentFilter = "all";       // "all" | "emg" | "active" | "done"
let patientFilter = "all";       // "all" | "<roomCode>"

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

// ------------------------------------------------------------------ nurse profiles

function saveNursesList() {
  saveJSON(LS_NURSES, nurses);
}

function persistActiveNurse() {
  if (currentNurse) {
    localStorage.setItem(LS_ACTIVE_NURSE, currentNurse.id);
    const idx = nurses.findIndex((n) => n.id === currentNurse.id);
    if (idx >= 0) nurses[idx] = currentNurse;
    else nurses.push(currentNurse);
    saveNursesList();
  } else {
    localStorage.removeItem(LS_ACTIVE_NURSE);
  }
}

function selectNurse(nurseId) {
  const target = nurses.find((n) => n.id === nurseId);
  if (!target) return;
  currentNurse = target;
  activeNurseId = currentNurse.id;
  persistActiveNurse();
  rooms = currentNurse.rooms || [];
  feed = loadJSON(LS_FEED_PREFIX + currentNurse.id, []);
  patientFilter = "all";
  currentFilter = "all";
  sync.attachRooms(rooms);
  updateTopBar();
  renderDashboard();
  toastToast(`Switched to ${currentNurse.name}`);
}

function createNurseStation(name, unit = "", initialRooms = []) {
  const cleanName = String(name || "").trim().slice(0, 40);
  if (!cleanName) {
    toastToast("Please enter your nurse name to sign in.");
    return null;
  }
  const cleanUnit = String(unit || "").trim().slice(0, 40) || "ICU Pod";
  const cleanRooms = Array.from(new Set(initialRooms.filter((r) => /^\d{4}$/.test(r))));
  const newId = `nurse_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const newNurse = {
    id: newId,
    name: cleanName,
    unit: cleanUnit,
    rooms: cleanRooms,
    created_ms: Date.now(),
  };

  nurses.push(newNurse);
  saveNursesList();
  currentNurse = newNurse;
  activeNurseId = newId;
  persistActiveNurse();
  rooms = currentNurse.rooms;
  feed = [];
  sync.attachRooms(rooms);
  updateTopBar();
  renderDashboard();
  toastToast(`Welcome, ${cleanName}! Station ready.`);
  return newNurse;
}

// ------------------------------------------------------------------ welcome / setup screen

function renderJoin() {
  document.title = titleBase;
  hidePatientStatusRail();
  $("#codeTag").innerHTML = "Setup";
  $("#nurseProfileChip").classList.add("hidden");

  const existingNursesHtml = nurses.length > 0
    ? `
      <div style="margin-bottom:18px">
        <label style="font-size:13px;font-weight:700;color:var(--text-soft);display:block;margin-bottom:8px">Existing Nurse Stations:</label>
        <div class="nurse-profiles-list">
          ${nurses.map((n) => `
            <div class="nurse-profile-card" data-nid="${esc(n.id)}">
              <div>
                <div style="font-weight:800;font-size:14.5px">👩‍⚕️ ${esc(n.name)}</div>
                <div style="font-size:12px;color:var(--text-soft)">${esc(n.unit || "ICU")} · <b>${(n.rooms || []).length} ${(n.rooms || []).length === 1 ? "bed" : "beds"}</b> connected</div>
              </div>
              <button type="button" class="btn btn-sm btn-mint">Open Station →</button>
            </div>
          `).join("")}
        </div>
      </div>
      <div style="text-align:center;color:var(--text-faint);font-size:13px;margin:12px 0;font-weight:700">── OR CREATE NEW STATION ──</div>
    `
    : "";

  $("#main").innerHTML = `
    <section class="clay join-card" style="max-width:520px">
      <nav class="role-nav" aria-label="Role selector" style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span class="badge" style="padding:6px 14px;font-size:13px;font-weight:700;background:var(--accent-soft);color:#235f55">🩺 Nurse Station</span>
        <a class="badge" href="/" style="padding:6px 14px;font-size:13px;font-weight:700;text-decoration:none;color:var(--text-soft)">👤 Switch to Patient Tablet →</a>
        <a class="badge" href="/dual" style="padding:6px 14px;font-size:13px;font-weight:700;text-decoration:none;color:var(--text-soft)">👥 Dual Simulator →</a>
      </nav>
      <h1>Nurse Sign In</h1>
      <p class="hint">Every nurse signs in with their own name. Your name is shown on the dashboard and attached when you acknowledge a patient, so patients know who responded. One nurse can monitor several patients at once.</p>
      
      ${existingNursesHtml}

      <form id="formNewNurse" style="display:grid;gap:14px" novalidate>
        <div>
          <label for="inNurseName" style="font-size:13px;font-weight:700;color:var(--text-soft);display:block;margin-bottom:5px">Nurse Name (required)</label>
          <input id="inNurseName" class="alph-out" style="min-height:auto;padding:12px 16px;font-size:16px;width:100%;letter-spacing:normal;text-transform:none;text-align:left" placeholder="e.g. Sarah Jenkins, RN" required maxlength="40" autocomplete="name">
        </div>
        <div>
          <label for="inNurseUnit" style="font-size:13px;font-weight:700;color:var(--text-soft);display:block;margin-bottom:5px">Ward / Pod (Optional)</label>
          <input id="inNurseUnit" class="alph-out" style="min-height:auto;padding:12px 16px;font-size:16px;width:100%;letter-spacing:normal;text-transform:none;text-align:left" placeholder="e.g. ICU Pod A" maxlength="40">
        </div>
        <div>
          <label for="inInitialRooms" style="font-size:13px;font-weight:700;color:var(--text-soft);display:block;margin-bottom:5px">Bedside Room Code(s) <span style="font-weight:500">(Optional, comma-separated)</span></label>
          <input id="inInitialRooms" class="alph-out" style="min-height:auto;padding:12px 16px;font-size:16px;letter-spacing:2px;width:100%" placeholder="e.g. 1024, 2048">
          <small style="display:block;color:var(--text-soft);font-size:12px;margin-top:4px">You can add more patients anytime with the “Add Patient” button.</small>
        </div>
        <div class="join-err hidden" id="errJoin"></div>
        <button type="submit" class="btn btn-mint" style="padding:15px;font-size:17px;margin-top:4px">Sign In & Open Dashboard</button>
      </form>
    </section>`;

  $$(".nurse-profile-card", $("#main")).forEach((card) => {
    card.addEventListener("click", () => {
      selectNurse(card.dataset.nid);
    });
  });

  $("#formNewNurse").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#inNurseName").value.trim();
    const unit = $("#inNurseUnit").value.trim();
    const rawRooms = $("#inInitialRooms").value.trim();
    const parsedRooms = rawRooms
      ? rawRooms.split(/[\s,]+/).map((r) => r.trim()).filter((r) => /^\d{4}$/.test(r))
      : [];

    if (!name) {
      const err = $("#errJoin");
      err.classList.remove("hidden");
      err.textContent = "Please enter your nurse name to sign in.";
      $("#inNurseName").focus();
      return;
    }
    createNurseStation(name, unit, parsedRooms);
  });
}

// ------------------------------------------------------------------ top bar

function updateTopBar() {
  if (!currentNurse) {
    $("#nurseProfileChip").classList.add("hidden");
    $("#codeTag").textContent = "0 Beds";
    return;
  }

  const chip = $("#nurseProfileChip");
  chip.classList.remove("hidden");
  chip.innerHTML = `
    <div class="nurse-avatar" aria-hidden="true">👩‍⚕️</div>
    <div class="nurse-info">
      <span class="nurse-name">${esc(currentNurse.name)}</span>
      <span class="nurse-unit">${esc(currentNurse.unit || "ICU")} · tap to switch</span>
    </div>
  `;
  chip.title = `Signed in as ${currentNurse.name} — click to switch nurse`;
  chip.style.cursor = "pointer";
  chip.onclick = () => openNurseProfileDialog();

  const count = rooms.length;
  $("#codeTag").innerHTML = count === 0
    ? `<span style="color:var(--text-faint)">No patients yet — tap “Add Patient”</span>`
    : `<b>${count}</b> ${count === 1 ? "Patient" : "Patients"} Connected`;
}

// ------------------------------------------------------------------ dashboard render

function renderDashboard() {
  if (!currentNurse) return renderJoin();

  updateTopBar();

  const el = $("#main");
  el.innerHTML = `
    <div class="n-cols">
      <section>
        <div class="feed-head">
          <h2>Patient Requests</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="btnClearAll">Mark all handled</button>
            <button class="btn btn-ghost btn-sm" id="btnMute2">${svg(mute ? "mute" : "bell")}${mute ? "Muted" : "Sound on"}</button>
          </div>
        </div>

        <!-- Filter by assigned patient -->
        <div class="patient-filter-bar" id="patientFilterBar"></div>

        <!-- Filter by request urgency/status -->
        <div class="feed-filter-bar" id="filterBar"></div>

        <!-- Incoming request feed -->
        <div class="feed" id="feed"></div>
      </section>

      <aside class="rail">
        <div>
          <div class="patient-rail-head">
            <h3>My Patients (${rooms.length})</h3>
            <button class="btn btn-mint btn-sm" id="btnRailAddBed" style="padding:6px 10px;font-size:12.5px;font-weight:800">＋ Add Patient</button>
          </div>
          <div class="card" style="font-size:13px;color:var(--text-soft);line-height:1.55;padding:14px 15px">
            <div><b style="color:var(--text)">${esc(currentNurse.name)}</b> is monitoring <b>${rooms.length} patient${rooms.length === 1 ? "" : "s"}</b>.</div>
            <div style="margin-top:6px">Full live status for each patient is on the right-side <b>Patient Status</b> panel. Tap a patient there to focus their requests.</div>
          </div>
          <div class="patient-list" id="patientList" style="margin-top:10px"></div>
        </div>

        <div>
          <h3>Station Instructions</h3>
          <div class="card" style="font-size:13.5px;color:var(--text-soft);display:grid;gap:10px;line-height:1.5">
            <div><b style="color:#a63a3a">Red cards are emergencies.</b> Siren rings continuously until acknowledged.</div>
            <div><b style="color:#2c7d70">Mint stamp means fresh request.</b> Tap Acknowledge to notify the patient.</div>
            <div><b>Add patients:</b> Use “Add Patient” in the top bar or the Patient Status panel. Enter each tablet's 4-digit code.</div>
            <div><b>Personalized response:</b> When you acknowledge, the patient's tablet displays your name (${esc(currentNurse.name)}).</div>
          </div>
        </div>
      </aside>
    </div>`;

  renderPatientList();
  renderPatientFilterBar();
  renderFilterBar();
  renderFeed();
  wireDashboardButtons();
  renderPatientStatusRail();

  clearInterval(clockTimer);
  clockTimer = setInterval(renderClocks, 5000);
}

function renderPatientList() {
  const el = $("#patientList");
  if (!el) return;

  if (!rooms.length) {
    el.innerHTML = `
      <div class="empty" style="border-radius:18px;padding:22px 14px">
        No patients on <b>${esc(currentNurse?.name || "this station")}</b>'s dashboard yet.<br>
        <button class="btn btn-mint btn-sm" id="btnEmptyAddBed" style="margin-top:10px">＋ Add Patient</button>
      </div>`;
    $("#btnEmptyAddBed")?.addEventListener("click", openConnectDialog);
    return;
  }

  el.innerHTML = rooms.map((rCode) => {
    const p = patients[rCode] || { room: rCode, name: "Connecting...", bed: "", online: false };
    const isSelected = patientFilter === rCode;
    const unhandled = feed.filter((m) => m.room === rCode && (m.status === "new" || m.status === "ack")).length;
    const hasEmg = feed.some((m) => m.room === rCode && m.kind === "emergency" && m.status !== "done");

    return `
      <div class="patient-card-item ${isSelected ? "selected" : ""}" data-room="${esc(rCode)}">
        <div class="p-meta">
          <div class="p-title">
            <span class="dot ${p.online ? "on" : ""}" title="${p.online ? "Tablet Online" : "Tablet Offline"}"></span>
            <span>${esc(p.name || "Patient")}</span>
            ${p.bed ? `<span class="badge" style="font-size:11px;padding:1px 6px">Bed ${esc(p.bed)}</span>` : ""}
          </div>
          <div class="p-sub">
            Room Code: <b>${esc(rCode)}</b> · ${p.online ? "Online" : "Waiting"}
          </div>
        </div>
        <div class="p-actions">
          ${unhandled > 0 ? `<span class="badge-count ${hasEmg ? "emg" : ""}">${unhandled}</span>` : ""}
          <button class="btn-rm-patient" data-rm="${esc(rCode)}" title="Remove patient from this dashboard">×</button>
        </div>
      </div>`;
  }).join("");

  $$(".patient-card-item", el).forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-rm-patient")) return;
      const r = card.dataset.room;
      patientFilter = (patientFilter === r) ? "all" : r;
      renderPatientList();
      renderPatientFilterBar();
      renderFeed();
      renderPatientStatusRail();
    });
  });

  $$(".btn-rm-patient", el).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const rCode = btn.dataset.rm;
      disconnectBed(rCode);
    });
  });
}

function renderPatientFilterBar() {
  const bar = $("#patientFilterBar");
  if (!bar) return;

  if (rooms.length <= 1) {
    bar.innerHTML = "";
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  const totalRequests = feed.length;
  let html = `
    <button class="patient-pill ${patientFilter === "all" ? "active" : ""}" data-p="all">
      👥 All Beds (${totalRequests})
    </button>`;

  rooms.forEach((rCode) => {
    const p = patients[rCode] || { name: "Patient", bed: "" };
    const count = feed.filter((m) => m.room === rCode).length;
    const label = p.bed ? `Bed ${p.bed} · ${p.name}` : `Room ${rCode}`;
    html += `
      <button class="patient-pill ${patientFilter === rCode ? "active" : ""}" data-p="${esc(rCode)}">
        🛏️ ${esc(label)} (${count})
      </button>`;
  });

  bar.innerHTML = html;
  $$(".patient-pill", bar).forEach((b) => {
    b.addEventListener("click", () => {
      patientFilter = b.dataset.p;
      renderPatientList();
      renderPatientFilterBar();
      renderFeed();
    });
  });
}

function renderFilterBar() {
  const bar = $("#filterBar");
  if (!bar) return;

  const scopedFeed = patientFilter === "all" ? feed : feed.filter((r) => r.room === patientFilter);
  const emgCount = scopedFeed.filter((r) => r.kind === "emergency" && r.status !== "done").length;
  const activeCount = scopedFeed.filter((r) => r.status === "new" || r.status === "ack").length;
  const doneCount = scopedFeed.filter((r) => r.status === "done").length;

  bar.innerHTML = `
    <button class="filter-pill ${currentFilter === "all" ? "active" : ""}" data-f="all">All (${scopedFeed.length})</button>
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

function cardFor(r) {
  const iconName = iconFor(r);
  const emg = r.kind === "emergency";
  const done = r.status === "done";
  const statusWord = r.status === "ack" ? " · acknowledged" : done ? " · handled" : "";

  return `
    <article class="req ${emg ? "emg" : ""} ${!done && r.status === "new" && !emg ? "speaks" : ""} ${done ? "done" : ""}" data-cmid="${esc(r.cmid)}" data-room="${esc(r.room || "")}">
      <div class="stamp">${svg(iconName)}</div>
      <div class="bd">
        <div class="who">
          ${emg ? `EMERGENCY: ` : ""}
          <span>${esc(r.patientName || "Patient")}</span>
          ${r.bed ? `<span class="bedtag">Bed ${esc(r.bed)}</span>` : ""}
          ${r.room && r.room !== DEMO ? `<span class="roomtag">Room ${esc(r.room)}</span>` : ""}
        </div>
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
  const el = $("#feed");
  if (!el) return;

  let items = feed;
  if (patientFilter !== "all") {
    items = items.filter((r) => r.room === patientFilter);
  }

  if (currentFilter === "emg") items = items.filter((r) => r.kind === "emergency");
  else if (currentFilter === "active") items = items.filter((r) => r.status === "new" || r.status === "ack");
  else if (currentFilter === "done") items = items.filter((r) => r.status === "done");

  if (!items.length) {
    const emptySub = patientFilter !== "all"
      ? `No requests for Bed / Room ${esc(patientFilter)}.`
      : "When any of your connected patients tap a tile, it appears here in real-time.";
    el.innerHTML = `<div class="empty">${emptySub}</div>`;
    return;
  }

  el.innerHTML = items.map(cardFor).join("");

  $$("article[data-cmid]", el).forEach((card, i) => {
    card.style.setProperty("--d", `${Math.min(i, 8) * 50}ms`);
  });

  $$("article[data-cmid] .acts button", el).forEach((b) => {
    b.addEventListener("click", (e) => {
      const art = e.target.closest("article");
      const cmid = art.dataset.cmid;
      const r = feed.find((x) => x.cmid === cmid);
      if (!r) return;
      const act = e.target.dataset.act;

      if (act === "ack") {
        r.status = "ack";
        sync.sendAck(r.cmid, r.room, currentNurse?.name || "Nurse");
        audio.blip();
        if (alarmCmid === r.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
        document.title = titleBase;
        persistFeed();
        renderFeed();
        renderPatientList();
        renderPatientStatusRail();
        toastToast(`Acknowledged to ${r.patientName || "patient"}`);
      } else if (act === "done") {
        r.status = "done";
        if (alarmCmid === r.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
        persistFeed();
        renderFeed();
        renderPatientList();
        renderPatientStatusRail();
      } else if (act === "speak") {
        speak(`${r.patientName || "Patient"} says: ${r.msg}`, { rate: 0.95 });
      }
    });
  });
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

const persistFeed = () => {
  if (currentNurse) saveJSON(LS_FEED_PREFIX + currentNurse.id, feed.slice(0, 80));
};

// ------------------------------------------------------------------ connect & disconnect beds

function openConnectDialog() {
  if (!currentNurse) return renderJoin();
  const dlg = $("#dlgConnectBed");
  if (!dlg) return;
  const inRoom = $("#inNewRoom", dlg);
  const statusEl = $("#connectRoomStatus", dlg);
  const browseBtn = $("#btnBrowsePatients", dlg);
  const browseList = $("#browsePatientsList", dlg);
  const targetEl = $("#connectNurseTarget", dlg);
  if (targetEl) targetEl.textContent = `Adding to ${currentNurse.name}'s dashboard (${rooms.length} patient${rooms.length === 1 ? "" : "s"} connected).`;
  inRoom.value = "";
  statusEl.textContent = "";
  browseList.style.display = "none";
  browseList.innerHTML = "";

  // Live validation for comma-separated codes
  const checkLive = async () => {
    const raw = inRoom.value.trim();
    const codes = raw.split(/[\s,]+/).map((c) => c.trim()).filter((c) => /^\d{4}$/.test(c));
    const unique = Array.from(new Set(codes));

    if (!unique.length) { statusEl.textContent = ""; return; }

    const results = [];
    for (const code of unique) {
      if (rooms.includes(code)) {
        results.push(`⚠ ${code} already connected`);
        continue;
      }
      try {
        const res = await fetch(`/api/room?code=${code}`);
        if (res.ok) {
          const d = await res.json();
          if (d.exists) {
            results.push(`✓ ${code} → <b>${esc(d.name || "Patient")}</b> (Bed ${esc(d.bed || "·")})`);
          } else {
            results.push(`○ ${code} will connect when patient goes online`);
          }
        }
      } catch {
        results.push(`○ ${code} (offline — will connect later)`);
      }
    }
    statusEl.innerHTML = results.join("<br>");
    statusEl.style.color = "var(--text-soft)";
  };

  let debounceTimer = null;
  inRoom.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkLive, 400);
  };

  // Browse online patients
  browseBtn.onclick = async () => {
    browseList.style.display = "block";
    browseList.innerHTML = `<div style="text-align:center;color:var(--text-soft);font-size:13px;padding:12px">Loading patients…</div>`;
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const available = (data.rooms || []).filter((r) => !rooms.includes(r.room));
      if (!available.length) {
        browseList.innerHTML = `<div style="text-align:center;color:var(--text-soft);font-size:13px;padding:12px">No unconnected patients found. Have a patient open their bedside tablet first.</div>`;
        return;
      }
      browseList.innerHTML = available.map((r) => `
        <label class="browse-patient-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;cursor:pointer;border:1px solid var(--line);background:var(--surface-2);margin-bottom:6px;transition:all .12s ease">
          <input type="checkbox" class="browse-cb" data-room="${esc(r.room)}" style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13.5px">${esc(r.name || "Patient")} ${r.bed ? `· <span style="color:var(--text-soft)">Bed ${esc(r.bed)}</span>` : ""}</div>
            <div style="font-size:12px;color:var(--text-faint)">Room ${esc(r.room)} · ${r.online ? '<span style="color:var(--ok)">● Online</span>' : '<span style="color:var(--text-faint)">○ Offline</span>'}</div>
          </div>
        </label>
      `).join("");

      // Sync checked items into input field
      $$(".browse-cb", browseList).forEach((cb) => {
        cb.addEventListener("change", () => {
          const checked = $$(".browse-cb:checked", browseList).map((c) => c.dataset.room);
          const existing = inRoom.value.trim().split(/[\s,]+/).filter((c) => /^\d{4}$/.test(c) && !checked.includes(c));
          const merged = Array.from(new Set([...existing, ...checked]));
          inRoom.value = merged.join(", ");
          checkLive();
        });
      });
    } catch {
      browseList.innerHTML = `<div style="text-align:center;color:var(--text-soft);font-size:13px;padding:12px">Could not fetch patients. Server may be offline.</div>`;
    }
  };

  if (!dlg.open) dlg.showModal();
  try { inRoom.focus(); } catch { /* noop */ }
}

async function doConnectBed() {
  const dlg = $("#dlgConnectBed");
  const inRoom = $("#inNewRoom", dlg);
  const raw = inRoom.value.trim();
  const codes = Array.from(new Set(
    raw.split(/[\s,]+/).map((c) => c.trim()).filter((c) => /^\d{4}$/.test(c))
  ));

  if (!codes.length) {
    toastToast("Please enter at least one valid 4-digit room code.");
    return;
  }

  const newCodes = codes.filter((c) => !rooms.includes(c));
  if (!newCodes.length) {
    toastToast("All entered rooms are already connected.");
    dlg.close();
    return;
  }

  // Add all new rooms at once
  for (const code of newCodes) {
    rooms.push(code);
    sync.addRoom(code);
  }

  if (currentNurse) {
    currentNurse.rooms = rooms;
    persistActiveNurse();
  }
  dlg.close();

  // Fetch patient info for all new rooms
  for (const code of newCodes) {
    try {
      const res = await fetch(`/api/room?code=${code}`);
      if (res.ok) {
        const d = await res.json();
        if (d.exists) {
          patients[code] = { room: code, name: d.name, bed: d.bed, online: d.online };
        }
      }
    } catch { /* noop */ }
  }

  updateTopBar();
  renderDashboard();
  toastToast(`${newCodes.length} patient${newCodes.length > 1 ? "s" : ""} added to ${currentNurse?.name || "dashboard"}: ${newCodes.join(", ")}`);
}

function disconnectBed(codeVal) {
  const p = patients[codeVal];
  const label = p?.name ? `${p.name} (Room ${codeVal})` : `Room ${codeVal}`;
  if (!confirm(`Remove ${label} from ${currentNurse?.name || "this nurse"}'s dashboard?`)) return;

  rooms = rooms.filter((r) => r !== codeVal);
  if (currentNurse) {
    currentNurse.rooms = rooms;
    persistActiveNurse();
  }
  sync.removeRoom(codeVal);
  delete patients[codeVal];

  if (patientFilter === codeVal) patientFilter = "all";
  updateTopBar();
  renderDashboard();
  toastToast(`${label} removed.`);
}

// ------------------------------------------------------------------ nurse profile dialog

function openNurseProfileDialog() {
  const dlg = $("#dlgNurseProfile");
  if (!dlg) return;

  const listEl = $("#savedNursesList", dlg);
  listEl.innerHTML = nurses.map((n) => `
    <div class="nurse-profile-card ${n.id === currentNurse?.id ? "active" : ""}" data-nid="${esc(n.id)}">
      <div>
        <div style="font-weight:800;font-size:14px">👩‍⚕️ ${esc(n.name)}</div>
        <div style="font-size:12px;color:var(--text-soft)">${esc(n.unit || "ICU")} · <b>${(n.rooms || []).length} ${(n.rooms || []).length === 1 ? "bed" : "beds"}</b></div>
      </div>
      ${n.id === currentNurse?.id
        ? `<span class="badge ok" style="font-size:11px">Active</span>`
        : `<button class="btn btn-sm btn-ghost btn-switch-to" data-nid="${esc(n.id)}">Select</button>`}
    </div>
  `).join("");

  $$(".btn-switch-to", listEl).forEach((btn) => {
    btn.addEventListener("click", () => {
      selectNurse(btn.dataset.nid);
      dlg.close();
    });
  });

  if (!dlg.open) dlg.showModal();
}

// ------------------------------------------------------------------ emergency overlay

function patientStatusFromRoom(code) {
  // Internal helper: returns a read-only status snapshot for one room.
  const p = patients[code] || { room: code, name: "Connecting...", bed: "", online: false };
  const scoped = feed.filter((m) => m.room === code);
  const unhandled = scoped.filter((m) => m.status === "new" || m.status === "ack").length;
  const emg = scoped.some((m) => m.kind === "emergency" && m.status !== "done");
  const acked = scoped.some((m) => m.status === "ack");
  const doneCount = scoped.filter((m) => m.status === "done").length;
  const lastActive = scoped.length ? scoped[0].ts : 0;
  return {
    room: code,
    name: p.name || "Patient",
    bed: p.bed || "",
    online: !!p.online,
    unhandled,
    hasEmg: !!emg,
    acked,
    doneCount,
    lastActive,
    requestCount: scoped.length,
  };
}

function refreshPatientStatusList() {
  const list = $("#patientStatusList");
  const summary = $("#patientStatusSummary");
  if (!list || !summary) return;

  const status = (rooms.length ? rooms : []).map((r) => patientStatusFromRoom(r));
  const total = status.length;
  const totalUnhandled = status.reduce((a, b) => a + b.unhandled, 0);
  const totalEmg = status.reduce((a, b) => a + (b.hasEmg ? 1 : 0), 0);

  summary.textContent = total === 0
    ? "No patients yet"
    : `${total} patient${total === 1 ? "" : "s"} · ${totalUnhandled} open${totalEmg ? ` · ${totalEmg} emergency${totalEmg === 1 ? "" : "s"}` : ""}`;

  const nurseEl = $("#patientStatusNurse");
  if (nurseEl) {
    nurseEl.textContent = currentNurse
      ? `${currentNurse.name} · tap a patient to focus`
      : "";
  }

  if (total === 0) {
    list.innerHTML = `<div class="patient-status-empty-state" id="patientStatusEmpty">
      No patients on this dashboard yet.
      <span class="ps-empty-strong">Tap “Add Patient” and enter a bedside tablet's 4-digit code.</span>
      <button class="btn btn-mint btn-sm" id="btnStatusEmptyAdd" style="margin-top:12px;width:100%">＋ Add Patient</button>
    </div>`;
    $("#btnStatusEmptyAdd")?.addEventListener("click", openConnectDialog);
    return;
  }

  list.innerHTML = status.map((s) => {
    const isSelected = patientFilter === s.room;
    const lastAgo = s.lastActive ? fmtAgo(s.lastActive) : "no requests yet";
    return `
      <div class="patient-status-item ${isSelected ? "selected" : ""} ${s.hasEmg ? "has-emg" : ""}" data-room="${esc(s.room)}" role="button" tabindex="0" aria-pressed="${isSelected ? "true" : "false"}" title="Tap to ${isSelected ? "show all patients" : `focus ${esc(s.name)}`}">
        <div class="ps-top">
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
            <div class="ps-name"><span class="ps-dot ${s.online ? "on" : ""}" title="${s.online ? "Online" : "Offline"}"></span>${esc(s.name)}${s.bed ? ` <span class="ps-bed">Bed ${esc(s.bed)}</span>` : ""}</div>
            <div class="ps-code">Room ${esc(s.room)} · ${esc(lastAgo)}</div>
          </div>
          <div class="ps-actions">
            <button class="ps-rm" data-room="${esc(s.room)}" title="Remove ${esc(s.name)} from dashboard">×</button>
          </div>
        </div>
        <div class="ps-stats">
          ${s.unhandled > 0 ? `<span class="ps-stat unhandled-stat">${s.unhandled} open</span>` : `<span class="ps-stat">all clear</span>`}
          ${s.hasEmg ? `<span class="ps-stat emg-stat">EMERGENCY</span>` : ""}
          ${s.acked ? `<span class="ps-stat">ACK sent</span>` : ""}
          ${s.doneCount > 0 ? `<span class="ps-stat">${s.doneCount} handled</span>` : ""}
          ${s.online ? `<span class="ps-stat">● online</span>` : `<span class="ps-stat">○ waiting</span>`}
        </div>
      </div>`;
  }).join("");

  const focusRoom = (r) => {
    patientFilter = (patientFilter === r) ? "all" : r;
    renderPatientList();
    renderPatientFilterBar();
    renderFeed();
    renderPatientStatusRail();
  };

  $$(".patient-status-item", list).forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".ps-rm")) return;
      focusRoom(item.dataset.room);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        focusRoom(item.dataset.room);
      }
    });
  });

  $$(".ps-rm", list).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      disconnectBed(btn.dataset.room);
    });
  });
}

function renderPatientStatusRail() {
  if (!currentNurse) return hidePatientStatusRail();
  showPatientStatusRail();
  refreshPatientStatusList();
}

// ------------------------------------------------------------------ emergency overlay
function showAlarm(r) {
  const el = $("#alarm");
  el.style.display = "";
  el.classList.remove("hidden");
  el.innerHTML = `
    <section class="alarm-card">
      <div class="stamp">${svg("emergency")}</div>
      <h2>EMERGENCY ALERT</h2>
      <div class="who">
        ${esc(r.patientName || "Patient")}
        ${r.bed ? ` · Bed ${esc(r.bed)}` : ""}
        ${r.room && r.room !== DEMO ? ` · Room ${esc(r.room)}` : ""}
      </div>
      <div class="sub">Pressed the emergency alert button at ${fmtClock(r.ts)}. Immediate bedside response required.</div>
      <div class="act">
        <button class="btn btn-red" id="aAck" style="padding:15px 24px;font-size:17px">${svg("check")}I am on my way, silence alarm</button>
        <button class="btn" id="aRead" style="padding:15px 24px;font-size:17px">${svg("speaker")}Read aloud</button>
      </div>
    </section>`;

  $("#aAck").addEventListener("click", () => {
    const rr = feed.find((x) => x.cmid === r.cmid);
    if (rr && rr.status === "new") { rr.status = "ack"; }
    sync.sendAck(r.cmid, r.room, currentNurse?.name || "Nurse");
    alarmCmid = null;
    audio.alarmStop();
    hideAlarm();
    persistFeed();
    renderFeed();
    renderPatientList();
    toastToast(`Emergency acknowledged to ${r.patientName || "patient"}`);
  });

  $("#aRead").addEventListener("click", () => speak(`Emergency: ${r.patientName || "Patient"} in bed ${r.bed || "?"} needs help now.`));
}

const hideAlarm = () => {
  const el = $("#alarm");
  el.classList.add("hidden");
  el.style.display = "none";
  el.innerHTML = "";
};

// ------------------------------------------------------------------ buttons wire

function wireDashboardButtons() {
  $("#btnMute2") && ($("#btnMute2").onclick = () => $("#btnMute").click());

  $("#btnClearAll") && ($("#btnClearAll").onclick = () => {
    feed.forEach((r) => { if (r.status !== "done") r.status = "done"; });
    persistFeed();
    renderFeed();
    renderPatientList();
    renderPatientStatusRail();
    toastToast("All marked handled");
  });

  // “Add Patient” entry points: top bar persists (onclick), rails re-render (onclick resets safely)
  const railAdd = $("#btnRailAddBed");
  if (railAdd) railAdd.onclick = openConnectDialog;
  const statusAdd = $("#btnPatientStatusAdd");
  if (statusAdd) statusAdd.onclick = openConnectDialog;
  const statusRefresh = $("#btnPatientStatusRefresh");
  if (statusRefresh) statusRefresh.onclick = () => {
    refreshPatientStatusList();
    toastToast("Patient statuses refreshed.");
  };
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

// ------------------------------------------------------------------ incoming events

function onIncoming(msg) {
  // If in demo mode, accept all demo msgs
  // Otherwise, only process if msg belongs to one of this nurse's connected rooms
  if (!rooms.includes(DEMO)) {
    if (msg.room && !rooms.includes(msg.room)) return;
  }

  const r = {
    cmid: msg.cmid || String(msg.id ?? Date.now()),
    kind: msg.kind === "emergency" ? "emergency" : "need",
    need: msg.need || "message",
    label: msg.label || "",
    msg: msg.msg || msg.message || "",
    risk: msg.risk || (msg.kind === "emergency" ? "high" : "normal"),
    patientName: msg.patientName || msg.patient || "Patient",
    bed: msg.bed || "",
    room: msg.room || (rooms[0] || ""),
    ts: msg.ts || Date.now(),
    status: "new",
  };

  // Update patient cache
  if (r.room) {
    patients[r.room] = {
      room: r.room,
      name: r.patientName,
      bed: r.bed,
      online: true,
    };
  }

  const existing = feed.find((x) => x.cmid === r.cmid);
  if (existing && existing.status !== "new") return;
  if (existing) { existing.status = "ack"; }
  else { feed.unshift(r); }

  persistFeed();
  renderFeed();
  renderPatientList();
  renderPatientStatusRail();
  renderFilterBar();

  if (!mute) {
    if (r.kind === "emergency") {
      alarmCmid = r.cmid;
      audio.alarmStart();
      showAlarm(r);
      document.title = `EMERGENCY (${r.patientName}) · INTUBATALK`;
    } else {
      audio.chime();
      if (r.risk === "high") document.title = `Urgent request (${r.patientName}) · INTUBATALK`;
    }
    const who = r.bed ? `${r.patientName}, Bed ${r.bed}` : r.patientName;
    speak(`${who} ${r.kind === "emergency" ? "needs help now" : "says"}: ${r.msg}`, { rate: 0.98 });
    if (r.risk === "high") vibrate([120, 60, 120]);
  }

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(r.kind === "emergency" ? "EMERGENCY, patient needs help now" : "INTUBATALK request", {
        body: `${r.patientName}${r.bed ? `, Bed ${r.bed}` : ""}: ${r.msg}`,
        tag: r.cmid,
      });
    } catch { /* noop */ }
  }
}

function onAck(msg) {
  audio.blip();
  const r = feed.find((x) => x.cmid === msg.cmid);
  if (r && r.status === "new") { r.status = "ack"; }
  if (alarmCmid === msg.cmid) { alarmCmid = null; audio.alarmStop(); hideAlarm(); }
  document.title = titleBase;
  persistFeed();
  renderFeed();
  renderPatientList();
  renderPatientStatusRail();
}

function onClear(msg) {
  audio.blip();
  audio.alarmStop();
  alarmCmid = null;
  hideAlarm();
  document.title = titleBase;
  feed.forEach((r) => {
    if (r.room === msg.room && r.kind === "emergency" && r.status !== "done") {
      r.status = "ack";
    }
  });
  persistFeed();
  renderFeed();
  renderPatientList();
  toastToast("Patient alarm cleared.");
}

function onProfilesUpdate(msg) {
  const pMap = msg.profiles || {};
  let changed = false;
  for (const [rCode, p] of Object.entries(pMap)) {
    if (rooms.includes(rCode)) {
      patients[rCode] = {
        room: rCode,
        name: p.name || "Patient",
        bed: p.bed || "",
        online: !!p.online,
        caps: p.caps || [],
      };
      changed = true;
    }
  }
  if (changed) {
    renderPatientList();
    renderPatientFilterBar();
    renderPatientStatusRail();
  }
}

// ------------------------------------------------------------------ initialization

sync.on("request", onIncoming);
sync.on("ack", onAck);
sync.on("clear", onClear);
sync.on("profiles", onProfilesUpdate);

document.addEventListener("click", () => audio.unlock(), { once: true });

// URL param reset handling
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("fresh") === "1" || urlParams.get("reset") === "1") {
  // If explicit fresh reset requested via role chooser:
  // keep nurse list, but open selector so user chooses which nurse to open
  activeNurseId = null;
  currentNurse = null;
  rooms = [];
  feed = [];
}

// Notifications
if (!("Notification" in window)) $("#btnNotify").disabled = true;
$("#btnNotify").addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  const res = await Notification.requestPermission();
  $("#btnNotify").innerHTML = `${svg("bell")}${res === "granted" ? "Alerts on" : "Alerts blocked"}`;
});

// Modal Dialog Wiring
$("#btnCloseConnectDlg")?.addEventListener("click", () => $("#dlgConnectBed")?.close());
$("#btnConfirmConnect")?.addEventListener("click", doConnectBed);
$("#inNewRoom")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doConnectBed(); });

$("#btnCloseNurseDlg")?.addEventListener("click", () => $("#dlgNurseProfile")?.close());
$("#btnCreateNurseProfile")?.addEventListener("click", () => {
  const nameEl = $("#inNurseNameNew");
  const name = nameEl.value.trim();
  const unit = $("#inNurseUnitNew").value.trim();
  if (!name) {
    toastToast("Please enter your nurse name to create a station.");
    nameEl.focus();
    return;
  }
  const created = createNurseStation(name, unit, []);
  if (created) $("#dlgNurseProfile")?.close();
});

// Persistent top-bar buttons (these live outside #main, so wire once)
$("#btnAddPatient")?.addEventListener("click", openConnectDialog);
$("#btnSwitchNurse")?.addEventListener("click", openNurseProfileDialog);
$("#btnMute")?.addEventListener("click", () => {
  mute = !mute;
  saveJSON(LS_MUTE, mute);
  audio.setMuted(mute);
  $("#btnMute").innerHTML = `${svg(mute ? "mute" : "bell")}${mute ? "Muted" : "Sound"}`;
  const m2 = $("#btnMute2");
  if (m2) m2.innerHTML = `${svg(mute ? "mute" : "bell")}${mute ? "Muted" : "Sound on"}`;
  if (mute) { audio.alarmStop(); hideAlarm(); }
});
$("#btnTestSound")?.addEventListener("click", () => {
  audio.unlock();
  audio.chime();
  speak("Nurse dashboard alert sound test.");
  toastToast("Audio alert tested.");
});

// Hydrate static SVGs
$$("[data-ic]").forEach((el) => { el.innerHTML = svg(el.dataset.ic); });

startAmbient();

if (currentNurse) {
  rooms = currentNurse.rooms || [];
  sync.attachRooms(rooms);
  feed = loadJSON(LS_FEED_PREFIX + currentNurse.id, []);
  renderDashboard();
} else {
  renderJoin();
}
