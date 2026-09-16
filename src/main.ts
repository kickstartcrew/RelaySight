import {
  OsEventTypeList,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import { AppController, type GlassesPort } from './controller';
import {
  CONFIG_STORAGE_KEY,
  UPDATE_OFFSET_STORAGE_KEY,
  parseStoredConfig,
  serializeConfig,
  validateBotToken,
  validateBotUsername,
  type AppConfig,
} from './config';
import { describeEvenEvent, EvenGlasses, isCancelRecordingInput, isPhysicalPress, requestExitOnDoublePress, systemEventType, textEventType } from './even';
import { glassFrame, initialState, type GlassFrame } from './state';
import { createBrowserLocalStore, createEvenLocalStore } from './storage';
import { probeTelegramReachability, TelegramClient } from './telegram';
import { createUi, setTokenRevealed, showConfig, showState } from './ui';
import './style.css';

class PreviewGlasses implements GlassesPort {
  async render(_frame: GlassFrame): Promise<void> {}
  async startMicrophone(): Promise<boolean> { return false; }
  async stopMicrophone(): Promise<boolean> { return true; }
}

async function bridgeOrNull(): Promise<EvenAppBridge | null> {
  const nativeRuntime = (window as Window & {
    flutter_inappwebview?: { callHandler?: unknown };
  }).flutter_inappwebview;
  if (typeof nativeRuntime?.callHandler !== 'function') return null;
  return waitForEvenAppBridge();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

async function withSetupTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds = 12_000): Promise<T> {
  const abort = new AbortController();
  const timer = globalThis.setTimeout(() => abort.abort(), milliseconds);
  try {
    return await operation(abort.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${milliseconds / 1_000} seconds.`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root is missing.');
const ui = createUi(root);
const bridge = await bridgeOrNull();
const evenGlasses = bridge ? new EvenGlasses(bridge) : null;
const glasses: GlassesPort = evenGlasses ?? new PreviewGlasses();
const store = bridge ? createEvenLocalStore(bridge) : createBrowserLocalStore();

const controller = new AppController(glasses, store, {
  onState(state, frame) {
    showState(ui, state, frame);
  },
});

let lastPrimaryPressAt = 0;
let suppressPressUntil = 0;
let receivedAudioBytes = 0;
const unsubscribe = bridge?.onEvenHubEvent(handleEvenEvent);

ui.runtimeBadge.textContent = bridge ? 'G2 bridge connected' : 'Browser preview mode';
ui.runtimeBadge.classList.toggle('secure', Boolean(bridge));

ui.tokenVisibilityButton.addEventListener('click', () => {
  setTokenRevealed(ui, ui.tokenInput.type === 'password');
});

if (evenGlasses) {
  try {
    await evenGlasses.initialize(glassFrame(initialState));
  } catch (error) {
    console.error(`G2 display initialization failed: ${messageOf(error)}`);
    ui.status.textContent = messageOf(error);
  }
}

let config = parseStoredConfig(await store.get(CONFIG_STORAGE_KEY));
showConfig(ui, config);
if (config) {
  try {
    await controller.configure(config, false);
  } catch (error) {
    ui.status.textContent = messageOf(error);
  }
} else {
  showState(ui, initialState, glassFrame(initialState));
}

ui.setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    let stage = 'input validation';
    let authenticatedRelay = 'not authenticated';
    let requestedTarget = 'not validated';
    ui.saveButton.disabled = true;
    ui.setupDiagnostic.hidden = true;
    ui.connection.textContent = 'Step 1/5 · Checking input…';
    try {
      const token = validateBotToken(ui.tokenInput.value || config?.relayBotToken || '');
      const agentBotUsername = validateBotUsername(ui.usernameInput.value);
      requestedTarget = `@${agentBotUsername}`;
      stage = 'public Telegram reachability';
      ui.connection.textContent = 'Step 2/5 · Reaching Telegram…';
      const probeStatus = await withSetupTimeout((signal) => probeTelegramReachability(signal));

      const telegram = new TelegramClient(token);
      stage = 'relay-token authentication';
      ui.connection.textContent = 'Step 3/5 · Authenticating relay token…';
      const identity = await withSetupTimeout((signal) => telegram.getMe(signal));
      if (!identity.is_bot || !identity.username) throw new Error('That token does not identify a usable Telegram bot.');
      authenticatedRelay = `@${identity.username} (Telegram ID ${identity.id})`;
      ui.relayIdentity.textContent = `Bot B authenticated from token: ${authenticatedRelay} → Bot A agent destination: ${requestedTarget}`;
      stage = 'relay/target identity separation';
      if (identity.username.toLowerCase() === agentBotUsername.toLowerCase()) {
        throw new Error(
          `Telegram authenticated Bot B's token as @${identity.username}, which is also the Bot A agent destination ${requestedTarget}. Bot A and Bot B must be different usernames.`,
        );
      }

      stage = 'webhook conflict check';
      ui.connection.textContent = 'Step 4/5 · Checking relay bot…';
      const webhook = await withSetupTimeout((signal) => telegram.getWebhookInfo(signal));
      if (webhook.url) {
        throw new Error('The relay bot already has a webhook. Remove it or create a dedicated unused relay bot.');
      }

      stage = 'local save and Telegram cursor initialization';
      ui.connection.textContent = 'Step 5/5 · Saving locally…';
      const nextConfig: AppConfig = {
        relayBotToken: token,
        agentBotUsername,
        relayBotId: identity.id,
        relayBotUsername: identity.username,
      };
      const tokenChanged = config?.relayBotToken !== token;
      await store.set(CONFIG_STORAGE_KEY, serializeConfig(nextConfig));
      config = nextConfig;
      showConfig(ui, config);
      await controller.configure(config, tokenChanged);
      ui.connection.textContent = 'Configured locally';
      ui.setupDiagnostic.textContent = `All checks passed · Telegram probe HTTP ${probeStatus}`;
      ui.setupDiagnostic.hidden = false;
      ui.tokenInput.value = '';
    } catch (error) {
      const reason = messageOf(error);
      ui.connection.textContent = `Setup failed at: ${stage}`;
      ui.relayIdentity.textContent = reason;
      ui.setupDiagnostic.textContent = [
        `Failed step: ${stage}`,
        `Runtime: ${bridge ? 'Even WebView' : 'browser preview'}`,
        `Browser network state: ${navigator.onLine ? 'online' : 'offline'}`,
        `Page origin: ${window.location.origin}`,
        `Authenticated relay: ${authenticatedRelay}`,
        `Requested agent target: ${requestedTarget}`,
        `Error: ${reason}`,
      ].join('\n');
      ui.setupDiagnostic.hidden = false;
      controller.startPolling();
    } finally {
      ui.saveButton.disabled = false;
    }
  })();
});

ui.clearButton.addEventListener('click', () => {
  if (!window.confirm('Forget the locally stored relay-bot token and Telegram state on this phone?')) return;
  void (async () => {
    try {
      await controller.unconfigure();
      await store.remove(CONFIG_STORAGE_KEY);
      await store.remove(UPDATE_OFFSET_STORAGE_KEY);
      config = null;
      showConfig(ui, null);
    } catch (error) {
      ui.status.textContent = messageOf(error);
    }
  })();
});

ui.clearChatButton.addEventListener('click', () => {
  if (!window.confirm('Clear the conversation stored locally on this phone?')) return;
  void controller.clearConversation().catch((error) => {
    ui.status.textContent = messageOf(error);
  });
});

async function runPrimaryPress(origin: string): Promise<void> {
  const before = controller.snapshot().mode;
  if (before !== 'recording') receivedAudioBytes = 0;
  ui.deviceDiagnostic.textContent = `${origin} press recognized · ${before} → requesting action…`;
  try {
    await controller.handlePrimaryPress();
    const after = controller.snapshot().mode;
    ui.deviceDiagnostic.textContent = `${origin} press recognized · ${before} → ${after}`;
  } catch (error) {
    ui.deviceDiagnostic.textContent = `${origin} action failed · ${messageOf(error)}`;
  }
}

function cancelActiveRecording(origin: string): void {
  const mode = controller.snapshot().mode;
  if (mode !== 'starting' && mode !== 'recording') {
    ui.deviceDiagnostic.textContent = `${origin} · no recording to cancel`;
    return;
  }
  ui.deviceDiagnostic.textContent = `${origin} · cancelling recording`;
  void controller.cancelRecording().then(
    (cancelled) => { ui.deviceDiagnostic.textContent = cancelled ? `${origin} · recording discarded` : `${origin} · too late to cancel`; },
    (error: unknown) => { ui.deviceDiagnostic.textContent = `Could not cancel recording · ${messageOf(error)}`; },
  );
}

ui.testForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = ui.testInput.value;
  void controller.sendTestText(text).then(() => { ui.testInput.value = ''; }).catch(() => undefined);
});

function handleEvenEvent(event: EvenHubEvent): void {
  if (event.audioEvent?.audioPcm) {
    const firstAudioFrame = receivedAudioBytes === 0;
    receivedAudioBytes += event.audioEvent.audioPcm.byteLength;
    controller.acceptPcm(event.audioEvent.audioPcm);
    if (firstAudioFrame) {
      ui.deviceDiagnostic.textContent = `${describeEvenEvent(event)} · microphone stream active`;
    }
  }
  const textType = textEventType(event);
  const sysType = systemEventType(event);

  // The root page must always open the system exit dialog on double press,
  // including while recording. Keep resources alive until exit is confirmed.
  const exitRequest = requestExitOnDoublePress(event, evenGlasses);
  if (exitRequest) {
    ui.deviceDiagnostic.textContent = `${describeEvenEvent(event)} · opening exit dialog`;
    void exitRequest.then(
      (accepted) => {
        if (!accepted) ui.deviceDiagnostic.textContent = 'The G2 did not accept the exit-dialog request.';
      },
      (error: unknown) => {
        ui.deviceDiagnostic.textContent = `Could not open exit dialog · ${messageOf(error)}`;
      },
    );
  }
  else if (isCancelRecordingInput(event)) {
    // A held press may open the OS menu instead of reaching the app. Both the
    // raw long-press event and its menu action discard the current recording.
    if (sysType === OsEventTypeList.LONG_PRESS_EVENT) suppressPressUntil = Date.now() + 600;
    cancelActiveRecording(describeEvenEvent(event));
  }
  // CLICK_EVENT (ordinal 0) can arrive undefined on either event envelope.
  else if (isPhysicalPress(event)) {
    const now = Date.now();
    if (now < suppressPressUntil || now - lastPrimaryPressAt < 300) {
      ui.deviceDiagnostic.textContent = `${describeEvenEvent(event)} · duplicate ignored`;
      return;
    }
    lastPrimaryPressAt = now;
    void runPrimaryPress('G2 / R1');
  }
  else if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) void controller.nextPage();
  else if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    if (['starting', 'recording'].includes(controller.snapshot().mode)) {
      cancelActiveRecording('G2 / R1 swipe up');
    }
    else void controller.previousPage();
  }
  else if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
    ui.deviceDiagnostic.textContent = describeEvenEvent(event);
    controller.startPolling();
  }
  else if (sysType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    // This also fires when the system contextual-menu overlay closes. The app
    // remains alive, so polling and an active recording must continue.
    ui.deviceDiagnostic.textContent = describeEvenEvent(event);
  }
  else if (sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT || sysType === OsEventTypeList.SYSTEM_EXIT_EVENT) {
    void controller.shutdown().catch((error) => {
      ui.deviceDiagnostic.textContent = `Exit cleanup failed · ${messageOf(error)}`;
    });
  }
}

window.addEventListener('pagehide', () => {
  void controller.shutdown().catch(() => undefined);
  unsubscribe?.();
});
