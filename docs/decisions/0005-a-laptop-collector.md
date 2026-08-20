# 5. A laptop collector, so validation does not wait on Apple

**Status:** accepted · 2026-08-19

## Context

Milestone 4's cross-check is the gate on everything: until decoded history is compared
against the standard heart-rate characteristic on real hardware, no field in this project
may be called Verified, and the central claim stays unproven.

Decision record 4 chose Expo to reach an iPhone without a Mac. That works, but it ran into
a rule further up: Apple will not issue the signing credentials for a build on a physical
device without a paid Developer Program membership. A free Apple ID can only sign through
Xcode on a Mac, with certificates that expire weekly. Neither is available here, so the
iOS path costs either $99 a year or a Mac, and it would be paid **before** knowing whether
the protocol decoding is correct at all.

The development laptop has a working Bluetooth controller. The collector was already
written so that Bluetooth, storage and the clock arrive as injected ports.

## Decision

**Build a second collector as a Linux command-line tool, in `apps/cli`.**

It reuses the decoder, the transfer state machine, the session and the comparison
unchanged. The only new code is a Bluetooth binding over BlueZ, the counterpart of the
phone's. It buffers to SQLite, which ships with Node, and uploads to the same API.

This does not replace the phone app, which stays written and unproven until someone pays
for it or lends a Mac. A laptop is not a thing you wear.

## Consequences

**Easier.** The protocol can be validated today, for nothing, and the archive can start
filling. If the cross-check disagrees, that is found out before any money is spent, which
is the right order.

**Better evidence than expected.** The port design was a claim about testability. A second
independent binding to the same ports, on a different operating system and a different
Bluetooth stack, is the first real test of it.

**Harder.** Two Bluetooth bindings now exist, and a protocol correction that touches either
has to touch both. This one is Linux only, since it speaks to BlueZ over D-Bus. And syncing
means being near the laptop, which is a worse daily experience than a phone in a pocket:
this is a validation rig that happens to be a working collector, not the product.

## Alternatives

**Pay Apple $99.** Still the route to the product, and probably worth it once the protocol
is known to decode correctly. Rejected as the immediate step because it spends money to
learn something a laptop can establish for free.

**Android.** Signing is free and the app code would barely change. Rejected because the
plan says no Android until iOS works, and reversing that would be choosing the target by
convenience rather than by what is owned.

**Borrow a Mac.** Free provisioning gives seven-day certificates, so every validation run a
week apart needs the Mac again. Rejected as a dependency on someone else's hardware for a
thing that has to be repeatable.
