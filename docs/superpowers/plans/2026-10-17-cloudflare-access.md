# INTUBATALK Cloudflare Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require allowlisted staff email OTP before the patient or nurse Cloud app, API, or D1 data can be accessed, then enable the existing cross-network room-code workflow.

**Architecture:** Cloudflare Access protects the Worker before requests reach its static assets and API. A deny-only bootstrap version reserves the Worker identity, Access is configured and verified on that Worker, then the app Worker and public assets are released. The app continues to use D1 and four-digit codes for pairing; Local/LAN remains an independent trusted-network mode.

**Tech Stack:** Cloudflare Workers, Cloudflare Access, Wrangler, D1, Node.js test runner, Windows installer, Android TWA, Apple PWA.

**Status:** Approved for inline Native execution

**Spec:** `docs/superpowers/specs/2026-10-17-cloudflare-access-design.md`

## Global Constraints

- Do not deploy the application Worker or public app assets until Access is active and verified on the exact Worker.
- Access must allow only explicitly approved email addresses; never configure `Everyone` or an unrestricted email domain.
- Both Cloud roles require independent staff authentication; the four-digit code remains a pairing identifier.
- Keep the current Worker + D1 API contract and 1.5-second polling behavior.
- Keep Local/LAN separate and clearly identify it as trusted-network-only; Cloudflare Access does not protect it.
- Do not use real patient information or describe the prototype as clinically ready.
- Do not place Access credentials, OTPs, or signing-key passwords in source control or logs.

## Review Focus

- Missing Access app or policy: all requests must stay blocked before any app or API response is served.
- Email outside the exact allowlist: OTP authentication must be denied.
- Expired Access session: reauthentication must not erase the patient room or duplicate pending alerts.
- Alternate Worker preview/version hostname: it must not bypass the production access gate.
- Android TWA and iOS PWA sign-in cookie handoff: the user must return to the same app origin and reach the dashboard after authentication.

---

### Task 1: Create a deny-only Worker bootstrap

**Files:**
- Create: `access-bootstrap-worker.mjs`
- Create: `wrangler.access-bootstrap.jsonc`
- Test: `test/access-bootstrap.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Bootstrap Worker exports the standard default `{ fetch(request) }` handler from an ES module and returns an empty `404` for every path.
- Bootstrap config deploys the Worker as `intubatalk`, with no D1 binding and no static asset binding.
- Both bootstrap and production Wrangler configs explicitly set `preview_urls: false`.
- A package script invokes the repository-pinned Wrangler with the bootstrap config.

- [ ] **Step 1: Write the failing test**

Add tests dynamically importing the `.mjs` module and asserting the bootstrap returns 404 with an empty body for `/`, `/api/poll`, and an arbitrary path.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test test/access-bootstrap.test.cjs`

Expected: FAIL because the bootstrap module/config does not exist.

- [ ] **Step 3: Implement the deny-only Worker and config**

Keep the Worker handler minimal. Configure the same Worker name as the release target, omit assets/D1, set `workers_dev: true`, and set `preview_urls: false` using the installed Wrangler schema.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test test/access-bootstrap.test.cjs`

Expected: PASS; every request returns an empty 404.

- [ ] **Step 5: Validate the bootstrap configuration without deploying**

Run: `npx wrangler deploy --config wrangler.access-bootstrap.jsonc --dry-run`

Expected: Wrangler reports a valid deploy bundle containing only the deny-only Worker and no D1/assets bindings.

- [ ] **Step 6: Deploy the deny-only bootstrap Worker**

Run: `npm run access:bootstrap`

Expected: Wrangler reports that only Worker `intubatalk` was uploaded; the public origin still returns the bootstrap's empty 404 and exposes no app/API/D1 data. This reserves the Worker identity so Access can be attached before app code is published.

### Task 2: Put Cloudflare Access in front of the Worker

**Files:**
- Remote Cloudflare Access application, identity provider, and policy for Worker `intubatalk`
- Modify: `.superpowers/sdd/2026-10-17-android-apk/progress.md`

**Interfaces:**
- Access policy uses the approved explicit staff email list and one-time PIN authentication.
- Access application targets the entire `intubatalk` Worker, not only the root page.
- Worker-level Access protects the `workers.dev` production hostname and any Worker previews/alternate domains.

- [ ] **Step 1: Inspect current Cloudflare Access state**

Inspect the Zero Trust organization, OTP identity provider, existing Access applications/policies, and the `intubatalk` Worker. Do not create duplicates or alter unrelated account policies.

- [ ] **Step 2: Confirm the exact staff email allowlist**

Obtain the addresses directly from the user if they have not supplied them. Never infer allowed users from the Wrangler account owner.

- [ ] **Step 3: Create the OTP provider and deny-by-default Worker Access app**

Create only missing resources. Configure an allow policy for the explicit addresses, attach it to Worker `intubatalk`, and set a finite session duration. Do not add domain-wide or Everyone rules.

- [ ] **Step 4: Verify protection before app deployment**

Check unauthenticated and non-allowlisted requests are blocked, and an allowlisted user completes OTP login to the deny-only bootstrap (then receives its 404). Confirm all Worker routes and previews are covered.

- [ ] **Step 5: Record Access state and verification evidence**

Update the local progress ledger without recording OTP codes or other credentials.

### Task 3: Release the shared app behind verified Access

**Files:**
- Modify/deploy: `worker.js`, `wrangler.jsonc`, `public/`
- Modify: `README.md`
- Remote: Worker `intubatalk` and D1 database `intubatalk`

**Interfaces:**
- Restore the production Worker config as the target config, retaining the existing `DB` binding and `public/` assets.
- The authenticated app uses the existing relative `/api/...` routes and same-origin D1 store.

- [ ] **Step 1: Verify staged app config and assets**

Run the existing tests and syntax check; confirm the production Worker still binds the selected D1 ID and static assets directory and has `preview_urls: false`.

- [ ] **Step 2: Obtain final release approval**

Present the exact target origin, active Access allowlist summary, and test result. Do not upload production app code/assets until the user approves this release step.

- [ ] **Step 3: Deploy the app Worker and assets**

Run the exact pinned Wrangler deploy command after approval. Confirm the deploy reports the intended Worker and D1 binding.

- [ ] **Step 4: Verify public app routes remain Access-gated**

From an unauthenticated client verify `/`, `/nurse`, `/manifest.webmanifest`, `/api/session`, `/api/poll`, and `/.well-known/assetlinks.json` do not expose app/API data; from an approved session verify the app and expected assets are served.

- [ ] **Step 5: Update Cloud setup documentation**

Document OTP sign-in on each device, the shared URL/code workflow, Access session expiry, and the Local/LAN security boundary.

### Task 4: Verify cross-device behavior and release clients

**Files:**
- Test: Worker/API cross-device acceptance tests
- Update as needed: `scripts/build-windows.ps1`, `scripts/init-android.mjs`, `scripts/build-android.mjs`, installer payload, PWA manifest/service worker

**Interfaces:**
- An authenticated patient and nurse client on separate networks use the same origin and D1 backend.
- Existing outbox, alert, ack, and room isolation behavior remains unchanged after Access login/expiry.

- [ ] **Step 1: Run API contract and existing project checks**

Run: `npm test`, `npm run check`, `npm run windows:mode-test`, and `git diff --check`.

Expected: PASS; no cloud client silently falls back to a separate local store.

- [ ] **Step 2: Complete two-device web acceptance**

Use an allowlisted user on two independently authenticated clients/networks. Create patient room, attach nurse by code, send emergency, acknowledge, verify patient receipt, and confirm an unrelated room cannot read that event.

- [ ] **Step 3: Verify access expiry and denied user**

Confirm a non-allowlisted email is denied and an expired session requires OTP again without duplicate or lost alerts.

- [ ] **Step 4: Verify Android and Apple install flows**

After the approved Google SDK license is accepted and Android build tools are installed, build/sign the TWA and verify its OTP redirect/session return on Android. Verify the iOS PWA using Safari Add to Home Screen. If mobile hardware is unavailable, record the device checks as outstanding rather than claiming them passed.

- [ ] **Step 5: Rebuild Windows artifacts if package inputs changed**

Run `npm run windows:build` and `npm run windows:installer` only when access-facing URLs, packaged assets, or release version changed. Preserve any running EXE process; report if the root executable remains locked.

### Final self-review

- Spec sections 1–8 map to Tasks 1–4 and Global Constraints.
- Allowlist and deny-by-default failure modes are checked in Task 2.
- Session expiry and cross-room isolation are checked in Task 4.
- Alternate/preview domain coverage is checked in Task 2.
- TWA/PWA Access cookie flow and SDK dependency are called out in Task 4.
- Release deployment remains a gated step after Access is configured and verified.
