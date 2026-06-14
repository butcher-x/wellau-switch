<#
  Wellau Switch 安装能力测试清理脚本 (Windows)

  目的：把 wellau-switch「一键安装」装上的东西卸干净，方便反复测试安装流程。
  默认清理：
    - Claude Code CLI (@anthropic-ai/claude-code) 与 Codex CLI (@openai/codex)
    - Claude 桌面版 / Codex 桌面版（MSIX 包 + 已知安装路径 + 快捷方式）
    - Wellau 登录态（%USERPROFILE%\.wellau-switch\auth.json、.cc-switch\auth.json）

  不会删除：Wellau Switch / CC Switch 应用本体，也不删它的数据库。

  可选开关：
    -Node        同时卸载 Node.js（MSI + 文件 + PATH）。
                 ⚠️ 会导致 pnpm dev / dev:wellau 无法运行，需重装 Node。
    -KeepLogin   保留登录态，不删 auth.json。

  用法（建议用配套的 uninstall-windows.bat 以自动提权）：
    powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows.ps1
    powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows.ps1 -Node
#>

param(
  [switch]$Node,
  [switch]$KeepLogin
)

$ErrorActionPreference = "Continue"
$script:Step = 0
$script:TotalSteps = if ($Node) { 6 } else { 5 }

function Write-Step($Message) {
  $script:Step += 1
  Write-Host ""
  Write-Host "[$script:Step/$script:TotalSteps] $Message" -ForegroundColor Cyan
}
function Write-Info($Message) { Write-Host "  - $Message" -ForegroundColor Yellow }
function Write-Ok($Message) { Write-Host "  OK $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "  ! $Message" -ForegroundColor Red }

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Remove-Tree($Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (Test-Path -LiteralPath $Path) {
    Write-Info "删除: $Path"
    try { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop }
    catch { Write-Warn "删除失败 ${Path}: $($_.Exception.Message)" }
  }
}

function Remove-Glob($Parent, $Filter) {
  if ([string]::IsNullOrWhiteSpace($Parent) -or -not (Test-Path -LiteralPath $Parent)) { return }
  Get-ChildItem -LiteralPath $Parent -Filter $Filter -Force -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Tree $_.FullName
  }
}

function Join-OptionalPath($Root, $Child) {
  if ([string]::IsNullOrWhiteSpace($Root)) { return $null }
  return Join-Path $Root $Child
}

function Remove-AppShortcuts($Filter) {
  Remove-Glob (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs") $Filter
  Remove-Glob (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs") $Filter
  Remove-Glob ([Environment]::GetFolderPath("Desktop")) $Filter
  Remove-Glob ([Environment]::GetFolderPath("CommonDesktopDirectory")) $Filter
}

function Stop-TargetProcesses($Names) {
  foreach ($Name in $Names) {
    Get-Process -Name $Name -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Info "结束进程: $($_.ProcessName) ($($_.Id))"
      try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {}
    }
  }
}

function Remove-AppxByPattern($Pattern, $Label) {
  Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -like $Pattern -or $_.PackageFullName -like $Pattern
  } | ForEach-Object {
    Write-Info "删除 $Label Appx 包: $($_.PackageFullName)"
    try { Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop }
    catch { Write-Warn "删除失败: $($_.Exception.Message)" }
  }
}

function Uninstall-NpmGlobal {
  if (-not (Test-Command "npm")) {
    Write-Info "未检测到 npm，跳过 npm 卸载"
    return
  }
  foreach ($pkg in @("@anthropic-ai/claude-code", "@openai/codex")) {
    Write-Info "npm uninstall -g $pkg"
    try { & npm uninstall -g $pkg 2>$null | Out-Null } catch {}
  }
}

function Remove-CliLeftovers {
  $prefixes = @()
  if (Test-Command "npm") {
    try {
      $p = (& npm prefix -g 2>$null)
      if (-not [string]::IsNullOrWhiteSpace($p)) { $prefixes += $p.Trim() }
    } catch {}
  }
  $prefixes += (Join-Path $env:APPDATA "npm")
  $prefixes = $prefixes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

  foreach ($root in $prefixes) {
    foreach ($name in @("claude", "codex")) {
      Remove-Tree (Join-Path $root $name)
      Remove-Tree (Join-Path $root "$name.cmd")
      Remove-Tree (Join-Path $root "$name.ps1")
    }
    Remove-Tree (Join-Path $root "node_modules\@anthropic-ai\claude-code")
    Remove-Tree (Join-Path $root "node_modules\@openai\codex")
  }
}

function Get-UninstallEntries {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($p in $paths) { Get-ItemProperty $p -ErrorAction SilentlyContinue }
}

function Uninstall-NodeMsi {
  Get-UninstallEntries | Where-Object { $_.DisplayName -match "^Node\.js" } | ForEach-Object {
    $code = $null
    if ($_.PSChildName -match "^\{[0-9A-Fa-f-]+\}$") { $code = $_.PSChildName }
    elseif ([string]$_.UninstallString -match "\{[0-9A-Fa-f-]+\}") { $code = $Matches[0] }
    if ($code) {
      Write-Info "卸载 Node.js: $code"
      Start-Process msiexec.exe -ArgumentList "/x", $code, "/qn", "/norestart" -Wait -WindowStyle Hidden
    }
  }
}

Write-Host "Wellau Switch 安装测试清理 (Windows)" -ForegroundColor Cyan
Write-Host "清理 Claude/Codex 的 CLI 与桌面版 + 登录态；不动 Wellau Switch 应用与数据库。" -ForegroundColor DarkGray
if ($Node) {
  Write-Host "已启用 -Node：将卸载 Node.js（会导致 pnpm dev 无法运行，需重装）。" -ForegroundColor Red
}

Write-Step "结束 Claude / Codex 进程"
$procs = @("Claude", "claude", "Codex", "codex")
if ($Node) { $procs += @("node", "npm", "npx", "corepack") }
Stop-TargetProcesses $procs
Write-Ok "相关进程已处理"

Write-Step "删除 Claude / Codex 桌面版"
Remove-AppxByPattern "*Claude*" "Claude"
Remove-AppxByPattern "OpenAI.Codex*" "Codex"
$desktopPaths = @(
  (Join-OptionalPath $env:LOCALAPPDATA "Programs\Claude"),
  (Join-OptionalPath $env:LOCALAPPDATA "AnthropicClaude"),
  (Join-OptionalPath $env:LOCALAPPDATA "Programs\Codex"),
  (Join-OptionalPath $env:LOCALAPPDATA "Codex"),
  (Join-OptionalPath $env:ProgramFiles "Claude"),
  (Join-OptionalPath $env:ProgramFiles "Codex")
)
$desktopPaths | ForEach-Object { Remove-Tree $_ }
Remove-AppShortcuts "Claude*.lnk"
Remove-AppShortcuts "Codex*.lnk"
Write-Ok "桌面版已删除"

Write-Step "卸载 Claude Code CLI 与 Codex CLI"
Uninstall-NpmGlobal
Remove-CliLeftovers
Write-Ok "CLI 已清理"

Write-Step "清理 Wellau 登录态"
if ($KeepLogin) {
  Write-Info "检测到 -KeepLogin，保留 auth.json"
} else {
  Remove-Tree (Join-Path $env:USERPROFILE ".wellau-switch\auth.json")
  Remove-Tree (Join-Path $env:USERPROFILE ".cc-switch\auth.json")
  Write-Info "已登录的供应商会在下次登录时幂等重导入；如需彻底清除，请在应用内先「登出」。"
}
Write-Ok "登录态处理完成"

if ($Node) {
  Write-Step "卸载 Node.js（-Node）"
  Uninstall-NodeMsi
  $nodePaths = @(
    (Join-OptionalPath $env:ProgramFiles "nodejs"),
    (Join-OptionalPath ${env:ProgramFiles(x86)} "nodejs"),
    (Join-OptionalPath $env:APPDATA "npm"),
    (Join-OptionalPath $env:APPDATA "npm-cache")
  )
  $nodePaths | ForEach-Object { Remove-Tree $_ }
  if (Test-Command "node") {
    Write-Warn "node 仍可用: $((Get-Command node).Source)（可能来自 nvm/Scoop，需自行处理）"
  } else {
    Write-Ok "node 已移除"
  }
}

Write-Host ""
Write-Host "Wellau Switch 验证状态:" -ForegroundColor Cyan
foreach ($cmd in @("claude", "codex")) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) { Write-Warn "$cmd 仍可用: $($found.Source)" } else { Write-Ok "$cmd 已移除" }
}

Write-Host ""
Write-Host "清理完成。新开一个终端，再到 Wellau Switch「设置→通用→环境安装」重新测试一键安装。" -ForegroundColor Green
