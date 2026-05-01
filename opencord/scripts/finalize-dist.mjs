/*
 * Creates HeinoDiscord-branded dist entrypoints while keeping Vencord-compatible
 * filenames for the upstream runtime internals.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");

const aliases = [
    ["patcher.js", "HeinoDiscordPatcher.js"],
    ["patcher.js.map", "HeinoDiscordPatcher.js.map"],
    ["patcher.js.LEGAL.txt", "HeinoDiscordPatcher.js.LEGAL.txt"],
    ["preload.js", "HeinoDiscordPreload.js"],
    ["preload.js.map", "HeinoDiscordPreload.js.map"],
    ["renderer.js", "HeinoDiscordRenderer.js"],
    ["renderer.js.map", "HeinoDiscordRenderer.js.map"],
    ["renderer.css", "HeinoDiscordRenderer.css"],
    ["renderer.css.map", "HeinoDiscordRenderer.css.map"],
    ["vencordDesktopMain.js", "HeinoDiscordDesktopMain.js"],
    ["vencordDesktopMain.js.map", "HeinoDiscordDesktopMain.js.map"],
    ["vencordDesktopPreload.js", "HeinoDiscordDesktopPreload.js"],
    ["vencordDesktopPreload.js.map", "HeinoDiscordDesktopPreload.js.map"],
    ["vencordDesktopRenderer.js", "HeinoDiscordDesktopRenderer.js"],
    ["vencordDesktopRenderer.js.map", "HeinoDiscordDesktopRenderer.js.map"],
    ["vencordDesktopRenderer.css", "HeinoDiscordDesktopRenderer.css"],
    ["vencordDesktopRenderer.css.map", "HeinoDiscordDesktopRenderer.css.map"]
];

for (const [source, target] of aliases) {
    const sourcePath = join(dist, source);
    if (!existsSync(sourcePath)) continue;
    copyFileSync(sourcePath, join(dist, target));
    console.log(`[dist] ${target}`);
}
