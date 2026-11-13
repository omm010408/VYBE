# VYBE — private video rooms

A minimal, account-free video room app. Participants join with a high-entropy private key; no Google sign-in or participant account is involved.

## Features

- Create a 256-bit private room key or join with a key / invitation URL.
- Pre-join camera and microphone preview, with both controls independently switchable.
- Live video and audio, microphone / camera toggles, and leave-call control.
- Screen sharing with best-effort screen/tab audio capture and explicit audio-track detection.
- Adaptive WebRTC delivery using LiveKit's global SFU network.
- No app database and no participant profiles.

## Requirements

- Node.js 20 or newer.
- A LiveKit Cloud project (free tier is available; current limits and pricing are controlled by LiveKit).
- A Vercel project or another Next.js-compatible host.

## Configure LiveKit

Create a project at [LiveKit Cloud](https://cloud.livekit.io/), then copy its server URL, API key, and API secret.

Create `.env.local` from `.env.example` and set:

```dotenv
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://your-project.livekit.cloud
```

`LIVEKIT_API_SECRET` is server-only. Never add a `NEXT_PUBLIC_` prefix to it and never commit `.env.local`.

## Run locally

```bash
npm install
cp .env.example .env.local
# add your LiveKit values to .env.local
npm run dev
```

Open <http://localhost:3000>.

## Deploy to Vercel

1. Push this folder to a private GitHub repository, or import it into Vercel.
2. Add the three environment variables above to the Vercel project for Preview and Production. Use the exact names shown; do not prefix any of them with `NEXT_PUBLIC_`.
3. Deploy. No database or Google OAuth setup is required.
4. Open the site and create a room. Share the private invitation link with the other participant.

## How private rooms work

The browser generates a cryptographically random 256-bit key. The token route uses an HMAC derived from the key and the server-side LiveKit secret to create an opaque room name. The raw key is not stored in a database and the LiveKit secret is never sent to the browser. Anyone possessing the invitation key can join; treat it like a password and share it only with intended participants.

The room key is a bearer credential, not an account identity system. This MVP does not include key rotation, revocation, waiting-room approval, per-room host roles, or persistent room history. Anyone who receives the key can enter while the room is active. Add a host approval flow and rate limiting before exposing the service to large public traffic.

## Privacy and media notes

- LiveKit WebRTC uses encrypted media transport. This code does **not** enable LiveKit end-to-end media encryption (E2EE); the SFU is part of the trusted media service. Do not describe this build as E2EE.
- Screen audio is browser-dependent. `getDisplayMedia()` may return a video track but no audio track. Chromium browsers generally offer the richest screen/tab audio options; Safari and mobile browsers can differ. VYBE checks whether an audio track was actually returned and shows a notice when it was not.
- Camera, microphone, and screen capture require HTTPS (localhost is allowed for development) and explicit browser permission.
- Use a modern Chromium browser on desktop for the most predictable screen-plus-audio sharing experience.
- The room token is short-lived (8 hours). The private key itself is not expired by this MVP; rooms are naturally ephemeral at the media provider when nobody is connected.

## Performance choices

- WebRTC media is transported by LiveKit rather than relayed through Next.js API requests.
- The Next.js API only mints short-lived room access tokens.
- Adaptive stream and dynacast are enabled to avoid sending unnecessary video layers.
- Camera preview is stopped before entering the room so the app does not keep a duplicate local capture alive.

## Scripts

- `npm run dev` — development server.
- `npm run build` — production build.
- `npm run start` — production server.
