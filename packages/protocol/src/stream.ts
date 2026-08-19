/**
 * Reassembles frames from the notification stream.
 *
 * Notifications are capped at the negotiated packet size and have no relationship
 * to frame boundaries, so a frame may arrive across several notifications and a
 * notification may carry several frames. Damaged or unrecognised input has to be
 * survivable too.
 *
 * Resynchronisation is only as good as its ability to recognise a frame start.
 * The marker alone is not enough: a payload byte can equal it, and reading a
 * length out of the payload behind it parks the reader waiting for bytes that
 * never arrive. So a candidate is confirmed by its header checksum from its
 * first eight bytes, before the reader commits to it. That is what the two-sum
 * design is for, and it is why the declared length can be trusted cheaply.
 *
 * Nothing here touches Bluetooth. It takes byte runs from whatever produced them
 * and returns frames, which is what lets the same code run in the phone, the
 * server and CI.
 */

import { headerChecksum as bandHeaderChecksum } from './checksums.ts';
import type { Crc } from './crc.ts';
import { decodeEnvelope, decodeHeader, type Envelope, type FrameHeader } from './envelope.ts';
import { FRAME_MARKER } from './spec.ts';

export type FrameStreamOptions = {
  /**
   * Checksum over the first six bytes of a frame, used to confirm a candidate
   * frame start before the reader commits to it. Defaults to the band's own,
   * named in spec.ts. Override only to decode a stream from something else.
   */
  readonly headerChecksum?: Crc;
};

export type StreamStats = {
  /** Frames emitted since construction. */
  readonly framesEmitted: number;
  /** Bytes dropped while resynchronising. A rising count means real trouble. */
  readonly bytesDiscarded: number;
  /** Candidates that carried the marker but failed their header checksum. */
  readonly falseStartsRejected: number;
};

export class FrameStream {
  readonly #headerChecksum: Crc;
  #pending: Uint8Array = new Uint8Array(0);
  #framesEmitted = 0;
  #bytesDiscarded = 0;
  #falseStartsRejected = 0;

  constructor(options: FrameStreamOptions = {}) {
    this.#headerChecksum = options.headerChecksum ?? bandHeaderChecksum;
  }

  /** Bytes held back waiting for the rest of a frame. */
  get pendingBytes(): number {
    return this.#pending.length;
  }

  get stats(): StreamStats {
    return {
      framesEmitted: this.#framesEmitted,
      bytesDiscarded: this.#bytesDiscarded,
      falseStartsRejected: this.#falseStartsRejected,
    };
  }

  /** Drop any partial frame. For use after a disconnect, not during a transfer. */
  reset(): void {
    this.#pending = new Uint8Array(0);
  }

  /** Accept one notification and return whatever frames it completed. */
  push(chunk: Uint8Array): Envelope[] {
    this.#pending = append(this.#pending, chunk);

    const frames: Envelope[] = [];
    let at = 0;

    while (at < this.#pending.length) {
      const decoded = decodeHeader(this.#pending, at);

      // Fewer than eight bytes: nothing can be judged yet.
      if (!decoded.ok && decoded.error.kind === 'incomplete') break;

      if (!decoded.ok || !this.#confirms(decoded.header)) {
        at = this.#resynchronise(at);
        continue;
      }

      // The header is trusted, so the frame length is too. Wait for the body
      // rather than rescanning, which is what the cheap header sum buys.
      if (this.#pending.length - at < decoded.header.frameLength) break;

      const result = decodeEnvelope(this.#pending, at);
      if (!result.ok) break;

      frames.push(result.envelope);
      this.#framesEmitted += 1;
      at += result.envelope.frameLength;
    }

    // Views handed out above point into this buffer, so it is replaced rather
    // than written through. Emitted frames stay valid for as long as the caller
    // holds them.
    this.#pending = this.#pending.slice(at);
    return frames;
  }

  /** True when this looks like a real frame start. */
  #confirms(header: FrameHeader): boolean {
    if (this.#headerChecksum(header.headerChecksummed) === header.headerChecksum) return true;

    this.#falseStartsRejected += 1;
    return false;
  }

  /** Skip the byte at `at` and everything up to the next marker. */
  #resynchronise(at: number): number {
    const next = indexOfMarker(this.#pending, at + 1);
    const skipTo = next === -1 ? this.#pending.length : next;
    this.#bytesDiscarded += skipTo - at;
    return skipTo;
  }
}

function append(head: Uint8Array, tail: Uint8Array): Uint8Array {
  if (head.length === 0) return tail.slice();
  const out = new Uint8Array(head.length + tail.length);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

function indexOfMarker(bytes: Uint8Array, from: number): number {
  for (let at = from; at < bytes.length; at += 1) {
    if (bytes[at] === FRAME_MARKER) return at;
  }
  return -1;
}
