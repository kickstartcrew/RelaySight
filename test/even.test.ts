import test from 'node:test';
import assert from 'node:assert/strict';
import { OsEventTypeList, validateEvenHubPageContainer, type EvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { CANCEL_RECORDING_MENU_ID, createGlassesPage, describeEvenEvent, EvenGlasses, isCancelRecordingInput, isDoublePress, isPhysicalPress, isTextPress, requestExitOnDoublePress, systemEventType, textEventType } from '../src/even';
import { glassFrame, initialState } from '../src/state';

test('glasses HUD fits the SDK limits and has exactly one event capture region', () => {
  const page = createGlassesPage(glassFrame(initialState));
  assert.deepEqual(validateEvenHubPageContainer(page), { valid: true });
  assert.equal(page.containerTotalNum, 5);
  assert.equal(page.textObject?.length, 5);
  assert.equal(page.textObject?.filter((container) => container.isEventCapture === 1).length, 1);
  assert.deepEqual(page.menuObject?.menuItems?.map((item) => [item.itemID, item.itemName]), [
    [CANCEL_RECORDING_MENU_ID, 'Cancel recording'],
  ]);
  for (const container of page.textObject ?? []) {
    assert.ok((container.xPosition ?? 0) + (container.width ?? 0) <= 576);
    assert.ok((container.yPosition ?? 0) + (container.height ?? 0) <= 288);
    assert.ok((container.containerName?.length ?? 17) <= 16);
  }
});

test('long press and the system-menu action both request recording cancellation', () => {
  const longPress = { sysEvent: { eventType: OsEventTypeList.LONG_PRESS_EVENT } } as EvenHubEvent;
  const release = { sysEvent: { eventType: OsEventTypeList.LONG_PRESS_RELEASE_EVENT } } as EvenHubEvent;
  const menuSelection = { menuItemClickEvent: { itemID: CANCEL_RECORDING_MENU_ID } } as EvenHubEvent;
  const unrelatedMenuSelection = { menuItemClickEvent: { itemID: 2 } } as EvenHubEvent;
  const click = { sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as EvenHubEvent;

  assert.equal(isCancelRecordingInput(longPress), true);
  assert.equal(isCancelRecordingInput(menuSelection), true);
  assert.equal(isCancelRecordingInput(release), false);
  assert.equal(isCancelRecordingInput(unrelatedMenuSelection), false);
  assert.equal(isCancelRecordingInput(click), false);
  assert.equal(isPhysicalPress(longPress), false);
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

test('recognizes double presses from both SDK event envelopes, even before setup', () => {
  const textDouble = { textEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as EvenHubEvent;
  const systemDouble = { sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as EvenHubEvent;
  const namedSystemDouble = { sysEvent: { eventType: 'DOUBLE_CLICK_EVENT' } } as unknown as EvenHubEvent;
  const single = { sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as EvenHubEvent;

  for (const event of [textDouble, systemDouble, namedSystemDouble]) {
    assert.equal(isDoublePress(event), true);
    assert.equal(isPhysicalPress(event), false);
  }
  assert.equal(isDoublePress(single), false);
});

test('a root-page double press requests the SDK system exit dialog', async () => {
  const modes: number[] = [];
  const bridge = {
    shutDownPageContainer: async (mode: number) => {
      modes.push(mode);
      return true;
    },
  } as unknown as EvenAppBridge;
  const glasses = new EvenGlasses(bridge);
  const doublePress = { sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as EvenHubEvent;
  const singlePress = { sysEvent: { eventType: OsEventTypeList.CLICK_EVENT } } as EvenHubEvent;

  assert.equal(requestExitOnDoublePress(singlePress, glasses), undefined);
  assert.equal(await requestExitOnDoublePress(doublePress, glasses), true);
  assert.deepEqual(modes, [1]);
});
