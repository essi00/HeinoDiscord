# HeinoDiscord Tutorial

This is the practical user guide for HeinoDiscord.

## What HeinoDiscord Is

HeinoDiscord is a full open-source Discord desktop mod distribution. It uses the
OpenCord engine and keeps the Vencord-compatible plugin API internally so that
existing Vencord plugins still work.

That means some internal names can still say `Vencord`. This is intentional
compatibility, not the product identity. User-facing installer, settings data,
release package, and patch entrypoint are HeinoDiscord.

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

## Why The Compatibility API Is Still Called Vencord

The runtime keeps `globalThis.Vencord` because many existing plugins import or
access that API. Removing it would break the plugin ecosystem.

HeinoDiscord adds:

- HeinoDiscord installer,
- HeinoDiscord data folder,
- HeinoDiscord release package,
- HeinoDiscord patch entrypoint,
- HeinoDiscord plugin registry,
- HeinoDiscord recommended profile.

The compatibility layer remains available so users can still run the existing
plugin ecosystem.
