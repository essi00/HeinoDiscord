# Open Vencord Plugin Library

Source-based Vencord userplugin library with an opt-in installer. It copies only
the plugins you select into `Vencord/src/userplugins`, then optionally rebuilds
and repatches Discord.

This avoids the usual problem where every local file in `src/userplugins` gets
compiled into your Vencord build.

## Quick Install

From PowerShell:

```powershell
cd "$env:USERPROFILE\VencordPluginLibrary"
.\scripts\install.ps1 -Recommended -Build -Patch
```

Install specific plugins:

```powershell
.\scripts\install.ps1 -Plugins QuickTemplates,LinkSafety,TranslatorPro -Build -Patch
```

Install only the selected library plugins and remove other local userplugins:

```powershell
.\scripts\install.ps1 -Recommended -PruneUserPlugins -Build -Patch
```

Install advanced plugins too:

```powershell
.\scripts\install.ps1 -All -IncludeAdvanced -Build -Patch
```

## Included Plugins

- `QuickTemplates`: local support/chat templates. Type `;;hello` or use `/qt`.
- `LinkSafety`: blocks obvious phishing-style links before sending.
- `LocalChatExporter`: token-free export of the current cached channel via `/export-local-chat`.
- `TranslatorPro`: extended translation tools.
- `LastSeenTracker`: local presence/last-seen tracking. Advanced/privacy-sensitive.
- `SilentEdit`: advanced opt-in message edit workflow.
- `SilentDelete`: advanced opt-in message deletion workflow.
- `AntiLog`: compatibility placeholder.

## Safety Model

The library is intentionally source-based. Users can inspect every plugin before
installing it. The installer never downloads code and never enables every local
plugin automatically.

Advanced plugins are not installed by `-Recommended`. They require either an
explicit plugin name or `-IncludeAdvanced`.

`LocalChatExporter` intentionally has no token field. It exports only messages
already loaded in your running Discord client.

## Publishing

This folder is ready to become a public GitHub repo:

```powershell
git init
git add .
git commit -m "Initial open Vencord plugin library"
```

After pushing, users can clone the repo and run the installer.
