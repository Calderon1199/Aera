# mobile

React Native app. Owns Bluetooth, buffers locally, syncs when the API is reachable. iOS first.

**Status:** written, and unproven until it runs against a band. See
[`docs/PLAN.md`](../../docs/PLAN.md) (milestone M4).

Constraints that apply here are in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## What is here, and what is not

Everything this app does apart from talking to Bluetooth lives in
[`packages/collector`](../../packages/collector), driven through injected ports and
exercised in tests with no phone, no band and no network. What is here is the shell that
binds real Bluetooth, real storage and a real network to those ports.

That split is the whole strategy for this milestone. This is the riskiest part of the
project, so everything provable without hardware was proven first, and
[`src/bluetooth.ts`](src/bluetooth.ts) is the only code in the project that has never run.
When a sync misbehaves, look there first.

| File | Role |
|---|---|
| [`src/bluetooth.ts`](src/bluetooth.ts) | Scan, connect, subscribe, move bytes. Parses nothing |
| [`src/storage.ts`](src/storage.ts) | The local buffer. Durable before it resolves, because the transfer depends on that |
| [`src/sync.ts`](src/sync.ts) | Uploads buffered frames. Nothing is marked sent until the API answers |
| [`App.tsx`](App.tsx) | One screen, and the verdict that decides the milestone |

## Setup

You need an [expo.dev](https://expo.dev) account and an Apple ID. No Mac, which is the
point: see decision record 4.

```bash
npm install                       # from the repository root
npm install --global eas-cli
eas login
```

Point the app at your API. These are read at build time and never committed:

```bash
# apps/mobile/.env
EXPO_PUBLIC_AERA_API_URL=http://192.168.1.10:8000
EXPO_PUBLIC_AERA_TOKEN=the-value-of-AERA_INGEST_TOKEN
```

## Getting it onto the phone

```bash
npm run build:dev --workspace @aera/mobile
```

The first run asks to generate signing credentials. Say yes and sign in with your Apple ID;
it handles the rest. When the build finishes, open the link it prints on the phone and
install. Then:

```bash
npm run start --workspace @aera/mobile
```

and scan the QR code with the installed app. Code changes reload without rebuilding. A
rebuild is only needed when native dependencies change.

## Using it

Wear the band, open the app, and press **Sync from band**. It reads the standard
heart-rate characteristic while it drains stored history, then compares the two.

The verdict at the bottom is what milestone 4 turns on. **Agrees with the reference** means
the field positions are right on your firmware and the data can be trusted. **Disagrees**
means they are not, whatever the numbers look like, and the decoded data should not be
used. **Not enough overlap** means wear it a few minutes longer and sync again.

Until that verdict says agree, nothing in this project is Verified, and
[`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) means something specific by that word.
