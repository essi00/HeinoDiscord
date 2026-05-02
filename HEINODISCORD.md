# HeinoDiscord

HeinoDiscord is the user-facing distribution built on the OpenCord engine.
It ships as a source-available package with a Windows installer named
`HeinoDiscord.exe`.
It does not present itself as a Vencord runtime. The primary API is
`globalThis.HeinoDiscord`; `globalThis.Vencord` exists only as a compatibility
adapter for current plugins that still reference that global.

## What The Installer Does

- Installs the recommended custom plugin set.
- Applies the recommended settings profile.
- Builds the local source when Node.js and pnpm are available.
- Patches Discord Stable, Canary, or PTB if installed.
- Registers a local auto-repair task so Discord updates are patched again.
- Keeps everything open source and local-first.

## Install

Run:

```cmd
HeinoDiscord.exe
```

Full tutorial:

```text
HEINODISCORD_TUTORIAL.md
```

Repair only:

```cmd
HeinoDiscord.exe --repair-only
```

Install with the optional LastSeenTracker custom plugin:

```cmd
HeinoDiscord.exe --with-lastseen
```

## Build The Installer

```cmd
pnpm heino:build-installer
```

The built executable is written to:

```text
HeinoDiscord.exe
release/HeinoDiscord/HeinoDiscord.exe
```

## Build A Release Package

```cmd
pnpm heino:package
```

The release package includes source code, the built Discord mod files, the
plugin library, and `HeinoDiscord.exe`.

## Plugin Model

HeinoDiscord uses a source-based plugin model. Plugins live in:

```text
opencord/plugin-library/plugins
```

The static registry lives in:

```text
opencord/cloud/registry.json
```

You can host that registry on GitHub Pages or raw GitHub for a public plugin
catalog. Users still build from source, which keeps the system inspectable.

New HeinoDiscord plugins should use the primary runtime surface:

```text
HeinoDiscord.Api
HeinoDiscord.Plugins
HeinoDiscord.Webpack
```

The Vencord global is kept only as an adapter for existing community plugins.
The HeinoDiscord product pieces now use their own installer, registry, data
folder, release package, patch entrypoint, and public `HeinoDiscord.*` identity.

## LocalChatExporter

`LocalChatExporter` is token-free. It reads the messages Discord has already
loaded into the current channel cache and saves them locally as JSON or Markdown.
It cannot fetch hidden history or bypass permissions; scroll/load more messages
first if you want a larger export.

Commands:

```text
/export-local-chat
/export-local-chat format:markdown
/export-local-chat autoload:true seconds:120
```

The `autoload:true` option keeps everything token-free. It only scrolls the
currently open chat to load more visible history into the local client cache.

For all accessible history across a server, use the bot-based full exporter in
`HEINODISCORD_FULL_EXPORT.md`.

For DMs without a bot, import Discord's official data package with
`pnpm heino:import-data-package -- --input <package.zip>`. See
`HEINODISCORD_DATA_PACKAGE_IMPORT.md`.

## Local Data Plugins

The recommended library now includes local-only data helpers:

- `/chat-stats`
- `/local-search`
- `/collect-links`
- `/attachment-index`
- `/privacy-scan`
- `Support Desk` UI for ticket reminders and support triage
- `/security-scan`
- `/privacy-check`
- `/secure-vault`

They use the loaded in-memory message cache and local browser downloads. They do
not read account tokens, call Discord's history API, or send exports to a cloud
service.

For support work, `SupportQueueGuard` feeds the visible `Support Desk` panel and
chat-bar button. It only tracks servers you add as support workspaces, uses a
local scoring classifier instead of relying only on channel names, filters
non-English-script tickets when English-only mode is active, and gives you
buttons for open, done, snooze, watch, and not-support training.
`ScamShield` warns about fake-support/RAT patterns, and
`CustomerPrivacyGuard` blocks accidental customer-data leaks.
`SecureSupportVault` encrypts local support notes/drafts with WebCrypto AES-GCM;
it is local note encryption, not Discord E2EE.

Inside Discord, HeinoDiscord library plugins are shown under:

```text
User Settings -> HeinoDiscord Settings -> Heino Plugins
User Settings -> HeinoDiscord Settings -> Support Desk
```

The regular `Plugins` tab is kept for the wider compatibility plugin ecosystem.
