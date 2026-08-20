/**
 * Bonding with the band, on terms it will accept.
 *
 * The band pairs "just works": no PIN, nothing for the wearer to confirm. A
 * desktop Bluetooth agent advertises a keyboard and a display, so BlueZ asks for
 * man-in-the-middle protection, which just-works pairing cannot provide by
 * definition. The band then answers "Pairing not supported" and drops the link.
 *
 * Observed on real hardware:
 *
 *   SMP: Pairing Request   IO capability: KeyboardDisplay
 *                          Authentication requirement: Bonding, MITM, SC
 *   SMP: Pairing Failed    Reason: Pairing not supported (0x05)
 *
 * So this registers an agent that claims no input and no output, which is what
 * makes BlueZ drop the MITM requirement and offer terms the band accepts. The
 * agent answers every question permissively because there is nothing to answer:
 * a device with no keypad cannot be asked to confirm anything.
 */

import dbus from 'dbus-next';

const AGENT_PATH = '/dev/aera/agent';

const { Interface } = dbus.interface;

class JustWorksAgent extends Interface {
  Release(): void {}
  Cancel(): void {}
  RequestPinCode(): string {
    return '0000';
  }
  RequestPasskey(): number {
    return 0;
  }
  DisplayPinCode(): void {}
  DisplayPasskey(): void {}
  RequestConfirmation(): void {}
  RequestAuthorization(): void {}
  AuthorizeService(): void {}
}

JustWorksAgent.configureMembers({
  methods: {
    Release: { inSignature: '', outSignature: '' },
    Cancel: { inSignature: '', outSignature: '' },
    RequestPinCode: { inSignature: 'o', outSignature: 's' },
    RequestPasskey: { inSignature: 'o', outSignature: 'u' },
    DisplayPinCode: { inSignature: 'os', outSignature: '' },
    DisplayPasskey: { inSignature: 'ouq', outSignature: '' },
    RequestConfirmation: { inSignature: 'ou', outSignature: '' },
    RequestAuthorization: { inSignature: 'o', outSignature: '' },
    AuthorizeService: { inSignature: 'os', outSignature: '' },
  },
});

/**
 * The slices of BlueZ this calls. dbus-next types proxy methods loosely, since
 * it builds them from introspection at runtime, so the shape being relied on is
 * written down here rather than asserted at each call.
 */
type AgentManager = {
  RegisterAgent(path: string, capability: string): Promise<void>;
  RequestDefaultAgent(path: string): Promise<void>;
  UnregisterAgent(path: string): Promise<void>;
};

type Device1 = {
  Pair(): Promise<void>;
};

type Properties = {
  Get(iface: string, name: string): Promise<{ value: unknown }>;
  Set(iface: string, name: string, value: dbus.Variant): Promise<void>;
};

export type PairResult = {
  readonly paired: boolean;
  readonly detail: string;
};

/** Object path BlueZ uses for a device, derived from its address. */
function devicePath(address: string, adapter = 'hci0'): string {
  return `/org/bluez/${adapter}/dev_${address.toUpperCase().replaceAll(':', '_')}`;
}

/**
 * Bond with the band, taking the default agent for the duration.
 *
 * The desktop's own agent is put back afterwards by BlueZ when this one
 * unregisters, so nothing about the machine is left changed.
 */
export async function pair(address: string): Promise<PairResult> {
  const bus = dbus.systemBus();

  try {
    const agent = new JustWorksAgent('org.bluez.Agent1');
    bus.export(AGENT_PATH, agent);

    const bluez = await bus.getProxyObject('org.bluez', '/org/bluez');
    const manager = bluez.getInterface('org.bluez.AgentManager1') as unknown as AgentManager;

    await manager.RegisterAgent(AGENT_PATH, 'NoInputNoOutput');
    await manager.RequestDefaultAgent(AGENT_PATH);

    const object = await bus.getProxyObject('org.bluez', devicePath(address));
    const device = object.getInterface('org.bluez.Device1') as unknown as Device1;
    const properties = object.getInterface(
      'org.freedesktop.DBus.Properties',
    ) as unknown as Properties;

    const already = await properties.Get('org.bluez.Device1', 'Paired');
    if (already.value === true) {
      await manager.UnregisterAgent(AGENT_PATH).catch(() => undefined);
      return { paired: true, detail: 'already bonded' };
    }

    try {
      await device.Pair();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await manager.UnregisterAgent(AGENT_PATH).catch(() => undefined);
      return { paired: false, detail };
    }

    // Trusting it means BlueZ reconnects without asking again.
    await properties
      .Set('org.bluez.Device1', 'Trusted', new dbus.Variant('b', true))
      .catch(() => undefined);

    const paired = await properties.Get('org.bluez.Device1', 'Paired');
    await manager.UnregisterAgent(AGENT_PATH).catch(() => undefined);

    return { paired: paired.value === true, detail: 'bonded' };
  } finally {
    bus.disconnect();
  }
}
