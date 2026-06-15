#!/usr/bin/env bash
#
# Wellau Switch 探测自检 (macOS)
# 复刻后端 probe_tool_installations / probe_desktop_apps 的探测逻辑，
# 让你在本机先验证四项能否被识别，再决定要不要编译。
#
# 用法: bash scripts/detect-macos.sh

set -uo pipefail

GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; DIM='\033[2m'; RESET='\033[0m'
ok()      { printf "${GREEN}  ✓ 检测到${RESET} %s  ${DIM}%s${RESET}\n" "$1" "${2:-}"; }
no()      { printf "${RED}  ✗ 未找到${RESET} %s\n" "$1"; }
section() { printf "\n${YELLOW}== %s ==${RESET}\n" "$1"; }

HOME_DIR="$HOME"

# ---- CLI 探测：复刻后端搜索目录 ----
cli_search_dirs() {
  # PATH 内目录
  printf '%s\n' "${PATH//:/$'\n'}"
  # 常见安装目录（与 misc.rs scan 目录一致）
  printf '%s\n' \
    "$HOME_DIR/.npm-global/bin" \
    "$HOME_DIR/n/bin" \
    "$HOME_DIR/.volta/bin" \
    "$HOME_DIR/.bun/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin" \
    "/usr/bin"
  # nvm 各版本
  if [ -d "$HOME_DIR/.nvm/versions/node" ]; then
    for d in "$HOME_DIR/.nvm/versions/node"/*/bin; do
      [ -d "$d" ] && printf '%s\n' "$d"
    done
  fi
  # fnm / mise
  for d in "$HOME_DIR/.local/state/fnm_multishells"/*/bin "$HOME_DIR/.local/share/mise/installs/node"/*/bin; do
    [ -d "$d" ] && printf '%s\n' "$d"
  done
}

detect_cli() {
  local tool="$1"
  local found=""
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    if [ -x "$dir/$tool" ] || [ -f "$dir/$tool" ]; then
      found="$dir/$tool"
      break
    fi
  done < <(cli_search_dirs | awk 'NF' | sort -u)

  if [ -n "$found" ]; then
    local ver
    ver="$("$found" --version 2>/dev/null | head -1 || true)"
    ok "$1 CLI" "$found  ${ver:-(无法取版本)}"
  else
    no "$1 CLI"
  fi
}

# ---- 桌面应用探测 ----
detect_app() {
  local label="$1" appname="$2" bundleid="$3"
  local p
  for p in "$HOME_DIR/Applications/$appname.app" "/Applications/$appname.app"; do
    if [ -d "$p" ]; then ok "$label" "$p"; return; fi
  done
  # Spotlight 兜底（按 bundle id）
  local hit
  hit="$(mdfind "kMDItemCFBundleIdentifier == '$bundleid'" 2>/dev/null | grep '\.app$' | head -1 || true)"
  if [ -n "$hit" ]; then ok "$label" "$hit (mdfind)"; return; fi
  no "$label"
}

printf "${YELLOW}Wellau Switch 探测自检 (macOS)${RESET}\n"
printf "${DIM}当前进程 PATH:${RESET} %s\n" "$PATH"

section "命令行 CLI"
detect_cli "claude"
detect_cli "codex"

section "桌面应用"
detect_app "Claude 桌面版" "Claude" "com.anthropic.claudefordesktop"
detect_app "Codex 桌面版"  "Codex"  "com.openai.codex"

printf "\n${DIM}说明：CLI 扫描了 PATH + npm-global/homebrew/nvm/volta/bun 等常见目录；桌面版查 ~/Applications、/Applications 及 Spotlight bundle id。\n如果这里能检测到、但 App 里仍「待安装」，说明 App 进程环境/构建版本问题；如果这里也找不到，就是真没装在这些位置。${RESET}\n"
