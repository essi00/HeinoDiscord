/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { app, net, protocol } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { ensureSafePath } from "./ipcMain";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { installExt } from "./utils/extensions";

const sourceMapAliases = new Map([
    ["renderer.js.map", "renderer.js.map"],
    ["HeinoDiscordRenderer.js.map", "renderer.js.map"],
    ["vencordDesktopRenderer.js.map", "vencordDesktopRenderer.js.map"],
    ["HeinoDiscordDesktopRenderer.js.map", "vencordDesktopRenderer.js.map"],
    ["preload.js.map", "preload.js.map"],
    ["HeinoDiscordPreload.js.map", "preload.js.map"],
    ["vencordDesktopPreload.js.map", "vencordDesktopPreload.js.map"],
    ["HeinoDiscordDesktopPreload.js.map", "vencordDesktopPreload.js.map"],
    ["patcher.js.map", "patcher.js.map"],
    ["HeinoDiscordPatcher.js.map", "patcher.js.map"],
    ["vencordDesktopMain.js.map", "vencordDesktopMain.js.map"],
    ["HeinoDiscordDesktopMain.js.map", "vencordDesktopMain.js.map"]
]);

if (IS_VESKTOP || !IS_VANILLA) {
    app.whenReady().then(() => {
        const handleResourceProtocol = ({ url: unsafeUrl }: { url: string; }, scheme: "heinodiscord" | "vencord") => {
            let url = decodeURI(unsafeUrl).slice(`${scheme}://`.length).replace(/\?v=\d+$/, "");

            if (url.endsWith("/")) url = url.slice(0, -1);

            if (url.startsWith("/themes/")) {
                const theme = url.slice("/themes/".length);

                const safeUrl = ensureSafePath(THEMES_DIR, theme);
                if (!safeUrl) {
                    return new Response(null, {
                        status: 404
                    });
                }

                return net.fetch(pathToFileURL(safeUrl).toString());
            }

            // Source Maps! Maybe there's a better way but since the renderer is executed
            // from a string I don't think any other form of sourcemaps would work

            const sourceMapFile = sourceMapAliases.get(url);
            if (sourceMapFile) {
                return net.fetch(pathToFileURL(join(__dirname, sourceMapFile)).toString());
            }

            return new Response(null, {
                status: 404
            });
        };

        protocol.handle("heinodiscord", request => handleResourceProtocol(request, "heinodiscord"));
        protocol.handle("vencord", request => handleResourceProtocol(request, "vencord"));

        try {
            if (RendererSettings.store.enableReactDevtools)
                installExt("fmkadmapgofadopljbjfkapdkoienihi")
                    .then(() => console.info("[HeinoDiscord] Installed React Developer Tools"))
                    .catch(err => console.error("[HeinoDiscord] Failed to install React Developer Tools", err));
        } catch { }


        initCsp();
    });
}

if (IS_DISCORD_DESKTOP) {
    require("./patcher");
}
