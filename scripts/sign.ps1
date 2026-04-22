# Firefox Extension Signing Script
# Bumps the patch version, signs the extension, and opens the output folder.
# Credentials are loaded from .env (never commit that file).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$srcDir   = Join-Path $repoRoot "src"
$distDir  = Join-Path $repoRoot "dist"

# --- Load .env ---------------------------------------------------------------
$envFile = Join-Path $repoRoot ".env"
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
$manifestPath = Join-Path $srcDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$parts = $manifest.version -split '\.'
$parts[2] = [string]([int]$parts[2] + 1)
$newVersion = $parts -join '.'
$manifest.version = $newVersion

$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8
Write-Host "Version bumped to $newVersion"

# --- Sign ---------------------------------------------------------------------
$geckoId = $manifest.browser_specific_settings.gecko.id
$amoStatusUrl = "https://addons.mozilla.org/developers/addon/$geckoId/versions/"
Write-Host "Signing extension..."
Write-Host "  Check approval status at: $amoStatusUrl"
web-ext sign --source-dir $srcDir --api-key $apiKey --api-secret $apiSecret --artifacts-dir $distDir --channel unlisted --timeout 300000

# --- Open output folder -------------------------------------------------------
Write-Host ""
Write-Host "Done! Install the .xpi from: $distDir"
Write-Host "  Firefox -> about:addons -> gear icon -> Install Add-on From File"
if (Test-Path $distDir) { Invoke-Item $distDir }
