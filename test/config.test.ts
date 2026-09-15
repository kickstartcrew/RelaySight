import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelegramUsername, parseStoredConfig, validateBotToken, validateBotUsername } from '../src/config';

const token = `123456789:${'A'.repeat(35)}`;

test('normalizes and validates Telegram bot credentials', () => {
  assert.equal(normalizeTelegramUsername(' @Personal_Agent_bot '), 'Personal_Agent_bot');
  assert.equal(validateBotUsername('@Personal_Agent_bot'), 'Personal_Agent_bot');
  assert.equal(validateBotToken(` ${token} `), token);
});

test('rejects malformed credentials', () => {
  assert.throws(() => validateBotToken('not-a-token'), /BotFather token/);
  assert.throws(() => validateBotUsername('@person'), /bot.*ending/i);
});

test('stored configuration fails closed when incomplete and migrates the legacy target field', () => {
  assert.equal(parseStoredConfig('{"relayBotToken":"bad"}'), null);
  assert.deepEqual(parseStoredConfig(JSON.stringify({
    relayBotToken: token,
    hermesBotUsername: 'agent_bot',
    relayBotId: 123,
    relayBotUsername: 'glasses_bot',
  })), {
    relayBotToken: token,
    agentBotUsername: 'agent_bot',
    relayBotId: 123,
    relayBotUsername: 'glasses_bot',
  });
});
