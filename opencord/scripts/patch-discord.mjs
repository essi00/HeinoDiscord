/*
 * OpenCord Discord patcher
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OPENCORD_ROOT = resolve(SCRIPT_DIR, "..", "..");
const HEINO_PATCHER_PATH = join(OPENCORD_ROOT, "dist", "HeinoDiscordPatcher.js");
const PATCHER_PATH = existsSync(HEINO_PATCHER_PATH)
    ? HEINO_PATCHER_PATH
    : join(OPENCORD_ROOT, "dist", "patcher.js");
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");

const DEFAULT_INSTALLS = [
    ["Stable", join(LOCAL_APP_DATA, "Discord")],
    ["Canary", join(LOCAL_APP_DATA, "DiscordCanary")],
    ["PTB", join(LOCAL_APP_DATA, "DiscordPTB")]
];

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { all: args.length === 0, locations: [] };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--all") {
            result.all = true;
        } else if (arg === "--location" || arg === "-location") {
            const value = args[++i];
            if (!value) throw new Error(`${arg} requires a path`);
            result.locations.push(["Custom", resolve(value)]);
            result.all = false;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return result;
}

function findLatestApp(installPath) {
    if (!existsSync(installPath)) return null;

    const apps = readdirSync(installPath)
        .filter(name => name.startsWith("app-"))
        .map(name => {
            const fullPath = join(installPath, name);
            return { name, fullPath, stat: statSync(fullPath) };
        })
        .filter(app => app.stat.isDirectory())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    return apps[0] ?? null;
}

function createAsar(files) {
    let offset = 0;
    const headerFiles = {};
    const fileBuffers = [];

    for (const [name, buffer] of files) {
        headerFiles[name] = {
            size: buffer.length,
            offset: String(offset)
        };
        fileBuffers.push(buffer);
        offset += buffer.length;
    }

    const header = Buffer.from(JSON.stringify({ files: headerFiles }));
    const padding = (4 - (header.length % 4)) % 4;
    const pickle = Buffer.alloc(8 + header.length + padding);
    pickle.writeUInt32LE(header.length + 4, 0);
    pickle.writeUInt32LE(header.length, 4);
    header.copy(pickle, 8);

    const size = Buffer.alloc(8);
    size.writeUInt32LE(4, 0);
    size.writeUInt32LE(pickle.length, 4);

    return Buffer.concat([size, pickle, ...fileBuffers]);
}

function createPatchedDiscordAsar() {
    const escapedPatcherPath = PATCHER_PATH.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    const indexJs = Buffer.from(`require("${escapedPatcherPath}")`);
    const packageJson = Buffer.from('{"name":"discord","main":"index.js"}');
    return createAsar([
        ["index.js", indexJs],
        ["package.json", packageJson]
    ]);
}

function asarContainsCurrentPatch(asarPath) {
    if (!existsSync(asarPath)) return false;

    const text = readFileSync(asarPath).toString("utf8");
    const single = PATCHER_PATH;
    const double = PATCHER_PATH.replace(/\\/g, "\\\\");

    return text.includes(single) || text.includes(double);
}

function patchInstall(label, installPath) {
    const updateExe = join(installPath, "Update.exe");
    if (!existsSync(updateExe)) {
        console.log(`[patch-discord] Skipping ${label}: not installed at ${installPath}`);
        return false;
    }

    if (!existsSync(PATCHER_PATH)) {
        throw new Error(`OpenCord build missing: ${PATCHER_PATH}`);
    }

    const latestApp = findLatestApp(installPath);
    if (!latestApp) {
        throw new Error(`No app-* folder found in ${installPath}`);
    }

    const resources = join(latestApp.fullPath, "resources");
    const appAsar = join(resources, "app.asar");
    const originalAsar = join(resources, "_app.asar");

    if (!existsSync(appAsar)) {
        throw new Error(`Missing app.asar for ${label}: ${appAsar}`);
    }

    if (asarContainsCurrentPatch(appAsar)) {
        console.log(`[patch-discord] ${label} already points at OpenCord: ${latestApp.name}`);
        return true;
    }

    mkdirSync(resources, { recursive: true });
    if (!existsSync(originalAsar) && !readFileSync(appAsar).toString("utf8").includes("dist\\\\patcher.js")) {
        copyFileSync(appAsar, originalAsar);
        console.log(`[patch-discord] Backed up original app.asar for ${label}.`);
    }

    writeFileSync(appAsar, createPatchedDiscordAsar());
    console.log(`[patch-discord] Patched ${label}: ${appAsar}`);
    return true;
}

const args = parseArgs();
const installs = args.all ? DEFAULT_INSTALLS : args.locations;

let patchedAny = false;
for (const [label, installPath] of installs) {
    patchedAny = patchInstall(label, installPath) || patchedAny;
}

if (!patchedAny) {
    throw new Error("No Discord installations were patched.");
}
