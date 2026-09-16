import {
  AudioInputSource,
  CreateStartUpPageContainer,
  EventSourceType,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import type { GlassesPort } from './controller';
import { GLASSES_LAYOUT } from './glasses-layout';
import type { GlassFrame } from './state';

const CONTAINERS = {
  brand: { id: 1, name: 'brand' },
  status: { id: 2, name: 'status' },
  body: { id: 3, name: 'body' },
  hint: { id: 4, name: 'hint' },
  page: { id: 5, name: 'page' },
} as const;

export const CANCEL_RECORDING_MENU_ID = 1;

function bodyContent(frame: GlassFrame): string {
  if (!frame.title) return frame.body;
  return `${frame.title}\n\n${frame.body}`;
}

export function createGlassesPage(frame: GlassFrame): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: 5,
    menuObject: new MenuContainerProperty({
      menuItems: [new MenuItemProperty({ itemID: CANCEL_RECORDING_MENU_ID, itemName: 'Cancel recording' })],
    }),
    textObject: [
      new TextContainerProperty({
        xPosition: GLASSES_LAYOUT.brand.x, yPosition: GLASSES_LAYOUT.brand.y,
        width: GLASSES_LAYOUT.brand.width, height: GLASSES_LAYOUT.brand.height,
        borderWidth: GLASSES_LAYOUT.brand.border, paddingLength: GLASSES_LAYOUT.brand.padding,
        containerID: CONTAINERS.brand.id, containerName: CONTAINERS.brand.name,
        content: 'RELAY SIGHT  /  AGENT', textColor: 3, isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: GLASSES_LAYOUT.status.x, yPosition: GLASSES_LAYOUT.status.y,
        width: GLASSES_LAYOUT.status.width, height: GLASSES_LAYOUT.status.height,
        borderWidth: GLASSES_LAYOUT.status.border, borderColor: 8, borderRadius: 8,
        paddingLength: GLASSES_LAYOUT.status.padding,
        containerID: CONTAINERS.status.id, containerName: CONTAINERS.status.name,
        content: frame.status, textColor: frame.statusBrightness, isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: GLASSES_LAYOUT.body.x, yPosition: GLASSES_LAYOUT.body.y,
        width: GLASSES_LAYOUT.body.width, height: GLASSES_LAYOUT.body.height,
        borderWidth: GLASSES_LAYOUT.body.border, borderColor: 7, borderRadius: 8,
        paddingLength: GLASSES_LAYOUT.body.padding,
        containerID: CONTAINERS.body.id, containerName: CONTAINERS.body.name,
        content: bodyContent(frame), textColor: 4, isEventCapture: 1,
      }),
      new TextContainerProperty({
        xPosition: GLASSES_LAYOUT.hint.x, yPosition: GLASSES_LAYOUT.hint.y,
        width: GLASSES_LAYOUT.hint.width, height: GLASSES_LAYOUT.hint.height,
        borderWidth: GLASSES_LAYOUT.hint.border, paddingLength: GLASSES_LAYOUT.hint.padding,
        containerID: CONTAINERS.hint.id, containerName: CONTAINERS.hint.name,
        content: frame.hint, textColor: 2, isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: GLASSES_LAYOUT.page.x, yPosition: GLASSES_LAYOUT.page.y,
        width: GLASSES_LAYOUT.page.width, height: GLASSES_LAYOUT.page.height,
        borderWidth: GLASSES_LAYOUT.page.border, paddingLength: GLASSES_LAYOUT.page.padding,
        containerID: CONTAINERS.page.id, containerName: CONTAINERS.page.name,
        content: frame.page || ' ', textColor: 2, isEventCapture: 0,
      }),
    ],
  });
}

function withTimeout<T>(operation: Promise<T>, milliseconds = 7_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('The glasses connection timed out.')), milliseconds);
    void operation.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class EvenGlasses implements GlassesPort {
  private renderQueue: Promise<void> = Promise.resolve();
  private readonly content = new Map<number, string>();
  private readonly brightness = new Map<number, number>();
  private started = false;

  constructor(readonly bridge: EvenAppBridge) {}

  async initialize(frame: GlassFrame): Promise<void> {
    if (this.started) return;
    const result = await withTimeout(this.bridge.createStartUpPageContainer(createGlassesPage(frame)));
    if (result !== StartUpPageCreateResult.success) {
      throw new Error(`Could not create the G2 display (code ${result}).`);
    }
    this.started = true;
    this.remember(frame);
  }

  render(frame: GlassFrame): Promise<void> {
    this.renderQueue = this.renderQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.started) return;
        await this.update(CONTAINERS.status, frame.status, frame.statusBrightness);
        await this.update(CONTAINERS.body, bodyContent(frame), 4);
        await this.update(CONTAINERS.hint, frame.hint, 2);
        await this.update(CONTAINERS.page, frame.page || ' ', 2);
      });
    return this.renderQueue;
  }

  startMicrophone(): Promise<boolean> {
    return withTimeout(this.bridge.audioControl(true, AudioInputSource.Glasses));
  }

  stopMicrophone(): Promise<boolean> {
    return withTimeout(this.bridge.audioControl(false));
  }

  requestExit(): Promise<boolean> {
    return withTimeout(this.bridge.shutDownPageContainer(1));
  }

  private remember(frame: GlassFrame): void {
    this.content.set(CONTAINERS.status.id, frame.status);
    this.content.set(CONTAINERS.body.id, bodyContent(frame));
    this.content.set(CONTAINERS.hint.id, frame.hint);
    this.content.set(CONTAINERS.page.id, frame.page || ' ');
    this.brightness.set(CONTAINERS.status.id, frame.statusBrightness);
    this.brightness.set(CONTAINERS.body.id, 4);
    this.brightness.set(CONTAINERS.hint.id, 2);
    this.brightness.set(CONTAINERS.page.id, 2);
  }

  private async update(
    container: { id: number; name: string },
    content: string,
    textColor: number,
  ): Promise<void> {
    if (this.content.get(container.id) === content && this.brightness.get(container.id) === textColor) return;
    const updated = await withTimeout(this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: container.id,
      containerName: container.name,
      content,
      textColor,
    })));
    if (!updated) throw new Error(`The ${container.name} glasses region did not update.`);
    this.content.set(container.id, content);
    this.brightness.set(container.id, textColor);
  }
}

export function textEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  return OsEventTypeList.fromJson(event.textEvent?.eventType);
}

export function systemEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  return OsEventTypeList.fromJson(event.sysEvent?.eventType);
}

/** A double press can arrive on either envelope, depending on the host. */
export function isDoublePress(event: EvenHubEvent): boolean {
  return textEventType(event) === OsEventTypeList.DOUBLE_CLICK_EVENT
    || systemEventType(event) === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

/** Long press is delivered as an app event on some hosts and opens the OS menu on others. */
export function isCancelRecordingInput(event: EvenHubEvent): boolean {
  return systemEventType(event) === OsEventTypeList.LONG_PRESS_EVENT
    || event.menuItemClickEvent?.itemID === CANCEL_RECORDING_MENU_ID;
}

/** Returns no request for unrelated events, so callers can route them normally. */
export function requestExitOnDoublePress(
  event: EvenHubEvent,
  glasses: Pick<EvenGlasses, 'requestExit'> | null,
): Promise<boolean> | undefined {
  if (!glasses || !isDoublePress(event)) return undefined;
  return glasses.requestExit();
}

/** CLICK_EVENT is ordinal zero and is missing on some host/SDK combinations. */
export function isTextPress(event: EvenHubEvent): boolean {
  if (!event.textEvent) return false;
  const type = textEventType(event);
  return type === OsEventTypeList.CLICK_EVENT || type === undefined;
}

export function isPhysicalPress(event: EvenHubEvent): boolean {
  if (isTextPress(event)) return true;
  if (!event.sysEvent) return false;
  const type = systemEventType(event);
  if (type === OsEventTypeList.CLICK_EVENT) return true;

  // Some host builds omit ordinal zero on system events too. In that shape,
  // eventSource is the discriminant that proves this is a glasses/R1 touch.
  const source = EventSourceType.fromJson(event.sysEvent.eventSource);
  return type === undefined && (
    source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R
    || source === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L
    || source === EventSourceType.TOUCH_EVENT_FROM_RING
  );
}

export function describeEvenEvent(event: EvenHubEvent): string {
  if (event.audioEvent) return `G2 audio received · ${event.audioEvent.audioPcm.byteLength} bytes`;
  if (event.textEvent) {
    const type = textEventType(event);
    const name = type === undefined ? 'CLICK_EVENT (zero omitted)' : OsEventTypeList[type];
    return `G2 text event · ${name ?? type}`;
  }
  if (event.sysEvent) {
    const type = systemEventType(event);
    const name = type === undefined ? 'unknown' : OsEventTypeList[type];
    return `G2 system event · ${name ?? type}`;
  }
  return event.menuItemClickEvent ? 'G2 menu selection' : 'Unknown G2 event';
}
