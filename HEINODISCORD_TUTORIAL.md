# HeinoDiscord Tutorial

This is the practical user guide for HeinoDiscord.

## What HeinoDiscord Is

HeinoDiscord is a full open-source Discord desktop mod distribution. It uses the
independent OpenCord engine and exposes `globalThis.HeinoDiscord` as the primary
runtime API.

Existing Vencord plugins still work through a compatibility adapter for the
current plugin format and the legacy `globalThis.Vencord` bridge. New plugins
should use `HeinoDiscord`.

## Install For Yourself

Open a terminal:

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
HeinoDiscord.exe
```

The installer will:

- install recommended HeinoDiscord plugins,
- apply the recommended settings profile,
- build the local source,
- patch Discord,
- register automatic repair for Discord updates,
- start Discord.

## Repair After Discord Updates

Normally the task `HeinoDiscord Auto Repair` checks every few minutes and only
patches when Discord has replaced the patched `app.asar`.

Manual repair:

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
HeinoDiscord.exe --repair-only
```

This no longer closes Discord unless a patch is actually needed.

## Plugins Included By Default

Recommended custom plugins:

- `QuickTemplates`
- `LinkSafety`
- `TranslatorPro`
- `LocalChatExporter`
- `ChatStats`
- `LocalSearch`
- `LinkCollector`
- `AttachmentIndex`
- `PrivacyScan`
- `SupportQueueGuard`
- `ScamShield`
- `CustomerPrivacyGuard`
- `SecureSupportVault`

These HeinoDiscord library plugins are managed in Discord under:

```text
User Settings -> HeinoDiscord Settings -> Heino Plugins
User Settings -> HeinoDiscord Settings -> Support Desk
```

The regular `Plugins` tab is now reserved for the broader compatibility plugin
ecosystem.

Recommended built-in plugins are enabled through:

```text
opencord/profiles/recommended-settings.json
```

## How LocalChatExporter Works

`LocalChatExporter` is a local cache exporter, not a token exporter.

- It registers the slash command `/export-local-chat`.
- It reads the current channel from Discord's already-loaded `MessageStore`.
- It exports only messages currently cached in the running client.
- With `autoload:true`, it repeatedly scrolls upward in the visible chat first
  so Discord loads more local history before the export.
- It writes a local browser download as JSON by default.
- It supports Markdown with `/export-local-chat format:markdown`.
- It includes message ids, channel/guild info, author ids/names, timestamps,
  content, attachment links, embed summaries, and reply references.
- It does not ask for or use a Discord token.
- It does not fetch extra history from Discord's API.

If the export has too few messages, scroll upward in the channel to load more
history first, then run the command again.

Deep local export:

```text
/export-local-chat autoload:true seconds:120
```

Keep the target DM/channel open while it runs. The autoload step now runs for
the requested duration and uses repeated fast scroll bursts instead of stopping
after a few stable cache checks.

For a full server archive, use the bot-based exporter:

```powershell
cd "C:\Users\Joachim Csida\OpenCord"
$env:HEINODISCORD_EXPORT_BOT_TOKEN = "YOUR_BOT_TOKEN"
pnpm heino:export-history -- --guild-id YOUR_GUILD_ID
```

Full guide:

```text
HEINODISCORD_FULL_EXPORT.md
```

For DMs without a bot, use Discord's official data package import:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\discord-data-package.zip"
```

That path does not use a token, but Discord's package only includes messages
sent by your account. It writes local HTML, JSON, and Markdown archives by
default.

## Local Data Tools

The recommended profile also includes token-free tools for loaded Discord data:

```text
/chat-stats
/local-search query:invoice format:markdown
/collect-links format:csv
/attachment-index format:json
/privacy-scan
/privacy-scan export:true format:markdown
/security-scan
/privacy-check text:customer@example.com
/secure-vault action:unlock text:<passphrase>
```

For support tickets, use the visible Support Desk instead of a slash command:

```text
User Settings -> HeinoDiscord Settings -> Support Desk
```

It has its own chat-bar button and only tracks servers you add as support
workspaces. Keep `English only` enabled if you do not handle Chinese or other
non-English-script tickets. `Watch` trains the current channel as support;
`Not support` trains the classifier to ignore it.

These tools run inside the client, inspect only messages already loaded in the
current channel or DM, and create local browser downloads when exporting. They
do not use a user token or upload chat data.

Security note: `SecureSupportVault` encrypts only local notes/drafts stored by
HeinoDiscord. It cannot make normal Discord messages end-to-end encrypted and it
cannot protect decrypted text from malware that is already running on your PC.

## Enable Optional LastSeenTracker

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
HeinoDiscord.exe --with-lastseen
```

## Create A Plugin

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
pnpm opencord:create-plugin -- MyPlugin
```

Edit:

```text
opencord/plugin-library/plugins/MyPlugin/index.tsx
```

Install it:

```cmd
pnpm opencord:plugins -- -Plugins "MyPlugin" -Build -Patch
```

## Build A Release

```cmd
cd "C:\Users\Joachim Csida\OpenCord"
pnpm heino:package
```

Release output:

```text
release/HeinoDiscord
release/HeinoDiscord-release.zip
```

Upload `HeinoDiscord-release.zip` to GitHub Releases.

## Why There Is Still A Vencord Bridge

The runtime exposes `globalThis.HeinoDiscord` first. It also keeps
`globalThis.Vencord` as a compatibility bridge because many existing plugins
import or access that API. Removing it would break the existing plugin ecosystem.

HeinoDiscord adds:

- HeinoDiscord installer,
- HeinoDiscord data folder,
- HeinoDiscord release package,
- HeinoDiscord patch entrypoint,
- HeinoDiscord plugin registry,
- HeinoDiscord recommended profile,
- HeinoDiscord source maps and resource protocol.

Use `HeinoDiscord.Api.*`, `HeinoDiscord.Plugins.*`, and
`HeinoDiscord.Webpack.*` for new code. The compatibility layer remains available
so users can still run the existing plugin ecosystem.
