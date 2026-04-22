# Firefox Extension Signing Script
# Bumps the patch version, signs the extension, and opens the output folder.
# Credentials are loaded from .env (never commit that file).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Load .env ---------------------------------------------------------------
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found. Copy .env.example to .env and fill in your AMO credentials."
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
    }
}

$apiKey    = $env:AMO_API_KEY
$apiSecret = $env:AMO_API_SECRET

if (-not $apiKey -or -not $apiSecret) {
    Write-Error "AMO_API_KEY and AMO_API_SECRET must be set in .env"
}

# --- Bump patch version -------------------------------------------------------
$manifestPath = Join-Path $PSScriptRoot "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$parts = $manifest.version -split '\.'
$parts[2] = [string]([int]$parts[2] + 1)
$newVersion = $parts -join '.'
$manifest.version = $newVersion

$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8
Write-Host "Version bumped to $newVersion"

# --- Sign ---------------------------------------------------------------------
$artifactsDir = Join-Path $PSScriptRoot "web-ext-artifacts"
Write-Host "Signing extension..."
web-ext sign --source-dir $PSScriptRoot --api-key $apiKey --api-secret $apiSecret --artifacts-dir $artifactsDir --channel unlisted --timeout 300000

# --- Open output folder -------------------------------------------------------
Write-Host ""
Write-Host "Done! Install the .xpi from: $artifactsDir"
Write-Host "  Firefox -> about:addons -> gear icon -> Install Add-on From File"
if (Test-Path $artifactsDir) { Invoke-Item $artifactsDir }
