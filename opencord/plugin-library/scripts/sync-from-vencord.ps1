[CmdletBinding()]
param(
    [string]$VencordRoot = (Join-Path $env:USERPROFILE "Vencord")
)

$ErrorActionPreference = "Stop"

$LibraryRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$Manifest = Get-Content -LiteralPath (Join-Path $LibraryRoot "manifest.json") -Raw | ConvertFrom-Json
$UserPluginsDir = Join-Path $VencordRoot "src\userplugins"

foreach ($plugin in $Manifest.plugins) {
    $source = Join-Path $UserPluginsDir $plugin.target
    $target = Join-Path $LibraryRoot $plugin.source

    if (-not (Test-Path -LiteralPath $source)) {
        Write-Warning "Skipping missing userplugin: $($plugin.target)"
        continue
    }

    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }

    Write-Host "Syncing $($plugin.name)"
    Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}
