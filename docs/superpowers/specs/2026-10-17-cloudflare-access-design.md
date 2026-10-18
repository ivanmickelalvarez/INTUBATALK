# INTUBATALK Cloud Access Control Design

**Date:** 2026-10-17  
**Status:** Design and implementation plan approved
**Scope:** Protect the shared Cloudflare-hosted app before enabling cross-network use.

## 1. Goal

Require staff identity authentication before either the patient or nurse Cloud dashboard, its static files, or its API can be accessed. After sign-in, preserve the current patient room-code workflow and the shared Worker + D1 synchronization so a nurse on another network receives patient alerts and can acknowledge them.

Local/LAN mode remains a separate option and is not routed through Cloudflare Access. It is limited to devices that can reach the local host and must remain documented as a trusted-network prototype, not a secure clinical deployment.

## 2. Selected Approach

Use Cloudflare Access as an identity-aware gate in front of the INTUBATALK Worker. Protect the Worker, including its `workers.dev` hostname, so Access checks requests before the Worker serves app assets or reads/writes D1. This avoids adding custom password storage, token issuance, or login code to the patient and nurse app.

Use email one-time PIN authentication with an explicit allowlist of individual staff email addresses. Do not allow an unrestricted email domain or `Everyone`. Cloudflare documents Worker-level protection for all associated Worker hostnames and supports one-time PIN for approved email addresses:

- <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>
- <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/>

## 3. User Flow

1. On each device, the user opens the same Cloud HTTPS app origin.
2. Cloudflare Access requires the user to authenticate with an allowlisted staff email before any app or API request reaches the Worker.
3. After authentication, the patient dashboard creates or displays its existing four-digit room code.
4. The nurse authenticates separately on the nurse device and enters the patient room code.
5. Patient alerts, acknowledgements, presence, and profiles continue through the shared D1-backed API.
6. Access sessions expire according to the configured Access application session duration; each device must reauthenticate when its session expires.

The room code remains a pairing identifier. It is no longer the only barrier to the public service because requests also require an Access-authenticated session.

## 4. Access Policy and Deployment Order

- Create/enable the Cloudflare Zero Trust organization and email OTP identity provider if they are not already configured.
- Create an Access application for the exact INTUBATALK Worker/hostname and allow only explicitly approved email addresses.
- Protect the `workers.dev` release hostname and the Worker itself so preview or alternate hostnames cannot bypass the gate.
- Confirm an unapproved visitor is blocked and an approved user can complete OTP authentication before deploying the app Worker and public assets.
- Never deploy the application unprotected as an intermediate step. If Cloudflare cannot attach Access to the selected Worker before upload, use a hostname-based Access application for the reserved `workers.dev` hostname first and confirm it is active before deployment.
- Do not publish the Worker or assets until the Access gate and allowlist have been verified. Publishing remains a separate release action.

## 5. Local/LAN Mode

Cloudflare Access does not protect the bundled Node server. Local/LAN mode remains available for use on a trusted local network, but has no staff identity gate in this design. The UI and documentation must clearly distinguish Cloud Access-protected mode from Local/LAN mode. Do not use the Local/LAN mode for sensitive patient data or expose its port to the public Internet.

## 6. Failure Behavior

- If Access blocks a request, the browser displays Cloudflare's sign-in/block flow; the app must not silently switch to Local/LAN.
- If an approved email is not in the allowlist, Access denies it and does not issue an OTP.
- If the Worker/D1 service is unavailable after authentication, the existing app connection state reports offline/reconnecting; requests remain in the existing retry outbox.
- An expired Access session requires reauthentication; app-level room codes and client state remain unchanged.

## 7. Acceptance Checks

- A non-allowlisted email cannot authenticate.
- An allowlisted email receives and completes the OTP flow on Windows, Android TWA, iPhone/iPad Safari/PWA, and desktop browsers.
- Requests without a valid Access session cannot load the app, call any API route, or reach D1-backed room data.
- Two independently authenticated devices on different networks can pair with the same room code; a patient alert appears on the nurse device and the nurse acknowledgement appears on the patient device.
- A different room code cannot retrieve the alert.
- Cloudflare Access expiry prompts reauthentication and does not reset or lose an already active room session after sign-in.
- Local/LAN mode remains selectable and is clearly identified as a separate trusted-network mode.

## 8. Known Limits

- Exact email addresses must be supplied or selected for the Access allowlist before configuration.
- Cloudflare Zero Trust must be enabled for the account; current account state must be inspected before setup.
- This gate is an access-control improvement, not clinical certification, an audit system, or a compliance determination. Real patient information remains out of scope until privacy, audit, operational, and clinical-safety requirements are independently addressed.
- The local/LAN path is not covered by Cloudflare Access and remains unsuitable for real patient information in this design.
