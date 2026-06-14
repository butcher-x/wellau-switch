//! Wellau 账号登录 / 登出
//!
//! 这是 Wellau Switch overlay 的后端注入点：负责持有 Wellau 会话凭证
//! (access_token / refresh_token)，并将其持久化到 `~/.wellau-switch/auth.json`
//! (`0600`)。前端只能拿到脱敏后的 [`WellauSession`]，原始 token 不出后端。
//!
//! 接口沿用 wellau-installer 中已验证的端点：
//! - `POST /api/v1/auth/login`
//! - `GET  /api/v1/keys`
//! 响应统一包装为 `{ code, message, data }`，`code == 0` 时取 `data`。

use chrono::Utc;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

/// Wellau 导入的供应商 id 前缀（与前端 providerIdForKey 一致）。
const WELLAU_PROVIDER_PREFIX: &str = "wellau-";

const LOGIN_URL: &str = "https://wellau.com/api/v1/auth/login";
const REFRESH_URL: &str = "https://wellau.com/api/v1/auth/refresh";
const KEYS_URL: &str = "https://wellau.com/api/v1/keys";
const REQUEST_TIMEOUT_SECS: u64 = 30;
/// token 剩余有效期低于该阈值（秒）时，使用前先刷新。
const REFRESH_SKEW_SECS: i64 = 60;
/// 前端可识别的未登录错误码，用于触发回到登录态。
const ERR_UNAUTHENTICATED: &str = "UNAUTHENTICATED";

/// 内存中的会话缓存，避免每次命令都读盘。
static AUTH: OnceCell<Mutex<Option<StoredAuth>>> = OnceCell::new();

fn auth_cache() -> &'static Mutex<Option<StoredAuth>> {
    AUTH.get_or_init(|| Mutex::new(load_from_disk()))
}

/// 持久化到磁盘的完整凭证（含 token，绝不返回给前端）。
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredAuth {
    email: String,
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    /// 过期时间戳（unix 秒）。
    expires_at: i64,
    user_id: i64,
    #[serde(default)]
    balance: f64,
}

/// 返回给前端的脱敏会话视图（不含任何 token）。
#[derive(Debug, Clone, Serialize)]
pub struct WellauSession {
    pub email: String,
    pub user_id: i64,
    pub balance: f64,
    pub expires_at: i64,
    pub logged_in: bool,
}

impl From<&StoredAuth> for WellauSession {
    fn from(a: &StoredAuth) -> Self {
        WellauSession {
            email: a.email.clone(),
            user_id: a.user_id,
            balance: a.balance,
            expires_at: a.expires_at,
            logged_in: true,
        }
    }
}

/// 返回给前端的 Key（`sk-*` 是供应商 API Key，本就会写入本地配置，可暴露）。
#[derive(Debug, Clone, Serialize)]
pub struct WellauKey {
    pub key: String,
    pub name: String,
    pub platform: String,
    pub status: String,
}

// ---- API 响应结构 ----

#[derive(Deserialize)]
struct ApiEnvelope<T> {
    code: i64,
    message: Option<String>,
    data: Option<T>,
}

#[derive(Deserialize)]
struct LoginData {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    user: UserInfo,
}

#[derive(Deserialize)]
struct RefreshData {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfo {
    id: i64,
    email: String,
    #[serde(default)]
    balance: f64,
}

#[derive(Deserialize)]
struct KeysData {
    #[serde(default)]
    items: Option<Vec<KeyItem>>,
    #[serde(default)]
    pages: Option<i64>,
}

#[derive(Deserialize)]
struct KeyItem {
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    group: Option<KeyGroup>,
}

#[derive(Deserialize)]
struct KeyGroup {
    #[serde(default)]
    platform: Option<String>,
}

// ---- 持久化 ----

fn auth_file_path() -> PathBuf {
    crate::config::get_app_config_dir().join("auth.json")
}

fn load_from_disk() -> Option<StoredAuth> {
    let path = auth_file_path();
    let content = std::fs::read_to_string(&path).ok()?;
    match serde_json::from_str::<StoredAuth>(&content) {
        Ok(auth) => Some(auth),
        Err(e) => {
            log::warn!("[WellauAuth] 解析 auth.json 失败: {e}");
            None
        }
    }
}

fn save_to_disk(auth: &StoredAuth) -> Result<(), String> {
    let path = auth_file_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(auth)
        .map_err(|e| format!("序列化凭证失败: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("写入 auth.json 失败: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, perms);
        }
    }

    Ok(())
}

fn remove_from_disk() {
    let path = auth_file_path();
    if path.exists() {
        if let Err(e) = std::fs::remove_file(&path) {
            log::warn!("[WellauAuth] 删除 auth.json 失败: {e}");
        }
    }
}

/// 读取当前内存中的凭证（克隆出来，避免跨 await 持锁）。
fn current() -> Option<StoredAuth> {
    auth_cache().lock().ok().and_then(|guard| guard.clone())
}

/// 更新内存 + 磁盘。
fn persist(auth: StoredAuth) -> Result<WellauSession, String> {
    save_to_disk(&auth)?;
    let session = WellauSession::from(&auth);
    if let Ok(mut guard) = auth_cache().lock() {
        *guard = Some(auth);
    }
    Ok(session)
}

/// 清空内存 + 磁盘。
fn clear() {
    remove_from_disk();
    if let Ok(mut guard) = auth_cache().lock() {
        *guard = None;
    }
}

fn expires_at_from(expires_in: Option<i64>) -> i64 {
    // 默认 24h（与服务端 expires_in=86400 一致）。
    let ttl = expires_in.unwrap_or(86_400);
    Utc::now().timestamp() + ttl
}

// ---- HTTP ----

/// 解析统一包装的响应体，`code != 0` 视为错误。
async fn parse_envelope<T: for<'de> Deserialize<'de>>(
    resp: reqwest::Response,
) -> Result<T, String> {
    let status = resp.status();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    let envelope: ApiEnvelope<T> = serde_json::from_slice(&bytes).map_err(|e| {
        if !status.is_success() {
            format!("HTTP {}", status.as_u16())
        } else {
            format!("解析响应失败: {e}")
        }
    })?;
    if envelope.code != 0 {
        return Err(envelope
            .message
            .unwrap_or_else(|| format!("Wellau API 返回错误 (code={})", envelope.code)));
    }
    envelope
        .data
        .ok_or_else(|| "Wellau API 响应缺少 data".to_string())
}

/// 用 refresh_token 续期；失败则清空会话。
async fn refresh_internal(stored: StoredAuth) -> Result<StoredAuth, String> {
    let refresh_token = match &stored.refresh_token {
        Some(t) if !t.is_empty() => t.clone(),
        _ => {
            clear();
            return Err(ERR_UNAUTHENTICATED.to_string());
        }
    };

    let client = crate::proxy::http_client::get();
    let resp = client
        .post(REFRESH_URL)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            // 网络错误不清会话，留给前端重试。
            return Err(format!("刷新登录态失败: {e}"));
        }
    };

    match parse_envelope::<RefreshData>(resp).await {
        Ok(data) => {
            let updated = StoredAuth {
                email: stored.email.clone(),
                access_token: data.access_token,
                refresh_token: data.refresh_token.or(stored.refresh_token.clone()),
                expires_at: expires_at_from(data.expires_in),
                user_id: stored.user_id,
                balance: stored.balance,
            };
            save_to_disk(&updated)?;
            if let Ok(mut guard) = auth_cache().lock() {
                *guard = Some(updated.clone());
            }
            Ok(updated)
        }
        Err(_) => {
            // refresh_token 失效：清会话，要求重新登录。
            clear();
            Err(ERR_UNAUTHENTICATED.to_string())
        }
    }
}

/// 返回一个有效的 access_token，必要时先刷新（对调用方透明）。
async fn valid_access_token() -> Result<String, String> {
    let stored = current().ok_or_else(|| ERR_UNAUTHENTICATED.to_string())?;
    let now = Utc::now().timestamp();
    if stored.expires_at - now > REFRESH_SKEW_SECS {
        return Ok(stored.access_token);
    }
    let refreshed = refresh_internal(stored).await?;
    Ok(refreshed.access_token)
}

// ---- Tauri 命令 ----

#[tauri::command]
pub async fn wellau_login(email: String, password: String) -> Result<WellauSession, String> {
    let email = email.trim().to_string();
    if email.is_empty() || password.is_empty() {
        return Err("邮箱和密码不能为空".to_string());
    }

    let client = crate::proxy::http_client::get();
    let resp = client
        .post(LOGIN_URL)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;

    let data: LoginData = parse_envelope(resp).await?;

    let auth = StoredAuth {
        email: data.user.email,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expires_at_from(data.expires_in),
        user_id: data.user.id,
        balance: data.user.balance,
    };
    persist(auth)
}

#[tauri::command]
pub async fn wellau_logout() -> Result<(), String> {
    clear();
    Ok(())
}

/// 删除所有由 Wellau 导入的供应商（id 以 `wellau-` 开头）。
///
/// 后端处理"当前供应商无法删除"的限制：若某个 Wellau 供应商正处于当前选中，
/// 先切换到任意一个非 Wellau 供应商（顺带把 live 配置切走，避免残留 Wellau 凭证）；
/// 若没有可切换的供应商，则清空当前指针并强制删除数据库记录。
#[tauri::command]
pub fn wellau_remove_imported_providers(state: State<'_, crate::AppState>) -> Result<usize, String> {
    use crate::{AppType, ProviderService};

    let mut removed = 0usize;
    for app_type in [AppType::Claude, AppType::Codex] {
        let providers = state
            .db
            .get_all_providers(app_type.as_str())
            .map_err(|e| e.to_string())?;

        let wellau_ids: Vec<String> = providers
            .keys()
            .filter(|id| id.starts_with(WELLAU_PROVIDER_PREFIX))
            .cloned()
            .collect();
        if wellau_ids.is_empty() {
            continue;
        }

        // 若当前选中的是 Wellau 供应商，先把"当前"移走。
        let current =
            ProviderService::current(state.inner(), app_type.clone()).unwrap_or_default();
        if current.starts_with(WELLAU_PROVIDER_PREFIX) {
            let fallback = providers
                .keys()
                .find(|id| !id.starts_with(WELLAU_PROVIDER_PREFIX))
                .cloned();
            match fallback {
                Some(fb) => {
                    let _ = ProviderService::switch(state.inner(), app_type.clone(), &fb);
                }
                None => {
                    let _ = crate::settings::set_current_provider(&app_type, None);
                }
            }
        }

        for id in &wellau_ids {
            // 正常删除会校验"非当前"；切换后应已通过。失败时（如无可切换的
            // 后备供应商）回退到直接删库，确保凭证不残留。
            if ProviderService::delete(state.inner(), app_type.clone(), id).is_ok()
                || state.db.delete_provider(app_type.as_str(), id).is_ok()
            {
                removed += 1;
            }
        }
    }

    Ok(removed)
}

#[tauri::command]
pub async fn wellau_get_session() -> Result<Option<WellauSession>, String> {
    Ok(current().as_ref().map(WellauSession::from))
}

#[tauri::command]
pub async fn wellau_refresh() -> Result<WellauSession, String> {
    let stored = current().ok_or_else(|| ERR_UNAUTHENTICATED.to_string())?;
    let refreshed = refresh_internal(stored).await?;
    Ok(WellauSession::from(&refreshed))
}

#[tauri::command]
pub async fn wellau_list_keys() -> Result<Vec<WellauKey>, String> {
    let token = valid_access_token().await?;
    let client = crate::proxy::http_client::get();

    let page_size = 100;
    let mut keys: Vec<WellauKey> = Vec::new();

    for page in 1..=100 {
        let url = format!(
            "{KEYS_URL}?page={page}&page_size={page_size}&sort_by=created_at&sort_order=desc"
        );
        let resp = client
            .get(&url)
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| format!("网络请求失败: {e}"))?;

        let data: KeysData = parse_envelope(resp).await?;
        let items = data.items.unwrap_or_default();
        let count = items.len();

        for item in items {
            let status = item.status.unwrap_or_default();
            let key = match item.key {
                Some(k) if !k.is_empty() => k,
                _ => continue,
            };
            if status != "active" {
                continue;
            }
            let platform = item
                .group
                .and_then(|g| g.platform)
                .unwrap_or_default();
            keys.push(WellauKey {
                key,
                name: item.name.unwrap_or_default(),
                platform,
                status,
            });
        }

        let reached_last_page = data.pages.map(|p| page >= p).unwrap_or(false);
        if count < page_size || reached_last_page {
            break;
        }
    }

    Ok(keys)
}
