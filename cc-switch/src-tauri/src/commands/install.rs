//! 环境安装命令（从 wellau-installer 迁移）。
//!
//! - `probe_desktop_apps`：探测 Claude / Codex 桌面应用安装状态。
//! - `install_desktop_app`：下载并安装桌面应用（macOS 默认落 `~/Applications`，全程免授权）。
//! - `install_node`：Node.js 自举（幂等：已有 npm 则跳过；仅装 CLI 缺 npm 时触发）。
//!
//! CLI 安装/更新沿用 `commands::misc::run_tool_lifecycle_action`，不在此重复。
//! 下载统一走 `crate::proxy::http_client::get()`（继承全局代理），进度通过
//! `install-progress` 事件回报给前端。

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

const CLAUDE_MAC_DMG_URL: &str =
    "https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect";
const CLAUDE_WIN_X64_MSIX_URL: &str =
    "https://claude.ai/api/desktop/win32/x64/msix/latest/redirect";
const CLAUDE_WIN_ARM64_MSIX_URL: &str =
    "https://claude.ai/api/desktop/win32/arm64/msix/latest/redirect";
const CODEX_WIN_MSIX_URL: &str = "https://codexapp.agentsmirror.com/latest/win";

const NODE_VERSION: &str = "v24.16.0";
const NODE_BASE_URL: &str = "https://nodejs.org/dist/v24.16.0";

#[derive(Serialize, Clone)]
pub struct DesktopAppStatus {
    app: String,
    installed: bool,
    path: Option<String>,
}

#[derive(Serialize, Clone)]
struct InstallProgress {
    target: String,
    phase: String,
    percent: Option<u8>,
    message: String,
}

fn emit_progress(app: &AppHandle, target: &str, phase: &str, percent: Option<u8>, message: &str) {
    let _ = app.emit(
        "install-progress",
        InstallProgress {
            target: target.to_string(),
            phase: phase.to_string(),
            percent,
            message: message.to_string(),
        },
    );
}

/// 取子进程输出末尾若干行作为可读错误（与 misc.rs 的 last_lines 风格一致）。
fn tail_output(output: &std::process::Output) -> String {
    let text = if !output.stderr.is_empty() {
        String::from_utf8_lossy(&output.stderr)
    } else {
        String::from_utf8_lossy(&output.stdout)
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(8);
    let tail = lines[start..].join("\n");
    if tail.trim().is_empty() {
        format!("命令失败 (exit code: {:?})", output.status.code())
    } else {
        tail
    }
}

/// 流式下载并按 content-length 回报进度。
async fn download_with_progress(
    app: &AppHandle,
    target: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    use futures::StreamExt;
    use std::io::Write;

    let client = crate::proxy::http_client::get();
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status().as_u16()));
    }

    let total = resp.content_length();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut last_pct: u8 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
        file.write_all(&chunk).map_err(|e| format!("写入失败: {e}"))?;
        downloaded += chunk.len() as u64;
        if let Some(total) = total {
            if total > 0 {
                let pct = ((downloaded.saturating_mul(100)) / total) as u8;
                if pct != last_pct {
                    last_pct = pct;
                    emit_progress(app, target, "download", Some(pct), "下载中");
                }
            }
        }
    }

    file.flush().map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

// ============================================================
// 探测
// ============================================================

fn probe_paths(app: &str) -> Vec<PathBuf> {
    let app_name = if app == "claude" { "Claude" } else { "Codex" };
    let mut out = Vec::new();
    match std::env::consts::OS {
        "macos" => {
            if let Some(home) = dirs::home_dir() {
                out.push(home.join("Applications").join(format!("{app_name}.app")));
            }
            out.push(PathBuf::from(format!("/Applications/{app_name}.app")));
        }
        "windows" => {
            if let Ok(la) = std::env::var("LOCALAPPDATA") {
                let la = PathBuf::from(la);
                out.push(la.join(format!("Programs/{app_name}/{app_name}.exe")));
                out.push(la.join(format!("{app_name}/{app_name}.exe")));
                if app == "claude" {
                    out.push(la.join("AnthropicClaude/Claude.exe"));
                }
            }
            if let Ok(pf) = std::env::var("ProgramFiles") {
                out.push(PathBuf::from(pf).join(format!("{app_name}/{app_name}.exe")));
            }
        }
        _ => {}
    }
    out
}

fn probe_one(app: &str) -> DesktopAppStatus {
    for candidate in probe_paths(app) {
        if candidate.exists() {
            return DesktopAppStatus {
                app: app.to_string(),
                installed: true,
                path: Some(candidate.to_string_lossy().to_string()),
            };
        }
    }
    DesktopAppStatus {
        app: app.to_string(),
        installed: false,
        path: None,
    }
}

#[tauri::command]
pub fn probe_desktop_apps(apps: Vec<String>) -> Vec<DesktopAppStatus> {
    apps.iter().map(|app| probe_one(app)).collect()
}

// ============================================================
// 桌面应用安装
// ============================================================

fn mac_user_apps_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("无法获取用户目录")?;
    let dir = home.join("Applications");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 ~/Applications 失败: {e}"))?;
    Ok(dir)
}

/// 挂载 dmg → 拷贝 .app 到目标目录（用户态，无 sudo）→ 卸载。
fn mac_mount_copy(dmg: &str, mount: &str, app_name: &str, target_dir: &str) -> Result<(), String> {
    let _ = Command::new("hdiutil")
        .args(["detach", mount, "-quiet"])
        .output();

    let attach = Command::new("hdiutil")
        .args(["attach", dmg, "-nobrowse", "-quiet", "-mountpoint", mount])
        .output()
        .map_err(|e| format!("挂载镜像失败: {e}"))?;
    if !attach.status.success() {
        return Err(tail_output(&attach));
    }

    let result = (|| -> Result<(), String> {
        let src = format!("{mount}/{app_name}");
        if !Path::new(&src).exists() {
            return Err(format!("镜像中未找到 {app_name}"));
        }
        let target_app = format!("{target_dir}/{app_name}");
        let _ = std::fs::remove_dir_all(&target_app);
        let copy = Command::new("ditto")
            .args([src.as_str(), target_app.as_str()])
            .output()
            .map_err(|e| format!("拷贝失败: {e}"))?;
        if !copy.status.success() {
            return Err(tail_output(&copy));
        }
        Ok(())
    })();

    let _ = Command::new("hdiutil")
        .args(["detach", mount, "-quiet"])
        .output();
    result
}

async fn install_claude_mac(app: &AppHandle) -> Result<(), String> {
    let dmg = std::env::temp_dir().join("cc-switch-Claude-latest.dmg");
    emit_progress(app, "claude-desktop", "download", Some(0), "开始下载");
    download_with_progress(app, "claude-desktop", CLAUDE_MAC_DMG_URL, &dmg).await?;

    let target_dir = mac_user_apps_dir()?;
    emit_progress(app, "claude-desktop", "install", None, "安装到 ~/Applications");
    let dmg_s = dmg.to_string_lossy().to_string();
    let mount = "/Volumes/Claude (cc-switch)".to_string();
    let target_s = target_dir.to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || mac_mount_copy(&dmg_s, &mount, "Claude.app", &target_s))
        .await
        .map_err(|e| format!("安装任务错误: {e}"))??;
    let _ = std::fs::remove_file(&dmg);
    Ok(())
}

async fn install_codex_mac(app: &AppHandle) -> Result<(), String> {
    // macOS Codex 桌面版由官方 `codex app` 子命令安装（依赖 Codex CLI 已就绪）。
    emit_progress(app, "codex-desktop", "install", None, "执行 codex app");
    let out = tokio::task::spawn_blocking(|| Command::new("codex").arg("app").output())
        .await
        .map_err(|e| format!("安装任务错误: {e}"))?;
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(tail_output(&o)),
        Err(_) => Err(
            "未检测到 Codex CLI，请先安装 Codex CLI，或前往 https://developers.openai.com/codex/ 手动安装 Codex 桌面版"
                .to_string(),
        ),
    }
}

/// Windows: 下载官方/镜像 MSIX → Add-AppxPackage（用户态，无需提权）。
async fn install_msix(
    app: &AppHandle,
    target: &str,
    url: &str,
    file_name: &str,
) -> Result<(), String> {
    let path = std::env::temp_dir().join(file_name);
    emit_progress(app, target, "download", Some(0), "开始下载");
    download_with_progress(app, target, url, &path).await?;

    emit_progress(app, target, "install", None, "注册应用包");
    let escaped = path.to_string_lossy().replace('\'', "''");
    let out = tokio::task::spawn_blocking(move || {
        Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!("Add-AppxPackage -Path '{escaped}'"),
            ])
            .output()
    })
    .await
    .map_err(|e| format!("安装任务错误: {e}"))?;
    let _ = std::fs::remove_file(&path);
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(tail_output(&o)),
        Err(e) => Err(format!("执行失败: {e}")),
    }
}

fn claude_win_msix_url() -> &'static str {
    if std::env::consts::ARCH == "aarch64" {
        CLAUDE_WIN_ARM64_MSIX_URL
    } else {
        CLAUDE_WIN_X64_MSIX_URL
    }
}

#[tauri::command]
pub async fn install_desktop_app(app_handle: AppHandle, app: String) -> Result<(), String> {
    match (app.as_str(), std::env::consts::OS) {
        ("claude", "macos") => install_claude_mac(&app_handle).await,
        ("claude", "windows") => {
            install_msix(
                &app_handle,
                "claude-desktop",
                claude_win_msix_url(),
                "cc-switch-Claude.msix",
            )
            .await
        }
        ("codex", "macos") => install_codex_mac(&app_handle).await,
        ("codex", "windows") => {
            install_msix(
                &app_handle,
                "codex-desktop",
                CODEX_WIN_MSIX_URL,
                "cc-switch-OpenAI.Codex.msix",
            )
            .await
        }
        _ => Err(format!("当前系统不支持自动安装 {app} 桌面版")),
    }
}

// ============================================================
// Node.js 自举
// ============================================================

/// 检查 npm 是否可用（用登录 shell 以拿到 nvm/homebrew 等 PATH）。
fn npm_available() -> bool {
    let result = if std::env::consts::OS == "windows" {
        Command::new("cmd").args(["/C", "npm --version"]).output()
    } else {
        Command::new("bash").args(["-lc", "npm --version"]).output()
    };
    result.map(|o| o.status.success()).unwrap_or(false)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// 用官方 SHASUMS256.txt 校验下载的安装包。
async fn verify_node_sha256(file: &Path, file_name: &str) -> Result<(), String> {
    let client = crate::proxy::http_client::get();
    let text = client
        .get(format!("{NODE_BASE_URL}/SHASUMS256.txt"))
        .send()
        .await
        .map_err(|e| format!("获取校验和失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("读取校验和失败: {e}"))?;

    let expected = text
        .lines()
        .find_map(|line| {
            let mut it = line.split_whitespace();
            let hash = it.next()?;
            let name = it.next()?;
            if name == file_name {
                Some(hash.to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| format!("校验和列表中未找到 {file_name}"))?;

    let path = file.to_path_buf();
    let actual = tokio::task::spawn_blocking(move || sha256_file(&path))
        .await
        .map_err(|e| format!("校验任务错误: {e}"))??;

    if actual.eq_ignore_ascii_case(&expected) {
        Ok(())
    } else {
        Err("Node.js 安装包校验失败（哈希不匹配），已中止安装".to_string())
    }
}

async fn install_node_mac(app: &AppHandle) -> Result<(), String> {
    let file_name = format!("node-{NODE_VERSION}.pkg");
    let pkg = std::env::temp_dir().join(&file_name);
    emit_progress(app, "node", "download", Some(0), "下载 Node.js");
    download_with_progress(app, "node", &format!("{NODE_BASE_URL}/{file_name}"), &pkg).await?;
    emit_progress(app, "node", "verify", None, "校验安装包");
    verify_node_sha256(&pkg, &file_name).await?;

    emit_progress(app, "node", "install", None, "安装（需要授权）");
    // installer 需要 root；用 osascript 触发原生 GUI 授权弹窗（规避终端 sudo 死结）。
    let pkg_escaped = pkg
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script = format!(
        "do shell script \"installer -pkg \\\"{pkg_escaped}\\\" -target /\" with administrator privileges"
    );
    let out = tokio::task::spawn_blocking(move || {
        Command::new("osascript").args(["-e", &script]).output()
    })
    .await
    .map_err(|e| format!("安装任务错误: {e}"))?;
    let _ = std::fs::remove_file(&pkg);
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(tail_output(&o)),
        Err(e) => Err(format!("执行失败: {e}")),
    }
}

async fn install_node_windows(app: &AppHandle) -> Result<(), String> {
    let arch = if std::env::consts::ARCH == "aarch64" {
        "arm64"
    } else {
        "x64"
    };
    let file_name = format!("node-{NODE_VERSION}-{arch}.msi");
    let msi = std::env::temp_dir().join(&file_name);
    emit_progress(app, "node", "download", Some(0), "下载 Node.js");
    download_with_progress(app, "node", &format!("{NODE_BASE_URL}/{file_name}"), &msi).await?;
    emit_progress(app, "node", "verify", None, "校验安装包");
    verify_node_sha256(&msi, &file_name).await?;

    emit_progress(app, "node", "install", None, "安装（需要授权）");
    let escaped = msi.to_string_lossy().replace('\'', "''");
    let cmd = format!(
        "Start-Process msiexec -ArgumentList '/i','\"{escaped}\"','/qn','/norestart' -Verb RunAs -Wait"
    );
    let out = tokio::task::spawn_blocking(move || {
        Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &cmd])
            .output()
    })
    .await
    .map_err(|e| format!("安装任务错误: {e}"))?;
    let _ = std::fs::remove_file(&msi);
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(tail_output(&o)),
        Err(e) => Err(format!("执行失败: {e}")),
    }
}

async fn install_node_linux(app: &AppHandle) -> Result<(), String> {
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => return Err(format!("不支持的 Linux 架构: {other}")),
    };
    let file_name = format!("node-{NODE_VERSION}-linux-{arch}.tar.xz");
    let tarball = std::env::temp_dir().join(&file_name);
    emit_progress(app, "node", "download", Some(0), "下载 Node.js");
    download_with_progress(app, "node", &format!("{NODE_BASE_URL}/{file_name}"), &tarball).await?;
    emit_progress(app, "node", "verify", None, "校验安装包");
    verify_node_sha256(&tarball, &file_name).await?;

    let home = dirs::home_dir().ok_or("无法获取用户目录")?;
    let dest = home.join(".wellau").join(format!("node-{NODE_VERSION}"));
    emit_progress(app, "node", "install", None, "解压安装");
    let tarball_s = tarball.to_string_lossy().to_string();
    let dest_s = dest.to_string_lossy().to_string();
    // 注意：解压到 ~/.wellau，需要用户把 <dest>/bin 加入 PATH 后 CLI 安装才能用到 npm。
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let _ = std::fs::remove_dir_all(&dest_s);
        std::fs::create_dir_all(&dest_s).map_err(|e| format!("创建目录失败: {e}"))?;
        let out = Command::new("tar")
            .args(["-xJf", &tarball_s, "-C", &dest_s, "--strip-components=1"])
            .output()
            .map_err(|e| format!("解压失败: {e}"))?;
        if !out.status.success() {
            return Err(tail_output(&out));
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("安装任务错误: {e}"))??;
    let _ = std::fs::remove_file(&tarball);
    Ok(())
}

#[tauri::command]
pub async fn install_node(app_handle: AppHandle) -> Result<(), String> {
    // 幂等：已有 npm 则直接跳过（前端在装 CLI 前无条件调用本命令）。
    if tokio::task::spawn_blocking(npm_available)
        .await
        .unwrap_or(false)
    {
        return Ok(());
    }

    match std::env::consts::OS {
        "macos" => install_node_mac(&app_handle).await,
        "windows" => install_node_windows(&app_handle).await,
        "linux" => install_node_linux(&app_handle).await,
        other => Err(format!("当前系统不支持自动安装 Node.js: {other}")),
    }
}
