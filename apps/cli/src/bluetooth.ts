/**
 * The Bluetooth binding for Linux, over BlueZ.
 *
 * Counterpart to the phone's, and unproven in the same way: everything above it
 * has been exercised without hardware, so when a sync misbehaves this is where
 * to look. It scans, connects, subscribes and moves bytes, and parses nothing.
 */

import { createBluetooth } from 'node-ble';

import type { Transport } from '@aera/collector';
import { spec } from '@aera/protocol';

export type Candidate = {
  readonly address: string;
  readonly name: string;
  readonly services: readonly string[];
  /** Whether it advertises the vendor service, which is the strong signal. */
  readonly looksLikeTheBand: boolean;
};

export type LinkHandlers = {
  onFrames: (chunk: Uint8Array) => void;
  onReference: (chunk: Uint8Array) => void;
  onDisconnect: () => void;
};

type Bluetooth = ReturnType<typeof createBluetooth>;

export class BandLink {
  #session: Bluetooth | undefined;
  #device: { connect(): Promise<void>; disconnect(): Promise<void>; gatt(): Promise<unknown> } | undefined;
  #command: { writeValue(value: Buffer, options?: unknown): Promise<void> } | undefined;

  /** Scan and report what is nearby, loudest signal first. */
  static async scan(seconds: number): Promise<Candidate[]> {
    const session = createBluetooth();

    try {
      const adapter = await session.bluetooth.defaultAdapter();
      if (!(await adapter.isDiscovering())) await adapter.startDiscovery();

      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

      const addresses = await adapter.devices();
      const candidates: Candidate[] = [];

      for (const address of addresses) {
        try {
          const device = await adapter.getDevice(address);
          const name = await device.getName().catch(() => '');
          const services = await readServices(device);

          candidates.push({
            address,
            name: name || '(unnamed)',
            services,
            looksLikeTheBand: services.some((uuid) => uuid.toLowerCase() === spec.GATT.SERVICE),
          });
        } catch {
          // A device that vanishes mid-scan is normal, not an error.
        }
      }

      await adapter.stopDiscovery().catch(() => undefined);

      return candidates.sort((a, b) => Number(b.looksLikeTheBand) - Number(a.looksLikeTheBand));
    } finally {
      session.destroy();
    }
  }

  async connect(address: string, handlers: LinkHandlers): Promise<void> {
    const session = createBluetooth();
    this.#session = session;

    const adapter = await session.bluetooth.defaultAdapter();

    // A bonded band is already known to BlueZ, so no scan is needed. Scanning
    // while connecting is worse than unnecessary: BlueZ cancels the attempt with
    // le-connection-abort-by-local, because it cannot do both at once.
    let device;
    try {
      device = await adapter.getDevice(address.toUpperCase());
    } catch {
      if (!(await adapter.isDiscovering())) await adapter.startDiscovery();
      device = await adapter.waitDevice(address.toUpperCase());
    }

    await adapter.stopDiscovery().catch(() => undefined);

    // A bonded, trusted band is often already being reconnected by BlueZ on its
    // own. Asking again in the middle of that answers "In Progress", which means
    // wait rather than fail, so the connection is waited for instead.
    if (!(await device.isConnected())) {
      try {
        await device.connect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/in progress/i.test(message)) throw error;

        await waitUntilConnected(device);
      }
    }

    this.#device = device as never;

    device.on?.('disconnect', () => handlers.onDisconnect());

    const gatt = await device.gatt();

    const vendor = await gatt.getPrimaryService(spec.GATT.SERVICE);
    this.#command = await vendor.getCharacteristic(spec.GATT.COMMAND);

    // Which notify channel carries what is not documented, so subscribe to every
    // one and let the framing sort it out. A channel this firmware does not
    // expose simply is not there, which is not a failure.
    for (const uuid of spec.GATT.NOTIFY) {
      try {
        const characteristic = await vendor.getCharacteristic(uuid);
        await characteristic.startNotifications();
        characteristic.on('valuechanged', (buffer: Buffer) => {
          handlers.onFrames(Uint8Array.from(buffer));
        });
      } catch {
        // Not exposed by this firmware.
      }
    }

    // The reference signal, on a service that needs no pairing at all.
    try {
      const heartRate = await gatt.getPrimaryService(spec.STANDARD_HEART_RATE.SERVICE);
      const measurement = await heartRate.getCharacteristic(spec.STANDARD_HEART_RATE.MEASUREMENT);
      await measurement.startNotifications();
      measurement.on('valuechanged', (buffer: Buffer) => {
        handlers.onReference(Uint8Array.from(buffer));
      });
    } catch {
      // Without this there is no cross-check, and the caller is told so rather
      // than being left to wonder why the verdict never arrives.
      throw new Error(
        'the standard heart-rate service is not available, so no cross-check is possible',
      );
    }

    // Let the stack settle before anything is written. Five subscriptions have
    // just been set up, and BlueZ refuses overlapping operations while it works
    // through them.
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  transport(): Transport {
    return {
      write: async (frame: Uint8Array): Promise<void> => {
        const command = this.#command;
        if (command === undefined) throw new Error('not connected');

        // With response. The acknowledgement is what raises encryption on the
        // link, and the vendor channels stay silent until it is raised.
        //
        // BlueZ answers "In Progress" when it is still settling something else,
        // which happens routinely right after subscribing to five channels. It
        // means try again shortly, not that the write is impossible.
        for (let attempt = 0; ; attempt += 1) {
          if (process.env.AERA_DEBUG === '1') console.error('  [write attempt', attempt, ']');
          try {
            await command.writeValue(Buffer.from(frame), { type: 'request' });
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (attempt >= 15 || !/in progress/i.test(message)) throw error;

            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }
      },
    };
  }

  async disconnect(): Promise<void> {
    await this.#device?.disconnect().catch(() => undefined);
    this.#session?.destroy();
    this.#session = undefined;
    this.#device = undefined;
    this.#command = undefined;
  }
}

/** Wait for a connection BlueZ is already establishing. */
async function waitUntilConnected(
  device: { isConnected(): Promise<boolean> },
  timeoutMs = 20_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await device.isConnected()) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error('the band never finished connecting');
}

/** Advertised service UUIDs, which BlueZ exposes as a device property. */
async function readServices(device: unknown): Promise<string[]> {
  try {
    const helper = (device as { helper?: { prop(name: string): Promise<unknown> } }).helper;
    const uuids = await helper?.prop('UUIDs');

    return Array.isArray(uuids) ? (uuids as string[]) : [];
  } catch {
    return [];
  }
}
