# OpenCord Plugin Development

OpenCord plugins are HeinoDiscord plugins with Vencord-compatible structure.
Use `HeinoDiscord.*` for new runtime API access. The `Vencord.*` global remains
as a legacy bridge so existing plugins can still run.

## Create A Plugin

```powershell
pnpm opencord:create-plugin -- MyPlugin
```

This creates:

```text
opencord/plugin-library/plugins/MyPlugin/index.tsx
```

and registers it in:

```text
opencord/plugin-library/manifest.json
```

## Install Your Plugin

```powershell
pnpm opencord:plugins -- -Plugins "MyPlugin" -Build -Patch
```

## Minimal Plugin

```ts
import definePlugin from "@utils/types";

export default definePlugin({
    name: "MyPlugin",
    description: "My plugin",
    authors: [{ name: "Me", id: 0n }],

    start() {
        console.log("MyPlugin started");
    },

    stop() {
        console.log("MyPlugin stopped");
    }
});
```

## Runtime API

```ts
HeinoDiscord.Api
HeinoDiscord.Plugins
HeinoDiscord.Webpack
HeinoDiscord.WebpackPatcher
```

For legacy imports or snippets, `Vencord` points to the same runtime object.

## Rules

- Do not read or expose Discord tokens.
- Avoid obfuscated code.
- Declare network requests in the manifest and README.
- Prefer local-only features.
- Keep plugins opt-in.
