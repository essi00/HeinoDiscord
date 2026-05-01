[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$LibraryRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$Manifest = Get-Content -LiteralPath (Join-Path $LibraryRoot "manifest.json") -Raw | ConvertFrom-Json
$names = @{}

foreach ($plugin in $Manifest.plugins) {
    if ($names.ContainsKey($plugin.name.ToLowerInvariant())) {
        throw "Duplicate plugin name: $($plugin.name)"
    }
    $names[$plugin.name.ToLowerInvariant()] = $true

    $source = Join-Path $LibraryRoot $plugin.source
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing source for $($plugin.name): $source"
    }
}

Write-Host "Manifest OK: $($Manifest.plugins.Count) plugins"
