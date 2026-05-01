[CmdletBinding()]
param(
    [string]$Owner = "00essi00",
    [string]$Repo = "HeinoDiscord",
    [switch]$Private
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$Visibility = if ($Private) { "--private" } else { "--public" }
$RepoFullName = "$Owner/$Repo"
$RepoUrl = "https://github.com/$RepoFullName.git"

Push-Location $Root
try {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        Write-Host "GitHub CLI is not installed."
        Write-Host "Install it from: https://cli.github.com/"
        Write-Host "Then run:"
        Write-Host "  gh auth login"
        Write-Host "  pnpm heino:publish-github -- -Owner $Owner -Repo $Repo"
        Write-Host ""
        Write-Host "Manual fallback:"
        Write-Host "  Create https://github.com/new as public repo '$Repo'"
        Write-Host "  git remote add origin $RepoUrl"
        Write-Host "  git push -u origin main"
        exit 1
    }

    gh repo view $RepoFullName *> $null
    if ($LASTEXITCODE -ne 0) {
        gh repo create $RepoFullName $Visibility --source . --remote origin --push
        if ($LASTEXITCODE -ne 0) {
            throw "gh repo create failed with exit code $LASTEXITCODE"
        }
    } else {
        git remote get-url origin *> $null
        if ($LASTEXITCODE -ne 0) {
            git remote add origin $RepoUrl
        }
        git push -u origin main
    }

    Write-Host "Published: https://github.com/$RepoFullName"
} finally {
    Pop-Location
}
