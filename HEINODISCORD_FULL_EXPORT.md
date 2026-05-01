# HeinoDiscord Full History Export

`LocalChatExporter` is intentionally limited to messages already loaded in the
running Discord client. For a complete archive, use the bot-based full history
exporter instead.

This exporter uses Discord's official bot REST API. It never asks for a user
token and it never reads a token from the Discord client.

## What It Can Export

- Guild text channels the bot can view.
- Voice-channel text chats the bot can view.
- Announcement channels the bot can view.
- Public, active, and archived threads the bot can access.
- Private archived threads only when the bot is allowed to access them and you
  pass `--include-private-archives`.

The bot needs `View Channel` and `Read Message History` in each channel. If you
want message text content, enable the `Message Content Intent` for the bot in
the Discord Developer Portal.

## Usage

PowerShell:

```powershell
cd "C:\Users\Joachim Csida\OpenCord"
$env:HEINODISCORD_EXPORT_BOT_TOKEN = "YOUR_BOT_TOKEN"
pnpm heino:export-history -- --guild-id YOUR_GUILD_ID
```

Custom output folder:

```powershell
pnpm heino:export-history -- --guild-id YOUR_GUILD_ID --out "exports\my-server"
```

Test one channel first:

```powershell
pnpm heino:export-history -- --guild-id YOUR_GUILD_ID --channel-id CHANNEL_ID --max-messages 200
```

Try private archived thread endpoints:

```powershell
pnpm heino:export-history -- --guild-id YOUR_GUILD_ID --include-private-archives
```

## Output

The exporter writes:

```text
exports/discord-history/<guild>-<time>/archive-summary.json
exports/discord-history/<guild>-<time>/channels/<channel-name>-<channel-id>.jsonl
```

Each `.jsonl` line is one message object. Files are written newest-to-oldest per
channel so very large channels can stream to disk without holding everything in
memory.

## Why This Is Separate From LocalChatExporter

A client plugin can only safely export what the client has already loaded. A full
history export requires API pagination through channel history. HeinoDiscord does
that with a bot token and server permissions, not with a user token or selfbot.
