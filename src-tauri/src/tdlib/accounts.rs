//! 账户清单命令、TDLib 初始化入口与旧数据迁移。

use super::lifecycle::{create_client, shutdown_client};
use super::loader::ensure_shared_loaded;
use super::{
    account_db_dir, account_files_dir, account_root_dir, builtin_api_hash, builtin_api_id,
    AccountRuntimeMeta, AppState,
};
use crate::store::accounts::AccountsStore;
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::{Emitter, State};

fn trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// 构建给前端的账户列表（命令路径与接收线程路径共用）。
pub(super) fn accounts_payload(
    accounts: &AccountsStore,
    meta: &HashMap<i64, AccountRuntimeMeta>,
    active: i64,
) -> Vec<serde_json::Value> {
    accounts
        .records()
        .iter()
        .map(|rec| {
            let m = meta.get(&rec.id);
            json!({
                "id": rec.id,
                "first_name": rec.first_name,
                "last_name": rec.last_name,
                "username": rec.username,
                "logged_in": m.map(|x| x.logged_in).unwrap_or(false),
                "avatar_path": m.and_then(|x| x.avatar_path.clone()),
                "is_active": rec.id == active,
                "use_test_dc": rec.use_test_dc,
                "custom_api_creds": rec.custom_api_creds,
                "api_id": rec.api_id,
                "api_hash": rec.api_hash,
            })
        })
        .collect()
}

// --- TDLib 自定义启动参数 ---
/// 更新全局 TDLib 连接参数。
/// - `use_custom_api = Some(true)` + api_id/api_hash：写入自定义凭据
/// - `use_custom_api = Some(false)`：显式回落到编译期内置凭据（避免 config 残留）
/// - `persist = true`：同步写入活动账户记录，供重建客户端 / 冷启动时优先读取
#[tauri::command]
pub fn set_tdlib_parameters(
    state: State<AppState>,
    api_id: Option<i32>,
    api_hash: Option<String>,
    use_custom_api: Option<bool>,
    use_test_dc: Option<bool>,
    persist: Option<bool>,
    language_pack_id: Option<String>,
    localization_target: Option<String>,
    system_language_code: Option<String>,
) -> Result<(), String> {
    let has_creds = api_id.is_some() && api_hash.is_some();
    let has_test_dc = use_test_dc.is_some();
    let has_language = language_pack_id.is_some()
        || localization_target.is_some()
        || system_language_code.is_some();
    let has_api_mode = use_custom_api.is_some();

    if api_id.is_some() != api_hash.is_some() {
        return Err("api_id and api_hash must be provided together".to_string());
    }
    if use_custom_api == Some(true) && !has_creds {
        return Err("use_custom_api=true requires api_id and api_hash".to_string());
    }
    if !has_creds && !has_test_dc && !has_language && !has_api_mode {
        return Err("No parameters provided to update".to_string());
    }

    // 最终是否使用自定义凭据（persist 与 setTdlibParameters 选择逻辑共用）
    let mut effective_custom = has_creds;

    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        if let Some(test_dc) = use_test_dc {
            config.use_test_dc = test_dc;
        }
        if use_custom_api == Some(false) {
            config.api_id = builtin_api_id();
            config.api_hash = builtin_api_hash();
            effective_custom = false;
        } else if let (Some(id), Some(hash)) = (api_id.as_ref(), api_hash.as_ref()) {
            if *id <= 0 {
                return Err("Invalid api_id: must be greater than 0".to_string());
            }
            if hash.trim().is_empty() {
                return Err("Invalid api_hash: cannot be empty".to_string());
            }
            config.api_id = *id;
            config.api_hash = hash.clone();
            effective_custom = true;
        }
        if let Some(v) = trimmed(language_pack_id) {
            config.language_pack_id = v;
        }
        if let Some(v) = trimmed(localization_target) {
            config.localization_target = v;
        }
        if let Some(v) = trimmed(system_language_code) {
            config.system_language_code = v;
        }    }

    // persist=true 时将凭据持久化到活动账户的记录中。
    // 内置凭据不保存 api_id/hash 到磁盘，防止泄露。
    if persist.unwrap_or(false) {
        let active_id = state.active.load(Ordering::SeqCst);
        let cfg = state.config.lock().map_err(|e| e.to_string())?;
        if let Ok(mut accounts) = state.accounts.lock() {
            accounts.set_tdlib_params(
                active_id,
                if effective_custom { Some(cfg.api_id) } else { None },
                if effective_custom {
                    Some(cfg.api_hash.as_str())
                } else {
                    None
                },
                cfg.use_test_dc,
                effective_custom,
            );
        }
    }
    Ok(())
}

// --- 账户管理命令 ---

#[tauri::command]
pub fn get_accounts(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let meta = state.account_meta.lock().map_err(|e| e.to_string())?;
    let accounts = state.accounts.lock().map_err(|e| e.to_string())?;
    Ok(accounts_payload(
        &accounts,
        &meta,
        state.active.load(Ordering::SeqCst),
    ))
}

/// 返回内置 API 账户数量与上限，供前端判断是否需要弹出自定义 API 弹窗。
#[tauri::command]
pub fn get_account_limits(state: State<AppState>) -> Result<serde_json::Value, String> {
    let accounts = state.accounts.lock().map_err(|e| e.to_string())?;
    let builtin_count = accounts.count_builtin_accounts();
    let limit = AccountsStore::BUILTIN_API_LIMIT;
    Ok(json!({
        "builtin_count": builtin_count,
        "limit": limit,
        "reached": builtin_count >= limit,
    }))
}

/// 新增一个账户：分配新 id，创建其客户端（未登录态），并设为活动账户。
/// 返回新账户的 id。前端随后 reload 进入登录流程。
///
/// - 使用内置 API 时，`api_id` / `api_hash` 为 None；Rust 端会检查是否超过 5 个内置账户上限。
/// - 使用自定义 API 时，前端传入 `api_id` 和 `api_hash`，直接写入新账户记录。
#[tauri::command]
pub fn add_account(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
    api_id: Option<i32>,
    api_hash: Option<String>,
) -> Result<i64, String> {
    ensure_shared_loaded(&app_handle, state.inner())?;

    let use_custom = api_id.is_some() && api_hash.is_some();
    let id = {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;

        // 内置 API 账户上限检查
        if !use_custom && accounts.count_builtin_accounts() >= AccountsStore::BUILTIN_API_LIMIT {
            return Err(format!(
                "内置 API 账户已达上限（{}个），请使用自定义 API ID / Hash 添加新账户",
                AccountsStore::BUILTIN_API_LIMIT
            ));
        }

        let id = accounts.add();
        accounts.set_active(id)?;

        // 如果提供了自定义凭据，立即持久化到新账户记录
        if use_custom {
            let cfg = state.config.lock().map_err(|e| e.to_string())?;
            accounts.set_tdlib_params(id, api_id, api_hash.as_deref(), cfg.use_test_dc, true);
        }
        id
    };
    state.active.store(id, Ordering::SeqCst);
    if let Ok(mut dl) = state.download_store.lock() {
        dl.set_active_account(id);
    }
    create_client(&app_handle, state.inner(), id)?;
    Ok(id)
}

/// 切换活动账户。
#[tauri::command]
pub fn switch_account(state: State<AppState>, session_id: i64) -> Result<(), String> {
    state
        .accounts
        .lock()
        .map_err(|e| e.to_string())?
        .set_active(session_id)?;
    state.active.store(session_id, Ordering::SeqCst);
    // 下载记录按账户独立存储：切换后加载该账户的 downloads.json
    if let Ok(mut dl) = state.download_store.lock() {
        dl.set_active_account(session_id);
    }
    Ok(())
}

/// 登出并移除指定账户；若移除的是活动账户，则自动切换到剩余账户。
/// 未登录的账户直接移除（无需 logOut）。
#[tauri::command]
pub async fn logout_account(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), String> {
    let logged_in = {
        let meta = state.account_meta.lock().map_err(|e| e.to_string())?;
        meta.get(&session_id).map(|m| m.logged_in).unwrap_or(false)
    };
    let client_exists = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.contains_key(&session_id)
    };

    if client_exists {
        if logged_in {
            shutdown_client(state.inner(), session_id, "logOut").await?;
        } else {
            // 未登录：直接释放客户端（无需 logOut）
            state
                .clients
                .lock()
                .map_err(|e| e.to_string())?
                .remove(&session_id);
        }
    }

    // 删除本地数据目录（含该账户独立的下载记录）
    let _ = std::fs::remove_dir_all(account_root_dir(&state.data_dir, session_id));
    if let Ok(mut dl) = state.download_store.lock() {
        dl.drop_account(session_id);
    }

    // 从清单移除（内部会自动处理活动账户切换）
    let new_active = {
        let mut accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        accounts.remove(session_id)?;
        accounts.active()
    };
    state.active.store(new_active, Ordering::SeqCst);
    if let Ok(mut meta) = state.account_meta.lock() {
        meta.remove(&session_id);
    }

    // 若新的活动账户客户端尚未创建（例如被移除的是唯一账户后重建的空账户），补建。
    let exists = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.contains_key(&new_active)
    };
    if !exists {
        create_client(&app_handle, state.inner(), new_active)?;
    }
    Ok(())
}

// --- 初始化入口 ---

/// 初始化 TDLib：迁移旧数据（单账户 → 账户 0），并为所有已登记账户创建
/// 客户端实例（全部常驻，后台接收消息）。
///
/// `force = true`：先关闭已有客户端再重建。用于登录页切换登录方式、
/// 应用自定义 API/测试 DC 后——重建时 setTdlibParameters 必须使用
/// 当前全局 config 与账户记录中的凭据（含自定义 api_id/api_hash）。
#[tauri::command]
pub async fn init_tdlib(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    force: Option<bool>,
) -> Result<(), String> {
    let force = force.unwrap_or(false);
    let existing: Vec<i64> = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.keys().cloned().collect()
    };

    if !existing.is_empty() && !force {
        return Ok(()); // 已初始化
    }

    if force {
        for id in existing {
            // close 优先；失败时直接移除，避免客户端残留在 map 里导致无法重建
            if shutdown_client(state.inner(), id, "close").await.is_err() {
                if let Ok(mut clients) = state.clients.lock() {
                    clients.remove(&id);
                }
            }
        }
    }

    // 迁移旧单账户数据 → 账户 0
    migrate_legacy_data(state.inner())?;

    // 同步活动账户 id（accounts.json 中的 active 可能为旧的）
    let (active_id, ids) = {
        let accounts = state.accounts.lock().map_err(|e| e.to_string())?;
        (accounts.active(), accounts.ids())
    };
    state.active.store(active_id, Ordering::SeqCst);
    if let Ok(mut dl) = state.download_store.lock() {
        dl.set_active_account(active_id);
    }

    for id in ids {
        if let Err(e) = create_client(&app_handle, state.inner(), id) {
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": e }));
            return Err(e);
        }
    }
    Ok(())
}

/// 将旧版单账户数据目录（TDLib/tdlib_db、TDLib/tdlib_files）迁移到账户 0。
fn migrate_legacy_data(state: &AppState) -> Result<(), String> {
    let tdlib_dir = state.data_dir.join("TDLib");
    let accounts_dir = tdlib_dir.join("accounts");

    // 已有 accounts 数据则不迁移
    if accounts_dir.is_dir()
        && std::fs::read_dir(&accounts_dir)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false)
    {
        return Ok(());
    }

    for (legacy, dst) in [
        (tdlib_dir.join("tdlib_db"), account_db_dir(&state.data_dir, 0)),
        (
            tdlib_dir.join("tdlib_files"),
            account_files_dir(&state.data_dir, 0),
        ),
    ] {
        if !legacy.is_dir() || dst.exists() {
            continue;
        }
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&legacy, &dst)
            .map_err(|e| format!("迁移 {} 失败: {e}", legacy.display()))?;
    }
    Ok(())
}
