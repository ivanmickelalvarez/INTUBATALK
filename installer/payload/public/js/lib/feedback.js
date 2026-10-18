// INTUBATALK · shared UI feedback helpers
// Splash loading screen, in-button loading spinners, connection banner,
// and network error toasts. All motion honors prefers-reduced-motion.
import { $ } from "./util.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------- splash */

// The three interactive shells ship with a static splash screen in the HTML
// (visible before any JS runs). This removes it once the app module booted.
export function removeSplash() {
  document.querySelectorAll(".app-splash").forEach((el) => {
    if (REDUCED) { el.remove(); return; }
    el.classList.add("app-splash--done");
    setTimeout(() => el.remove(), 260);
  });
  document.documentElement.classList.remove("app-booting");
}

/* -------------------------------------------------------- button loading */

const BUSY_BTN_HTML = new WeakMap();

// Turns a button into a spinner + disabled for the duration of `promise`.
// Kills double-taps: the button cannot be pressed again until it resolves.
export function withButtonLoading(btn, promise, label = "Working…") {
  if (!btn) return promise;
  if (BUSY_BTN_HTML.has(btn)) return promise; // already in flight
  BUSY_BTN_HTML.set(btn, true);
  const orig = btn.innerHTML;
  const disabled = btn.disabled;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.innerHTML =
    `<span class="btn-spinner" aria-hidden="true"></span>` +
    `<span class="btn-busy-label">${label}</span>`;
  return Promise.resolve(promise).finally(() => {
    btn.innerHTML = orig;
    btn.disabled = disabled;
    btn.removeAttribute("aria-busy");
    BUSY_BTN_HTML.delete(btn);
  });
}

/* ---------------------------------------------------------- connection UI */

let connEl = null;
let connState = null;

// Slim banner pinned to the top: offline / reconnecting / live.
// Only shows when there is something to say (never renders "live").
export function setConnectionState(state) { // "offline" | "reconnecting" | "auth" | "live"
  if (state === connState) return;
  connState = state;

  if (!state || state === "live") {
    if (connEl) {
      connEl.classList.add("conn-banner--leaving");
      const el = connEl;
      setTimeout(() => el.remove(), REDUCED ? 0 : 300);
      connEl = null;
    }
    return;
  }

  const label =
    state === "offline" ? "Wi-Fi or network is off — requests are saved and will send when back online" :
    state === "auth" ? "Sign in to the shared app to reconnect" :
    state === "service" ? "Network is available, but the shared service needs sign-in or recovery" :
    state === "reconnecting" ? "Reconnecting to the nurse dashboard…" :
    "Live connection restored";
  const icon =
    state === "offline" || state === "auth" ? "wifi-off" :
    state === "reconnecting" ? "spinner" : "wifi";

  if (!connEl) {
    connEl = document.createElement("div");
    connEl.className = "conn-banner";
    connEl.setAttribute("role", "status");
    connEl.setAttribute("aria-live", "polite");
    document.body.prepend(connEl);
  }
  connEl.classList.toggle("conn-banner--leaving", false);
  connEl.dataset.state = state;
  connEl.innerHTML =
    `<span class="conn-banner-icon ${icon === 'spinner' ? 'btn-spinner' : ''}" aria-hidden="true"></span>` +
    `<span>${label}</span>` +
    (state === "auth" ? `<button id="connSignIn" class="conn-banner-action" type="button">Sign in</button>` : "");
  connEl.querySelector("#connSignIn")?.addEventListener("click", () => window.location.reload());
}

/* ------------------------------------------------------- network errors */

let errToastTimer = null;
let errToastEl = null;

// Network problems surface as an auto-dismissing clay toast.
export function netErrorToast(msg) {
  if (errToastEl) errToastEl.remove();
  errToastEl = document.createElement("div");
  errToastEl.className = "ack ack--net";
  errToastEl.setAttribute("role", "status");
  errToastEl.textContent = msg || "Network hiccup — trying again.";
  document.body.append(errToastEl);
  clearTimeout(errToastTimer);
  errToastTimer = setTimeout(() => { errToastEl?.remove(); errToastEl = null; }, 4000);
}

// Convenience: only toast when a navigator is online but a request still failed.
export function sendFailedToast() {
  netErrorToast(navigator.onLine
    ? "That message didn't reach the nurse. Tap again."
    : "You're offline — the request is queued and will send automatically.");
}
