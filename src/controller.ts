import { PcmRecorder, pcm16LeToOggOpus } from './audio';
import type { AppConfig } from './config';
import { CONVERSATION_STORAGE_KEY, UPDATE_OFFSET_STORAGE_KEY } from './config';
import type { LocalStore } from './storage';
import { extractAgentReplies, ReplyAccumulator, TelegramClient, type TelegramGateway } from './telegram';
import {
  glassFrame,
  initialState,
  parseStoredConversation,
  reduceState,
  serializeConversation,
  type AppState,
  type GlassFrame,
} from './state';

const MIN_RECORDING_SECONDS = 0.35;

export interface GlassesPort {
  render(frame: GlassFrame): Promise<void>;
  startMicrophone(): Promise<boolean>;
  stopMicrophone(): Promise<boolean>;
}

export interface ControllerCallbacks {
  onState?: (state: AppState, frame: GlassFrame) => void;
  onOffset?: (offset: number) => void;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export class AppController {
  private state: AppState = initialState;
  private config: AppConfig | null = null;
  private telegram: TelegramGateway | null = null;
  private readonly recorder = new PcmRecorder(90);
  private readonly replies = new ReplyAccumulator();
  private offset = 0;
  private pollAbort: AbortController | null = null;
  private polling = false;
  private pollGeneration = 0;
  private recordingGeneration = 0;
  private finishingRecording = false;
  private pendingReplyText: string | null = null;
  private responseTurnStarted = false;

  constructor(
    private readonly glasses: GlassesPort,
    private readonly store: LocalStore,
    private readonly callbacks: ControllerCallbacks = {},
    private readonly telegramFactory: (token: string) => TelegramGateway = (token) => new TelegramClient(token),
  ) {}

  async configure(config: AppConfig, discardOldUpdates: boolean): Promise<void> {
    this.stopPolling();
    this.recordingGeneration += 1;
    if (this.state.mode === 'starting' || this.state.mode === 'recording') {
      await this.glasses.stopMicrophone();
      this.recorder.reset();
    }
    this.config = config;
    this.telegram = this.telegramFactory(config.relayBotToken);
    this.replies.clear();
    this.responseTurnStarted = false;
    const conversation = parseStoredConversation(await this.store.get(CONVERSATION_STORAGE_KEY));
    await this.dispatch({ type: 'LOAD_CONVERSATION', turns: conversation });
    const storedOffset = await this.loadOffset();
    this.offset = storedOffset ?? 0;
    if (discardOldUpdates || storedOffset === null) {
      try {
        await this.moveOffsetToLatest();
      } catch (error) {
        if (discardOldUpdates) throw error;
      }
    }
    await this.dispatch({ type: 'CONFIG_READY' });
    this.startPolling();
  }

  async unconfigure(): Promise<void> {
    this.stopPolling();
    this.recordingGeneration += 1;
    if (this.state.mode === 'starting' || this.state.mode === 'recording') await this.glasses.stopMicrophone();
    this.recorder.reset();
    this.config = null;
    this.telegram = null;
    this.offset = 0;
    await this.store.remove(UPDATE_OFFSET_STORAGE_KEY);
    await this.store.remove(CONVERSATION_STORAGE_KEY);
    await this.dispatch({ type: 'CONFIG_MISSING' });
  }

  async startRecording(): Promise<void> {
    if (!this.config || !this.telegram || !['ready', 'reading'].includes(this.state.mode)) return;
    const generation = ++this.recordingGeneration;
    this.recorder.reset();
    try {
      await this.dispatch({ type: 'RECORDING_REQUESTED' });
      const started = await this.glasses.startMicrophone();
      if (generation !== this.recordingGeneration) {
        if (started) await this.glasses.stopMicrophone();
        return;
      }
      if (!started) throw new Error('The G2 microphone did not start. Check microphone permission.');
      await this.dispatch({ type: 'RECORDING_STARTED' });
    } catch (error) {
      if (generation !== this.recordingGeneration) return;
      await this.fail(error);
    }
  }

  acceptPcm(chunk: Uint8Array): void {
    if (this.state.mode !== 'recording') return;
    const full = this.recorder.append(chunk);
    if (full) void this.stopAndSendRecording();
  }

  async stopAndSendRecording(): Promise<void> {
    if (this.state.mode !== 'recording' || this.finishingRecording || !this.telegram || !this.config) return;
    this.finishingRecording = true;
    try {
      await this.glasses.stopMicrophone();
      const recording = this.recorder.finish();
      if (recording.durationSeconds < MIN_RECORDING_SECONDS) {
        throw new Error('Recording was too short. Press, speak, then press again.');
      }
      this.replies.clear();
      this.pendingReplyText = null;
      await this.dispatch({ type: 'SENDING' });
      const voice = await pcm16LeToOggOpus(recording.pcm);
      await this.telegram.sendVoicePrompt(this.config.agentBotUsername, voice, recording.durationSeconds);
      await this.dispatch({ type: 'USER_MESSAGE', text: `Voice message / ${Math.max(1, Math.round(recording.durationSeconds))}s` });
      this.responseTurnStarted = false;
      await this.dispatch({ type: 'WAITING' });
      await this.showPendingReply();
    } catch (error) {
      this.recorder.reset();
      await this.fail(error);
    } finally {
      this.finishingRecording = false;
    }
  }

  async cancelRecording(): Promise<void> {
    if (this.state.mode !== 'starting' && this.state.mode !== 'recording') return;
    this.recordingGeneration += 1;
    await this.glasses.stopMicrophone();
    this.recorder.reset();
    await this.dispatch({ type: 'CONFIG_READY' });
  }

  async sendTestText(text: string): Promise<void> {
    if (!this.telegram || !this.config) throw new Error('Save the bot setup first.');
    if (!['ready', 'reading', 'error'].includes(this.state.mode)) {
      throw new Error('Wait for the current request to finish.');
    }
    const cleaned = text.trim();
    if (!cleaned) throw new Error('Enter a test message.');
    this.replies.clear();
    this.pendingReplyText = null;
    this.responseTurnStarted = false;
    await this.dispatch({ type: 'SENDING' });
    try {
      await this.telegram.sendText(this.config.agentBotUsername, cleaned);
      await this.dispatch({ type: 'USER_MESSAGE', text: cleaned });
      await this.dispatch({ type: 'WAITING' });
      await this.showPendingReply();
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  async clearConversation(): Promise<void> {
    if (this.state.mode === 'recording' || this.state.mode === 'starting') return;
    this.replies.clear();
    this.pendingReplyText = null;
    this.responseTurnStarted = false;
    await this.store.remove(CONVERSATION_STORAGE_KEY);
    await this.dispatch({ type: 'CLEAR_CONVERSATION' });
  }

  async handlePrimaryPress(): Promise<void> {
    if (this.state.mode === 'recording') return this.stopAndSendRecording();
    if (this.state.mode === 'error') return this.dispatch({ type: 'DISMISS_ERROR' });
    if (this.state.mode === 'ready' || this.state.mode === 'reading') return this.startRecording();
  }

  nextPage(): Promise<void> {
    return this.dispatch({ type: 'NEXT_PAGE' });
  }

  previousPage(): Promise<void> {
    return this.dispatch({ type: 'PREVIOUS_PAGE' });
  }

  snapshot(): AppState {
    return structuredClone(this.state);
  }

  stopPolling(): void {
    this.pollGeneration += 1;
    this.polling = false;
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  startPolling(): void {
    if (this.polling || !this.telegram || !this.config) return;
    this.polling = true;
    const generation = ++this.pollGeneration;
    void this.pollLoop(generation);
  }

  private async moveOffsetToLatest(): Promise<void> {
    if (!this.telegram) return;
    const latest = await this.telegram.getUpdates(-1, 0);
    this.offset = latest.length ? Math.max(...latest.map((update) => update.update_id)) + 1 : 0;
    await this.saveOffset();
  }

  private async pollLoop(generation: number): Promise<void> {
    let failures = 0;
    while (this.polling && generation === this.pollGeneration && this.telegram && this.config) {
      const abort = new AbortController();
      this.pollAbort = abort;
      try {
        const updates = await this.telegram.getUpdates(this.offset, 15, abort.signal);
        if (!this.polling || generation !== this.pollGeneration) break;
        failures = 0;
        if (updates.length > 0) {
          this.offset = Math.max(...updates.map((update) => update.update_id)) + 1;
          await this.saveOffset();
          for (const reply of extractAgentReplies(updates, this.config.agentBotUsername)) {
            const text = this.replies.add(reply);
            if (this.state.mode === 'sending') this.pendingReplyText = text;
            else if (this.state.mode !== 'recording') {
              await this.dispatch({ type: 'REPLY', text, replaceLast: this.responseTurnStarted });
              this.responseTurnStarted = true;
            }
          }
        }
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration || (error instanceof DOMException && error.name === 'AbortError')) break;
        failures += 1;
        if (failures === 3) await this.fail(error);
        await delay(Math.min(1_000 * 2 ** Math.min(failures, 4), 15_000));
      }
    }
    if (generation === this.pollGeneration) {
      this.pollAbort = null;
      this.polling = false;
    }
  }

  private async showPendingReply(): Promise<void> {
    if (!this.pendingReplyText) return;
    const text = this.pendingReplyText;
    this.pendingReplyText = null;
    await this.dispatch({ type: 'REPLY', text, replaceLast: this.responseTurnStarted });
    this.responseTurnStarted = true;
  }

  private async loadOffset(): Promise<number | null> {
    const stored = await this.store.get(UPDATE_OFFSET_STORAGE_KEY);
    if (stored === null || stored === '') return null;
    const value = Number(stored);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  private async saveOffset(): Promise<void> {
    await this.store.set(UPDATE_OFFSET_STORAGE_KEY, String(this.offset));
    this.callbacks.onOffset?.(this.offset);
  }

  private async fail(error: unknown): Promise<void> {
    await this.dispatch({ type: 'ERROR', message: errorMessage(error) });
  }

  private async dispatch(action: Parameters<typeof reduceState>[1]): Promise<void> {
    this.state = reduceState(this.state, action);
    if (action.type === 'USER_MESSAGE' || action.type === 'REPLY') {
      await this.store.set(CONVERSATION_STORAGE_KEY, serializeConversation(this.state.conversation));
    }
    const frame = glassFrame(this.state);
    this.callbacks.onState?.(this.snapshot(), frame);
    await this.glasses.render(frame);
  }
}
