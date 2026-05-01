# OpenCord Developer Kit

This folder contains OpenCord-specific tooling:

- `plugin-library`: curated source-based userplugins.
- `scripts/install-plugins.ps1`: installs selected plugins into `src/userplugins`.
- `scripts/create-plugin.ps1`: scaffolds a new plugin and registers it in the manifest.
- `scripts/patch-discord.mjs`: OpenCord's local Discord app.asar patcher.
- `scripts/build-and-patch.ps1`: builds OpenCord and patches Discord.
- `scripts/auto-repatch.ps1`: repairs the patch after Discord updates.
- `scripts/register-auto-repatch.ps1`: installs scheduled auto-repair tasks.
- `docs/PLUGIN_DEVELOPMENT.md`: plugin author guide.

The core runtime intentionally remains Vencord-compatible so existing plugins
can run unchanged.
