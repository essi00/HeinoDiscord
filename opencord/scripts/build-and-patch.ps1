[CmdletBinding()]
param(
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))

Push-Location $OpenCordRoot
try {
    foreach ($name in @("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment", "Discord Helper", "Discord Crashpad Handler")) {
        Get-Process -Name $name -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3

    pnpm run build:discord
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm run build:discord failed with exit code $LASTEXITCODE"
    }

    node "opencord\scripts\patch-discord.mjs" --all
    if ($LASTEXITCODE -ne 0) {
        throw "OpenCord Discord patch failed with exit code $LASTEXITCODE"
    }

    if (-not $NoRestart) {
        $stableUpdater = Join-Path $env:LOCALAPPDATA "Discord\Update.exe"
        if (Test-Path -LiteralPath $stableUpdater) {
            Start-Process -FilePath $stableUpdater -ArgumentList "--processStart Discord.exe" -WindowStyle Hidden
        }
    }
} finally {
    Pop-Location
}
