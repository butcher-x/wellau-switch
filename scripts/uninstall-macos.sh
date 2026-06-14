#!/usr/bin/env bash
#
# Wellau Switch 安装能力测试清理脚本 (macOS)
#
# 目的：把 wellau-switch「一键安装」装上的东西卸干净，方便反复测试安装流程。
# 默认清理：
#   - Claude Code CLI (@anthropic-ai/claude-code) 与 Codex CLI (@openai/codex)
#   - Claude 桌面版 / Codex 桌面版（~/Applications 与 /Applications）
#   - Wellau 登录态（~/.wellau-switch/auth.json、~/.cc-switch/auth.json）
#
# 不会删除：Wellau Switch / CC Switch 应用本体，也不删它的数据库（providers/配置）。
#
# 可选开关：
#   --node         同时卸载 Node.js（pkg/usr-local/~.wellau）。
#                  ⚠️ 会导致 `pnpm dev` / `pnpm dev:wellau` 无法运行，需重装 Node。
#                  仅在测试「Node 自举」路径时使用。
#   --keep-login   保留登录态，不删 auth.json。
#   -h, --help     显示帮助。
#
# 用法：
#   bash scripts/uninstall-macos.sh
#   bash scripts/uninstall-macos.sh --node
#   bash scripts/uninstall-macos.sh --keep-login

set -uo pipefail

REMOVE_NODE=0
KEEP_LOGIN=0

for arg in "$@"; do
  case "$arg" in
    --node) REMOVE_NODE=1 ;;
    --keep-login) KEEP_LOGIN=1 ;;
    -h | --help)
      sed -n '2,33p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg（用 --help 查看用法）" >&2
      exit 1
      ;;
  esac
done

COLOR_RESET='\033[0m'
COLOR_CYAN='\033[36m'
COLOR_GREEN='\033[32m'
COLOR_YELLOW='\033[33m'
COLOR_RED='\033[31m'
COLOR_DIM='\033[2m'

STEP=0
TOTAL_STEPS=5
[ "$REMOVE_NODE" -eq 1 ] && TOTAL_STEPS=6

step() {
  STEP=$((STEP + 1))
  printf '\n%b[%s/%s] %s%b\n' "$COLOR_CYAN" "$STEP" "$TOTAL_STEPS" "$1" "$COLOR_RESET"
}
info() { printf '%b  -%b %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"; }
ok() { printf '%b  OK%b %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$1"; }
warn() { printf '%b  !%b %s\n' "$COLOR_RED" "$COLOR_RESET" "$1"; }

remove_path() {
  local path="$1"
  if [ -e "$path" ] || [ -L "$path" ]; then
    info "删除: $path"
    rm -rf "$path" 2>/dev/null || sudo rm -rf "$path" 2>/dev/null || warn "删除失败: $path"
  fi
}

kill_app() {
  local app_name="$1"
  local match="$2"
  osascript -e "tell application \"$app_name\" to quit" >/dev/null 2>&1 || true
  local pids
  pids="$(pgrep -f "$match" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    info "结束进程: $app_name"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(pgrep -f "$match" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

npm_prefixes() {
  local prefixes=()
  if command -v npm >/dev/null 2>&1; then
    local p
    p="$(npm prefix -g 2>/dev/null || true)"
    [ -n "$p" ] && prefixes+=("$p")
  fi
  prefixes+=("$HOME/.npm-global" "/usr/local" "/opt/homebrew")
  printf '%s\n' "${prefixes[@]}" | awk 'NF' | sort -u
}

main() {
  if [ "$(uname -s)" != "Darwin" ]; then
    warn "此脚本只支持 macOS。"
    exit 1
  fi

  printf '%b%s%b\n' "$COLOR_CYAN" "Wellau Switch 安装测试清理 (macOS)" "$COLOR_RESET"
  printf '%b%s%b\n' "$COLOR_DIM" "清理 Claude/Codex 的 CLI 与桌面版 + 登录态；不动 Wellau Switch 应用与数据库。" "$COLOR_RESET"
  if [ "$REMOVE_NODE" -eq 1 ]; then
    printf '%b%s%b\n' "$COLOR_RED" "已启用 --node：将卸载 Node.js（会导致 pnpm dev 无法运行，需重装）。" "$COLOR_RESET"
  fi

  step "退出 Claude / Codex 桌面应用"
  kill_app "Claude" "/Claude.app"
  kill_app "Codex" "/Codex.app"
  ok "桌面应用已退出"

  step "删除 Claude / Codex 桌面版"
  remove_path "$HOME/Applications/Claude.app"
  remove_path "$HOME/Applications/Codex.app"
  remove_path "/Applications/Claude.app"
  remove_path "/Applications/Codex.app"
  ok "桌面版已删除"

  step "卸载 Claude Code CLI 与 Codex CLI"
  if command -v npm >/dev/null 2>&1; then
    info "npm uninstall -g @anthropic-ai/claude-code @openai/codex"
    npm uninstall -g @anthropic-ai/claude-code @openai/codex >/dev/null 2>&1 || true
  else
    info "未检测到 npm，跳过 npm 卸载，直接清理残留文件"
  fi
  while IFS= read -r prefix; do
    [ -z "$prefix" ] && continue
    remove_path "$prefix/bin/claude"
    remove_path "$prefix/bin/codex"
    remove_path "$prefix/lib/node_modules/@anthropic-ai/claude-code"
    remove_path "$prefix/lib/node_modules/@openai/codex"
  done < <(npm_prefixes)
  # 兜底：清理仍在 PATH 中的 claude/codex 可执行文件
  for cmd in claude codex; do
    p="$(command -v "$cmd" 2>/dev/null || true)"
    [ -n "$p" ] && remove_path "$p"
  done
  hash -r 2>/dev/null || true
  ok "CLI 已清理"

  step "清理 Wellau 登录态"
  if [ "$KEEP_LOGIN" -eq 1 ]; then
    info "检测到 --keep-login，保留 auth.json"
  else
    remove_path "$HOME/.wellau-switch/auth.json"
    remove_path "$HOME/.cc-switch/auth.json"
    info "已登录的供应商会在下次登录时幂等重导入；如需彻底清除，请在应用内先「登出」。"
  fi
  ok "登录态处理完成"

  if [ "$REMOVE_NODE" -eq 1 ]; then
    step "卸载 Node.js（--node）"
    info "获取管理员权限以删除系统 Node.js"
    sudo -v || warn "未获取到 sudo，部分系统文件可能删不掉"
    sudo pkgutil --forget org.nodejs.node.pkg >/dev/null 2>&1 || true
    sudo pkgutil --forget org.nodejs.npm.pkg >/dev/null 2>&1 || true
    remove_path "/usr/local/bin/node"
    remove_path "/usr/local/bin/npm"
    remove_path "/usr/local/bin/npx"
    remove_path "/usr/local/bin/corepack"
    remove_path "/usr/local/lib/node_modules"
    remove_path "/usr/local/include/node"
    remove_path "$HOME/.wellau/node-v24.16.0"
    hash -r 2>/dev/null || true
    if command -v node >/dev/null 2>&1; then
      warn "node 仍可用: $(command -v node)（可能来自 Homebrew/nvm，需自行处理）"
    else
      ok "node 已移除"
    fi
  fi

  printf '\n%bWellau Switch 验证状态:%b\n' "$COLOR_CYAN" "$COLOR_RESET"
  for cmd in claude codex; do
    if command -v "$cmd" >/dev/null 2>&1; then
      warn "$cmd 仍可用: $(command -v "$cmd")"
    else
      ok "$cmd 已移除"
    fi
  done
  [ -d "$HOME/Applications/Claude.app" ] || [ -d "/Applications/Claude.app" ] && warn "Claude.app 仍存在" || ok "Claude.app 已移除"
  [ -d "$HOME/Applications/Codex.app" ] || [ -d "/Applications/Codex.app" ] && warn "Codex.app 仍存在" || ok "Codex.app 已移除"

  printf '\n%b%s%b\n' "$COLOR_GREEN" "清理完成。建议新开一个终端，再到 Wellau Switch「设置→通用→环境安装」重新测试一键安装。" "$COLOR_RESET"
}

main
