# Plugin Catalog

## Recommended

### QuickTemplates

Local template expansion for support and repeated messages.

- Type `;;hello` to expand a template before sending.
- Use `/qt` to list templates or `/qt name` to preview one locally.
- Templates are stored in Vencord plugin settings as JSON.
- No network requests.

### LinkSafety

Local pre-send guard for suspicious links.

- Blocks punycode domains.
- Blocks obvious Discord/Nitro lookalike domains.
- Can optionally block raw IP links.
- No network requests.

### TranslatorPro

Extended translation workflow.

- Message context menu and popover translation.
- Optional auto-translate before sending.
- Supports Google, DeepL, DeepSeek, and backup engine settings.
- Network requests depend on selected translation engine.

### LocalChatExporter

Token-free local channel export.

- Use `/export-local-chat` for JSON.
- Use `/export-local-chat format:markdown` for Markdown.
- Exports the messages currently cached/loaded by the running Discord client.
- Does not ask for, read, store, or display a Discord token.
- Scroll/load more history first if you need more messages in the export.

## Advanced

### LastSeenTracker

Tracks locally observed presence transitions and shows last-seen information.

Privacy note: this stores locally observed timestamps on your machine. It does
not fetch hidden Discord data, and it should be presented as local observation,
not guaranteed truth.

### SilentEdit

Advanced opt-in workflow that sends a replacement message and deletes the
original to avoid the edited marker.

Warning: this can conflict with server moderation expectations.

### SilentDelete

Advanced opt-in workflow that replaces/deletes messages.

Warning: this can conflict with server moderation expectations.

### AntiLog

Compatibility placeholder.
