import { invoke } from "@tauri-apps/api/core";
import { providersApi } from "@/lib/api/providers";
import { failoverApi } from "@/lib/api/failover";
import type { AppId } from "@/lib/api/types";
import type { Provider } from "@/types";
import { wellauAuthApi } from "@wellau/auth/api";
import type { ImportSummary, WellauKey } from "@wellau/auth/types";

/** Wellau 网关基础地址（与 wellau-installer 的 WELLAU_BASE_URL 保持一致）。 */
const WELLAU_BASE_URL = "https://api.wellau.com";

/** 与 wellau-installer/src/ccSwitch.js 的 codexConfigToml 保持一致。 */
function codexConfigToml(): string {
  return `model_provider = "OpenAI"
model = "gpt-5.5"
model_reasoning_effort = "high"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${WELLAU_BASE_URL}"
wire_api = "responses"
`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 生成确定性 provider id，与 wellau-installer 的 providerIdForKey 完全一致，
 * 确保 CLI 安装器与桌面端导入同一个 key 时落到同一条记录（幂等去重）。
 */
async function providerIdForKey(
  key: string,
  appType: AppId,
  platform: string,
): Promise<string> {
  const hash = (await sha256Hex(key)).slice(0, 12);
  if (appType === "codex" && platform === "openai") {
    return `wellau-openai-${hash}`;
  }
  return `wellau-${appType}-${platform}-${hash}`;
}

interface ImportTarget {
  appType: AppId;
  platform: string;
  defaultName: string;
  icon: string;
}

function settingsConfigFor(target: ImportTarget, key: WellauKey): Record<string, unknown> {
  if (target.appType === "claude") {
    return {
      env: {
        ANTHROPIC_BASE_URL: WELLAU_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: key.key,
      },
    };
  }
  // codex
  return {
    auth: { OPENAI_API_KEY: key.key },
    config: codexConfigToml(),
  };
}

const CLAUDE_PLATFORMS = new Set(["anthropic", "claude"]);
const OPENAI_PLATFORMS = new Set(["openai"]);

function targetForKey(key: WellauKey): ImportTarget | null {
  if (CLAUDE_PLATFORMS.has(key.platform)) {
    return {
      appType: "claude",
      platform: "anthropic",
      defaultName: "Wellau Claude",
      icon: "anthropic",
    };
  }
  if (OPENAI_PLATFORMS.has(key.platform)) {
    return {
      appType: "codex",
      platform: "openai",
      defaultName: "Wellau OpenAI",
      icon: "openai",
    };
  }
  return null;
}

async function buildProvider(
  key: WellauKey,
  target: ImportTarget,
): Promise<Provider> {
  const id = await providerIdForKey(key.key, target.appType, target.platform);
  return {
    id,
    name: key.name || target.defaultName,
    settingsConfig: settingsConfigFor(target, key),
    websiteUrl: "https://wellau.com",
    // 类型化的 ProviderCategory 不含 "wellau"；用 third_party，
    // Wellau 来源通过 id 前缀 "wellau-" 识别（与 wellau-installer 一致）。
    category: "third_party",
    createdAt: Date.now(),
    icon: target.icon,
    // 自动加入故障转移队列，配合默认开启的 auto_failover。
    inFailoverQueue: true,
  };
}

/**
 * 拉取当前账号的全部活跃 Key 并幂等导入为供应商。
 * provider id 由 key 派生，重复导入会走 upsert（add 底层 save_provider）。
 */
export async function importWellauKeys(): Promise<ImportSummary> {
  const keys = await wellauAuthApi.listKeys();
  const summary: ImportSummary = { imported: 0, claude: 0, codex: 0, skipped: 0 };
  const importedApps = new Set<AppId>();

  for (const key of keys) {
    const target = targetForKey(key);
    if (!target) {
      summary.skipped += 1;
      continue;
    }
    const provider = await buildProvider(key, target);
    // addToLive=false：仅入库，不直接写 live 配置，由用户主动切换。
    await providersApi.add(provider, target.appType, false);
    // 显式入队：save_provider 在「更新已存在供应商」时会保留旧的
    // in_failover_queue，因此对已存在的供应商，inFailoverQueue:true 不会生效。
    // 这里再调一次 add_to_failover_queue，保证无论新建还是更新都进入队列。
    try {
      await failoverApi.addToFailoverQueue(target.appType, provider.id);
    } catch {
      // 已在队列中或入队失败都不应阻断导入。
    }
    importedApps.add(target.appType);
    summary.imported += 1;
    if (target.appType === "claude") summary.claude += 1;
    else summary.codex += 1;
  }

  // 导入完成后再开启路由接管：此时已有当前供应商，接管才能成功。
  // （启动时如果还没登录/没有供应商，接管会失败并被清掉 enabled，所以必须放在这里。）
  for (const appId of importedApps) {
    try {
      await invoke("set_proxy_takeover_for_app", {
        appType: appId,
        enabled: true,
      });
    } catch (e) {
      console.error(`[WellauAuth] 开启 ${appId} 路由接管失败`, e);
    }
  }

  return summary;
}
