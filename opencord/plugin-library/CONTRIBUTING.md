# Contributing

Plugins should be easy to inspect, easy to remove, and respectful of user
privacy.

## Rules

- Keep source readable TypeScript/TSX.
- Declare network requests in the plugin description.
- Store sensitive data only in Vencord settings or DataStore.
- Do not collect, forward, or exfiltrate messages, tokens, cookies, or account data.
- Prefer local-only features.
- Put each folder plugin under `plugins/PluginName/index.ts(x)`.
- Put simple one-file plugins under `plugins/pluginName.ts(x)`.
- Add every plugin to `manifest.json`.

## Test Before PR

```powershell
.\scripts\install.ps1 -Plugins YourPlugin -Build
```

Then restart Discord and check Vencord's renderer log for plugin errors.
