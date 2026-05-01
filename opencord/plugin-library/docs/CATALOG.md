# Plugin Catalog

## Recommended

### QuickTemplates

Local template expansion for support and repeated messages.

- Type `;;hello` to expand a template before sending.
- Use `/qt` to list templates or `/qt name` to preview one locally.
- Templates are stored in HeinoDiscord plugin settings as JSON.
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
- Use `/export-local-chat autoload:true seconds:120` to scroll-load more visible
  history before exporting.
- `seconds` controls the autoload duration; keep the chat open while it runs.
- Exports the messages currently cached/loaded by the running Discord client.
- Does not ask for, read, store, or display a Discord token.
- Does not call Discord's history API or fetch messages that are not already
  loaded in the client.
- The exported file is created locally with a browser download.
- Scroll/load more history first if you need more messages in the export.
- For complete server history, use the separate bot-based
  `heino:export-history` tool instead.

### ChatStats

Local summary for the currently loaded channel or DM cache.

- Use `/chat-stats`.
- Counts loaded messages, unique authors, links, attachments, embeds, and
  reactions.
- Shows the busiest loaded hour and top loaded authors.
- No network requests.

### LocalSearch

Local loaded-message search with export.

- Use `/local-search query:your text`.
- Use `/local-search query:your text format:markdown` for Markdown.
- Optional `case-sensitive:true` matching.
- Exports JSON or Markdown locally.
- No network requests.

### LinkCollector

Local link index for loaded messages.

- Use `/collect-links`.
- Supports `format:json`, `format:csv`, and `format:markdown`.
- Optional `unique:false` to keep duplicate URLs.
- No network requests.

### AttachmentIndex

Local attachment metadata index for loaded messages.

- Use `/attachment-index`.
- Supports `format:json`, `format:csv`, and `format:markdown`.
- Exports filename, URL, type, size, author, timestamp, and message id.
- No network requests.

### PrivacyScan

Local privacy review for loaded messages.

- Use `/privacy-scan`.
- Detects email-like, phone-like, IPv4, Discord invite, and token-shaped
  strings.
- Samples are redacted in chat output.
- Use `/privacy-scan export:true format:markdown` for a redacted local report.
- No network requests.

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
