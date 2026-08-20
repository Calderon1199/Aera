# 4. Expo rather than bare React Native

**Status:** accepted · 2026-08-19

## Context

Milestone 4 needs the app on a physical iPhone, because the cross-check against the
standard heart-rate characteristic is the only thing that can promote a field from
Documented to Verified. Everything else in the project has been arranged so that this is
the last unproven step.

The development machine is Linux. That is not an inconvenience to work around, it is the
constraint: iOS apps are signed by Apple tooling that runs on macOS, and there is no Mac.

The repository originally assumed bare React Native built on a GitHub-hosted macOS runner.
That builds, but a runner cannot sign for a personal Apple ID, so it produces an unsigned
bundle that then has to be sideloaded with third-party tooling and re-signed every seven
days. The build was never the hard part. Getting a signed app onto a phone is.

## Decision

**Use Expo, with a development build, and build on Expo's hosted service.**

The signing credentials live with the build service, authorised once with an Apple ID.
Installing is a link on the phone rather than a cable and a desktop tool. Bluetooth needs
native code that Expo Go cannot provide, hence a development build rather than the sandbox
client.

The macOS runner is gone. The iOS workflow now runs on Linux and delegates.

## Consequences

**Easier.** One command produces an installable app, from a machine that cannot compile it.
Signing stops being a recurring chore, which matters because a validation run that requires
half an hour of setup is a validation run that stops happening. Native modules arrive as
configuration rather than as Xcode project edits, so the repository holds no generated
iOS project to drift.

**Harder.** A hosted dependency now sits in the path to a build, with queues on the free
tier and an account that has to keep existing. Native configuration is expressed through
plugins rather than directly, so anything without a plugin needs one written. Metro must be
taught about the workspace explicitly, since the decoder and collector are sibling packages
rather than published dependencies.

**Reversible.** `expo prebuild` generates the native project on demand, so the bare path
stays available. Choosing this now does not spend the option.

## Alternatives

**Bare React Native on the macOS runner.** What the repository already assumed, and the
reason it was reconsidered: an unsigned bundle needs sideloading tooling and re-signing
weekly. Rejected because the friction lands on the step that has to be repeated most.

**Buy a Mac.** Solves it permanently and costs more than the band. Rejected as
disproportionate for one validation path.

**Android first.** Signing is trivial there and the whole problem evaporates. Rejected
because the plan already says no Android until iOS works, and reversing that would be
choosing the target by what is convenient rather than by what is owned.
