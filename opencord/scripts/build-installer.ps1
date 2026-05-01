[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$Source = Join-Path $Root "opencord\installer\HeinoDiscordInstaller.cs"
$Output = Join-Path $Root "HeinoDiscord.exe"
$ReleaseDir = Join-Path $Root "release\HeinoDiscord"
$ReleaseOutput = Join-Path $ReleaseDir "HeinoDiscord.exe"

$candidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework64\v3.5\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v3.5\csc.exe"
)

$Csc = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $Csc) {
    throw "Could not find csc.exe. Install .NET Framework build tools or Visual Studio Build Tools."
}

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

& $Csc /nologo /target:exe /platform:anycpu /out:$Output $Source
if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath $Output -Destination $ReleaseOutput -Force

Write-Host "Built installer:"
Write-Host "  $Output"
Write-Host "  $ReleaseOutput"
