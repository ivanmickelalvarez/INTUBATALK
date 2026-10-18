# INTUBATALK Android APK and Shared Cloud Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a signed Android TWA APK and update the Windows launcher so Windows Cloud mode, Android, and the Apple PWA use one hosted service, while preserving Windows Local/LAN mode.

**Architecture:** Use one HTTPS origin value as the source for the TWA host and Windows Cloud mode. The APK is a Bubblewrap Trusted Web Activity rendering the existing PWA; Windows defaults to the same origin but can explicitly select its bundled local Node server. The Apple PWA stays on the same origin.

**Tech Stack:** Existing vanilla HTML/CSS/JS, Cloudflare Worker + D1, Node.js, sharp for PNG icon rendering, Bubblewrap TWA, Android SDK/Gradle, C# .NET Framework 4.x, Inno Setup.

**Spec:** `docs/superpowers/specs/2026-10-17-android-apk-design.md`

## Global Constraints

- The stable Android application ID is `com.intubatalk.mobile`.
- The APK display name is `INTUBATALK`; its launch route is `/`; the nurse route is `/nurse`.
- Windows Cloud mode is the default; Local/LAN mode remains explicitly selectable.
- Windows Cloud mode, Android, and Apple clients use the same configured HTTPS origin and shared API/data store.
- Windows Cloud mode must show an actionable error when the origin is unavailable; it must not silently start or switch to the local server.
- Keep the Android signing keystore outside source control and reuse the same key for all future APK updates.
- Build the signed APK at `release/android/INTUBATALK-Android.apk`, separate from the Windows executable and installer.
- Confirm a real D1 binding and working Digital Asset Links before claiming the release is cross-device ready.
- Core patient requests, pairing, nurse acknowledgements, and emergency state must continue to work if speech or haptic APIs vary by device.

## Review Focus

1. **Untrusted or malformed cloud origin:** reject HTTP, credentials, path, query, and fragment; cover with `test/app-origin.test.cjs`.
2. **Cloud mode silently using local data:** keep mode selection explicit and test each launch path manually with Cloud unavailable and with Local/LAN selected.
3. **Wrong signing fingerprint or package ID:** assert the generated assetlinks target is exactly `com.intubatalk.mobile` and matches `keytool -list -v`; cover in `test/assetlinks.test.cjs`.
4. **Missing or incompatible PWA icon assets:** assert manifest paths exist, PNG dimensions are 512×512, purposes are correct, and service-worker shell includes them; cover in `test/mobile-assets.test.cjs`.
5. **Different browser capabilities breaking the core flow:** pair Windows Cloud, Android TWA, and Apple PWA through one room and exercise request, acknowledgement, emergency, and clear actions in the manual device matrix.

## File Structure

- `app-origin.txt`: the single public HTTPS origin consumed by build scripts and copied with the Windows installer.
- `scripts/lib/app-origin.cjs`: strict origin parser shared by Node scripts and tests.
- `scripts/generate-mobile-icons.mjs`: rasterizes the existing SVG to Android/PWA PNG sizes.
- `scripts/create-assetlinks.mjs`: writes the association JSON using the final package ID and certificate fingerprint.
- `LauncherMode.cs`: pure Windows mode parsing and target-URL construction, kept separate so Cloud/Local routing can be tested without launching a browser.
- `scripts/build-windows.ps1`: repeatable C# executable and installer-payload build.
- `android-twa/`: Bubblewrap-generated Android project and non-secret build configuration.
- `release/android/`: local signed APK output; never store the keystore here.
- `INTUBATALK-Launcher.cs`: Cloud/Local mode routing and mode selection for Windows.
- `installer/intubatalk.iss` and `installer/payload/`: updated Windows release payload.

### Task 1: Select and validate the release origin; add shared origin and icon configuration

**Files:**
- Create: `app-origin.txt`
- Create: `scripts/lib/app-origin.cjs`
- Create: `scripts/generate-mobile-icons.mjs`
- Create: `test/app-origin.test.cjs`
- Create: `test/mobile-assets.test.cjs`
- Modify: `package.json`, `package-lock.json`, `.gitignore`, `public/manifest.webmanifest`, `public/sw.js`

**Interfaces:**
- Produces: `readAppOrigin(filePath: string): URL`, requiring an HTTPS origin with no credentials, path, query, or fragment.
- Produces: `npm run mobile:icons`, which deterministically generates `public/icons/icon-512.png` and `public/icons/icon-maskable-512.png` from `public/icons/icon.svg`.

- [ ] **Step 1: Run the release-origin preflight.** Check the README candidate at `https://site-a166399491ee4290b4637b32520266e3.freebuff.page` for the root page, `/manifest.webmanifest`, the API deployment, and whether the project can deploy `/.well-known/assetlinks.json`. Confirm Cloudflare access with `npx wrangler whoami` and check for a real D1 database with `npx wrangler d1 list`. If the user-controlled origin or real D1 binding is unavailable, stop before release configuration and ask for the correct origin/database setup; do not substitute an unverified host.
- [ ] **Step 2: Add failing origin-parser cases.** In `test/app-origin.test.cjs`, test a valid HTTPS origin with optional trailing slash and rejection of HTTP, user info, non-root pathname, query, fragment, missing file, and multiple lines.
- [ ] **Step 3: Implement `readAppOrigin(filePath)`.** Read the one-line `app-origin.txt`, normalize a trailing slash, and reject every invalid case from Step 2. Add `npm test` as `node --test` in `package.json`.
- [ ] **Step 4: Add icon-generation checks.** In `test/mobile-assets.test.cjs`, assert both generated files exist, are 512×512 PNGs, and the manifest points to the right `any` and `maskable` files.
- [ ] **Step 5: Declare `sharp` directly and generate the PNG assets.** Add the resolved `sharp` version as a dev dependency, implement `scripts/generate-mobile-icons.mjs`, and update `public/manifest.webmanifest` to retain the SVG and include the raster launcher and maskable icons.
- [ ] **Step 6: Update the PWA shell cache.** Add both PNG paths to `public/sw.js` and bump `intubatalk-v20` to `intubatalk-v21` so installed PWA clients fetch the new assets. Run `npm test`; expected: all origin and icon checks pass.

### Task 2: Create and sign the Android TWA package

**Files:**
- Create: `android-twa/` Bubblewrap project files
- Create: `scripts/create-assetlinks.mjs`
- Create: `scripts/build-android.mjs`
- Create: `test/assetlinks.test.cjs`
- Create: `public/.well-known/assetlinks.json`
- Create: `release/android/` output directory
- Modify: `package.json`, `package-lock.json`, `.gitignore`

**Interfaces:**
- Consumes: `readAppOrigin(filePath)` from Task 1.
- Produces: `npm run android:init` and `npm run android:build`; Bubblewrap release configuration uses host from `app-origin.txt`, app ID `com.intubatalk.mobile`, launcher name `INTUBATALK`, version name `1.0.0`, version code `1`, start path `/`, and nurse shortcut `/nurse`.
- Produces: `createAssetLinks(packageId: string, certificateSha256: string): object`, writing only the public fingerprint and package ID to the association file.

- [ ] **Step 1: Check Android build prerequisites.** Confirm Node.js, Android SDK/build tools, Gradle runtime, and `keytool` availability. This workspace currently has no detected Android Studio, SDK, `adb`, Java, or Gradle. If Bubblewrap cannot bootstrap the required SDK/JDK in this environment, stop and request the user’s preferred installation path rather than claiming the APK build succeeded.
- [ ] **Step 2: Add the assetlinks test.** Assert that the JSON relation is `delegate_permission/common.handle_all_urls`, namespace is `android_app`, package ID is exact, and the fingerprint is uppercase colon-separated SHA-256.
- [ ] **Step 3: Create the persistent signing key outside the repository.** Use an interactive `keytool -genkeypair` prompt at `%USERPROFILE%\.intubatalk\android-release.keystore`; never place passwords in shell arguments or logs. Record only the alias and certificate fingerprint in non-secret release configuration, and tell the user to back up the keystore securely.
- [ ] **Step 4: Add and initialize Bubblewrap.** Add `@bubblewrap/cli` as a dev dependency and lock it in `package-lock.json`. Run `npm run android:init` against the selected origin’s deployed web manifest. Set the exact app ID, display name, version, launch URL, theme colors, orientation, and nurse shortcut. Verify the TWA host equals `app-origin.txt`; keep Gradle caches, local SDK paths, APK outputs, and signing material out of tracked source.
- [ ] **Step 5: Implement `createAssetLinks(packageId, certificateSha256)`.** Use the selected app ID and the signing certificate SHA-256 to produce `public/.well-known/assetlinks.json`. Run `npm test`; expected: the package and fingerprint assertions pass.
- [ ] **Step 6: Build the signed APK.** Add `android-twa/.gradle/`, `android-twa/**/build/`, `android-twa/local.properties`, and `release/android/*.apk` to `.gitignore`. Run `npm run android:build`, which invokes the lockfile-pinned Bubblewrap CLI from `android-twa/` and copies the signed release APK to `release/android/INTUBATALK-Android.apk`. Verify package ID, version name `1.0.0`, version code `1`, signature certificate, icon, and output path with Android SDK inspection tools; expected result is one signed APK at the specified path.

### Task 3: Add Windows Cloud mode without breaking Local/LAN mode

**Files:**
- Modify: `INTUBATALK-Launcher.cs`
- Create: `LauncherMode.cs`
- Create: `test/WindowsModeTests.cs`
- Create: `scripts/test-windows-mode.ps1`
- Create: `scripts/build-windows.ps1`
- Modify: `installer/intubatalk.iss`
- Modify: `installer/payload/INTUBATALK.exe`, `installer/payload/server.js`, `installer/payload/public/`
- Copy: `app-origin.txt` into the installer payload and installed app directory

**Interfaces:**
- `LauncherMode.ParseMode(string[] args): AppMode` returns Cloud when no mode flag is present; `--local` selects Local/LAN and `--cloud` selects Cloud.
- `LauncherMode.BuildTargetUri(AppMode mode, string cloudOrigin, int serverPort, string route): Uri` resolves the existing role routes for the selected mode.
- Change `RoleChooserForm(string initialRoute, bool startInTray)` to receive an `AppMode` value.
- Add command-line switches `--cloud` and `--local`; default to Cloud when neither is present.
- In Cloud mode, resolve the same HTTPS origin using `app-origin.txt` and append the existing patient/nurse/board routes.
- In Local/LAN mode, start the bundled Node server and use `http://127.0.0.1:<port>`; keep the LAN URL copy action.

- [ ] **Step 1: Write the Windows mode contract harness.** In `test/WindowsModeTests.cs`, assert no flag and `--cloud` parse as Cloud, `--local` parses as Local/LAN, and both modes preserve `/?fresh=1`, `/nurse?fresh=1`, `/dual`, and `/board` routes. Assert Cloud target uses the configured HTTPS origin and Local/LAN target uses `http://127.0.0.1:<port>`.
- [ ] **Step 2: Implement `LauncherMode.ParseMode(string[] args)` and `BuildTargetUri(AppMode mode, string cloudOrigin, int serverPort, string route)`.** Keep URL construction and mode selection free of UI/process startup so the harness can execute them.
- [ ] **Step 3: Refactor the launcher around the mode helpers.** Make server startup conditional on Local/LAN, use Cloud for missing mode flags, and show an actionable error when Cloud origin checks fail. Never fall back to localhost.
- [ ] **Step 4: Expose Local/LAN mode.** Add a visible hub/tray choice, retain Cloud default, and disable or explain LAN URL copying while Cloud is active. Keep the existing patient, nurse, dual, and board routes.
- [ ] **Step 5: Add repeatable Windows build scripts.** `scripts/test-windows-mode.ps1` compiles and runs the mode contract harness and prints `WINDOWS_MODE_TESTS_OK`; `scripts/build-windows.ps1` compiles `INTUBATALK-Launcher.cs` and `LauncherMode.cs` as a 2.4.0 Windows executable, then copies it and the current `server.js`, `public/`, and `app-origin.txt` into the installer payload. Add `npm run windows:mode-test` and `npm run windows:build` wrappers.
- [ ] **Step 6: Package both Windows modes.** Add the shared origin file to the Inno Setup payload, add a Local/LAN Start Menu shortcut using `--local`, bump the installer version to `2.4.0`, and add `npm run windows:installer` to run `ISCC.exe installer/intubatalk.iss` and compile `INTUBATALK-Setup-2.4.0.exe`.
- [ ] **Step 7: Run Windows smoke checks.** Launch default Cloud patient and nurse flows and confirm they use the configured HTTPS host without starting local Node. Launch Local/LAN mode and confirm the server starts, patient/nurse routes work, and the LAN URL points to the host. Expected: no cross-mode fallback and installer payload matches source.

### Task 4: Publish the association and verify the cross-device release

**Files:**
- Modify: `wrangler.jsonc`, `README.md`
- Deploy: Cloudflare Worker and `public/` assets to the selected origin, including `/.well-known/assetlinks.json`
- Output: `release/android/INTUBATALK-Android.apk`, `installer/INTUBATALK-Setup-2.4.0.exe`, updated `INTUBATALK.exe`

**Interfaces:**
- Consumes: origin config, D1 binding, app icons, Android package ID, signing fingerprint, Windows Cloud/Local implementation, and TWA project from Tasks 1–3.

- [ ] **Step 1: Verify D1 binding and public assets.** Confirm `wrangler.jsonc` uses the real D1 database ID, the selected origin serves the updated web manifest/icons, and the assetlinks file exactly matches the signed APK certificate. The current preview returns 404 for assetlinks, so this check cannot pass until the file is deployed.
- [ ] **Step 2: Stage deployment and release artifacts for user review.** Run `npm test`, `npm run check`, `npm run android:build`, `npm run windows:mode-test`, `npm run windows:build`, and `npm run windows:installer`. Build the Worker/assets locally; do not publish them from this step. Record any origin, database, domain association, or device checks still pending.
- [ ] **Step 3: Get final approval before external deployment.** Present the concrete APK, Windows executable/installer, and deployment target. Deploy the Worker/assets and assetlinks only after approval.
- [ ] **Step 4: Verify the deployed HTTPS endpoints.** Confirm `/`, `/manifest.webmanifest`, both PNG icons, `/api/...`, and `/.well-known/assetlinks.json` return the expected responses and the Worker is bound to D1.
- [ ] **Step 5: Run the device acceptance matrix.** Install the APK on Android; open the Apple PWA on iPhone/iPad; use Windows Cloud mode. Pair one patient and nurse through a shared room, send a request, acknowledge it, trigger/clear an emergency, and confirm each client sees the same server state. Separately verify Windows Local/LAN remains functional. If a device or emulator is unavailable, mark that device check pending instead of claiming it passed.
- [ ] **Step 6: Update README release instructions.** Document Cloud default, Local/LAN selection, Android APK installation, Apple PWA installation, the shared backend, required domain association, the APK signing-key backup rule, and the supported browser capability differences.

**Execution note:** Android build tools and the real D1/origin setup are not present in the checked-in configuration. The plan must stop for the missing concrete dependency rather than ship an APK that points at an unverified preview or local-only store.
