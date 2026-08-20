/**
 * The Bluetooth binding, and the only genuinely unproven code in this project.
 *
 * Everything above it has been exercised without hardware: the decoder against
 * a published frame, the transfer against a simulated multi-batch sync, the
 * session against fake ports. That was deliberate. When something goes wrong
 * during a real sync, this file is where to look, because it is the only layer
 * that has never run.
 *
 * It does as little as possible for that reason. It scans, connects,
 * subscribes, and moves bytes. It parses nothing.
 */

import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';

import type { Transport } from '@aera/collector';
import { spec } from '@aera/protocol';

import { fromBase64, toBase64 } from './base64.ts';

export type LinkHandlers = {
  /** Bytes from any vendor notify channel, in arrival order. */
  onFrames: (chunk: Uint8Array) => void;
  /** Bytes from the standard heart-rate characteristic. */
  onReference: (chunk: Uint8Array) => void;
  onDisconnect: () => void;
};

export class BandLink {
  readonly #manager = new BleManager();
  #device: Device | undefined;
  #subscriptions: Subscription[] = [];

  /** Scan for a band advertising the vendor service, then connect. */
  async connect(handlers: LinkHandlers, timeoutMs = 20_000): Promise<string> {
    const device = await this.#scan(timeoutMs);

    this.#device = await device.connect();
    await this.#device.discoverAllServicesAndCharacteristics();

    this.#subscriptions.push(
      this.#manager.onDeviceDisconnected(this.#device.id, () => handlers.onDisconnect()),
    );

    // The vendor channels stay silent until the link is encrypted, and on Apple
    // platforms a single acknowledged write raises that transparently. Which
    // channel carries what is not established, so all of them are subscribed
    // and the framing sorts it out.
    for (const characteristic of spec.GATT.NOTIFY) {
      this.#subscriptions.push(
        this.#device.monitorCharacteristicForService(
          spec.GATT.SERVICE,
          characteristic,
          (error, value) => {
            if (error || !value?.value) return;
            handlers.onFrames(fromBase64(value.value));
          },
        ),
      );
    }

    this.#subscriptions.push(
      this.#device.monitorCharacteristicForService(
        spec.STANDARD_HEART_RATE.SERVICE,
        spec.STANDARD_HEART_RATE.MEASUREMENT,
        (error, value) => {
          if (error || !value?.value) return;
          handlers.onReference(fromBase64(value.value));
        },
      ),
    );

    return this.#device.id;
  }

  /** The port the session writes through. */
  transport(): Transport {
    return {
      write: async (frame: Uint8Array): Promise<void> => {
        const device = this.#device;
        if (device === undefined) throw new Error('not connected');

        // With response, not without. The acknowledgement is what raises
        // encryption on the link, and an unencrypted vendor channel is silent.
        await device.writeCharacteristicWithResponseForService(
          spec.GATT.SERVICE,
          spec.GATT.COMMAND,
          toBase64(frame),
        );
      },
    };
  }

  async disconnect(): Promise<void> {
    for (const subscription of this.#subscriptions) subscription.remove();
    this.#subscriptions = [];

    if (this.#device !== undefined) {
      await this.#manager.cancelDeviceConnection(this.#device.id).catch(() => undefined);
      this.#device = undefined;
    }
  }

  destroy(): void {
    this.#manager.destroy();
  }

  #scan(timeoutMs: number): Promise<Device> {
    return new Promise<Device>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#manager.stopDeviceScan();
        reject(new Error('no band found. Is it awake and not connected to the vendor app?'));
      }, timeoutMs);

      this.#manager.startDeviceScan([spec.GATT.SERVICE], null, (error, device) => {
        if (error) {
          clearTimeout(timer);
          this.#manager.stopDeviceScan();
          reject(error);
          return;
        }

        if (device === null) return;

        clearTimeout(timer);
        this.#manager.stopDeviceScan();
        resolve(device);
      });
    });
  }
}
