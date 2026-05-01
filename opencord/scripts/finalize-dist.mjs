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
    ["renderer.js", "HeinoDiscordRenderer.js"],
    ["renderer.css", "HeinoDiscordRenderer.css"],
    ["vencordDesktopMain.js", "HeinoDiscordDesktopMain.js"],
    ["vencordDesktopPreload.js", "HeinoDiscordDesktopPreload.js"],
    ["vencordDesktopRenderer.js", "HeinoDiscordDesktopRenderer.js"],
    ["vencordDesktopRenderer.css", "HeinoDiscordDesktopRenderer.css"]
];

for (const [source, target] of aliases) {
    const sourcePath = join(dist, source);
    if (!existsSync(sourcePath)) continue;
    copyFileSync(sourcePath, join(dist, target));
    console.log(`[dist] ${target}`);
}
