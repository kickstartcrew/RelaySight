import test from 'node:test';
import assert from 'node:assert/strict';
import { glassFrame, initialState, parseStoredConversation, reduceState, serializeConversation } from '../src/state';

test('moves through recording, waiting, and paged reply states', () => {
  let state = reduceState(initialState, { type: 'CONFIG_READY' });
  state = reduceState(state, { type: 'RECORDING_STARTED' });
  assert.equal(state.mode, 'recording');
  state = reduceState(state, { type: 'SENDING' });
  state = reduceState(state, { type: 'WAITING' });
  assert.equal(state.mode, 'waiting');
  state = reduceState(state, { type: 'REPLY', text: 'reply '.repeat(200) });
  assert.equal(state.mode, 'reading');
  assert.ok(state.pages.length > 1);
  assert.equal(state.currentPage, state.pages.length - 1);
  state = reduceState(state, { type: 'PREVIOUS_PAGE' });
  assert.equal(state.currentPage, state.pages.length - 2);
  state = reduceState(state, { type: 'NEXT_PAGE' });
  assert.equal(state.currentPage, state.pages.length - 1);
  assert.equal(glassFrame(state).page, `${state.pages.length} / ${state.pages.length}`);
});

test('error state recovers to the previous usable screen', () => {
  const ready = reduceState(initialState, { type: 'CONFIG_READY' });
  const failed = reduceState(ready, { type: 'ERROR', message: 'offline' });
  assert.equal(failed.mode, 'error');
  assert.equal(reduceState(failed, { type: 'DISMISS_ERROR' }).mode, 'ready');
});

test('keeps user and agent turns as a paged conversation and opens at the latest page', () => {
  let state = reduceState(initialState, { type: 'CONFIG_READY' });
  state = reduceState(state, { type: 'USER_MESSAGE', text: 'What is next?', timestamp: 1 });
  state = reduceState(state, { type: 'REPLY', text: 'First response chunk', replaceLast: false });
  state = reduceState(state, { type: 'REPLY', text: 'Complete response', replaceLast: true });
  assert.deepEqual(state.conversation.map(({ role, text }) => ({ role, text })), [
    { role: 'user', text: 'What is next?' },
    { role: 'agent', text: 'Complete response' },
  ]);
  assert.equal(state.currentPage, state.pages.length - 1);
  assert.match(state.pages.map((page) => page.lines.join('\n')).join('\n'), /YOU\nWhat is next\?/);
  assert.match(state.pages.map((page) => page.lines.join('\n')).join('\n'), /AGENT\nComplete response/);
});

test('conversation persistence rejects malformed input, migrates old roles, and round-trips valid turns', () => {
  assert.deepEqual(parseStoredConversation('{bad json'), []);
  const turns = [{ role: 'user' as const, text: 'Hello', timestamp: 42 }];
  assert.deepEqual(parseStoredConversation(serializeConversation(turns)), turns);
  assert.deepEqual(parseStoredConversation('[{"role":"hermes","text":"Legacy reply","timestamp":42}]'), [
    { role: 'agent', text: 'Legacy reply', timestamp: 42 },
  ]);
});
