/*
 * HeinoDiscord settings profile applier.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..", "..");

function readJson(path, fallback) {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
}

function mergeDeep(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])
        ) {
            mergeDeep(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function argValue(name, fallback) {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1] ?? fallback;
}

const args = process.argv.slice(2);
let profileName = "recommended";
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--data-dir") {
        i++;
        continue;
    }
    if (!args[i].startsWith("-")) {
        profileName = args[i];
        break;
    }
}
const profilePath = join(root, "opencord", "profiles", `${profileName}-settings.json`);
const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
const dataDir = resolve(argValue("--data-dir", join(appData, "HeinoDiscord")));
const settingsDir = join(dataDir, "settings");
const settingsPath = join(settingsDir, "settings.json");

if (!existsSync(profilePath)) {
    throw new Error(`Unknown profile '${profileName}'. Missing ${profilePath}`);
}

const profile = readJson(profilePath, {});
const base = {
    autoUpdate: false,
    autoUpdateNotification: false,
    useQuickCss: true,
    themeLinks: [],
    eagerPatches: false,
    enabledThemes: [],
    enableReactDevtools: false,
    frameless: false,
    transparent: false,
    winCtrlQ: false,
    disableMinSize: false,
    winNativeTitleBar: false,
    plugins: {},
    uiElements: {
        chatBarButtons: {},
        messagePopoverButtons: {}
    },
    notifications: {
        timeout: 5000,
        position: "bottom-right",
        useNative: "not-focused",
        logLimit: 50
    },
    cloud: {
        authenticated: false,
        url: "",
        settingsSync: false,
        settingsSyncVersion: 0
    }
};

mkdirSync(settingsDir, { recursive: true });

const current = readJson(settingsPath, base);
if (existsSync(settingsPath)) {
    const backupPath = join(settingsDir, `settings.backup-before-heinodiscord-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(current, null, 4));
    console.log(`[profile] Backup written: ${backupPath}`);
}

const merged = mergeDeep(current, profile.settings ?? {});
merged.cloud ??= {};
merged.cloud.authenticated = false;
merged.cloud.settingsSync = false;
merged.cloud.url = "";
merged.cloud.settingsSyncVersion = Date.now();

writeFileSync(settingsPath, JSON.stringify(merged, null, 4));
console.log(`[profile] Applied '${profile.name ?? profileName}' to ${settingsPath}`);
