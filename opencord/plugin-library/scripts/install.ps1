[CmdletBinding()]
param(
    [Alias("VencordRoot")]
    [string]$OpenCordRoot = (Join-Path $env:USERPROFILE "OpenCord"),
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

$LibraryRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ManifestPath = Join-Path $LibraryRoot "manifest.json"
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$UserPluginsDir = Join-Path $OpenCordRoot "src\userplugins"
$StatePath = Join-Path $UserPluginsDir ".heinodiscord-plugin-library.json"
$LegacyStatePath = Join-Path $UserPluginsDir ".open-vencord-plugin-library.json"
$PluginNames = @(
    foreach ($pluginName in $Plugins) {
        $pluginName -split "," | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }
    }
)

if (-not (Test-Path -LiteralPath (Join-Path $OpenCordRoot "package.json"))) {
    throw "OpenCord root not found: $OpenCordRoot"
}

New-Item -ItemType Directory -Force -Path $UserPluginsDir | Out-Null

function Get-PluginByName {
    param([string]$Name)

    $match = @($Manifest.plugins | Where-Object { $_.name -ieq $Name })
    if ($match.Count -ne 1) {
        $available = ($Manifest.plugins | Select-Object -ExpandProperty name) -join ", "
        throw "Unknown plugin '$Name'. Available: $available"
    }

    return $match[0]
}

if ($All) {
    $selected = @($Manifest.plugins | Where-Object { $IncludeAdvanced -or -not $_.advanced })
} elseif ($Recommended -or $PluginNames.Count -gt 0) {
    $selected = @()

    if ($Recommended) {
        $selected += @($Manifest.plugins | Where-Object { $_.recommended -and ($IncludeAdvanced -or -not $_.advanced) })
    }

    if ($PluginNames.Count -gt 0) {
        $selected += @($PluginNames | ForEach-Object { Get-PluginByName $_ })
    }

    $byName = [ordered]@{}
    foreach ($plugin in $selected) {
        $byName[$plugin.name.ToLowerInvariant()] = $plugin
    }
    $selected = @($byName.Values)
} else {
    $available = $Manifest.plugins | ForEach-Object {
        $flag = if ($_.advanced) { "advanced" } elseif ($_.recommended) { "recommended" } else { "optional" }
        "  - {0} ({1})" -f $_.name, $flag
    }
    Write-Host "No plugin selection supplied. Use -Recommended, -All, or -Plugins."
    Write-Host "Available plugins:"
    $available | ForEach-Object { Write-Host $_ }
    exit 0
}

$selectedNames = @($selected | Select-Object -ExpandProperty name)
$selectedTargets = @($selected | Select-Object -ExpandProperty target)

if ($PruneUserPlugins) {
    Write-Host "Pruning unmanaged userplugins. Only selected library plugins will remain."
    foreach ($item in Get-ChildItem -LiteralPath $UserPluginsDir -Force) {
        if ($item.Name -in @(".heinodiscord-plugin-library.json", ".open-vencord-plugin-library.json")) {
            continue
        }

        if ($selectedTargets -contains $item.Name) {
            continue
        }

        Write-Host "Removing unmanaged userplugin: $($item.Name)"
        Remove-Item -LiteralPath $item.FullName -Recurse -Force
    }
}

if ($CleanManaged -and ((Test-Path -LiteralPath $StatePath) -or (Test-Path -LiteralPath $LegacyStatePath))) {
    $stateSource = if (Test-Path -LiteralPath $StatePath) { $StatePath } else { $LegacyStatePath }
    $state = Get-Content -LiteralPath $stateSource -Raw | ConvertFrom-Json
    foreach ($installed in @($state.installed)) {
        if ($selectedNames -contains $installed.name) {
            continue
        }

        $target = Join-Path $UserPluginsDir $installed.target
        if (Test-Path -LiteralPath $target) {
            Write-Host "Removing managed plugin: $($installed.name)"
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

$installedState = @()
foreach ($plugin in $selected) {
    if ($plugin.advanced -and -not $IncludeAdvanced -and -not ($PluginNames -contains $plugin.name)) {
        Write-Host "Skipping advanced plugin without -IncludeAdvanced: $($plugin.name)"
        continue
    }

    $source = Join-Path $LibraryRoot $plugin.source
    $target = Join-Path $UserPluginsDir $plugin.target

    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing plugin source: $source"
    }

    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }

    Write-Host "Installing $($plugin.name) -> $target"
    Copy-Item -LiteralPath $source -Destination $target -Recurse -Force

    $installedState += [pscustomobject]@{
        name = $plugin.name
        target = $plugin.target
        source = $plugin.source
        installedAt = (Get-Date).ToString("o")
    }
}

$stateObject = [pscustomobject]@{
    library = $Manifest.name
    installed = $installedState
}

$json = $stateObject | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($StatePath, $json, $utf8NoBom)
if (Test-Path -LiteralPath $LegacyStatePath) {
    Remove-Item -LiteralPath $LegacyStatePath -Force
}

if ($Build) {
    Push-Location $OpenCordRoot
    try {
        pnpm run build:discord
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm run build:discord failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

if ($Patch) {
    Push-Location $OpenCordRoot
    try {
        if (Test-Path -LiteralPath (Join-Path $OpenCordRoot "opencord\scripts\build-and-patch.ps1")) {
            powershell.exe -NoProfile -ExecutionPolicy Bypass -File "opencord\scripts\build-and-patch.ps1"
        } elseif (Test-Path -LiteralPath (Join-Path $OpenCordRoot "scripts\patchAllDiscordRoaming.mjs")) {
            node "scripts\patchAllDiscordRoaming.mjs"
        } else {
            pnpm inject
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Patch failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

Write-Host "Done. Installed: $($selectedNames -join ', ')"
