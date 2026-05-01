[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$ManifestPath = Join-Path $OpenCordRoot "opencord\plugin-library\manifest.json"
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$seen = @{}

foreach ($plugin in $Manifest.plugins) {
    $key = $plugin.name.ToLowerInvariant()
    if ($seen.ContainsKey($key)) {
        throw "Duplicate plugin in manifest: $($plugin.name)"
    }
    $seen[$key] = $true

    $source = Join-Path (Join-Path $OpenCordRoot "opencord\plugin-library") $plugin.source
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing source for $($plugin.name): $source"
    }
}

Write-Host "OpenCord distribution OK. Plugins: $($Manifest.plugins.Count)"
