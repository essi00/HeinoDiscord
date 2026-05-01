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

Recommended built-in plugins are enabled through:

```text
opencord/profiles/recommended-settings.json
```

## How LocalChatExporter Works

`LocalChatExporter` is a local cache exporter, not a token exporter.

- It registers the slash command `/export-local-chat`.
- It reads the current channel from Discord's already-loaded `MessageStore`.
- It exports only messages currently cached in the running client.
- It writes a local browser download as JSON by default.
- It supports Markdown with `/export-local-chat format:markdown`.
- It includes message ids, channel/guild info, author ids/names, timestamps,
  content, attachment links, embed summaries, and reply references.
- It does not ask for or use a Discord token.
- It does not fetch extra history from Discord's API.

If the export has too few messages, scroll upward in the channel to load more
history first, then run the command again.

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
