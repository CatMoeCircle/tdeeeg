# Bundle the offline-WebView2 variant without changing productName.
# Both variants share the app name "tdeeeg"; artifacts are distinguished by a -webview suffix.
param(
  [ValidateSet("All", "WebviewOnly")]
  [string]$Mode = "All",

  [switch]$Sign
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$signArgs = @()
if (-not $Sign) {
  $signArgs = @("--no-sign")
}

$bundleRoot = "src-tauri/target/release/bundle"
$artifactDirs = @(
  (Join-Path $bundleRoot "nsis"),
  (Join-Path $bundleRoot "msi")
)
$staging = Join-Path $bundleRoot "_default_staging"

$conf = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
$productName = $conf.productName
Write-Host "Product: $productName  Version: $version"

function Invoke-Tauri {
  param([string[]]$TauriArgs)
  bun run tauri -- @TauriArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Get-DefaultArtifacts {
  $files = @()
  foreach ($dir in $artifactDirs) {
    if (-not (Test-Path $dir)) { continue }
    $files += Get-ChildItem $dir -File | Where-Object {
      $_.Name -like "$($productName)_$($version)_*" -and $_.Name -notmatch "webview"
    }
  }
  return $files
}

function Remove-WebviewArtifacts {
  foreach ($dir in $artifactDirs) {
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -File | Where-Object {
      $_.Name -match "webview" -and $_.Name -like "$($productName)_$($version)_*"
    } | Remove-Item -Force
  }
}

# MSI 语言后缀规范化：en-US 直接去掉（语言中立名），ru-RU → ru，其余保留。
# .msi / .msi.sig 一并处理，避免 releases 里残留 tdeeeg_*_en-US.msi.sig。
function Normalize-MsiLanguageSuffix {
  param([string]$Name)
  $n = $Name
  $n = $n -replace "_en-US\.msi(\.sig)?$", '.msi$1'
  $n = $n -replace "_ru-RU\.msi(\.sig)?$", '_ru.msi$1'
  $n = $n -replace "_zh-CN\.msi(\.sig)?$", '_zh-CN.msi$1'
  $n = $n -replace "_zh-TW\.msi(\.sig)?$", '_zh-TW.msi$1'
  return $n
}

function Invoke-MsiLanguageRename {
  $msiDir = Join-Path $bundleRoot "msi"
  if (-not (Test-Path $msiDir)) { return }
  Get-ChildItem $msiDir -File | Where-Object {
    $_.Name -like "$($productName)_$($version)_*" -and $_.Name -match "msi"
  } | ForEach-Object {
    $newName = Normalize-MsiLanguageSuffix $_.Name
    if ($newName -ne $_.Name) {
      $dest = Join-Path $msiDir $newName
      if ((Test-Path $dest) -and ($_.FullName -ne $dest)) {
        Remove-Item $dest -Force
      }
      Rename-Item -Path $_.FullName -NewName $newName -Force
      Write-Host "MSI rename: $($_.Name) -> $newName"
    }
  }
}

function Rename-WebviewArtifacts {
  $renamed = @()
  $nsisDir = Join-Path $bundleRoot "nsis"
  if (Test-Path $nsisDir) {
    Get-ChildItem $nsisDir -File | Where-Object {
      $_.Name -like "$($productName)_$($version)_*-setup.exe" -and $_.Name -notmatch "webview"
    } | ForEach-Object {
      $newName = $_.Name -replace "-setup\.exe$", "-webview-setup.exe"
      Rename-Item -Path $_.FullName -NewName $newName -Force
      $renamed += (Join-Path $nsisDir $newName)
    }
  }

  $msiDir = Join-Path $bundleRoot "msi"
  if (Test-Path $msiDir) {
    Get-ChildItem $msiDir -File | Where-Object {
      $_.Name -like "$($productName)_$($version)_*.msi" -and $_.Name -notmatch "webview"
    } | ForEach-Object {
      $newName = $_.Name -replace "\.msi$", "-webview.msi"
      Rename-Item -Path $_.FullName -NewName $newName -Force
      $renamed += (Join-Path $msiDir $newName)
    }
  }

  return $renamed
}

Remove-WebviewArtifacts

if ($Mode -eq "All") {
  Write-Host "==> Bundling default variant (tauri.conf.json)"
  Invoke-Tauri (@("bundle", "--config", "src-tauri/tauri.conf.json") + $signArgs)
  Invoke-MsiLanguageRename

  if (Test-Path $staging) {
    Remove-Item $staging -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  Get-DefaultArtifacts | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $staging $_.Name) -Force
    Write-Host "Staged default: $($_.Name)"
  }
}

Write-Host "==> Bundling webview variant (offline WebView2, same productName)"
Invoke-Tauri (@("bundle", "--config", "src-tauri/tauri.webview.conf.json") + $signArgs)
Invoke-MsiLanguageRename

Write-Host "==> Renaming webview artifacts"
$webviewFiles = Rename-WebviewArtifacts
$webviewFiles | ForEach-Object { Write-Host "Webview: $_" }

if ($Mode -eq "All") {
  Write-Host "==> Restoring default artifacts"
  Get-ChildItem $staging -File | ForEach-Object {
    $destDir = if ($_.Extension -eq ".msi") { Join-Path $bundleRoot "msi" } else { Join-Path $bundleRoot "nsis" }
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item $_.FullName (Join-Path $destDir $_.Name) -Force
    Write-Host "Restored default: $($_.Name)"
  }
  Remove-Item $staging -Recurse -Force
}

Write-Host "`n==> Current $($productName) $version bundles:"
Get-ChildItem $artifactDirs -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "$($productName)_$($version)_*" } |
  Sort-Object Name |
  Format-Table Name, @{N = "SizeMB"; E = { [math]::Round($_.Length / 1MB, 2) } } -AutoSize
