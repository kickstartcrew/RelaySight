import test from 'node:test';
import assert from 'node:assert/strict';
import { OsEventTypeList, validateEvenHubPageContainer, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { createGlassesPage, describeEvenEvent, isPhysicalPress, isTextPress, systemEventType, textEventType } from '../src/even';
import { glassFrame, initialState } from '../src/state';

test('glasses HUD fits the SDK limits and has exactly one event capture region', () => {
  const page = createGlassesPage(glassFrame(initialState));
  assert.deepEqual(validateEvenHubPageContainer(page), { valid: true });
  assert.equal(page.containerTotalNum, 5);
  assert.equal(page.textObject?.length, 5);
  assert.equal(page.textObject?.filter((container) => container.isEventCapture === 1).length, 1);
  for (const container of page.textObject ?? []) {
    assert.ok((container.xPosition ?? 0) + (container.width ?? 0) <= 576);
    assert.ok((container.yPosition ?? 0) + (container.height ?? 0) <= 288);
    assert.ok((container.containerName?.length ?? 17) <= 16);
  }
});

test('recognizes a normal text-container press', () => {
  const event = { textEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as EvenHubEvent;
  assert.equal(textEventType(event), OsEventTypeList.CLICK_EVENT);
  assert.equal(isTextPress(event), true);
  assert.match(describeEvenEvent(event), /CLICK_EVENT/);
});

test('recognizes CLICK_EVENT when ordinal zero is omitted by the host', () => {
  const event = { textEvent: { containerID: 3, containerName: 'body' } } as EvenHubEvent;
  assert.equal(textEventType(event), undefined);
  assert.equal(isTextPress(event), true);
  assert.match(describeEvenEvent(event), /zero omitted/);
});

test('normalizes explicit system event values without treating an empty system event as a click', () => {
  const click = { sysEvent: { eventType: 'CLICK_EVENT' } } as unknown as EvenHubEvent;
  const empty = { sysEvent: {} } as EvenHubEvent;
  assert.equal(systemEventType(click), OsEventTypeList.CLICK_EVENT);
  assert.equal(isTextPress(empty), false);
  assert.equal(isPhysicalPress(empty), false);
});

test('recognizes an ordinal-zero system press from glasses or R1 by its source', () => {
  for (const eventSource of [1, 2, 3]) {
    const event = { sysEvent: { eventSource } } as EvenHubEvent;
    assert.equal(isPhysicalPress(event), true);
  }
});
