[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern("^[A-Za-z][A-Za-z0-9_ -]*$")]
    [string]$Name,

    [string]$Description = "An OpenCord userplugin.",
    [switch]$Recommended
)

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$LibraryRoot = Join-Path $OpenCordRoot "opencord\plugin-library"
$ManifestPath = Join-Path $LibraryRoot "manifest.json"
$SafeName = ($Name -replace "[^A-Za-z0-9_]", "")

if (-not $SafeName) {
    throw "Plugin name must contain letters or numbers."
}

$PluginDir = Join-Path $LibraryRoot "plugins\$SafeName"
if (Test-Path -LiteralPath $PluginDir) {
    throw "Plugin already exists: $PluginDir"
}

New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null

$pluginSource = @"
/*
 * OpenCord UserPlugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

export default definePlugin({
    name: "$SafeName",
    description: "$Description",
    authors: [{ name: "OpenCord User", id: 0n }],
    tags: ["Utility"],

    start() {
        console.log("[$SafeName] started");
    },

    stop() {
        console.log("[$SafeName] stopped");
    }
});
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PluginDir "index.tsx"), $pluginSource, $utf8NoBom)

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (@($manifest.plugins | Where-Object { $_.name -ieq $SafeName }).Count) {
    throw "Manifest already contains plugin: $SafeName"
}

$entry = [pscustomobject]@{
    name = $SafeName
    source = "plugins/$SafeName"
    target = $SafeName
    category = "custom"
    recommended = [bool]$Recommended
    advanced = $false
    description = $Description
}

$manifest.plugins += $entry
$json = $manifest | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($ManifestPath, $json, $utf8NoBom)

Write-Host "Created plugin: $PluginDir"
Write-Host "Install it with: pnpm opencord:plugins -- -Plugins `"$SafeName`" -Build -Patch"
