# HeinoDiscord Plugin API

HeinoDiscord exposes its runtime as:

```js
globalThis.HeinoDiscord
```

The old Vencord global remains as a legacy bridge:

```js
globalThis.Vencord === globalThis.HeinoDiscord
```

Use `HeinoDiscord` for all new plugins.

## Common Entry Points

```js
HeinoDiscord.Api
HeinoDiscord.Plugins
HeinoDiscord.Webpack
HeinoDiscord.WebpackPatcher
HeinoDiscord.Components
HeinoDiscord.Util
```

## Example Patch Replacement

```ts
replace: "HeinoDiscord.Api.Commands._init($1)$2"
```

## Example Console Checks

Open Discord DevTools and run:

```js
({
  hasHeinoDiscord: typeof HeinoDiscord !== "undefined",
  hasLegacyBridge: typeof Vencord !== "undefined",
  sameApi: HeinoDiscord === Vencord,
  plugins: Object.keys(HeinoDiscord.Plugins.plugins).length
})
```

## Why Keep The Bridge?

Thousands of existing plugins and snippets reference `Vencord.*`. The bridge
lets those plugins continue to work while new public documentation and new
plugins move to `HeinoDiscord.*`.
