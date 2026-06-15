<#
  Wellau Switch detection self-check (Windows)
  Mirrors the backend probe_tool_installations / probe_desktop_apps logic so you
  can verify whether the four items are detectable before building.

  Usage (PowerShell):
    powershell -NoProfile -ExecutionPolicy Bypass -File .\detect-windows.ps1

  Note: kept ASCII-only on purpose so it parses under any code page.
#>

$ErrorActionPreference = "Continue"

function Write-Ok($Label, $Detail) { Write-Host "  [FOUND]    $Label  $Detail" -ForegroundColor Green }
function Write-No($Label)          { Write-Host "  [NOT FOUND] $Label" -ForegroundColor Red }
function Write-Head($Text)         { Write-Host ""; Write-Host "== $Text ==" -ForegroundColor Yellow }

function Get-CliSearchDirs {
  $dirs = @()
  $dirs += ($env:Path -split ';')
  $dirs += (Join-Path $env:APPDATA "npm")
  $dirs += (Join-Path $env:LOCALAPPDATA "pnpm")
  $dirs += (Join-Path $env:LOCALAPPDATA "Volta\bin")
  $dirs += (Join-Path $env:USERPROFILE "scoop\shims")
  $dirs += (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links")
  if ($env:ProgramFiles) { $dirs += (Join-Path $env:ProgramFiles "nodejs") }
  if ($env:NVM_SYMLINK) { $dirs += $env:NVM_SYMLINK }
  return $dirs | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
}

function Detect-Cli($Tool) {
  $exts = @("", ".cmd", ".exe", ".ps1", ".bat")
  foreach ($dir in (Get-CliSearchDirs)) {
    foreach ($ext in $exts) {
      $p = Join-Path $dir ($Tool + $ext)
      if (Test-Path -LiteralPath $p) {
        $ver = ""
        try { $ver = (& $p --version 2>$null | Select-Object -First 1) } catch {}
        Write-Ok "$Tool CLI" "$p  $ver"
        return
      }
    }
  }
  Write-No "$Tool CLI"
}

function Detect-App($Label, $Name, $AppxFilter) {
  $paths = @(
    (Join-Path $env:LOCALAPPDATA ("Programs\" + $Name + "\" + $Name + ".exe")),
    (Join-Path $env:LOCALAPPDATA ($Name + "\" + $Name + ".exe"))
  )
  if ($env:ProgramFiles) { $paths += (Join-Path $env:ProgramFiles ($Name + "\" + $Name + ".exe")) }
  foreach ($p in $paths) {
    if ($p -and (Test-Path -LiteralPath $p)) { Write-Ok $Label $p; return }
  }
  if ($Name -eq "Claude") {
    $anthropic = Join-Path $env:LOCALAPPDATA "AnthropicClaude"
    if (Test-Path -LiteralPath $anthropic) { Write-Ok $Label "$anthropic (Squirrel)"; return }
  }
  try {
    $pkg = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $AppxFilter } | Select-Object -First 1
    if ($pkg) { Write-Ok $Label "$($pkg.PackageFullName) (AppX)"; return }
  } catch {}
  Write-No $Label
}

Write-Host "Wellau Switch detection self-check (Windows)" -ForegroundColor Yellow

Write-Head "CLI"
Detect-Cli "claude"
Detect-Cli "codex"

Write-Head "Desktop apps"
Detect-App "Claude Desktop" "Claude" "*Claude*"
Detect-App "Codex Desktop"  "Codex"  "*Codex*"

Write-Host ""
Write-Host "CLI scans PATH + npm/pnpm/volta/scoop/winget/nvm dirs." -ForegroundColor DarkGray
Write-Host "Desktop scans fixed paths, Claude Squirrel dir (AnthropicClaude), and Get-AppxPackage (MSIX, e.g. Codex)." -ForegroundColor DarkGray
Write-Host "If FOUND here but the app still shows pending, it is a PATH/old-build issue. If NOT FOUND, paste the output back." -ForegroundColor DarkGray
