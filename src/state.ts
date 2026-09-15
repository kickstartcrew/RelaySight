import { paginateForGlasses, type GlassPage } from './pagination';

export type AppMode = 'unconfigured' | 'ready' | 'starting' | 'recording' | 'sending' | 'waiting' | 'reading' | 'error';

export interface GlassFrame {
  status: string;
  title: string;
  body: string;
  hint: string;
  page: string;
  statusBrightness: number;
}

export interface ConversationTurn {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

export interface AppState {
  mode: AppMode;
  pages: GlassPage[];
  currentPage: number;
  error?: string;
  recoverTo?: 'unconfigured' | 'ready' | 'reading';
  conversation: ConversationTurn[];
}

export type AppAction =
  | { type: 'CONFIG_MISSING' }
  | { type: 'CONFIG_READY' }
  | { type: 'LOAD_CONVERSATION'; turns: ConversationTurn[] }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'USER_MESSAGE'; text: string; timestamp?: number }
  | { type: 'RECORDING_REQUESTED' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'SENDING' }
  | { type: 'WAITING' }
  | { type: 'REPLY'; text: string; replaceLast?: boolean }
  | { type: 'NEXT_PAGE' }
  | { type: 'PREVIOUS_PAGE' }
  | { type: 'ERROR'; message: string }
  | { type: 'DISMISS_ERROR' };

export const initialState: AppState = {
  mode: 'unconfigured',
  pages: [],
  currentPage: 0,
  conversation: [],
};

const MAX_CONVERSATION_TURNS = 200;

function normalizedTurns(turns: readonly unknown[]): ConversationTurn[] {
  const normalized: ConversationTurn[] = [];
  for (const value of turns) {
    if (!value || typeof value !== 'object') continue;
    const turn = value as { role?: unknown; text?: unknown; timestamp?: unknown };
    const role = turn.role === 'hermes' ? 'agent' : turn.role;
    if ((role !== 'user' && role !== 'agent') || typeof turn.text !== 'string' || !turn.text.trim()) continue;
    normalized.push({
      role,
      text: turn.text.trim().slice(0, 8_000),
      timestamp: typeof turn.timestamp === 'number' && Number.isFinite(turn.timestamp) ? turn.timestamp : Date.now(),
    });
  }
  return normalized.slice(-MAX_CONVERSATION_TURNS);
}

function conversationText(turns: ConversationTurn[]): string {
  return turns.map((turn) => `${turn.role === 'user' ? 'YOU' : 'AGENT'}\n${turn.text}`).join('\n\n');
}

function conversationPages(turns: ConversationTurn[]): GlassPage[] {
  return turns.length > 0
    ? paginateForGlasses(conversationText(turns), { maxPages: 300, overflowDirection: 'end' })
    : [];
}

export function parseStoredConversation(value: string | null | undefined): ConversationTurn[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizedTurns(parsed);
  } catch {
    return [];
  }
}

export function serializeConversation(turns: ConversationTurn[]): string {
  return JSON.stringify(normalizedTurns(turns));
}

export function reduceState(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CONFIG_MISSING':
      return { mode: 'unconfigured', pages: [], currentPage: 0, conversation: [] };
    case 'LOAD_CONVERSATION': {
      const conversation = normalizedTurns(action.turns);
      const pages = conversationPages(conversation);
      return { ...state, conversation, pages, currentPage: Math.max(0, pages.length - 1) };
    }
    case 'CLEAR_CONVERSATION':
      return { ...state, mode: state.mode === 'unconfigured' ? 'unconfigured' : 'ready', conversation: [], pages: [], currentPage: 0, error: undefined };
    case 'CONFIG_READY': {
      const pages = conversationPages(state.conversation);
      return { ...state, mode: pages.length > 0 ? 'reading' : 'ready', pages, currentPage: Math.max(0, pages.length - 1), error: undefined };
    }
    case 'USER_MESSAGE': {
      const conversation = normalizedTurns([
        ...state.conversation,
        { role: 'user', text: action.text, timestamp: action.timestamp ?? Date.now() },
      ]);
      const pages = conversationPages(conversation);
      return { ...state, conversation, pages, currentPage: Math.max(0, pages.length - 1) };
    }
    case 'RECORDING_REQUESTED':
      return { ...state, mode: 'starting', error: undefined };
    case 'RECORDING_STARTED':
      return { ...state, mode: 'recording', error: undefined };
    case 'SENDING':
      return { ...state, mode: 'sending', error: undefined };
    case 'WAITING':
      return { ...state, mode: 'waiting', error: undefined };
    case 'REPLY': {
      const nextTurn: ConversationTurn = { role: 'agent', text: action.text, timestamp: Date.now() };
      const conversation = normalizedTurns(action.replaceLast && state.conversation.at(-1)?.role === 'agent'
        ? [...state.conversation.slice(0, -1), nextTurn]
        : [...state.conversation, nextTurn]);
      const pages = conversationPages(conversation);
      return { ...state, mode: 'reading', conversation, pages, currentPage: Math.max(0, pages.length - 1), error: undefined };
    }
    case 'NEXT_PAGE':
      return { ...state, currentPage: Math.min(state.currentPage + 1, Math.max(0, state.pages.length - 1)) };
    case 'PREVIOUS_PAGE':
      return { ...state, currentPage: Math.max(0, state.currentPage - 1) };
    case 'ERROR':
      return {
        ...state,
        mode: 'error',
        error: action.message,
        recoverTo: state.pages.length > 0 ? 'reading' : state.mode === 'unconfigured' ? 'unconfigured' : 'ready',
      };
    case 'DISMISS_ERROR':
      return { ...state, mode: state.recoverTo ?? 'ready', error: undefined, recoverTo: undefined };
  }
}

export function glassFrame(state: AppState): GlassFrame {
  switch (state.mode) {
    case 'unconfigured':
      return { status: '○  SETUP', title: 'WELCOME TO RELAY SIGHT', body: 'Connect your agent from the phone to begin.', hint: 'OPEN EVEN APP', page: 'G2', statusBrightness: 2 };
    case 'ready':
      return { status: '●  READY', title: 'ASK YOUR AGENT', body: 'Press once, then speak naturally.\n\nPress again to send.', hint: 'PRESS OR HOLD  TALK', page: 'PRIVATE', statusBrightness: 4 };
    case 'starting':
      return { status: '○  STARTING', title: 'OPENING MICROPHONES', body: 'One moment...', hint: 'KEEP GLASSES ON', page: '', statusBrightness: 3 };
    case 'recording':
      return { status: '●  LISTENING', title: 'SPEAK NATURALLY', body: '━━━━━━━━━━━━━━━━━━\n\nYour agent is listening.', hint: 'PRESS  SEND  /  DOUBLE  CANCEL', page: '90s MAX', statusBrightness: 4 };
    case 'sending':
      return { status: '○  SENDING', title: 'MESSAGE ON ITS WAY', body: 'Transporting your voice through Telegram...', hint: 'VOICE CAPTURED', page: '', statusBrightness: 3 };
    case 'waiting':
      return { status: '○  THINKING', title: 'YOUR AGENT IS WORKING', body: 'The answer will appear here.', hint: 'PHONE CAN STAY POCKETED', page: '', statusBrightness: 3 };
    case 'error':
      return { status: '▲  ATTENTION', title: 'SOMETHING INTERRUPTED', body: state.error ?? 'Something went wrong.', hint: 'PRESS  CONTINUE', page: '', statusBrightness: 4 };
    case 'reading': {
      const page = state.pages[state.currentPage];
      return {
        status: '●  AGENT',
        // The conversation already labels each speaker. Omitting a redundant
        // body title leaves the full measured text box available for chat.
        title: '',
        body: page?.lines.join('\n') || '(empty reply)',
        hint: page && page.total > 1 ? 'SWIPE  ▲ PREVIOUS  ▼ NEXT' : 'PRESS  ASK AGAIN',
        page: page ? `${page.index + 1} / ${page.total}` : '1 / 1',
        statusBrightness: 4,
      };
    }
  }
}
