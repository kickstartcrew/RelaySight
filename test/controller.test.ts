import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController, type GlassesPort } from '../src/controller';
import { UPDATE_OFFSET_STORAGE_KEY, type AppConfig } from '../src/config';
import type { LocalStore } from '../src/storage';
import type { TelegramGateway, TelegramUpdate } from '../src/telegram';
import type { GlassFrame } from '../src/state';

class MemoryStore implements LocalStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
  async remove(key: string) { this.values.delete(key); }
}

class FakeGlasses implements GlassesPort {
  renders: GlassFrame[] = [];
  stopCount = 0;
  async render(frame: GlassFrame) { this.renders.push(frame); }
  async startMicrophone() { return true; }
  async stopMicrophone() { this.stopCount += 1; return true; }
}

class FakeTelegram implements TelegramGateway {
  readonly calls: Array<{ offset: number; timeout: number }> = [];

  async getUpdates(offset: number, timeout = 15, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    this.calls.push({ offset, timeout });
    if (timeout === 0) return [];
    return new Promise((resolve) => {
      signal?.addEventListener('abort', () => resolve([]), { once: true });
    });
  }

  async sendText() { return { message_id: 1, date: 1 }; }
  async sendVoicePrompt() { return { message_id: 1, date: 1 }; }
}

const config: AppConfig = {
  relayBotToken: `123456:${'A'.repeat(35)}`,
  agentBotUsername: 'agent_bot',
  relayBotId: 123456,
  relayBotUsername: 'glasses_bot',
};

test('a persisted zero update cursor is initialized and not treated as missing', async () => {
  const store = new MemoryStore();
  const firstTelegram = new FakeTelegram();
  const first = new AppController(new FakeGlasses(), store, {}, () => firstTelegram);
  await first.configure(config, true);
  assert.equal(store.values.get(UPDATE_OFFSET_STORAGE_KEY), '0');
  first.stopPolling();

  const secondTelegram = new FakeTelegram();
  const second = new AppController(new FakeGlasses(), store, {}, () => secondTelegram);
  await second.configure(config, false);
  assert.deepEqual(secondTelegram.calls[0], { offset: 0, timeout: 15 });
  assert.equal(secondTelegram.calls.some((call) => call.offset === -1), false);
  second.stopPolling();
});

test('recording can be cancelled without sending', async () => {
  const store = new MemoryStore();
  store.values.set(UPDATE_OFFSET_STORAGE_KEY, '1');
  const telegram = new FakeTelegram();
  const controller = new AppController(new FakeGlasses(), store, {}, () => telegram);
  await controller.configure(config, false);
  await controller.startRecording();
  assert.equal(controller.snapshot().mode, 'recording');
  assert.equal(await controller.cancelRecording(), true);
  assert.equal(controller.snapshot().mode, 'ready');
  controller.stopPolling();
});

test('a press during cancellation cannot send the discarded recording', async () => {
  const store = new MemoryStore();
  store.values.set(UPDATE_OFFSET_STORAGE_KEY, '1');
  const glasses = new FakeGlasses();
  const telegram = new FakeTelegram();
  let sent = 0;
  telegram.sendVoicePrompt = async () => { sent += 1; return { message_id: 1, date: 1 }; };
  const controller = new AppController(glasses, store, {}, () => telegram);
  await controller.configure(config, false);
  await controller.startRecording();
  controller.acceptPcm(new Uint8Array(16_000));

  let releaseStop: ((stopped: boolean) => void) | undefined;
  glasses.stopMicrophone = () => new Promise((resolve) => { releaseStop = resolve; });
  const cancellation = controller.cancelRecording();
  const latePress = controller.handlePrimaryPress();
  releaseStop?.(true);
  await Promise.all([cancellation, latePress]);

  assert.equal(controller.snapshot().mode, 'ready');
  assert.equal(sent, 0);
  controller.stopPolling();
});

test('confirmed system exit stops recording without repainting the closed page', async () => {
  const store = new MemoryStore();
  store.values.set(UPDATE_OFFSET_STORAGE_KEY, '1');
  const glasses = new FakeGlasses();
  const controller = new AppController(glasses, store, {}, () => new FakeTelegram());
  await controller.configure(config, false);
  await controller.startRecording();
  const rendersBeforeExit = glasses.renders.length;

  await controller.shutdown();
  await controller.shutdown(); // Host may also emit pagehide after SYSTEM_EXIT_EVENT.

  assert.equal(glasses.stopCount, 1);
  assert.equal(glasses.renders.length, rendersBeforeExit);
});

test('cancelling while the microphone is starting stops a late start', async () => {
  const store = new MemoryStore();
  store.values.set(UPDATE_OFFSET_STORAGE_KEY, '1');
  const glasses = new FakeGlasses();
  let resolveStart: ((started: boolean) => void) | undefined;
  glasses.startMicrophone = () => new Promise((resolve) => { resolveStart = resolve; });
  const controller = new AppController(glasses, store, {}, () => new FakeTelegram());
  await controller.configure(config, false);

  const start = controller.startRecording();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.snapshot().mode, 'starting');
  await controller.cancelRecording();
  resolveStart?.(true);
  await start;

  assert.equal(controller.snapshot().mode, 'ready');
  assert.equal(glasses.stopCount, 2);
  controller.stopPolling();
});

test('an obsolete long-poll cannot mutate state after reconfiguration', async () => {
  const store = new MemoryStore();
  store.values.set(UPDATE_OFFSET_STORAGE_KEY, '1');
  let resolveOldPoll: ((updates: TelegramUpdate[]) => void) | undefined;
  const oldTelegram = new FakeTelegram();
  oldTelegram.getUpdates = async (_offset, timeout = 15) => {
    if (timeout === 0) return [];
    return new Promise((resolve) => { resolveOldPoll = resolve; });
  };
  const newTelegram = new FakeTelegram();
  const clients = [oldTelegram, newTelegram];
  const controller = new AppController(
    new FakeGlasses(),
    store,
    {},
    () => clients.shift()!,
  );

  await controller.configure(config, false);
  await controller.configure({ ...config, relayBotToken: `654321:${'B'.repeat(35)}` }, false);
  resolveOldPoll?.([{
    update_id: 99,
    message: {
      message_id: 8,
      date: 1,
      from: { id: 2, is_bot: true, username: 'agent_bot' },
      text: 'stale reply',
    },
  }]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(store.values.get(UPDATE_OFFSET_STORAGE_KEY), '1');
  assert.equal(controller.snapshot().mode, 'ready');
  controller.stopPolling();
});
