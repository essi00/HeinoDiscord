/*
 * OpenCord pnpm-to-PowerShell bridge.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const openCordRoot = resolve(scriptDir, "..", "..");
const [scriptPath, ...rawArgs] = process.argv.slice(2);

if (!scriptPath) {
    console.error("Usage: node opencord/scripts/run-powershell.mjs <script.ps1> [...args]");
    process.exit(1);
}

const forwardedArgs = rawArgs.filter(arg => arg !== "--");
const absoluteScriptPath = resolve(openCordRoot, scriptPath);

const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    absoluteScriptPath,
    ...forwardedArgs
], {
    cwd: openCordRoot,
    stdio: "inherit",
    shell: false,
    windowsHide: false
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 0);
