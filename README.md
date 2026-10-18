# INTUBATALK

An adaptive communication system for intubated ICU patients who cannot speak.
A patient tablet, a nurse dashboard, and a printable laminated backup board,
built as a working functional prototype for an IPIC-style presentation.

**Links (deployed preview):**
- Patient tablet: `https://site-a166399491ee4290b4637b32520266e3.freebuff.page/`
- Nurse dashboard: `/nurse` (same domain)
- Printable board: `/board`

---

## What it does

### Patient tablet (`/`)

The patient first enters their name and bed. A four digit room code appears in the
top bar; the nurse dashboard pairs with that code. Then tiles:

| Tile | Behaviour |
|---|---|
| Emergency, call for help | Red pulsing tile: alarm sound, screen flash, vibration, speech, and an emergency ping to the nurse. Repeats until acknowledged. |
| Breathing, Suction, Toilet, Pain | High priority. Opens a variant picker ("There are secretions in my throat right now", pain scale 0 to 10) and rings an alert on the nurse side. |
| Thirst, Reposition, Nausea, Anxiety | One tap equals one request, spoken aloud via text to speech. |
| Write | Free text plus optional voice to text, read aloud on send. |
| Alphabet | Big letter spelling pad for patients with partial movement. |
| Eye-blink | Nurse assisted protocol: one blink means yes, two blinks mean no. The tap relays the answer and speaks it aloud. |
| Add tile | Custom tiles (for example "Call family") created by the patient or nurse. |

Also in the top bar: Abilities (adaptive communication, see below), Call nurse
(non urgent "come to bedside"), and Board (opens the printable backup board).

### Nurse dashboard (`/nurse`)

- Type the patient's four digit code to pair.
- Every request arrives as a card with the room and bed, timestamp, and full message.
- High priority requests and pain of 7 or more pulse the card and speak aloud.
- Emergency: a full screen red alarm overlay, a repeating siren, and a browser
  notification, until the nurse taps "I am on my way, silence alarm".
- A patient's "I am okay now" clears the alarm from their side too.
- Live patient online status in the sidebar.

### Adaptive communication

The Abilities dialog asks "What can the patient currently do?" and lets you check:
Touch screen, Move fingers, Write or draw, Blink clearly, Move eyes, Yes and no only.
The profile syncs to the nurse dashboard and voice speed can be slowed for easier
listening. This is what turns INTUBATALK from a static board into an adaptive
system that is reconfigured for each patient, each day.

### Printable backup board (`/board`)

A plain HTML page, deliberately offline and JavaScript free. Print it (A4 landscape)
and laminate. It is the fallback when the battery dies, which completes the brief's
stack of tablet plus app plus nurse dashboard plus backup laminated board.

---

## How it works

- **Frontend:** vanilla HTML, CSS, and JavaScript with no framework build step.
  Web Speech API for text to speech and voice to text. WebAudio generates the
  chimes and alarms, so there are no sound files. Web Vibration for haptic patterns.
- **Design:** claymorphism. Soft raised surfaces with dual shadows, a calm
  hospital palette, and a medical grade type pairing of Public Sans (UI) with
  Lora (display). A hand drawn stroke SVG icon set, no emojis anywhere.
- **Ambient motion:** a medically themed background, a slow breathing glow on a
  7 second rhythm plus a faint scrolling ECG trace (canvas), and interaction
  animations: hover lift, tap pulse rings, staggered tile and card entrances,
  panel slide-ins, and toast pops. All motion honors prefers-reduced-motion
  and pauses when the tab is hidden.
- **Backend:** a small Cloudflare Worker (`worker.js`) exposing
  `POST /api/session|messages|ack|clear|presence|profile` and
  `GET /api/poll?room=...&after=...`. D1 (SQLite) stores rooms and messages, with
  the schema auto-created on first request, so there is no separate migration step.
- **Sync model:** each patient event gets a `cmid` (client message id). Both sides
  poll their room about every 1.5 seconds, so a patient tap reaches the nurse
  within that window. The patient also broadcasts over `BroadcastChannel`, so two
  tabs in one browser demonstrate the entire flow with no network at all, which is
  ideal for a rehearsed classroom demo. Cross-device delivery uses the shared API;
  failed writes are retained in a local outbox and retried, with server-side `cmid`
  deduplication preventing duplicate alerts.
- **PWA:** a service worker caches the app shell, so the patient tablet keeps
  working through Wi-Fi blips. Audio unlock helpers satisfy iOS autoplay rules.
- **Privacy by design:** no patient identifiers beyond the name and bed you type,
  messages auto-expire after 12 hours, and nothing touches an EHR.

### Cross-device use

For Cloud mode, both devices open the same deployed HTTPS URL and sign in with an
allowlisted staff email using Cloudflare Access email one-time PIN. The patient
opens `/`, the nurse opens `/nurse`, and the nurse enters the patient's four-digit
room code. The Cloudflare Worker deployment uses D1 as the shared durable store.
Each device signs in independently. Access sessions last 12 hours; after expiry,
the device must sign in again. The room and pending alerts remain in the shared
database while a device reauthenticates.

For a local/LAN session, start the server on the host computer with `npm start` and
use the printed **Wi-Fi / LAN** URL on both devices. Do not use `127.0.0.1` or
`localhost` on the second device: those addresses point back to the second device
itself. Both devices must be on the same network and the host firewall must allow
the server port.

## Run it locally

### 1. Desktop Executable (`INTUBATALK.exe`)
Double-click `INTUBATALK.exe` (or `START-INTUBATALK.bat`).
- Automatically starts the local server in the background.
- Opens the INTUBATALK Desktop Hub with one-click buttons for:
  - 📱 Patient Tablet (opens in dedicated standalone app window)
  - 🩺 Nurse Dashboard (opens in dedicated nurse station window)
  - 👥 Dual Presentation Simulator (side-by-side view on one screen)
  - 📋 Printable Backup Board
- Includes System Tray integration and Wi-Fi LAN sharing.

### 2. Node.js Local Server
```bash
npm start           # Starts standalone zero-dependency server on http://127.0.0.1:8788
npm run check       # Runs esbuild syntax check across all scripts
```

- Patient tablet: `http://127.0.0.1:8788/`
- Nurse dashboard: `http://127.0.0.1:8788/nurse`
- Dual simulator: `http://127.0.0.1:8788/dual`
- Printable board: `http://127.0.0.1:8788/board`
- Diagnostic console: `http://127.0.0.1:8788/console`

## Shared Cloud, Windows, and Mobile Setup

The Cloudflare Worker in `worker.js` and the D1 database in `wrangler.jsonc` provide
one shared service for the Windows launcher, Android TWA, and Apple PWA. The selected
release origin is `https://intubatalk.intubatalk.workers.dev`; `app-origin.txt` is the
single origin value used by the Windows Cloud build and Android project. The deployed
Worker is protected by a Cloudflare Access policy that allows only the approved staff
email, using one-time PIN sign-in with a 12-hour session. Patient and nurse pages and
all `/api/` routes require Access. Only the web manifest, app icon files, and Android
Digital Asset Links file have path-specific public exceptions so browsers and Android
can read install metadata; these routes do not serve dashboard or patient data. The
Android Digital Asset Links file is published after the persistent signing key exists.

Windows opens Cloud mode by default. Use `INTUBATALK.exe --local` to start its bundled
Local/LAN service, or choose **Local LAN Mode** from the Start Menu. Build the EXE and
installer with:

```bash
npm run windows:build
npm run windows:installer
```

Android uses a Trusted Web Activity wrapper around the same PWA. After the shared
site is deployed and its manifest is reachable, initialize and build the signed APK:

```bash
npm run android:init
npm run android:build
```

The persistent signing keystore belongs at `%USERPROFILE%\.intubatalk\android-release.keystore`;
back it up securely and reuse it for every update. Keep its passwords private. The
APK output is `release/android/INTUBATALK-Android.apk`. Android fullscreen verification
also requires `/.well-known/assetlinks.json` to match the APK package ID and certificate.

On iPhone and iPad, open the same HTTPS origin in Safari and choose **Add to Home Screen**.
All Cloud clients must use the same origin to share patient rooms and messages.

**Prototype limitation:** Cloud mode requires an allowlisted staff email sign-in,
but rooms still use four-digit pairing codes and this prototype is not a clinical
system. Local/LAN mode has no Cloudflare Access protection and is only for trusted
private networks. Do not use real patient information or treat this deployment as
clinically ready; privacy, audit, operational, and clinical safety requirements
remain outside this prototype.

## Vercel Deployment (compatibility only)

INTUBATALK is pre-configured for Vercel deployment:
- `vercel.json` provides clean URLs, asset rewrites, and CORS headers.
- `api/` provides serverless function endpoints for `/api/session`, `/api/messages`, `/api/ack`, `/api/clear`, `/api/profile`, `/api/presence`, `/api/poll`.
- `public/` contains all static assets.

The included Vercel API fallback uses process memory and is not a durable shared
store across serverless instances. Use the Cloudflare/D1 deployment above when
cross-device synchronization must be reliable.

**To deploy:**
```bash
# Option A: Vercel CLI
npx vercel

# Option B: Git / GitHub
git init && git add . && git commit -m "Initial commit"
# Push to GitHub and import repository in Vercel dashboard. Zero build configuration required!
```

## Project layout

```
INTUBATALK.exe            Native Windows desktop executable application & launcher
NursingApp.exe            Windows executable alias
app.ico                   Custom high-res multi-size application icon
server.js                 Universal zero-dependency Node.js HTTP server & API
vercel.json               Vercel deployment & routing configuration
api/                      Vercel Serverless Functions
  _db.js                  Serverless state store
  index.js                Unified API router
  session.js              POST /api/session
  messages.js             POST /api/messages
  ack.js                  POST /api/ack
  clear.js                POST /api/clear
  profile.js              POST /api/profile
  presence.js             POST /api/presence
  poll.js                 GET /api/poll
public/
  index.html              Patient tablet shell
  nurse.html              Nurse dashboard shell
  dual.html               Dual interactive side-by-side simulator
  board.html              Printable laminated backup board
  manifest.webmanifest    PWA install manifest (fullscreen tablet)
  sw.js                   Service worker (offline shell cache v8)
  css/base.css            Design tokens and claymorphic primitives
  css/patient.css         Tablet styles & active emergency banner
  css/nurse.css           Dashboard styles & filter pills
  js/needs.js             Need catalog (icons, phrases, risk levels)
  js/patient.js           Tablet app logic & emergency banner controls
  js/nurse.js             Dashboard logic & filter controls
  js/lib/util.js          DOM and format helpers
  js/lib/audio.js         WebAudio chimes and alarm
  js/lib/tts.js           Web Speech API wrapper
  js/lib/sync.js          Rooms, polling, broadcast sync client
  js/lib/icons.js         Stroke SVG icon set
  icons/icon.svg          SVG Logo
worker.js                 Cloudflare Worker API (D1 compatible)
wrangler.jsonc            Cloudflare dev config
```

---

## IPIC demo script (5 minutes)

1. Open two windows side by side on the projector: patient left, nurse right, or
   patient on a real tablet and the nurse on your laptop. Hold up the laminated
   printed board too.
2. Patient setup: type "Maria", bed 204. Point at the four digit code.
3. Nurse pairing: open `/nurse`, type that code. Show "Online" turn green.
4. Low drama first: tap Thirst. The card appears on the nurse screen with speech.
   Tap Acknowledge and show the card tick over.
5. High priority: tap Suction, pick "There are secretions in my throat right now",
   and send. Show the pulsing card and that both devices spoke it aloud.
6. Pain: tap Pain, choose 8 of 10, and send. Explain that 7 or more escalates.
7. Emergency: tap the red tile. Alarm, flashing, full screen red on the nurse,
   title bar alert. Tap "I am on my way, silence alarm".
8. Eye-blink: tap the tile, the nurse holds up the laminated card, tap
   "1 blink means YES", and show the spoken answer.
9. Abilities: on the patient tablet open the wizard, tick what Maria can do today,
   and save. Explain that this is the adaptive communication innovation.
10. Offline resilience: switch Wi-Fi off on the tablet; the app keeps working
    through the cached shell and requests queue for the nurse side. Then hold up
    the laminated board: when everything else fails, this still works.

## Known limits

- No real camera blink detection, deliberately nurse assisted. It is more reliable
  in ICU lighting and works today. Camera detection is a future step.
- Latency is polling based, about 1.5 seconds, not instant. A WebSocket or
  WebRTC version could reduce it.
- Room codes are four digits for demo speed, not cryptographic security. A
  hospital deployment would integrate with the ward ADT or EHR for identity.
- No authentication on the nurse view beyond knowing the room code. Fine for a
  prototype, not for clinical deployment.

## For actual clinical use you would need

EHR integration and audit trails, end to end encryption, on-call routing rules,
battery and keep-awake policies for tablet kiosk mode, full offline message
queueing with guaranteed delivery, and clinical validation studies.
