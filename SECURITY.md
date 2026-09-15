# Security and privacy model

## Credential handling

Relay Sight asks for the token of a dedicated Telegram G2 relay bot. It never asks for or stores the separate token used by the target agent's Telegram gateway.

The relay token is:

- validated directly against Telegram's `getMe` endpoint;
- persisted only through the Even Hub SDK's app-local phone storage;
- never written into the source, build output, logs, page markup, query parameters, analytics, or a project-operated server;
- placed in the Telegram Bot API URL only when making a direct HTTPS request to `api.telegram.org`.

The setup UI deliberately does not fill the saved token back into the setup field. The field is masked by default, has an explicit temporary reveal control, and clears after validation. Selecting **Forget setup** clears the configuration, Telegram update cursor, and local conversation history from Even local storage.

Outside the Even runtime, the development preview falls back to the browser's local storage. Developers should use a dedicated test bot on shared computers and clear setup after testing.

Local-only storage is not the same as hardware-backed secret storage. A compromised or rooted phone, malicious Even host, device backup, or WebView debugging access may expose app-local data. Users who suspect exposure should revoke the relay token immediately with `@BotFather`, then create or rotate it.

## Data flow

This project has no application server. However, this is not an offline or end-to-end-encrypted path:

1. The glasses send raw microphone PCM to the Even phone app over Bluetooth.
2. Relay Sight locally encodes it as Ogg/Opus and uploads it as a Telegram voice message using the dedicated relay bot.
3. Telegram delivers it to the target agent bot.
4. The user's agent gateway downloads and transcribes the audio, then returns text through Telegram.
5. Relay Sight receives and displays that text.

The app retains up to 200 user/agent turns in Even app-local phone storage so the conversation can be revisited on the phone or paged through on the glasses. **Clear history** removes that transcript without removing the bot setup.

Telegram and the user's agent, model, and speech-to-text infrastructure process conversation content. Their policies and configuration apply.

## Telegram isolation

- Use a dedicated Relay Sight bot token. Never reuse the target agent bot's token.
- Enable Telegram Bot-to-Bot Communication only on the two intended bots.
- Add the Relay Sight bot's numeric ID to the target agent's narrow sender allowlist.
- Do not enable global allow-all behavior on the agent gateway.
- Do not attach a webhook or another polling process to the Relay Sight bot.
- Relay Sight filters incoming updates by the configured target bot username and ignores other senders.
- Relay Sight advances and persists Telegram's update cursor to prevent repeated replies.

The relay bot does not automatically respond to arbitrary received messages. That one-way behavior prevents bot-to-bot reply loops.

## App permissions

The Even manifest requests only:

- `g2-microphone`, used after the user presses to record;
- `network`, restricted to `https://api.telegram.org`.

There are no location, camera, photo-library, or phone-microphone permissions.

## Agent responsibility

Relay Sight carries user input to a tool-capable agent. The agent platform remains responsible for sender authorization, session isolation, prompt-injection defenses, tool permissions, command approvals, and side effects. Keep the relay bot on a narrow allowlist and avoid granting the corresponding agent unnecessary tools.

## Operational limitations

- Telegram retains unconsumed Bot API updates for a limited period.
- Even Hub WebViews can be suspended in the background; polling resumes when the app returns to the foreground.
- A relay token grants control of the dedicated relay bot. It does not directly reveal the target agent bot's separate token.
- Changing a Telegram bot username requires updating Relay Sight's local setup.

## Reporting a vulnerability

Please open a private security advisory in the repository rather than publishing a working credential-exfiltration exploit. Never include a real bot token, private conversation, or agent configuration in a public report.
