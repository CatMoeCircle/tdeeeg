import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 单个账户的展示信息（来自 Rust 端账户清单 + 运行时元数据） */
export interface AccountInfo {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  logged_in: boolean;
  avatar_path: string | null;
  is_active: boolean;
  /** 该账户登录时使用的 TDLib 参数 */
  use_test_dc: boolean | null;
  custom_api_creds: boolean | null;
  api_id: number | null;
  api_hash: string | null;
}

export const useAccountsStore = defineStore("accounts", () => {
  const accounts = ref<AccountInfo[]>([]);
  let initialized = false;

  /** 当前活动账户 */
  const activeAccount = computed(() => accounts.value.find((a) => a.is_active));

  /** 初始化：拉取账户列表 + 订阅 Rust 端账户元数据变化事件 */
  async function init() {
    if (initialized) return;
    initialized = true;
    await listen<AccountInfo[]>("accounts-updated", (event) => {
      accounts.value = event.payload ?? [];
    });
    await refresh();
  }

  /** 手动刷新账户列表 */
  async function refresh() {
    try {
      accounts.value = await invoke<AccountInfo[]>("get_accounts");
    } catch (e) {
      console.error("Failed to load accounts:", e);
    }
  }

  /** 新增账户：Rust 端创建新会话并设为活动，随后重载进入登录流程 */
  async function addAccount() {
    await invoke<number>("add_account");
    window.location.reload();
  }

  /** 切换账户：重载后前端引导到目标账户 */
  async function switchAccount(id: number) {
    await invoke("switch_account", { sessionId: id });
    window.location.reload();
  }

  /** 登出（并移除）指定账户 */
  async function logoutAccount(id: number) {
    await invoke("logout_account", { sessionId: id });
    window.location.reload();
  }

  return { accounts, activeAccount, init, refresh, addAccount, switchAccount, logoutAccount };
});