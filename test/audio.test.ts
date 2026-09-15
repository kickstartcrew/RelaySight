import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmRecorder, pcm16LeToOggOpus } from '../src/audio';

test('pcm16LeToOggOpus writes a valid Ogg Opus stream', async () => {
  const pcm = new Uint8Array(16_000 * 2 / 10);
  const ogg = await pcm16LeToOggOpus(pcm);
  const bytes = new Uint8Array(await ogg.arrayBuffer());
  assert.equal(ogg.type, 'audio/ogg');
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'OggS');
  assert.ok(new TextDecoder().decode(bytes).includes('OpusHead'));
  assert.ok(bytes.byteLength > 100);
});

test('PcmRecorder caps input and reports duration before reset', async () => {
  const recorder = new PcmRecorder(0.001);
  assert.equal(recorder.append(new Uint8Array(100)), true);
  const result = recorder.finish();
  assert.ok(result.durationSeconds > 0);
  assert.equal(result.pcm.byteLength, recorder.maxBytes);
  assert.equal(recorder.durationSeconds, 0);
});

test('odd trailing PCM byte is discarded', async () => {
  const recorder = new PcmRecorder();
  recorder.append(new Uint8Array([1, 2, 3]));
  assert.equal(recorder.finish().pcm.byteLength, 2);
});
