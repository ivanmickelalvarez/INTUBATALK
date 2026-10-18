# Mobile Connectivity Recovery Implementation Plan

> **For agentic workers:** Execute inline in this workspace. Steps use checkbox syntax for tracking.

**Goal:** Restore accurate connectivity and Access reauthentication in the mobile web app, then ship verified APK and Windows releases.

**Architecture:** Keep Cloudflare Access on all app pages and APIs. Add a public, exact-path Access exception only for the static `/sw.js` update script; classify Access redirects as authentication-required and offer a user-triggered reload into the existing Access sign-in flow. Preserve the current durable outbox and room-code behavior.

**Tech Stack:** Cloudflare Workers/Access, vanilla JavaScript, Node test runner, Bubblewrap TWA, Windows launcher, Inno Setup.

**Spec:** `docs/superpowers/specs/2026-10-17-cloudflare-access-design.md`

## Global Constraints

- Keep the patient/nurse app and every `/api/**` endpoint behind the allowlisted Cloudflare Access policy.
- Only the non-sensitive `/sw.js` source may bypass Access so expired clients can receive updates.
- Preserve the existing four-digit room-code pairing and queued alert behavior.
- Sign Android releases with the existing owner-held keystore and increment version code monotonically.

## Review Focus

- Access 302 with a non-opaque response must show sign-in recovery, not Wi-Fi-off.
- Genuine network failure must still show offline and preserve queued requests.
- Expired sessions must be able to fetch `/sw.js` but not app pages or API data.
- Patient and nurse devices still exchange alerts through the shared Worker/D1 API after authentication.
- Android icon assets in the rebuilt APK must match the current project icon source.

---

### Task 1: Connection error and sign-in recovery

**Files:** `test/connection-state.test.cjs`, `test/service-worker-update.test.cjs`, `public/js/lib/connection-state.mjs`, `public/js/lib/sync.js`, `public/js/lib/feedback.js`, patient/nurse listener sites.

**Interfaces:** `classifyApiResponse(response, appOrigin)` returns `live`, `auth`, or `offline`; `setConnectionState('auth')` provides a button that retries the current page navigation.

- [x] Add failing tests for visible HTTP 302 Access redirects and an actionable auth banner.
- [x] Implement redirect classification and user-triggered Access reauthentication.
- [x] Run targeted connection-state and service-worker tests; verify genuine failures remain offline.

### Task 2: Safe service-worker recovery

**Files:** `public/sw.js`, `test/service-worker-update.test.cjs`, `docs/superpowers/specs/2026-10-17-cloudflare-access-design.md`, Cloudflare Access applications.

**Interfaces:** Exact path `https://intubatalk.intubatalk.workers.dev/sw.js` is public; all broader routes retain the existing Access policy.

- [x] Bump the service-worker cache version and test its update behavior.
- [x] Add the exact-path public Access app and document the static-script exception.
- [x] Deploy the Worker; verify anonymous `/sw.js` and manifest are 200 while `/`, `/nurse`, and `/api/poll` remain 302.

### Task 3: Rebuild and verify releases

**Files:** `android-twa/twa-manifest.json`, generated Android project/resources, `release/android/INTUBATALK-Android.apk`, Windows EXE and installer deliverables.

- [x] Regenerate the mobile icon resources and increment the Android version.
- [x] Build and verify the signed APK, package version, icon resources, and signing certificate.
- [x] Rebuild the Windows launcher and installer from the same source release.
- [x] Run the full test suite and cross-device API smoke test; remove only identified obsolete deliverables.
