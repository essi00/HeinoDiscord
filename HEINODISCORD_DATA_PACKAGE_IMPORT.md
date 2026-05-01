# HeinoDiscord Discord Data Package Import

This importer converts Discord's official account data package into readable DM
archives without using a bot token, user token, or selfbot.

## Important Limit

Discord's account data package contains messages sent by your account. It is not
a complete transcript of every message every other DM participant sent to you.
That limit comes from Discord's export, not from HeinoDiscord.

For channels where you need all participants' messages and you have server
permission, use the bot-based full history exporter in
`HEINODISCORD_FULL_EXPORT.md`.

## Request Your Data

In Discord:

```text
User Settings -> Privacy & Safety -> Request Data
```

When Discord emails the ZIP file, download it locally.

## Import DMs

PowerShell:

```powershell
cd "C:\Users\Joachim Csida\OpenCord"
pnpm heino:import-data-package -- --input "C:\Path\To\discord-data-package.zip"
```

You can also pass an already extracted package folder:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\package"
```

## Options

Markdown only:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\package" --format markdown
```

JSON only:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\package" --format json
```

Include server message folders from the data package too:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\package" --all
```

Custom output folder:

```powershell
pnpm heino:import-data-package -- --input "C:\Path\To\package" --out "exports\my-discord-data"
```

## Output

```text
exports/discord-data-package/<time>/import-summary.json
exports/discord-data-package/<time>/channels/*.json
exports/discord-data-package/<time>/channels/*.md
```

The importer uses the package's `messages/index.json`, each message folder's
`channel.json`, and each `messages.csv`.
