# INTUBATALK Android APK and Cross-Device Runtime Design

**Date:** 2026-10-17  
**Status:** Awaiting user review before implementation  
**Scope:** Add an Android APK that launches the existing hosted PWA, while retaining the Apple PWA and the existing Windows app.

## 1. Goal and accepted requirements

- Android users can install INTUBATALK from a signed APK.
- iPhone and iPad users continue to install the existing PWA from Safari.
- Windows Cloud mode, Android, and Apple clients use one deployed HTTPS origin and the same shared API/data store.
- Windows Local/LAN mode remains available as an explicit alternative and continues using its bundled Node server.
- Windows Cloud mode is the default; users can explicitly select Local/LAN mode.
- The APK opens the patient login at `/`; the nurse dashboard remains at `/nurse` and available through the existing nurse shortcut.
- The core patient-to-nurse workflow and room data stay consistent across platforms.
- Existing Windows executables and setup installer remain distinct artifacts and are not replaced by the APK.

## 2. Chosen architecture

Use a Trusted Web Activity (TWA) as a thin Android shell around the deployed PWA. A TWA renders the same hosted web content in the browser runtime, avoiding a second copy of patient/nurse UI code. The Apple install remains the PWA. Android and Apple use the same-origin `/api/...` requests and the shared Worker + D1 service.

Add a Cloud mode to the Windows launcher. Cloud mode opens the same hosted origin as the TWA and Apple PWA. Cloud is the Windows default; Local/LAN mode remains explicitly selectable and continues to start and use the bundled Node server. If the Cloud origin is unavailable or unconfigured, show an error and keep the selected Cloud mode; never silently switch the session to the local server. Keep existing role routes and local/LAN behavior.

The release origin must be controlled by the project and must serve the deployed PWA/API, the configured D1-backed Worker, and `/.well-known/assetlinks.json`. The README currently identifies `https://site-a166399491ee4290b4637b32520266e3.freebuff.page/` as a preview. Treat it as the candidate origin only after verifying it can serve the association file and uses the shared durable backend. If it cannot, choose a controlled HTTPS origin before generating the final APK. The same selected origin must feed the TWA manifest and Windows Cloud mode from one configuration value to prevent URL drift. The local `wrangler.jsonc` currently contains a placeholder D1 ID, so a preview URL alone is not proof that cross-device persistence is configured.

TWA domain verification uses Digital Asset Links to associate the website with the Android package and signing certificate. Without that association, Chrome can fall back to browser UI rather than verified fullscreen presentation. The deployed site must remain the source of UI updates; updating the web app can update the content without rebuilding the Android shell.

## 3. Android package and assets

- Generate a Bubblewrap TWA Android project in a dedicated Android-specific directory.
- Use the stable Android application ID `com.intubatalk.mobile`.
- Use the display name `INTUBATALK` and the patient route `/` as the launch URL.
- Preserve the manifest nurse shortcut to `/nurse`.
- Add square 512×512 PNG launcher and maskable icon assets derived from the existing `public/icons/icon.svg`, and expose those in the web manifest. Keep the existing SVG for browser contexts.
- Build a signed release APK at `release/android/INTUBATALK-Android.apk`, separate from the Windows `INTUBATALK.exe` and setup installer.
- Use one persistent Android signing key for all future updates. Keep the private keystore outside source control and never include it in the APK output directory or repository history.

The signing key and package ID jointly determine whether a later APK can update an installed copy. A stable key must be backed up securely by the project owner.

## 4. Windows launcher integration

Update the existing launcher and installer so Windows Cloud mode is the default and uses the same configured HTTPS origin as the Android TWA. Keep Local/LAN mode available as an explicit choice; it starts the bundled Node server and continues to use its existing LAN URL. The Cloud mode must not silently fall back to Local/LAN when the host is unavailable. Keep Windows and Android release artifacts separate.

## 5. Runtime behavior and compatibility

Android and Apple load the same hosted frontend and API. Windows Cloud mode loads that same origin, while Windows Local/LAN mode continues to use its local server. The patient login remains the APK entry point; opening the nurse route or using the nurse shortcut continues to show the nurse dashboard. Cloud clients pair through the same four-digit room code and backend state.

The PWA service worker may cache the application shell, but live cross-device pairing and message delivery require connectivity to the hosted API. Existing offline queue/retry behavior remains the fallback for interrupted requests.

Core flows must be consistent, while browser-managed capabilities can vary by operating system and device. Speech recognition, text-to-speech voices, vibration, autoplay policy, and notifications are not guaranteed to behave identically in Chrome and Safari. Unsupported features must degrade without breaking patient requests, nurse pairing, acknowledgements, or emergency state.

## 6. Error handling and release safety

- If the configured origin is unavailable, the Android app must present the existing web app's connection behavior; it must not silently switch to a different API host or local database.
- If the configured origin is unavailable in Windows Cloud mode, show an actionable error; do not silently switch to Windows Local/LAN mode.
- If Digital Asset Links verification fails, report that the app is using browser fallback behavior and correct the website file or signing fingerprint before calling the release verified.
- Keep the APK package ID distinct from unrelated installed applications and stable between builds.
- Keep the keystore private; no passwords or signing material belong in tracked config, logs, or generated source.
- Do not claim durable cross-device operation until the selected hosted origin is confirmed to use the same configured D1 database.

## 7. Verification and acceptance

The user asked for compatibility and conflict checking, so the release is accepted only after these checks:

1. Confirm the selected HTTPS origin serves the PWA manifest, 512px icon assets, API routes, and Digital Asset Links file.
2. Confirm the deployed Worker is bound to a real D1 database rather than the local placeholder configuration.
3. Build and inspect the APK package ID, version, launcher label, launch route, icon, and release signature.
4. Install the APK on an Android device or emulator and confirm it opens the patient login without a browser toolbar when domain verification succeeds.
5. Pair the APK patient page with the nurse dashboard on another device using one room code; verify a patient request and nurse acknowledgement use the same hosted service.
6. Confirm the nurse shortcut opens `/nurse`, and confirm the existing Apple PWA still reaches the same hosted origin and shared room.
7. Confirm Windows Cloud mode opens the same configured HTTPS origin and pairs through the same room; confirm Windows Local/LAN mode still opens the bundled server and exposes the LAN URL.
8. If Android hardware/emulator or deploy credentials are unavailable, report those checks as pending rather than claiming cross-device validation succeeded.

## 8. Non-goals

- No separate native Android or iOS UI implementation.
- No App Store submission, Play Store publication, or Play Console release.
- No promise that device-specific speech, haptic, autoplay, or notification APIs behave identically.

## 9. Dependencies and boundaries

- A controlled HTTPS origin that can serve the app and Digital Asset Links.
- A single configured origin value shared by TWA generation and Windows Cloud mode.
- A configured shared durable API backend; the repo's documented public path is Cloudflare Worker + D1.
- Android build tooling (Bubblewrap, Android SDK/build tools, and Java runtime or Android Studio-managed JDK).
- A persistent signing key supplied or generated for the project owner and stored outside source control.
- An Android device/emulator for installation validation; other platform checks can verify shared URL/API behavior but cannot replace device testing.
