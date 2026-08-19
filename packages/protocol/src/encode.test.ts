/**
 * NO DEVICE DATA. These frames are built and read back by this project, so they
 * establish that the encoder and the decoder agree with each other. Agreement
 * between two halves of one codebase is not evidence about firmware.
 *
 * The exception is the last test, which encodes against the published opening
 * frame in spec.ts. That one has an external answer to match.
 */

import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyEnvelope } from './checksums.ts';
import { encodeCommand, encodeFrame, encodeHistoryRequest } from './encode.ts';
import { decodeBodyHeader, decodeEnvelope } from './envelope.ts';
import { COMMAND, NEVER_SEND, OPENING_FRAME, PACKET_KIND } from './spec.ts';

function readBack(bytes: Uint8Array) {
  const result = decodeEnvelope(bytes);
  if (!result.ok) throw new Error(`encoded frame does not decode: ${result.error.kind}`);
  return result;
}

describe('encodeFrame', () => {
  it('produces a frame that decodes to what went in', () => {
    const bytes = encodeFrame({
      kind: PACKET_KIND.METADATA,
      variant: 7,
      opcode: 2,
      data: Uint8Array.from([0xaa, 0xbb, 0xcc]),
    });

    const { envelope } = readBack(bytes);
    const body = decodeBodyHeader(envelope.body);

    strictEqual(body?.kind, PACKET_KIND.METADATA);
    strictEqual(body?.variant, 7);
    strictEqual(body?.opcode, 2);
    deepStrictEqual([...(body?.data ?? [])], [0xaa, 0xbb, 0xcc]);
  });

  it('signs both checksums so the frame verifies', () => {
    const { envelope } = readBack(encodeCommand(COMMAND.REQUEST_HISTORY, 1, Uint8Array.from([0])));

    deepStrictEqual(verifyEnvelope(envelope), { ok: true });
  });

  it('declares a length that matches the bytes it produced', () => {
    const bytes = encodeFrame({ kind: 1, variant: 0, opcode: 0, data: new Uint8Array(40) });
    const { envelope } = readBack(bytes);

    strictEqual(envelope.frameLength, bytes.length);
  });

  it('handles a command with no payload', () => {
    const { envelope } = readBack(encodeCommand(COMMAND.REQUEST_HISTORY, 3));

    deepStrictEqual([...(decodeBodyHeader(envelope.body)?.data ?? [])], []);
  });

  it('refuses every command excluded by design', () => {
    for (const opcode of Object.keys(NEVER_SEND).map(Number)) {
      throws(() => encodeCommand(opcode, 1), /excluded by design/, `command ${opcode} was encodable`);
    }
  });

  it('allows an excluded number as a non-command packet', () => {
    // The guard is about what gets sent as a command, not about the number.
    const bytes = encodeFrame({ kind: PACKET_KIND.METADATA, variant: 0, opcode: 29 });

    strictEqual(readBack(bytes).envelope.frameLength, bytes.length);
  });

  it('refuses a body the declared length cannot describe', () => {
    throws(() => encodeFrame({ kind: 1, variant: 0, opcode: 0, data: new Uint8Array(0x10000) }), RangeError);
  });

  it('wraps the sequence counter into a byte', () => {
    const { envelope } = readBack(encodeCommand(COMMAND.REQUEST_HISTORY, 258));

    strictEqual(decodeBodyHeader(envelope.body)?.variant, 2);
  });

  it('reproduces the published opening frame from its parts', () => {
    const { envelope } = readBack(OPENING_FRAME);
    const body = decodeBodyHeader(envelope.body);
    if (body === undefined) throw new Error('no body');

    const rebuilt = encodeFrame({
      kind: body.kind,
      variant: body.variant,
      opcode: body.opcode,
      data: body.data,
      revision: envelope.revision,
      routing: envelope.routing,
    });

    // Byte for byte, including both checksums, against a constant nobody here
    // chose. If the encoder computed either sum differently, this would not hold.
    deepStrictEqual([...rebuilt], [...OPENING_FRAME]);
  });
});

describe('encodeHistoryRequest', () => {
  it('asks for history with the documented payload', () => {
    const { envelope } = readBack(encodeHistoryRequest(1));
    const body = decodeBodyHeader(envelope.body);

    strictEqual(body?.kind, PACKET_KIND.COMMAND);
    strictEqual(body?.opcode, COMMAND.REQUEST_HISTORY);
    deepStrictEqual([...(body?.data ?? [])], [0x00]);
  });
});
