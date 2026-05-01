[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$ReleaseRoot = Join-Path $Root "release"
$PackageRoot = Join-Path $ReleaseRoot "HeinoDiscord"
$ZipPath = Join-Path $ReleaseRoot "HeinoDiscord-release.zip"

if (-not $SkipBuild) {
    Push-Location $Root
    try {
        pnpm opencord:plugins -- -Recommended -PruneUserPlugins
        if ($LASTEXITCODE -ne 0) { throw "Plugin install failed with exit code $LASTEXITCODE" }

        pnpm heino:profile -- recommended
        if ($LASTEXITCODE -ne 0) { throw "Profile apply failed with exit code $LASTEXITCODE" }

        pnpm run build:discord
        if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }

        pnpm heino:finalize-dist
        if ($LASTEXITCODE -ne 0) { throw "Dist finalization failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

& (Join-Path $Root "opencord\scripts\build-installer.ps1")

if (Test-Path -LiteralPath $PackageRoot) {
    Remove-Item -LiteralPath $PackageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageRoot | Out-Null

$items = @(
    "HeinoDiscord.exe",
    "HEINODISCORD.md",
    "HEINODISCORD_TUTORIAL.md",
    "HEINODISCORD_PLUGIN_API.md",
    "HEINODISCORD_FULL_EXPORT.md",
    "HEINODISCORD_DATA_PACKAGE_IMPORT.md",
    "HEINODISCORD_EXPORT_SAFETY.md",
    "GITHUB_PUBLISHING.md",
    "OPENCORD.md",
    "FORK_NOTICE.md",
    "LICENSE",
    "README.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".npmrc",
    "src",
    "scripts",
    "opencord",
    "packages",
    "patches",
    "dist"
)

foreach ($item in $items) {
    $source = Join-Path $Root $item
    if (-not (Test-Path -LiteralPath $source)) {
        continue
    }

    Copy-Item -LiteralPath $source -Destination (Join-Path $PackageRoot $item) -Recurse -Force
}

$bundledInstaller = Join-Path $PackageRoot "dist\Installer"
if (Test-Path -LiteralPath $bundledInstaller) {
    Remove-Item -LiteralPath $bundledInstaller -Recurse -Force
}

Get-ChildItem -LiteralPath $PackageRoot -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}

Compress-Archive -Path (Join-Path $PackageRoot "*") -DestinationPath $ZipPath -Force

Write-Host "Release package ready:"
Write-Host "  $PackageRoot"
Write-Host "  $ZipPath"
