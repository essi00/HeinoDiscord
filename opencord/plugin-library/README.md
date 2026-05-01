# HeinoDiscord Open Plugin Library

Source-based HeinoDiscord plugin library with an opt-in installer. It copies
only the plugins you select into `src/userplugins`, then optionally rebuilds and
repatches Discord.

This avoids the usual problem where every local file in `src/userplugins` gets
compiled into your client build.

## Quick Install

From PowerShell:

```powershell
cd "$env:USERPROFILE\OpenCord"
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
- `LocalChatExporter`: token-free export of the current loaded channel via `/export-local-chat`; use `autoload:true` to scroll-load more visible history first.
- `ChatStats`: local stats for loaded messages with top authors, links, attachments, embeds, reactions, and busiest loaded hour.
- `LocalSearch`: local loaded-message search with JSON or Markdown export.
- `LinkCollector`: local link index export as JSON, CSV, or Markdown.
- `AttachmentIndex`: local attachment metadata index export as JSON, CSV, or Markdown.
- `PrivacyScan`: local sensitive-pattern scan with redacted samples and optional redacted report export.
- `SupportQueueGuard`: local support ticket reminders for opened/read tickets that still need a reply.
- `ScamShield`: local scam/RAT warning layer for fake support, dangerous files, suspicious links, and token-shaped strings.
- `CustomerPrivacyGuard`: local outbound customer-data leak guard with an explicit `[allow-pii]` override.
- `SecureSupportVault`: local AES-GCM encrypted support notes/drafts with auto-lock.
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
already loaded in your running Discord client. It reads the local message cache,
then creates a browser download as JSON or Markdown. Its `autoload:true` mode
keeps the current chat open and repeatedly scrolls upward to ask Discord's own
UI to load more history before exporting. The `seconds` option controls how long
those fast scroll bursts keep running.

The other local data/security plugins follow the same rule: they inspect only
local client state and create local browser downloads when needed. They do not
read account tokens, upload data, or call Discord history APIs.

`SecureSupportVault` is client-side encryption for local notes and drafts, not
Discord end-to-end encryption. It stores AES-GCM ciphertext locally and forgets
the key when locked, but malware running on the same machine can still read what
you display, type, or decrypt while the vault is unlocked.

## Publishing

This folder is ready to become a public GitHub repo:

```powershell
git init
git add .
git commit -m "Initial HeinoDiscord plugin library"
```

After pushing, users can clone the repo and run the installer.
