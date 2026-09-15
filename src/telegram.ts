import { normalizeTelegramUsername } from './config';

interface TelegramEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramBotIdentity {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name: string;
}

export interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  from?: TelegramUser;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface AgentReply {
  updateId: number;
  messageId: number;
  date: number;
  text: string;
  edited: boolean;
}

export class TelegramApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

function availableFetch(request?: typeof fetch): typeof fetch | undefined {
  return request ?? (
    typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : undefined
  );
}

function networkFailure(error: unknown): TelegramApiError {
  const rawReason = error instanceof Error ? error.message : '';
  const knownReason = [
    'Failed to fetch',
    'Load failed',
    'Network request failed',
    'NetworkError',
    'Illegal invocation',
  ].find((reason) => rawReason.toLowerCase().includes(reason.toLowerCase()));
  const online = typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline';
  const detail = knownReason ?? (error instanceof Error ? error.name : 'browser error');
  return new TelegramApiError(`Could not reach Telegram (${detail}; browser reports ${online}).`);
}

export async function probeTelegramReachability(signal?: AbortSignal, request?: typeof fetch): Promise<number> {
  const send = availableFetch(request);
  if (!send) throw new TelegramApiError('Could not reach Telegram (this WebView does not expose the fetch API).');
  try {
    const response = await send('https://api.telegram.org/bot0:connectivity-probe/getMe', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal,
    });
    await response.text();
    return response.status;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw networkFailure(error);
  }
}

export interface TelegramGateway {
  getUpdates(offset: number, timeoutSeconds?: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
  sendText(targetUsername: string, text: string, signal?: AbortSignal): Promise<TelegramMessage>;
  sendVoicePrompt(targetUsername: string, oggOpus: Blob, durationSeconds: number, signal?: AbortSignal): Promise<TelegramMessage>;
}

export class TelegramClient implements TelegramGateway {
  private readonly baseUrl: string;
  private readonly request: typeof fetch | undefined;

  constructor(
    token: string,
    request?: typeof fetch,
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.request = availableFetch(request);
  }

  getMe(signal?: AbortSignal): Promise<TelegramBotIdentity> {
    return this.call('getMe', new URLSearchParams(), signal);
  }

  getWebhookInfo(signal?: AbortSignal): Promise<TelegramWebhookInfo> {
    return this.call('getWebhookInfo', new URLSearchParams(), signal);
  }

  getUpdates(offset: number, timeoutSeconds = 15, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const body = new URLSearchParams({
      offset: String(offset),
      timeout: String(timeoutSeconds),
      allowed_updates: JSON.stringify(['message', 'edited_message']),
    });
    return this.call('getUpdates', body, signal);
  }

  sendText(targetUsername: string, text: string, signal?: AbortSignal): Promise<TelegramMessage> {
    const body = new URLSearchParams({
      chat_id: `@${normalizeTelegramUsername(targetUsername)}`,
      text: text.trim(),
    });
    return this.call('sendMessage', body, signal);
  }

  sendVoicePrompt(targetUsername: string, oggOpus: Blob, durationSeconds: number, signal?: AbortSignal): Promise<TelegramMessage> {
    const body = new FormData();
    body.set('chat_id', `@${normalizeTelegramUsername(targetUsername)}`);
    body.set('voice', oggOpus, `g2-voice-${Date.now()}.ogg`);
    body.set('duration', String(Math.max(1, Math.round(durationSeconds))));
    return this.call('sendVoice', body, signal);
  }

  private async call<T>(method: string, body: BodyInit, signal?: AbortSignal): Promise<T> {
    if (!this.request) {
      throw new TelegramApiError('Could not reach Telegram (this WebView does not expose the fetch API).');
    }
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/${method}`, {
        method: 'POST',
        body,
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw networkFailure(error);
    }

    let envelope: TelegramEnvelope<T>;
    try {
      envelope = (await response.json()) as TelegramEnvelope<T>;
    } catch {
      throw new TelegramApiError(`Telegram returned an unreadable response (${response.status}).`, response.status);
    }
    if (!response.ok || !envelope.ok || envelope.result === undefined) {
      throw new TelegramApiError(envelope.description || `Telegram request failed (${response.status}).`, envelope.error_code ?? response.status);
    }
    return envelope.result;
  }
}

export function extractAgentReplies(updates: readonly TelegramUpdate[], agentUsername: string): AgentReply[] {
  const expected = normalizeTelegramUsername(agentUsername).toLowerCase();
  const replies: AgentReply[] = [];
  for (const update of updates) {
    const message = update.edited_message ?? update.message;
    const sender = message?.from?.username?.toLowerCase();
    const text = message?.text ?? message?.caption;
    if (!message || !message.from?.is_bot || sender !== expected || !text?.trim()) continue;
    replies.push({
      updateId: update.update_id,
      messageId: message.message_id,
      date: message.date,
      text: text.trim(),
      edited: Boolean(update.edited_message),
    });
  }
  return replies;
}

export class ReplyAccumulator {
  private readonly messages = new Map<number, { date: number; text: string }>();

  clear(): void {
    this.messages.clear();
  }

  add(reply: AgentReply): string {
    this.messages.set(reply.messageId, { date: reply.date, text: reply.text });
    return [...this.messages.values()]
      .sort((left, right) => left.date - right.date)
      .map(({ text }) => text)
      .join('\n\n');
  }
}
