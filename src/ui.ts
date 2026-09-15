import type { AppConfig } from './config';
import type { AppState, ConversationTurn, GlassFrame } from './state';

export interface UiElements {
  setupForm: HTMLFormElement;
  tokenInput: HTMLInputElement;
  tokenVisibilityButton: HTMLButtonElement;
  usernameInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  talkLabel: HTMLElement;
  clearChatButton: HTMLButtonElement;
  testForm: HTMLFormElement;
  testInput: HTMLInputElement;
  status: HTMLElement;
  connection: HTMLElement;
  relayIdentity: HTMLElement;
  setupDiagnostic: HTMLElement;
  deviceDiagnostic: HTMLElement;
  reply: HTMLElement;
  preview: HTMLElement;
  previewStatus: HTMLElement;
  previewTitle: HTMLElement;
  previewHint: HTMLElement;
  previewPage: HTMLElement;
  runtimeBadge: HTMLElement;
  experience: HTMLElement;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export function createUi(root: HTMLElement): UiElements {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand-lockup" href="#conversation" aria-label="Relay Sight home">
          <span class="brand-mark"><i></i><i></i><b>R</b></span>
          <span><strong>RELAY</strong><small>SIGHT / G2</small></span>
        </a>
        <div class="runtime-pill"><span class="runtime-light"></span><span id="runtime-badge">Connecting to G2…</span></div>
      </header>

      <main>
        <section id="conversation" class="experience" data-mode="unconfigured">
          <section class="chat-panel" aria-label="Conversation with your agent">
            <div class="conversation-head">
              <div><div class="card-label"><span>01</span> AGENT CHAT</div><p>Stored only in this app on your phone · swipe on G2 to browse</p></div>
              <button id="clear-chat" type="button" disabled>Clear history</button>
            </div>
            <div id="reply" class="chat-thread" aria-live="polite">
              <div class="empty-chat"><i></i><strong>No messages yet</strong><span>Press your glasses or R1 to ask your agent anything.</span></div>
            </div>
            <form id="test-form" class="quick-message">
              <label for="test-input">Optional keyboard message</label>
              <div class="message-field">
                <input id="test-input" type="text" maxlength="500" placeholder="Message your agent" disabled />
                <button type="submit" disabled aria-label="Send typed message">↗</button>
              </div>
            </form>
          </section>

          <aside class="command-surface">
            <div class="overline"><span>LIVE SESSION</span><span>G2</span></div>
            <h1>Your agent,<br><em>within sight.</em></h1>
            <p class="lede">Speak through your Even G2. Your agent answers privately through your own Telegram bots.</p>

            <div class="hardware-control" aria-label="Use the physical G2 temple or R1 ring">
              <div class="temple-signal" aria-hidden="true"><span></span><i></i><b></b></div>
              <div class="voice-copy">
                <span class="voice-kicker">PHYSICAL CONTROL</span>
                <strong id="talk-label">Single press to talk</strong>
                <small>Use either G2 temple or R1 · nothing here is tappable</small>
              </div>
            </div>

            <div id="status" class="status" aria-live="polite">Complete setup first.</div>
            <pre id="device-diagnostic" class="device-diagnostic" aria-live="polite">Input monitor · waiting for a G2 press</pre>

            <div class="glass-stage">
              <div class="stage-head"><span>GLASSES OUTPUT</span><span class="live-mark"><i></i> LIVE</span></div>
              <div class="glasses-frame">
                <div class="temple left"></div><div class="temple right"></div>
                <div class="lens-shell">
                  <div class="lens-glow"></div>
                  <div class="g2-region g2-brand">RELAY SIGHT / AGENT</div>
                  <div id="preview-status" class="g2-region g2-status">○ SETUP</div>
                  <div class="g2-region g2-body"><strong id="preview-title">WELCOME TO RELAY SIGHT</strong><pre id="preview">Connect your agent from the phone to begin.</pre></div>
                  <div id="preview-hint" class="g2-region g2-hint">OPEN EVEN APP</div>
                  <div id="preview-page" class="g2-region g2-page">G2</div>
                </div>
              </div>
              <div class="gesture-strip"><span><b>1×</b> record / send</span><span><b>HOLD</b> talk</span><span><b>↕</b> history</span></div>
            </div>
          </aside>
        </section>

        <section class="setup-card">
          <div class="setup-intro">
            <div class="card-label"><span>02</span> PRIVATE CONNECTION</div>
            <h2>Your credentials stay<br>on this phone.</h2>
            <p>No relay server, account, analytics, or project database. The app communicates directly with Telegram’s Bot API.</p>
            <div class="privacy-row"><span>LOCAL STORAGE</span><span>DIRECT API</span><span>OPEN SOURCE</span></div>
          </div>

          <div class="setup-panel">
            <div class="route-map" aria-label="Telegram bot route">
              <div><small>BOT B</small><strong>G2 SENDER</strong></div><b>→</b><div><small>BOT A</small><strong>AGENT BOT</strong></div>
            </div>
            <form id="setup-form" autocomplete="off">
              <div class="setup-field">
                <div class="field-label"><label for="token">New G2 bot token</label><small>Bot B</small></div>
                <div class="secret-field">
                  <input id="token" name="token" type="password" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="123456789:ABC…" aria-describedby="token-help" />
                  <button id="token-visibility" type="button" aria-controls="token" aria-pressed="false">Show</button>
                </div>
                <em id="token-help">Masked by default and cleared from the field after validation.</em>
              </div>
              <label>
                <span>Target agent bot username <small>Bot A</small></span>
                <input id="username" name="username" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="@my_agent_bot" required />
              </label>
              <div class="button-row">
                <button id="save" class="primary" type="submit">Validate & connect</button>
                <button id="clear" class="ghost-danger" type="button">Forget setup</button>
              </div>
            </form>
            <div class="connection-panel" aria-live="polite">
              <div><i></i><strong id="connection">Not configured</strong></div>
              <span id="relay-identity">Enter Bot B’s token and the Bot A username connected to your agent.</span>
              <pre id="setup-diagnostic" class="setup-diagnostic" hidden></pre>
            </div>
          </div>
        </section>

        <details class="requirements-card">
          <summary><span>One-time Telegram & agent requirements</span><b>+</b></summary>
          <ol>
            <li>Enable <strong>Bot-to-Bot Communication</strong> in BotFather for both bots.</li>
            <li>Add the displayed Bot B ID to your agent platform’s Telegram allowlist.</li>
            <li>Keep your agent’s speech-to-text enabled, then restart its gateway.</li>
            <li>Send a quiet-mode text first, then test glasses audio.</li>
          </ol>
        </details>
      </main>

      <footer><span>RELAY SIGHT / G2</span><span>No analytics · no custom backend · MIT</span></footer>
    </div>
  `;

  return {
    setupForm: required(root, '#setup-form'),
    tokenInput: required(root, '#token'),
    tokenVisibilityButton: required(root, '#token-visibility'),
    usernameInput: required(root, '#username'),
    saveButton: required(root, '#save'),
    clearButton: required(root, '#clear'),
    talkLabel: required(root, '#talk-label'),
    clearChatButton: required(root, '#clear-chat'),
    testForm: required(root, '#test-form'),
    testInput: required(root, '#test-input'),
    status: required(root, '#status'),
    connection: required(root, '#connection'),
    relayIdentity: required(root, '#relay-identity'),
    setupDiagnostic: required(root, '#setup-diagnostic'),
    deviceDiagnostic: required(root, '#device-diagnostic'),
    reply: required(root, '#reply'),
    preview: required(root, '#preview'),
    previewStatus: required(root, '#preview-status'),
    previewTitle: required(root, '#preview-title'),
    previewHint: required(root, '#preview-hint'),
    previewPage: required(root, '#preview-page'),
    runtimeBadge: required(root, '#runtime-badge'),
    experience: required(root, '#conversation'),
  };
}

export function showConfig(ui: UiElements, config: AppConfig | null): void {
  ui.usernameInput.value = config ? `@${config.agentBotUsername}` : '';
  ui.tokenInput.value = '';
  setTokenRevealed(ui, false);
  ui.tokenInput.placeholder = config ? 'Token stored locally — enter only to replace' : '123456789:ABC…';
  ui.clearButton.disabled = !config;
  ui.connection.textContent = config ? 'Connected locally' : 'Not configured';
  ui.connection.closest('div')?.classList.toggle('connected', Boolean(config));
  ui.setupDiagnostic.hidden = true;
  ui.relayIdentity.textContent = config
    ? `@${config.relayBotUsername} · ${config.relayBotId} → @${config.agentBotUsername}`
    : 'Enter Bot B’s token and the Bot A username connected to your agent.';
}

export function setTokenRevealed(ui: UiElements, revealed: boolean): void {
  ui.tokenInput.type = revealed ? 'text' : 'password';
  ui.tokenVisibilityButton.textContent = revealed ? 'Hide' : 'Show';
  ui.tokenVisibilityButton.setAttribute('aria-pressed', String(revealed));
}

export function showState(ui: UiElements, state: AppState, frame: GlassFrame): void {
  ui.experience.dataset.mode = state.mode;
  ui.previewStatus.textContent = frame.status;
  ui.previewTitle.textContent = frame.title;
  ui.preview.textContent = frame.body;
  ui.previewHint.textContent = frame.hint;
  ui.previewPage.textContent = frame.page;

  const configured = state.mode !== 'unconfigured';
  ui.testInput.disabled = !configured || ['starting', 'sending', 'waiting', 'recording'].includes(state.mode);
  const testButton = ui.testForm.querySelector<HTMLButtonElement>('button');
  if (testButton) testButton.disabled = ui.testInput.disabled;

  const labels: Record<AppState['mode'], string> = {
    unconfigured: 'Connect your two Telegram bots to begin.',
    ready: 'Ready. Press either temple once to start.',
    starting: 'Opening the G2 microphone array…',
    recording: 'Listening through the G2 microphone array.',
    sending: 'Encoding and sending your voice…',
    waiting: 'Your agent is preparing a response…',
    reading: `Response page ${state.currentPage + 1} of ${state.pages.length}.`,
    error: state.error ?? 'Something went wrong.',
  };
  ui.status.textContent = labels[state.mode];

  ui.talkLabel.textContent = state.mode === 'recording' ? 'Press again to send' : 'Single press to talk';
  ui.clearChatButton.disabled = state.conversation.length === 0 || ['starting', 'recording', 'sending'].includes(state.mode);
  renderConversation(ui.reply, state.conversation);
}

function renderConversation(root: HTMLElement, turns: ConversationTurn[]): void {
  if (turns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    const mark = document.createElement('i');
    const title = document.createElement('strong');
    title.textContent = 'No messages yet';
    const detail = document.createElement('span');
    detail.textContent = 'Press your glasses or R1 to ask your agent anything.';
    empty.append(mark, title, detail);
    root.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const turn of turns) {
    const message = document.createElement('article');
    message.className = `chat-message ${turn.role}`;
    const meta = document.createElement('div');
    const author = document.createElement('strong');
    author.textContent = turn.role === 'user' ? 'YOU' : 'AGENT';
    const time = document.createElement('time');
    time.dateTime = new Date(turn.timestamp).toISOString();
    time.textContent = new Date(turn.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    meta.append(author, time);
    const body = document.createElement('p');
    body.textContent = turn.text;
    message.append(meta, body);
    fragment.append(message);
  }
  root.replaceChildren(fragment);
  root.scrollTop = root.scrollHeight;
}
