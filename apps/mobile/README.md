# mobile

React Native app. Owns Bluetooth, buffers locally, syncs when the API is reachable. iOS first.

**Status:** the logic exists and is tested; the Bluetooth binding does not. See
[`docs/PLAN.md`](../../docs/PLAN.md) (milestone M4).

Everything this app does apart from talking to Bluetooth lives in
[`packages/collector`](../../packages/collector), driven through injected ports and
exercised in tests with no phone, no band and no network. What belongs here is the thin
shell that binds a real Bluetooth library to those ports, plus durable local storage and
the upload to the API.

That split is deliberate. This is the riskiest milestone, so everything that could be
proven without hardware was proven first, and whatever breaks on the day is Bluetooth.

Constraints that apply here are in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).
