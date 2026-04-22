# Package extension source for AMO public listing submission.
# Creates an unsigned zip suitable for uploading to addons.mozilla.org.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$srcDir = Join-Path $repoRoot "src"
$manifestPath = Join-Path $srcDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

$outputName = "extension-amo-$version.zip"
$outputPath = Join-Path $repoRoot "dist" $outputName

if (Test-Path $outputPath) { Remove-Item $outputPath -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($outputPath, 'Create')

Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($srcDir.Length + 1)
    $entryName = $relativePath.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName) | Out-Null
}

$zip.Dispose()

Write-Host "Created: dist/$outputName"
Write-Host "Upload this file at: addons.mozilla.org (Developer Hub -> Submit New Add-on)"
