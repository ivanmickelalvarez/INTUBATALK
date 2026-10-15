// INTUBATALK patient tablet app. Claymorphism UI, SVG icon set, no emojis.
import { $, $$, esc } from "./lib/util.js";
import * as audio from "./lib/audio.js";
import { speak, stopSpeech } from "./lib/tts.js";
import * as sync from "./lib/sync.js";
import { svg } from "./lib/icons.js";
import { startAmbient } from "./lib/ambient.js";
import { attach as attachTilt, startTilt } from "./lib/tilt3d.js"; // 3D tilt for the gate card + tiles

import { removeSplash, withButtonLoading, setConnectionState } from "./lib/feedback.js";
import { NEEDS, CAPS, CAPS_BY_KEY, DEFAULT_PROFILE } from "./needs.js";

// ------------------------------------------------------------------ state

let profile = sync.loadProfile() || { ...DEFAULT_PROFILE };
let room = sync.getRoom();
let pendingEmg = null;
let pickedPain = null;

const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* noop */ } };

function toast(text, ms = 3200, kind = "") {
  const t = document.createElement("div");
  t.className = "ack" + (kind ? " " + kind : "");
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ------------------------------------------------------------------ registration

async function startSession() {
  const name = $("#inName").value.trim();
  const bed = $("#inBed").value.trim();
  if (!name) return toast("Please enter the patient name first.", 2600);
  profile.name = name;
  profile.bed = bed;
  profile.caps = profile.caps || [];
  sync.saveProfile(profile);
  audio.unlock();
  try {
    room = await sync.register({ name, bed });
  } catch {
    // Offline demo: a locally generated code still works via tab broadcast.
    room = room || String(1000 + Math.floor(Math.random() * 9000));
    sync.attach(room);
  }
  const remembered = sync.getRememberedRoom();
  if (!room) room = remembered;
  mountApp();
}

// ------------------------------------------------------------------ emergency

function doEmergency() {
  audio.unlock();
  audio.alarmStart();
  flashScreen();
  vibrate([120, 80, 120, 80, 240]);      speak("I need help now.", { rate: rate() });
  pendingEmg = sync.sendEmergency({ msg: "I need help now." });
  document.body.classList.add("emg-active");
  showEmgBanner();
  toast("Emergency sent to the nurse dashboard.", 4000, "red");
}

function clearEmergency() {
  if (pendingEmg) {
    sync.sendClear(pendingEmg);
  }
  pendingEmg = null;
  audio.alarmStop();
  document.body.classList.remove("emg-active");
  hideEmgBanner();
  toast("Emergency alarm cancelled. Nurse informed.");
}

function showEmgBanner() {
  let b = $("#emgBanner");
  if (!b) {
    b = document.createElement("div");
    b.id = "emgBanner";
    b.className = "emg-banner";
    document.body.appendChild(b);
  }
  b.innerHTML = `
    <div class="emg-banner-inner">
      <div class="emg-banner-badge">${svg("emergency")} EMERGENCY ALARM ACTIVE</div>
      <div class="emg-banner-msg">The nurse dashboard has been alerted and is receiving your alarm.</div>
      <div class="emg-banner-acts">
        <button class="btn btn-sm emg-cancel-btn" id="btnCancelEmg">${svg("check")} I am okay now · Cancel alarm</button>
      </div>
    </div>`;
  b.classList.remove("hidden");
  $("#btnCancelEmg")?.addEventListener("click", clearEmergency);
}

function updateEmgBannerAck(nurseName) {
  const b = $("#emgBanner");
  if (!b) return;
  const who = nurseName ? esc(nurseName) : "Nurse";
  const msgEl = b.querySelector(".emg-banner-msg");
  if (msgEl) msgEl.textContent = `${who} acknowledged your call! Help is on the way.`;
  const badgeEl = b.querySelector(".emg-banner-badge");
  if (badgeEl) badgeEl.innerHTML = `${svg("check")} ${who.toUpperCase()} ON THE WAY (ACKNOWLEDGED)`;
}

function hideEmgBanner() {
  const b = $("#emgBanner");
  if (b) {
    b.classList.add("hidden");
    b.remove();
  }
}

// ------------------------------------------------------------------ helpers

function flashScreen() {
  const ov = document.createElement("div");
  ov.className = "flash-ov red";
  document.body.appendChild(ov);
  let n = 0;
  const t = setInterval(() => {
    ov.className = n % 2 === 0 ? "flash-ov white" : "flash-ov red";
    if (++n > 7) { clearInterval(t); ov.remove(); }
  }, 140);
}

const needDef = (key) => NEEDS[key] || null;
const rate = () => (profile.slowTts ? 0.75 : 1);

// ------------------------------------------------------------------ app mount

// Fill static [data-ic] placeholders in the HTML shells and brand marks.
function hydrateIcons() {
  $$("[data-ic]").forEach((el) => { el.innerHTML = svg(el.dataset.ic); });
  const gate = $("#gateMark");
  if (gate) gate.innerHTML = svg("voice");
  const top = $("#topMark");
  if (top) top.innerHTML = svg("voice");
}

function mountApp() {
  $("#wizard").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderTop();
  renderTiles();
  wireIncoming();
  wireTopButtons();
  if (!window._itkHb) window._itkHb = setInterval(() => sync.heartbeat(), 6000);
  hydrateIcons();
}

function wireIncoming() {
  sync.on("ack", (msg) => {
    audio.blip();
    vibrate(30);
    audio.alarmStop();
    updateEmgBannerAck(msg?.nurse);
    const who = msg?.nurse ? `${msg.nurse}` : "The nurse";
    toast(`${who} acknowledged. Help is on the way.`);
  });
  sync.on("clear", () => {
    document.body.classList.remove("emg-active");
    audio.alarmStop();
    hideEmgBanner();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopSpeech(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      goHome();
      const dlg = $("#capsDlg");
      if (dlg?.open) dlg.close();
      const tdlg = $("#addTileDlg");
      if (tdlg?.open) tdlg.close();
    }
  });
}

// ------------------------------------------------------------------ top bar

function renderTop() {
  $("#topName").textContent = profile.name || "Patient";
  $("#topRoom").innerHTML = `Room code &nbsp;<b>${esc(room || "· · · ·")}</b>${profile.bed ? ` &nbsp;·&nbsp; bed ${esc(profile.bed)}` : ""}`;
  const wrap = $("#capsChips");
  const list = profile.caps || [];
  wrap.innerHTML = list.map((k) => {
    const c = CAPS_BY_KEY[k];
    return c ? `<span class="badge mint">${esc(c.label)}</span>` : "";
  }).join("");
}

function wireTopButtons() {
  $("#btnCapsTop").addEventListener("click", openCaps);
  $("#btnBoard").addEventListener("click", () => window.open("/board", "_blank"));
  $("#btnStartOver")?.addEventListener("click", () => {
    if (confirm("Start a new patient session from the beginning?")) {
      sync.clearSession();
      window.location.href = "/?fresh=1";
    }
  });
  $("#btnDial").addEventListener("click", () => {
    audio.unlock();
    sync.sendNeed({
      need: "call", label: "Come to bedside",
      msg: "Please come to my bedside. No emergency, I would just like you here.",
      risk: "normal",
    });
    audio.chime();
    toast("Nurse called to the bedside.");
  });
}

// ------------------------------------------------------------------ home tiles

function customKeys() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem("it_custom") || "[]"); } catch { arr = []; }
  return arr.slice(0, 3).map((c) => String(c));
}

function saveCustom(list) {
  localStorage.setItem("it_custom", JSON.stringify(list.map((c) => c.replace(/^custom:/, "").slice(0, 20))));
}

function renderTiles() {
  const grid = $("#homeGrid");
  grid.innerHTML = "";
  const warns = ["suction", "breathing", "toilet", "pain"];
  const labels = ["emergency", ...Object.keys(NEEDS), ...customKeys().map((c) => `custom:${c}`)];
  for (const key of labels) {
    const def = key === "emergency" ? null : needDef(key);
    const custom = key.startsWith("custom:");
    const label = key === "emergency" ? "Emergency" : custom ? key.slice(7) : (def?.label ?? key);
    const iconName = custom ? "position" : key === "emergency" ? "emergency" : (def?.icon ?? "bell");
    const cls =
      key === "emergency" ? "tile tile--red et-phone-home" :
      warns.includes(key) ? "tile tile--mint" :
      custom ? "tile tile--custom" : "tile";
    const btn = document.createElement("button");
    btn.className = cls + " glare";
    btn.style.setProperty("--i", `${Math.min(grid.children.length, 12) * 45}ms`);
    btn.innerHTML = `<span class="tile-ic" style="display:flex">${svg(iconName, "tile-ic")}</span><span class="tile-lbl">${esc(label)}</span>`;
    if (custom) {
      const rm = document.createElement("span");
      rm.className = "rm";
      rm.innerHTML = svg("close");
      rm.title = "Remove tile";
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        saveCustom(customKeys().filter((c) => c !== key.slice(7)));
        renderTiles();
      });
      btn.appendChild(rm);
    }
    if (key !== "emergency") attachTilt(btn, { max: 0.6 }); // 3D lean on every tile
    btn.addEventListener("click", () => {
      audio.unlock();
      btn.classList.remove("tapped");
      void btn.offsetWidth; // restart the pulse ring animation
      btn.classList.add("tapped");
      setTimeout(() => btn.classList.remove("tapped"), 620);
      tileTap(key);
    });
    grid.appendChild(btn);
  }
  const add = document.createElement("button");
  add.className = "tile tile--add";
  add.innerHTML = `<span class="tile-ic" style="display:flex">${svg("plus", "tile-ic")}</span><span class="tile-lbl">Add tile</span>`;
  add.title = "Add a custom tile";
  add.addEventListener("click", addTileFlow);
  grid.appendChild(add);
}

function addTileFlow() {
  let dlg = $("#addTileDlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "addTileDlg";
    document.body.appendChild(dlg);
  }
  const suggestions = ["Call family", "Doctor", "Glasses", "Dentures", "Blanket / Cold", "Quiet please", "Chaplain", "Headache"];
  dlg.innerHTML = `
    <h3 class="dlg-title">Add a Custom Tile</h3>
    <p style="color:var(--text-soft);font-size:13.5px;margin:0 0 10px;line-height:1.5">Pick a suggested need or type your own request:</p>
    <div class="custom-tile-chips">
      ${suggestions.map((s) => `<button type="button" class="custom-tile-chip">${esc(s)}</button>`).join("")}
    </div>
    <div style="margin-bottom:14px">
      <label for="inTileName" style="display:block;font-size:13px;font-weight:700;color:var(--text-soft);margin-bottom:6px">Tile label</label>
      <input id="inTileName" class="alph-out" style="min-height:auto;padding:12px 14px;font-size:16px;width:100%" placeholder="e.g. Call daughter" maxlength="24">
    </div>
    <div class="dlg-actions">
      <button class="btn btn-ghost" id="dTileCancel" type="button">Cancel</button>
      <button class="btn btn-mint" id="dTileSave" type="button">Add tile</button>
    </div>`;

  const inTile = $("#inTileName", dlg);
  $$(".custom-tile-chip", dlg).forEach((btn) => {
    btn.addEventListener("click", () => { inTile.value = btn.textContent; inTile.focus(); });
  });
  $("#dTileCancel", dlg).addEventListener("click", () => dlg.close());

  const doSave = () => {
    const val = inTile.value.trim();
    if (!val) return;
    const list = customKeys();
    if (!list.includes(val)) {
      list.push(val.slice(0, 24));
      saveCustom(list);
    }
    dlg.close();
    renderTiles();
  };
  $("#dTileSave", dlg).addEventListener("click", doSave);
  inTile.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
  dlg.showModal();
}

// ------------------------------------------------------------------ taps and routing

function tileTap(key) {
  if (key === "emergency") return doEmergency();
  if (key === "blink") return openPanel("blink");
  if (key === "write") return openPanel("write");
  if (key === "alphabet") return openPanel("alphabet");
  if (key === "pain") return openPanel("pain");
  if (key.startsWith("custom:")) {
    const label = key.slice(7);
    sync.sendNeed({ need: "custom", label, msg: `I need help with: ${label}.`, risk: "normal" });
    audio.chime(); vibrate(35);
    speak(`I need help with: ${label}.`, { rate: rate() });
    toast("Sent to the nurse.");
    return;
  }
  const def = needDef(key);
  if (!def) return;
  if (def.risk === "high") return openPanel(key);
  sync.sendNeed({ need: key, label: def.label, msg: def.msg, risk: "normal" });
  audio.chime(); vibrate(35);
  speak(def.msg, { rate: rate() });
  toast("Sent to the nurse.");
}

// ------------------------------------------------------------------ panels

function openPanel(kind) {
  // Leaving the blink panel (or any panel) for another one must release the
  // camera immediately — never keep a live stream attached to a removed <video>.
  if (kind !== "blink") stopBlinkCamera();
  const panel = $("#panel");
  panel.classList.remove("hidden");
  const head = (icon, title, note = "") => `
    <div class="panel-head">
      <button class="btn btn-ghost back" id="pBack">${svg("arrowLeft")}Home</button>
      <h2>${svg(icon)}${esc(title)}</h2>
    </div>${note ? `<p class="blink-help">${esc(note)}</p>` : ""}`;

  if (kind === "pain") {
    panel.innerHTML = head("pain", "Pain level") + `
      <p class="pain-scale-note">Tap the number that matches your pain. 0 means none. 10 means the worst pain imaginable.</p>
      <div class="pain-grid" id="painGrid"></div>
      <div class="confirm-bar">
        <button class="btn btn-mint" id="pSend" disabled>Send pain report</button>
      </div>`;
    const grid = $("#painGrid");
    pickedPain = null;
    for (let i = 0; i <= 10; i++) {
      const b = document.createElement("button");
      b.className = "pain-btn";
      b.innerHTML = `<small style="font-size:clamp(18px,3vw,24px)">${i}</small>`;
      b.addEventListener("click", () => {
        pickedPain = i;
        $$(".pain-btn").forEach((x) => x.classList.remove("picked"));
        b.classList.add("picked");
        $("#pSend").disabled = false;
      });
      grid.appendChild(b);
    }
    $("#pSend").addEventListener("click", () => {
      if (pickedPain === null) return;
      const sev = pickedPain >= 7 ? "high" : "normal";
      sync.sendNeed({ need: "pain", label: "Pain", msg: `My pain level is ${pickedPain} out of 10.`, risk: sev });
      audio.chime(); vibrate(35);
      speak(`My pain level is ${pickedPain} out of 10.`, { rate: rate() });
      toast("Pain report sent.");
      goHome();
    });
    return wireBack();
  }

  if (["breathing", "suction", "toilet"].includes(kind)) {
    const def = needDef(kind);
    const chips = [def.msg, ...(def.vars || [])];
    panel.innerHTML = head(def.icon, def.label, "This is a high priority request. Choose the exact phrase, then send it.") + `
      <div class="chips-wrap" id="vChips">
        ${chips.map((v, i) => `<button class="chip ${i === 0 ? "sel" : ""}" data-v="${esc(v)}">${svg("check")}<span>${esc(v)}</span></button>`).join("")}
      </div>
      <div class="confirm-bar">
        <button class="btn btn-mint speak-btn" id="vSend">${svg("send")}Send this</button>
        <button class="btn speak-btn" id="vSpeak">${svg("speaker")}Speak instead</button>
      </div>`;
    let chosen = def.msg;
    $$("#vChips .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#vChips .chip").forEach((x) => x.classList.remove("sel"));
      c.classList.add("sel");
      chosen = c.dataset.v;
    }));
    $("#vSend").addEventListener("click", () => {
      sync.sendNeed({ need: kind, label: def.label, msg: chosen, risk: "high" });
      audio.chime(); vibrate(35);
      speak(chosen, { rate: rate() });
      toast("Sent to the nurse.");
      goHome();
    });
    $("#vSpeak").addEventListener("click", () => speak(chosen, { rate: rate() }));
    return wireBack();
  }

  if (kind === "write") {
    panel.innerHTML = head("write", "Write a note") + `
      <textarea id="wText" class="alph-out" data-placeholder="Type using the keyboard" style="width:100%;min-height:120px;font-weight:600;resize:vertical"></textarea>
      <div class="confirm-bar">
        <button class="btn btn-mint" id="wSend">${svg("send")}Send and speak</button>
        <button class="btn btn-ghost" id="wMic">${svg("mic")}Speak to text</button>
        <button class="btn btn-ghost" id="wTts">${svg("speaker")}Read my text</button>
      </div>`;
    const ta = $("#wText");
    const sr = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (sr) {
      $("#wMic").addEventListener("click", () => {
        const rec = new sr();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.onresult = (e) => { ta.value += (ta.value ? " " : "") + e.results[0][0].transcript; };
        try { rec.start(); toast("Listening."); } catch { /* already running */ }
      });
    } else $("#wMic").disabled = true;
    $("#wTts").addEventListener("click", () => ta.value.trim() && speak(ta.value.trim()));
    $("#wSend").addEventListener("click", () => {
      const t = ta.value.trim();
      if (!t) return toast("Write something first.");
      sync.sendNeed({ need: "message", label: "Message", msg: t });
      speak(t, { rate: rate() });
      toast("Message sent.");
      goHome();
    });
    return wireBack();
  }

  if (kind === "alphabet") {
    panel.innerHTML = head("alphabet", "Spell a message", "Tap letters to build a word. Send when it reads correctly.") + `
      <div class="alph-out" id="out" data-placeholder="Spell a word"></div>
      <div class="alph-grid" id="grid"></div>`;
    const out = $("#out");
    const grid = $("#grid");
    const push = (s) => { out.textContent += s; };
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c) => {
      const b = document.createElement("button");
      b.textContent = c;
      b.addEventListener("click", () => { push(c); audio.blip(); });
      grid.appendChild(b);
    });
    const mk = (cls, html, fn, span) => {
      const b = document.createElement("button");
      b.className = cls;
      b.style.gridColumn = `span ${span}`;
      b.innerHTML = html;
      b.addEventListener("click", fn);
      grid.appendChild(b);
    };
    mk("space", `${svg("position")} space`, () => push(" "), 3);
    mk("del", svg("close"), () => { out.textContent = out.textContent.slice(0, -1); }, 1);
    mk("send", `${svg("send")} send`, () => {
      const t = out.textContent.trim();
      if (!t) return toast("Spell something first.");
      sync.sendNeed({ need: "message", label: "Spelled", msg: t });
      speak(t, { rate: rate() });
      toast("Message sent.");
      goHome();
    }, 2);
    return wireBack();
  }

  if (kind === "blink") {
    panel.innerHTML = head("blink", "Eye-blink mode", "Nurse assisted blink protocol. One blink means yes, two blinks mean no. The tap below sends the answer and the tablet says it aloud.") + `
      <div class="blink-stage">
        <div class="blink-lesson" id="bQ">Waiting for a blink. The nurse will ask the question.</div>
        <div class="yn-grid">
          <button class="btn btn-mint yn-big" id="bYes">${svg("blink")}<span>1 blink = YES</span></button>
          <button class="btn yn-big" id="bNo">${svg("blink")}<span>2 blinks = NO</span></button>
        </div>
        <div class="blink-actions">
          <button class="btn" id="bClear">${svg("repeat")}Clear answer</button>
          <button class="btn btn-red" id="bLaunch">${svg("emergency")}Emergency</button>
        </div>
      </div>
      <div class="blink-cam-stage">
        <div class="blink-cam-head">
          <h3>${svg("camera")}Camera assist</h3>
          <button class="btn btn-mint btn-sm" id="bCamOn">${svg("camera")}Enable camera</button>
        </div>
        <p class="blink-cam-note">The bedside camera lets the nurse watch the patient's eyes live on the tablet, so blinks can be counted even from a busy ward desk. The video stays on this device — it is never recorded or sent to the dashboards.</p>
        <div class="blink-cam-frame hidden" id="bCamFrame">
          <video id="bCamVideo" autoplay playsinline muted></video>
          <span class="blink-cam-live"><span class="dot on"></span>LIVE</span>
          <button class="btn btn-red btn-sm blink-cam-off" id="bCamOff">${svg("close")}Camera off</button>
        </div>
        <div class="gate-err hidden" id="bCamErr"></div>
      </div>
      <p class="blink-ref">Automatic blink detection is deliberately off: the assisted protocol is more reliable in ICU lighting and works today. Answers are logged with the buttons above.</p>`;
    let answer = null;
    const saySpoken = () => {
      const el = $("#bQ");
      const spoken = answer === "yes" ? "The patient says yes." : answer === "no" ? "The patient says no." : "Waiting for a blink. The nurse will ask the question.";
      el.textContent = spoken;
      if (answer) speak(spoken, { rate: rate() });
    };
    $("#bYes").addEventListener("click", () => {
      answer = "yes";
      sync.sendNeed({ need: "blink", label: "Eye-blink answer", msg: "The patient answered with one blink: yes." });
      audio.chime();
      toast("Answer sent: YES");
      saySpoken();
    });
    $("#bNo").addEventListener("click", () => {
      answer = "no";
      sync.sendNeed({ need: "blink", label: "Eye-blink answer", msg: "The patient answered with two blinks: no." });
      audio.blip();
      toast("Answer sent: NO");
      saySpoken();
    });
    $("#bClear").addEventListener("click", () => { answer = null; saySpoken(); });
    $("#bLaunch").addEventListener("click", doEmergency);
    $("#bCamOn").addEventListener("click", () => openBlinkCamera());
    $("#bCamOff").addEventListener("click", () => { stopBlinkCamera(); });
    return wireBack();
  }
}

// ------------------------------------------------------------------ camera (eye-blink assist)

let blinkStream = null;

async function openBlinkCamera() {
  const frame = $("#bCamFrame");
  const err = $("#bCamErr");
  const video = $("#bCamVideo");
  if (!frame || !video) return;
  err?.classList.add("hidden");

  // Re-attach a previously granted stream to the (possibly re-rendered) video
  // element so the feed never comes back as a black frame.
  if (blinkStream) {
    if (video.srcObject !== blinkStream) video.srcObject = blinkStream;
    await video.play().catch(() => {});
    frame.classList.remove("hidden");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    if (err) {
      err.textContent = !window.isSecureContext
        ? "Camera access needs a secure connection (HTTPS or localhost). Over plain Wi-Fi HTTP, use a direct localhost connection or fall back to the blink buttons."
        : "This browser does not support camera access. Use the assisted blink buttons instead.";
      err.classList.remove("hidden");
    }
    return;
  }
  try {
    blinkStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = blinkStream;
    await video.play().catch(() => {});
    frame.classList.remove("hidden");
    audio.unlock();
    toast("Camera is live. Blinks can be counted from the bedside screen.");
  } catch (e) {
    blinkStream = null;
    if (err) {
      err.textContent = e?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access for this site, then tap Enable camera again."
        : "No camera is available on this device. Use the assisted blink buttons instead.";
      err.classList.remove("hidden");
    }
  }
}

function stopBlinkCamera() {
  blinkStream?.getTracks().forEach((t) => t.stop());
  blinkStream = null;
  const frame = $("#bCamFrame");
  if (frame) frame.classList.add("hidden");
  const video = $("#bCamVideo");
  if (video) video.srcObject = null;
}

const wireBack = () => $("#pBack")?.addEventListener("click", goHome);

const goHome = () => {
  pickedPain = null;
  stopBlinkCamera(); // release the camera when leaving the blink panel
  const panel = $("#panel");
  panel.classList.add("hidden");
  panel.innerHTML = "";
};

// ------------------------------------------------------------------ capabilities dialog

function openCaps() {
  let dlg = $("#capsDlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "capsDlg";
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = `
    <h3 class="dlg-title">What can the patient currently do?</h3>
    <p style="color:var(--text-soft);font-size:13.5px;margin:0 0 10px;line-height:1.5">INTUBATALK activates the right communication modes for today's strength level. The nurse dashboard shows this profile too.</p>
    <div class="cap-grid" id="capGrid"></div>
    <label style="display:flex;gap:9px;align-items:center;margin-top:16px;font-size:14.5px">
      <input type="checkbox" id="slowTts" style="width:18px;height:18px;accent-color:var(--accent-deep)"> Slower voice
    </label>
    <div class="dlg-actions">
      <button class="btn btn-ghost" id="dCancel">Cancel</button>
      <button class="btn btn-mint" id="dSave">Save</button>
    </div>`;
  const sel = new Set(profile.caps || []);
  $("#slowTts").checked = !!profile.slowTts;
  $("#capGrid", dlg).innerHTML = CAPS.map((c) =>
    `<button class="cap ${sel.has(c.key) ? "on" : ""}" data-k="${c.key}">${svg(c.icon)}<span>${esc(c.label)}</span><small>${sel.has(c.key) ? "enabled" : "off"}</small></button>`).join("");
  $$("#capGrid .cap", dlg).forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k;
    if (sel.has(k)) sel.delete(k); else sel.add(k);
    b.classList.toggle("on");
    b.querySelector("small").textContent = sel.has(k) ? "enabled" : "off";
    if (k === "onlyyesno" && sel.has(k)) {
      toast("Yes and no mode: eye-blink and emergency stay active, other tiles trim to the essentials.", 4200);
    }
  }));
  $("#dCancel", dlg).addEventListener("click", () => dlg.close());
  $("#dSave", dlg).addEventListener("click", () => {
    profile.caps = [...sel];
    profile.slowTts = $("#slowTts").checked;
    profile.caps = profile.caps || [];
    sync.saveProfile(profile);
    dlg.close();
    renderTop();
    toast("Abilities saved.");
  });
  dlg.showModal();
}

// ------------------------------------------------------------------ print backup board

function doPrint() {
  const tiles = ["emergency", ...Object.keys(NEEDS)]
    .map((k) => {
      const def = k === "emergency"
        ? { icon: "emergency", label: "EMERGENCY, CALL FOR HELP", cls: "red" }
        : needDef(k);
      return `<div class="tile ${def.cls || ""}"><span class="ic ic-lg">${svg(def.icon)}</span><span>${esc(def.label)}</span></div>`;
    })
    .join("");
  const w = window.open("", "itk-board", "width=1100,height=800");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>INTUBATALK board, ${esc(profile.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
body{font-family:'Public Sans',Arial,sans-serif;background:#f3f1ec;color:#263340;margin:0}
h1{font-size:28px;margin:16px 22px 2px;letter-spacing:.01em}.sub{margin:0 22px 16px;color:#5d6c78;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 22px 26px}
.tile{background:#f8f7f4;border:1px solid rgba(255,255,255,.7);border-radius:22px;min-height:150px;box-shadow:8px 8px 18px rgba(103,112,108,.16),-8px -8px 18px rgba(255,255,255,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:24px;font-weight:800;text-align:center;padding:14px}
.tile svg{width:56px;height:56px;color:#5d6c78}
.tile.red{background:linear-gradient(145deg,#dd6161,#bd4848);color:#fff}
.tile.red svg{color:#fff}
.tile.mint{background:linear-gradient(145deg,#4cb1a0,#38937f);color:#fff}
.tile.mint svg{color:#fff}
.foot{margin:10px 22px;color:#5d6c78;font-size:13px;max-width:100ch}
@media print{@page{size:A4 landscape;margin:10mm}.noprint{display:none}}
</style></head><body>
<h1>INTUBATALK communication board</h1>
<p class="sub">Patient: <b>${esc(profile.name)}</b> &nbsp; Bed ${esc(profile.bed || "?")} &nbsp; Print and laminate as the backup.</p>
<div class="grid">${tiles}</div>
<p class="foot">Point at a tile to communicate a need. For emergencies keep pointing until a nurse arrives. Use the tablet app whenever it is available.</p>
<p class="foot noprint"><button onclick="window.print()" style="padding:10px 18px;border-radius:12px;border:1px solid #c9c3b7;background:#f8f7f4;font-weight:700;cursor:pointer">Print or save as PDF</button></p>
</body></html>`);
  w.document.close();
}

// ------------------------------------------------------------------ boot
// Every time the app is opened or reopened, a new patient login is required.

document.addEventListener("click", () => audio.unlock(), { once: true });
hydrateIcons();
startAmbient();
startTilt(); // 3D lean + glare on the [data-tilt] gate card

// Wipe any previous session so the patient always inputs a new login
sync.clearSession();
profile = { ...DEFAULT_PROFILE };
room = null;

// Present the login screen
$("#wizard").classList.remove("hidden");
$("#app").classList.add("hidden");
if ($("#inName")) {
  $("#inName").value = "";
  setTimeout(() => { try { $("#inName").focus(); } catch { /* noop */ } }, 200);
}
if ($("#inBed")) $("#inBed").value = "";
$("#btnCreate").addEventListener("click", () => {
  withButtonLoading($("#btnCreate"), startSession(), "Starting…");
});

// Boot complete: drop the splash screen and settle content in.
document.documentElement.classList.add("app-booting");
removeSplash();
document.querySelectorAll("#wizard, #app").forEach((el) => el.classList.add("app-fade"));
requestAnimationFrame(() => document.documentElement.classList.remove("app-booting"));

// Connection banner: react to poll success/failure while the tablet is live.
sync.on("connection", (ok) => {
  setConnectionState(ok ? "live" : "offline");
});
window.addEventListener("online", () => { /* next poll (≤1.5s) confirms and clears */ });
window.addEventListener("offline", () => setConnectionState("offline"));
$( "#gateForm" ).addEventListener("submit", (e) => {
  e.preventDefault();
  withButtonLoading($("#btnCreate"), startSession(), "Starting…");
});
$("#inName").addEventListener("keydown", (e) => { if (e.key === "Enter") startSession(); });
