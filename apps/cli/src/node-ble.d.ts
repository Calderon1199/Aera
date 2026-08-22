/**
 * Types for node-ble, which ships none.
 *
 * Only what this project calls is described. An incomplete declaration is
 * honest about the surface actually used; a speculative one would invite calls
 * that were never checked against the library.
 */

declare module 'node-ble' {
  export type GattCharacteristic = {
    startNotifications(): Promise<void>;
    stopNotifications(): Promise<void>;
    writeValue(value: Buffer, options?: { type?: 'request' | 'command' }): Promise<void>;
    readValue(): Promise<Buffer>;
    on(event: 'valuechanged', listener: (value: Buffer) => void): void;
  };

  export type GattService = {
    getCharacteristic(uuid: string): Promise<GattCharacteristic>;
  };

  export type GattServer = {
    getPrimaryService(uuid: string): Promise<GattService>;
    services(): Promise<string[]>;
  };

  export type Device = {
    getName(): Promise<string>;
    isConnected(): Promise<boolean>;
    isPaired(): Promise<boolean>;
    getAddress(): Promise<string>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    gatt(): Promise<GattServer>;
    on?(event: 'connect' | 'disconnect', listener: () => void): void;
    helper?: { prop(name: string): Promise<unknown> };
  };

  export type Adapter = {
    isPowered(): Promise<boolean>;
    isDiscovering(): Promise<boolean>;
    startDiscovery(): Promise<void>;
    stopDiscovery(): Promise<void>;
    devices(): Promise<string[]>;
    getDevice(address: string): Promise<Device>;
    waitDevice(address: string, timeout?: number): Promise<Device>;
  };

  export type Bluetooth = {
    defaultAdapter(): Promise<Adapter>;
    adapters(): Promise<string[]>;
  };

  export function createBluetooth(): { bluetooth: Bluetooth; destroy(): void };
}
