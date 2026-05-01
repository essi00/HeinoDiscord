[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$OpenCordRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$AutoScript = Join-Path $OpenCordRoot "opencord\scripts\auto-repatch.ps1"
$TaskName = "OpenCord Auto Repatch"
$LogonTaskName = "OpenCord Auto Repatch On Logon"

if (-not (Test-Path -LiteralPath $AutoScript)) {
    throw "Auto-repatch script missing: $AutoScript"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$AutoScript`""

$taskCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"' + $AutoScript + '\"'

$repeatTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn

function Register-OpenCordTask {
    param(
        [string]$Name,
        [object]$Trigger,
        [string[]]$FallbackArgs,
        [string]$Description
    )

    try {
        Register-ScheduledTask `
            -TaskName $Name `
            -Action $action `
            -Trigger $Trigger `
            -Description $Description `
            -Force | Out-Null
        return $true
    } catch {
        Write-Warning "Register-ScheduledTask failed for '$Name': $($_.Exception.Message). Falling back to schtasks.exe."
        & schtasks.exe @FallbackArgs 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "schtasks.exe failed for '$Name' with exit code $LASTEXITCODE. You can rerun this script as administrator to add this trigger."
            return $false
        }
        return $true
    }
}

$registeredRepeat = Register-OpenCordTask `
    -Name $TaskName `
    -Trigger $repeatTrigger `
    -FallbackArgs @("/Create", "/SC", "MINUTE", "/MO", "5", "/TN", $TaskName, "/TR", $taskCommand, "/F") `
    -Description "Re-applies OpenCord after Discord updates replace app.asar."

$registeredLogon = Register-OpenCordTask `
    -Name $LogonTaskName `
    -Trigger $logonTrigger `
    -FallbackArgs @("/Create", "/SC", "ONLOGON", "/TN", $LogonTaskName, "/TR", $taskCommand, "/F") `
    -Description "Checks OpenCord patch status when Windows starts a user session."

foreach ($legacyName in @("Vencord Auto Repatch", "Vencord Auto Repatch On Logon")) {
    & schtasks.exe /Query /TN $legacyName *> $null
    if ($LASTEXITCODE -eq 0) {
        & schtasks.exe /Change /TN $legacyName /DISABLE | Out-Host
    }
}

Write-Host "Scheduled task status:"
Write-Host "  - ${TaskName}: $registeredRepeat"
Write-Host "  - ${LogonTaskName}: $registeredLogon"
Write-Host "Disabled legacy Vencord auto-repatch tasks if they existed."
