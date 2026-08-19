/**
 * Reassembles frames from the notification stream.
 *
 * Notifications are capped at the negotiated packet size and have no relationship
 * to frame boundaries, so a frame may arrive across several notifications and a
 * notification may carry several frames. Damaged or unrecognised input has to be
 * survivable too: the marker plus a cheaply trusted declared length is what makes
 * resynchronisation possible.
 *
 * Nothing here touches Bluetooth. It takes byte runs from whatever produced them
 * and returns frames, which is what lets the same code run in the phone, the
 * server and CI.
 */

import { decodeEnvelope, type Envelope } from './envelope.ts';
import { FRAME_MARKER } from './spec.ts';

export type StreamStats = {
  /** Frames emitted since construction. */
  readonly framesEmitted: number;
  /** Bytes dropped while resynchronising. A rising count means real trouble. */
  readonly bytesDiscarded: number;
};

export class FrameStream {
  #pending: Uint8Array = new Uint8Array(0);
  #framesEmitted = 0;
  #bytesDiscarded = 0;

  /** Bytes held back waiting for the rest of a frame. */
  get pendingBytes(): number {
    return this.#pending.length;
  }

  get stats(): StreamStats {
    return { framesEmitted: this.#framesEmitted, bytesDiscarded: this.#bytesDiscarded };
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
      const result = decodeEnvelope(this.#pending, at);

      if (result.ok) {
        frames.push(result.envelope);
        at += result.envelope.frameLength;
        this.#framesEmitted += 1;
        continue;
      }

      if (result.error.kind === 'incomplete') break;

      // Either the byte is not a marker, or a frame claimed a length no frame can
      // have. Both mean this position is not a frame start, so skip past it and
      // look for the next marker.
      const next = indexOfMarker(this.#pending, at + 1);
      const skipTo = next === -1 ? this.#pending.length : next;
      this.#bytesDiscarded += skipTo - at;
      at = skipTo;
    }

    // Views handed out above point into this buffer, so it is replaced rather
    // than written through. Emitted frames stay valid for as long as the caller
    // holds them.
    this.#pending = this.#pending.slice(at);
    return frames;
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
