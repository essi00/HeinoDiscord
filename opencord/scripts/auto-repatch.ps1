[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$LogRoot = Join-Path $env:APPDATA "OpenCord\logs"
$LogFile = Join-Path $LogRoot "auto-repatch.log"
$PatchScript = Join-Path $OpenCordRoot "opencord\scripts\patch-discord.mjs"
$PatcherJs = Join-Path $OpenCordRoot "dist\patcher.js"

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

function Write-AutoLog {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $LogFile -Value $line
    Write-Output $line
}

function Get-DiscordInstalls {
    $local = $env:LOCALAPPDATA
    @(
        [pscustomobject]@{ Name = "Stable"; Process = "Discord"; Path = Join-Path $local "Discord" },
        [pscustomobject]@{ Name = "Canary"; Process = "DiscordCanary"; Path = Join-Path $local "DiscordCanary" },
        [pscustomobject]@{ Name = "PTB"; Process = "DiscordPTB"; Path = Join-Path $local "DiscordPTB" }
    ) | Where-Object { Test-Path -LiteralPath (Join-Path $_.Path "Update.exe") }
}

function Get-LatestDiscordApp {
    param([string]$InstallPath)

    Get-ChildItem -LiteralPath $InstallPath -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

function Test-OpenCordPatch {
    param([string]$InstallPath)

    $app = Get-LatestDiscordApp -InstallPath $InstallPath
    if (-not $app) {
        return $false
    }

    $asar = Join-Path $app.FullName "resources\app.asar"
    if (-not (Test-Path -LiteralPath $asar)) {
        return $false
    }

    $bytes = [System.IO.File]::ReadAllBytes($asar)
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $single = $PatcherJs
    $double = $PatcherJs.Replace("\", "\\")

    return $text.Contains($single) -or $text.Contains($double)
}

function Stop-Discord {
    foreach ($name in @("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment", "Discord Helper", "Discord Crashpad Handler")) {
        Get-Process -Name $name -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 3
}

function Start-StableDiscord {
    $update = Join-Path $env:LOCALAPPDATA "Discord\Update.exe"
    if (Test-Path -LiteralPath $update) {
        Start-Process -FilePath $update -ArgumentList "--processStart Discord.exe" -WindowStyle Hidden
    }
}

try {
    $installs = @(Get-DiscordInstalls)
    if ($installs.Count -eq 0) {
        Write-AutoLog "No Discord installs found under LocalAppData."
        exit 0
    }

    $patched = @($installs | Where-Object { Test-OpenCordPatch -InstallPath $_.Path })
    $distReady = Test-Path -LiteralPath $PatcherJs
    $needsPatch = $Force -or ($patched.Count -ne $installs.Count) -or (-not $distReady)

    if (-not $needsPatch) {
        Write-AutoLog "Already patched with OpenCord; no action needed."
        exit 0
    }

    $wasStableRunning = [bool](Get-Process -Name "Discord" -ErrorAction SilentlyContinue)
    Write-AutoLog "Repair needed. Closing Discord and applying OpenCord patch."
    Stop-Discord

    Push-Location $OpenCordRoot
    try {
        if (-not $distReady) {
            Write-AutoLog "OpenCord dist missing. Building first."
            $build = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "pnpm run build:discord" -Wait -PassThru -WindowStyle Hidden
            if ($build.ExitCode -ne 0) {
                throw "pnpm run build:discord exited with code $($build.ExitCode)"
            }
        }

        $patch = Start-Process -FilePath "node" -ArgumentList $PatchScript, "--all" -Wait -PassThru -WindowStyle Hidden
        if ($patch.ExitCode -ne 0) {
            throw "patch-discord.mjs exited with code $($patch.ExitCode)"
        }
    } finally {
        Pop-Location
    }

    if ($wasStableRunning -and -not $NoRestart) {
        Write-AutoLog "Restarting Stable Discord."
        Start-StableDiscord
    }

    Write-AutoLog "OpenCord repair completed."
} catch {
    Write-AutoLog ("ERROR: " + $_.Exception.Message)
    exit 1
}
