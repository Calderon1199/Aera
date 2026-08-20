# cli

Sync the band from a Linux laptop. No phone, no Apple account, no cloud.

This is the validation rig, and a working collector. It exists because reaching a physical
iPhone needs a paid Apple Developer membership and the cross-check does not: see
[decision record 5](../../docs/decisions/0005-a-laptop-collector.md).

Everything here is reused. The decoder, the transfer state machine, the session and the
comparison are the same code the phone runs; only
[`src/bluetooth.ts`](src/bluetooth.ts) is new, speaking to BlueZ over D-Bus.

## Using it

```bash
npm run aera --workspace @aera/cli -- scan
```

Wake the band and make sure the vendor app is not connected to it, since only one host may
hold it at a time. The band is flagged in the list if it advertises the vendor service.

```bash
npm run aera --workspace @aera/cli -- sync --address AA:BB:CC:DD:EE:FF
```

It drains stored history into a local SQLite buffer while reading the standard heart-rate
characteristic, then compares the two where their timestamps overlap.

**The verdict at the end is the point.** *Agrees with the reference* means the field
positions are right on your firmware. *Disagrees* means they are not, whatever the numbers
look like, and the decoded data should not be used. *Not enough overlap* means wear it a
few minutes longer and sync again.

Then send it to the archive:

```bash
npm run aera --workspace @aera/cli -- upload --api http://127.0.0.1:8000 --token YOUR_TOKEN
```

Frames go up raw and the API decodes them, so the archive never depends on the machine that
collected it. Uploading is safe to repeat: frames are identified by the hash of their bytes,
so a second attempt changes nothing.

## If the band does not appear

It may be asleep, out of range, or already connected to the vendor app. Only one host may
hold it at a time. Nothing here sends a destructive command, and every command it does send
is safe to send twice.
