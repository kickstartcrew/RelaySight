# Relay Sight

An open-source, serverless Even Realities G2 voice client for AI agents connected to Telegram.

Press the glasses or R1 to record a question, press again to send it, and read the complete locally retained conversation on the G2 display. Replies and earlier turns are split into full-height, swipeable pages measured against the G2 firmware font.

## How it works

```text
Even G2 microphone
        │ raw PCM over Bluetooth
        ▼
Even phone app / local WebView
        │ Ogg/Opus voice message through Telegram
        ▼
Dedicated G2 relay bot  ──────────►  Agent's Telegram bot
        ▲                                  │
        └────────── text reply ────────────┘
```

There is no project-operated broker, cloud database, analytics service, or custom backend. The dedicated relay-bot token is stored with the Even Hub SDK's app-local storage on the user's phone. Telegram necessarily receives the messages and audio it transports, and the user's agent host receives the audio for transcription.

The ordinary browser preview uses that browser's local storage because the Even bridge is not present. Use a dedicated test bot when developing on a shared computer, and choose **Forget setup** when finished.

## Compatible agents

Relay Sight is transport, not an agent runtime. It can work with Hermes Agent, OpenClaw, or another Telegram-connected agent when:

- the agent already receives messages through its own Telegram bot;
- Telegram Bot-to-Bot Communication is enabled for both bots;
- the dedicated Relay Sight bot ID is authorized by the agent's Telegram allowlist;
- the agent can transcribe Telegram voice messages and return a text response.

The two setup fields always refer to different bots:

```text
Bot B (new G2 relay): enter its token; Relay Sight detects its username
Bot A (your agent):   enter the @username already connected to your agent
```

Relay Sight acts as Bot B and addresses messages to Bot A. Your agent keeps using Bot A's token; it only authorizes Bot B's numeric Telegram ID as a sender.

## Prerequisites

- Even G2 glasses and the Even Realities phone app 2.2.10 or newer.
- Node.js 22.12 or newer for development.
- An AI agent already working through a Telegram bot.
- A second, otherwise-unused Telegram bot created with `@BotFather` for Relay Sight.
- An agent gateway that accepts authorized bot-origin messages.

## One-time setup

1. Create a second bot with `@BotFather`. This is **Bot B**, the dedicated G2 relay bot.
2. In `@BotFather`, enable **Bot-to-Bot Communication** for Bot A and Bot B.
3. Open Relay Sight on the phone and enter:
   - Bot B's BotFather token;
   - Bot A's `@username`.
4. Relay Sight validates both identities and displays Bot B's numeric Telegram ID.
5. Add that ID to your agent gateway's Telegram sender allowlist:
   - **Hermes Agent:** append it to `TELEGRAM_ALLOWED_USERS` while keeping your personal Telegram ID.
   - **OpenClaw:** add it to the relevant account's `channels.telegram.allowFrom` list. See the [OpenClaw Telegram documentation](https://github.com/openclaw/openclaw/blob/main/docs/channels/telegram.md).
6. Ensure voice-message transcription is enabled on the agent host, then restart its gateway.
7. Send a typed connection test from Relay Sight before testing G2 audio.

Do not configure a webhook or run another `getUpdates` client for Bot B. Relay Sight checks for a conflicting webhook during setup.

## G2 controls

- **Single press:** start recording.
- **Single press again:** stop and send.
- **Double press from any screen:** open the system exit confirmation dialog.
- **Swipe up while recording:** cancel without sending.
- **Long press while recording:** cancel if the host delivers the long-press event to the app. If the system menu opens instead (tap, then hold), select **Cancel recording** there.
- **Swipe down:** next conversation page.
- **Swipe up while reading:** previous conversation page.

Recordings stop automatically at 90 seconds. Relay Sight encodes the G2's mono 16 kHz PCM locally into an Ogg/Opus Telegram voice message. Transcription happens through the agent's configured speech-to-text provider.

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Run the official simulator against the Vite server:

```bash
npx @evenrealities/evenhub-simulator http://localhost:5173
```

For real-glasses Local Testing, keep the Vite server running and scan a LAN URL:

```bash
evenhub qr --url "http://YOUR-LAN-IP:5173"
```

Local Testing provides real temple input and the real G2 microphone. If the phone was backgrounded or hot reload stopped, scan the QR again to force a clean WebView reload. A visible page can otherwise be stale even though the dev server is healthy.

Build the production web bundle:

```bash
npm run build
```

Build and package an installable Even Hub package:

```bash
npm run pack
```

The package is written to `relay-sight.ehpk`.

## Project structure

```text
src/
  audio.ts           PCM recording and local Ogg/Opus encoding
  config.ts          strict local configuration validation
  controller.ts      conversation, polling, and recording orchestration
  even.ts            Even Hub display and microphone bridge
  glasses-layout.ts  shared 576×288 display geometry
  pagination.ts      pixel-accurate glasses text formatting
  state.ts           conversation and display state
  storage.ts         Even app-local storage adapter
  telegram.ts        narrow Telegram Bot API client
  ui.ts              phone setup and diagnostics UI
  main.ts            app bootstrap and lifecycle wiring
test/                 unit and integration-style tests
app.json              Even Hub permissions and packaging manifest
```

## Privacy summary

- Token persistence: Even app-local phone storage in the G2 runtime; browser local storage in development preview.
- Conversation persistence: the latest 200 user/agent turns in the same local storage; clearable from the conversation header.
- Token network destination: `https://api.telegram.org` only.
- Voice destination: Telegram, then the user's agent host.
- App-operated servers: none.
- Analytics or telemetry: none.
- Build-time secrets: none.

See [SECURITY.md](SECURITY.md) for the full threat model and responsible disclosure guidance.

## License

MIT. Runtime dependency notices are included in [`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt) and in every production package.
