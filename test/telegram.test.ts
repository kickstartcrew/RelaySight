import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAgentReplies, probeTelegramReachability, ReplyAccumulator, TelegramClient } from '../src/telegram';

const token = `123456789:${'A'.repeat(35)}`;

test('TelegramClient sends text directly to the agent bot username', async () => {
  let calledUrl = '';
  let calledBody: BodyInit | null | undefined;
  const request: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledBody = init?.body;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1, date: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  await new TelegramClient(token, request).sendText('@agent_bot', 'hello');
  assert.match(calledUrl, /\/sendMessage$/);
  assert.ok(calledBody instanceof URLSearchParams);
  assert.equal(calledBody.get('chat_id'), '@agent_bot');
  assert.equal(calledBody.get('text'), 'hello');
});

test('Telegram errors never include the secret URL or token', async () => {
  const request: typeof fetch = async () => { throw new TypeError('Load failed'); };
  await assert.rejects(
    () => new TelegramClient(token, request).getMe(),
    (error: Error) => !error.message.includes(token)
      && /Could not reach Telegram/.test(error.message)
      && /Load failed/.test(error.message),
  );
});

test('connectivity probe uses a credential-free GET and accepts an HTTP error response', async () => {
  let calledUrl = '';
  let calledMethod = '';
  const request: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledMethod = init?.method ?? '';
    return new Response('{"ok":false}', { status: 401 });
  };
  assert.equal(await probeTelegramReachability(undefined, request), 401);
  assert.equal(calledMethod, 'GET');
  assert.equal(calledUrl.includes(token), false);
  assert.match(calledUrl, /connectivity-probe/);
});

test('extractAgentReplies accepts only the configured bot and includes edits', () => {
  const replies = extractAgentReplies([
    { update_id: 1, message: { message_id: 10, date: 1, from: { id: 2, is_bot: true, username: 'Agent_Bot' }, text: 'first' } },
    { update_id: 2, edited_message: { message_id: 10, date: 1, from: { id: 2, is_bot: true, username: 'Agent_Bot' }, text: 'final' } },
    { update_id: 3, message: { message_id: 11, date: 2, from: { id: 3, is_bot: true, username: 'Other_Bot' }, text: 'ignore' } },
    { update_id: 4, message: { message_id: 12, date: 3, from: { id: 4, is_bot: false, username: 'Agent_Bot' }, text: 'ignore' } },
  ], '@agent_bot');
  assert.deepEqual(replies.map((reply) => reply.text), ['first', 'final']);
  const accumulator = new ReplyAccumulator();
  assert.equal(accumulator.add(replies[0]!), 'first');
  assert.equal(accumulator.add(replies[1]!), 'final');
});
