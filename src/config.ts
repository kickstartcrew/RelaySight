// These keys stay stable so existing local previews survive the Relay Sight rename.
export const CONFIG_STORAGE_KEY = 'g2-hermes/config-v1';
export const UPDATE_OFFSET_STORAGE_KEY = 'g2-hermes/update-offset-v1';
export const CONVERSATION_STORAGE_KEY = 'g2-hermes/conversation-v1';

export interface AppConfig {
  relayBotToken: string;
  agentBotUsername: string;
  relayBotId: number;
  relayBotUsername: string;
}

interface StoredAppConfig extends Partial<AppConfig> {
  hermesBotUsername?: string;
}

const BOT_TOKEN_PATTERN = /^\d{5,20}:[A-Za-z0-9_-]{30,}$/;
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function normalizeTelegramUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

export function validateBotToken(value: string): string {
  const token = value.trim();
  if (!BOT_TOKEN_PATTERN.test(token)) {
    throw new Error('Enter the complete BotFather token, such as 123456:ABC…');
  }
  return token;
}

export function validateBotUsername(value: string): string {
  const username = normalizeTelegramUsername(value);
  if (!USERNAME_PATTERN.test(username) || !username.toLowerCase().endsWith('bot')) {
    throw new Error('Enter the agent bot username, including its “bot” ending.');
  }
  return username;
}

export function parseStoredConfig(value: string | null | undefined): AppConfig | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredAppConfig;
    const relayBotToken = validateBotToken(parsed.relayBotToken ?? '');
    const agentBotUsername = validateBotUsername(parsed.agentBotUsername ?? parsed.hermesBotUsername ?? '');
    if (!Number.isSafeInteger(parsed.relayBotId) || Number(parsed.relayBotId) <= 0) return null;
    const relayBotUsername = validateBotUsername(parsed.relayBotUsername ?? '');
    return {
      relayBotToken,
      agentBotUsername,
      relayBotId: Number(parsed.relayBotId),
      relayBotUsername,
    };
  } catch {
    return null;
  }
}

export function serializeConfig(config: AppConfig): string {
  return JSON.stringify(config);
}
