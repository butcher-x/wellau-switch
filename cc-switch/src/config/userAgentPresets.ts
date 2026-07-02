/**
 * 自定义 User-Agent 预设。
 *
 * 取值来自 PR #3671 对 Kimi Coding Plan（api.kimi.com/coding）UA 白名单的 curl 实测：
 * `claude-cli/*`、`claude-code/*`、`Kilo-Code/*` 可通过；`codex-cli`、`kimi-cli` 会被 403。
 * 白名单只校验 UA 名称前缀、不看版本号，因此用静态值即可，版本不会因 Claude Code 升级而失效。
 *
 * 第一条与 `stream_check.rs` 的 `DEFAULT_CLAUDE_CLI_USER_AGENT` 保持一致，用于通过
 * 校验 Claude Code 最低版本的严格上游（如 Wellau api.wellau.com）；其余为简短变体。
 *
 * 这些预设主要用于"非白名单 Coding Agent（Codex/Gemini/Hermes/OpenClaw 等）想接入受 UA
 * 限制的上游"的场景——把转发请求伪装成已在白名单内的客户端。是否使用由用户显式选择。
 */
/** 与后端 stream_check 默认探测 UA 对齐；Wellau 等上游要求 Claude Code ≥ 2.1.89。 */
export const DEFAULT_CLAUDE_CLI_USER_AGENT =
  "claude-cli/2.1.161 (external, cli)" as const;

export const USER_AGENT_PRESETS: readonly string[] = [
  DEFAULT_CLAUDE_CLI_USER_AGENT,
  "claude-cli/2.1.161",
  "claude-code/1.0.0",
  "claude-code/0.1.0",
  "Kilo-Code/1.0",
];
