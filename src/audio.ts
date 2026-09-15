import createOpusEncoder from '@audio/encode-opus';

export const PCM_SAMPLE_RATE = 16_000;
export const PCM_CHANNELS = 1;
export const PCM_BITS_PER_SAMPLE = 16;

function concatenateEvenPcm(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength - (chunk.byteLength % 2), 0);
  const pcm = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    const evenLength = chunk.byteLength - (chunk.byteLength % 2);
    pcm.set(chunk.subarray(0, evenLength), offset);
    offset += evenLength;
  }
  return pcm;
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export async function pcm16LeToOggOpus(pcm: Uint8Array): Promise<Blob> {
  const evenLength = pcm.byteLength - (pcm.byteLength % 2);
  const view = new DataView(pcm.buffer, pcm.byteOffset, evenLength);
  const channel = new Float32Array(evenLength / 2);
  for (let index = 0; index < channel.length; index += 1) {
    const sample = view.getInt16(index * 2, true);
    channel[index] = sample < 0 ? sample / 32_768 : sample / 32_767;
  }

  const encoder = await createOpusEncoder({
    sampleRate: PCM_SAMPLE_RATE,
    channels: PCM_CHANNELS,
    bitrate: 32,
    application: 'voip',
    complexity: 5,
    meta: { software: 'Relay Sight' },
  });
  try {
    const body = encoder.encode([channel]);
    const tail = encoder.flush();
    const encoded = joinBytes([body, tail]);
    return new Blob([encoded.buffer as ArrayBuffer], { type: 'audio/ogg' });
  } finally {
    encoder.free();
  }
}

export class PcmRecorder {
  private chunks: Uint8Array[] = [];
  private bytes = 0;

  constructor(readonly maxSeconds = 90) {
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('maxSeconds must be positive');
  }

  append(chunk: Uint8Array): boolean {
    const remaining = this.maxBytes - this.bytes;
    if (remaining <= 0) return true;
    const copyLength = Math.min(chunk.byteLength - (chunk.byteLength % 2), remaining - (remaining % 2));
    if (copyLength > 0) {
      this.chunks.push(chunk.slice(0, copyLength));
      this.bytes += copyLength;
    }
    return this.bytes >= this.maxBytes;
  }

  finish(): { pcm: Uint8Array; durationSeconds: number } {
    const pcm = concatenateEvenPcm(this.chunks);
    const result = {
      pcm,
      durationSeconds: this.durationSeconds,
    };
    this.reset();
    return result;
  }

  reset(): void {
    this.chunks = [];
    this.bytes = 0;
  }

  get durationSeconds(): number {
    return this.bytes / (PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8));
  }

  get maxBytes(): number {
    return Math.floor(this.maxSeconds * PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8));
  }
}
