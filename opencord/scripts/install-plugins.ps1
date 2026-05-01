[CmdletBinding()]
param(
    [string[]]$Plugins = @(),
    [switch]$Recommended,
    [switch]$All,
    [switch]$IncludeAdvanced,
    [switch]$CleanManaged,
    [switch]$PruneUserPlugins,
    [switch]$Build,
    [switch]$Patch
)

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$Installer = Join-Path $OpenCordRoot "opencord\plugin-library\scripts\install.ps1"

if (-not (Test-Path -LiteralPath $Installer)) {
    throw "Plugin library installer missing: $Installer"
}

$PluginNames = @(
    foreach ($pluginName in $Plugins) {
        $pluginName -split "[,\s]+" | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }
    }
)

$argsList = @("-OpenCordRoot", $OpenCordRoot)

if ($PluginNames.Count) {
    $argsList += "-Plugins"
    $argsList += ($PluginNames -join ",")
}
if ($Recommended) { $argsList += "-Recommended" }
if ($All) { $argsList += "-All" }
if ($IncludeAdvanced) { $argsList += "-IncludeAdvanced" }
if ($CleanManaged) { $argsList += "-CleanManaged" }
if ($PruneUserPlugins) { $argsList += "-PruneUserPlugins" }
if ($Build) { $argsList += "-Build" }
if ($Patch) { $argsList += "-Patch" }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer @argsList
