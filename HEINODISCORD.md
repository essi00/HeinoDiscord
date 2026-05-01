# HeinoDiscord

HeinoDiscord is the user-facing distribution built on the OpenCord engine.
It ships as a source-available package with a Windows installer named
`HeinoDiscord.exe`.
The runtime exposes `globalThis.HeinoDiscord` as the primary API and keeps
`globalThis.Vencord` only as a compatibility bridge for existing plugins.

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

New plugins should use:

```text
HeinoDiscord.Api
HeinoDiscord.Plugins
HeinoDiscord.Webpack
```
