# OpenCord

OpenCord is an independent GPL distribution built on top of the
Vencord-compatible plugin architecture.

The goal is:

- Keep compatibility with existing Vencord plugins.
- Ship a curated source-based plugin library.
- Let users create and install their own plugins without automatically compiling
  every random local file.
- Keep credentials out of plugins. OpenCord does not include token grabbers or
  token-based account automation.

## Internal Compatibility

For compatibility, the runtime still exposes the `Vencord.*` plugin API. That
lets existing plugins work without rewriting imports or globals.

Publicly, this distribution is called OpenCord. Internally, compatibility names
remain where changing them would break plugins.

## Common Commands

Install curated plugins:

```powershell
pnpm opencord:plugins -- -Recommended -PruneUserPlugins
```

Create a new plugin:

```powershell
pnpm opencord:create-plugin -- MyPlugin
```

Build and patch Discord:

```powershell
pnpm opencord:patch
```

Enable automatic repair after Discord updates:

```powershell
pnpm opencord:register-auto-repatch
```

Full install of selected plugins plus patch:

```powershell
pnpm opencord:plugins -- -Plugins "QuickTemplates,LinkSafety,TranslatorPro,LocalChatExporter,LastSeenTracker" -PruneUserPlugins -Build -Patch
```

Build the HeinoDiscord installer:

```powershell
pnpm heino:build-installer
```

Build a release package:

```powershell
pnpm heino:package
```

## Plugin Library

The built-in plugin library lives in:

```text
opencord/plugin-library
```

Its `manifest.json` is the source of truth for installable plugins.

## License

OpenCord is GPL-3.0-or-later and includes code derived from Vencord. Keep the
license, copyright notices, and source availability intact when distributing.
