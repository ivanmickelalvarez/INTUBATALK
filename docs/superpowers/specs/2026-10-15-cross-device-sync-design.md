# INTUBATALK Cross-Device Synchronization Design

**Date:** 2026-10-15  
**Status:** Awaiting user review before implementation  
**Scope:** Make the patient dashboard and nurse dashboard communicate reliably when opened on different devices.

## 1. Goal

A patient can open the patient dashboard on one device, while a nurse opens the nurse dashboard on another device. After the nurse enters the patient's four-digit room code, patient requests, emergencies, acknowledgements, clear actions, patient profile updates, and online presence must synchronize through a shared server-side store.

The same behavior should work in two supported modes:

1. **Public/deployed mode:** both devices use the same deployed application URL and durable shared storage.
2. **Local/LAN mode:** both devices use the same running Node server, reached through the host computer's LAN IP, with file-backed persistence.

Browser-local `BroadcastChannel` remains only an optimization for same-browser demos; it is not treated as cross-device transport.

## 2. Current State and Problem

The frontend already posts events to `/api/messages`, `/api/ack`, and `/api/clear`, then polls `/api/poll` about every 1.5 seconds. Room codes scope messages correctly.

The local Node server persists state in `.intubatalk-store.json`, which is suitable when both devices reach the same Node process. The Cloudflare Worker stores state in D1 and is suitable for public cross-device use.

The Vercel implementation currently uses `globalThis.__intubatalk_store`, which is process-local memory. Separate serverless instances can therefore see different rooms and messages. It cannot be the authoritative store for cross-device operation.

## 3. Chosen Architecture

### 3.1 Source of truth

Use the existing Cloudflare Worker + D1 implementation as the durable public backend. Keep the existing Node server as the local/LAN backend.

The frontend continues using relative `/api/...` requests so the UI and API remain same-origin in either deployment mode.

### 3.2 Transport

Keep HTTP polling initially rather than introducing WebSockets. Polling is already implemented, works through ordinary hosting and mobile networks, and provides acceptable alert latency for this prototype. The interval remains approximately 1.5 seconds.

### 3.3 Room isolation

Every patient session has a four-digit room code. All message creation, polling, acknowledgement, clear, profile, and presence operations validate and scope by that room code. A nurse only receives messages for room codes explicitly attached to that nurse station.

The code is a pairing identifier, not a clinical security credential. This limitation remains documented.

## 4. Required Implementation Changes

### 4.1 Remove the unreliable public fallback

Replace or disable the Vercel in-memory API path for production cross-device deployment. It must not be presented as durable shared synchronization. If Vercel remains in the repository for compatibility, its documentation must clearly state that it requires an external durable database before production use.

### 4.2 Align Worker behavior with the client contract

Verify and correct parity between `worker.js`, `server.js`, and the client synchronization contract:

- `/api/session`
- `/api/messages`
- `/api/ack`
- `/api/clear`
- `/api/profile`
- `/api/presence`
- `/api/room`
- `/api/rooms`
- `/api/poll?rooms=...&after=...`

The Worker must return the same message fields and profile/capability fields expected by `public/js/lib/sync.js`.

### 4.3 Reliable client delivery behavior

Update `public/js/lib/sync.js` so that:

- failed POSTs are not silently treated as successful delivery;
- the UI can distinguish server-connected, temporarily offline, and not-configured states;
- polling resumes automatically after transient failures;
- duplicate events remain safely deduplicated by `cmid` and server message ID;
- a patient request sent while the network is unavailable is retained locally as a pending outbox item and retried with bounded backoff;
- successful retry removes the item from the outbox;
- acknowledgement and clear actions use the same retry path where practical.

The existing same-browser broadcast remains best-effort and must not suppress the server retry path.

### 4.4 Connection visibility

Use the existing connection feedback hooks to show a clear status such as `Connected`, `Reconnecting`, or `Offline`. The nurse dashboard must not imply that a patient is online merely because its own page is loaded.

### 4.5 Local LAN access

Update local-run documentation and, if needed, the launcher/server startup messaging so the host IP URL is discoverable. The local server should continue binding in a way that permits another device on the same Wi-Fi/LAN to connect. The same room code must work from both devices through the host's LAN URL.

### 4.6 Deployment documentation

Document the supported deployment path:

- create/use a Cloudflare D1 database;
- bind it as `DB` in Wrangler;
- deploy the Worker and assets;
- open the same deployed URL on both devices;
- patient creates/displays the room code;
- nurse enters that code.

Document that opening the local `127.0.0.1` URL on another device will not work because it points to that other device itself; the second device must use the host computer's LAN IP.

## 5. Data Flow

### Patient sends an alert

1. Patient taps an alert tile.
2. Client creates a unique `cmid` and writes an outbox record.
3. Client attempts `POST /api/messages` with the room code.
4. Shared backend inserts the message into durable storage.
5. Patient client receives a successful response and marks the outbox item delivered.
6. Nurse client polls `/api/poll?rooms=<code>&after=<id>`.
7. Backend returns the new message.
8. Nurse client deduplicates by `cmid`/server ID and renders the alert.

### Nurse acknowledges

1. Nurse taps Acknowledge.
2. Client updates the local card immediately.
3. Client retries `POST /api/ack` until delivered or the retry policy expires.
4. Backend marks the matching request acknowledged and appends an acknowledgement event.
5. Patient client polls and renders the nurse acknowledgement.

### Patient clears an emergency

The same pattern applies through `/api/clear`; the backend marks active emergency messages as cleared and emits a clear event for the nurse dashboard.

## 6. Error Handling and Safety

- Invalid room codes are rejected with a client-visible pairing error.
- API failures show `Reconnecting`/`Offline` rather than silently discarding alerts.
- Outbox retries are bounded and deduplicated by `cmid`, preventing duplicate alerts after a timeout followed by a successful server insert.
- Poll cursors advance only from server responses.
- Message retention remains bounded; the existing prototype retention policy is preserved unless the chosen deployment requires an equivalent D1 cleanup policy.
- No EHR or patient identifiers beyond the current prototype fields are introduced.
- The existing warning remains: four-digit room codes are convenient pairing codes, not cryptographic authentication.

## 7. Testing and Acceptance Criteria

### Automated checks

- JavaScript syntax check passes for client, local server, Worker, and API files.
- Worker and local server route contracts are tested for session, message, poll, ack, clear, profile, presence, and room lookup.
- Outbox tests cover successful delivery, transient failure and retry, timeout after server insertion, deduplication, and reconnect polling.

### Manual cross-device acceptance test

1. Start the public deployment or local Node server on a host reachable by both devices.
2. Open the patient dashboard on Device A using the shared URL.
3. Enter a patient name and bed; record the four-digit room code.
4. Open the nurse dashboard on Device B using the same shared URL.
5. Enter the room code and confirm the patient changes to `Online`.
6. Send a normal request from Device A; it appears on Device B within the polling window.
7. Send an emergency from Device A; Device B shows the alarm behavior.
8. Acknowledge from Device B; Device A shows the nurse acknowledgement.
9. Clear the emergency from Device A; Device B clears the alarm.
10. Temporarily interrupt network access, send a request, restore access, and confirm it is eventually delivered once without duplication.
11. Open a second unrelated room and confirm its messages do not appear on the first nurse connection.

## 8. Non-Goals

- No WebSocket migration in this change.
- No EHR integration or hospital authentication.
- No cryptographic replacement for the four-digit pairing code.
- No native mobile app packaging change.
- No redesign of the patient or nurse visual interfaces beyond connection/outbox feedback required for correctness.

## 9. Implementation Order

1. Add/verify shared backend contract tests and fix Worker parity.
2. Implement client outbox/retry and robust connection state.
3. Verify local LAN binding and update launcher/documentation.
4. Update deployment configuration/documentation for Cloudflare D1 as the public path.
5. Run syntax checks and backend tests.
6. Run the two-device manual acceptance test and record results.
