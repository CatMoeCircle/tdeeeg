//! 账户客户端的生命周期：创建、关闭、重启、强制重建。

use super::loader::ensure_shared_loaded;
use super::proxy::apply_proxy_to_client;
use super::receive::{spawn_receive_loop, state_snapshot};
use super::{
    account_db_dir, account_files_dir, account_root_dir, shared, AccountRuntimeMeta, AppState,
    TdLibClient,
};
use crate::store::chat_store::ChatStore;
use crate::store::community_store::CommunityStore;
use serde_json::json;
use std::collections::HashMap;
use std::ffi::CString;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

/// 向指定账户发送 close/logOut 并等待 authorizationStateClosed，
/// 然后从 `clients` 移除该账户（Arc drop 会销毁底层客户端）。
/// 返回后该账户不再存在于 clients 中。
pub(super) async fn shutdown_client(
    state: &AppState,
    session_id: i64,
    action: &str,
) -> Result<(), String> {
    let sh = shared(state)?;
    let (client_ptr, close_signal) = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        let client = clients
            .get(&session_id)
            .ok_or_else(|| format!("账户 {session_id} 不存在或未初始化"))?;
        (client.client, client.close_signal.clone())
    };

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *close_signal.lock().map_err(|e| e.to_string())? = Some(tx);
    let req = json!({ "@type": action, "@extra": { "request_id": "internal-shutdown" } });
    let c_str = CString::new(req.to_string()).unwrap();
    unsafe { (sh.send_fn)(client_ptr, c_str.as_ptr()) };

    tokio::time::timeout(Duration::from_secs(30), rx)
        .await
        .map_err(|_| "等待 TDLib 资源释放超时".to_string())?
        .map_err(|_| "TDLib 关闭通道异常".to_string())?;

    state
        .clients
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&session_id);
    Ok(())
}

/// 关闭所有账户的客户端（迁移数据目录时使用）。
pub(super) async fn shutdown_all_clients(state: &AppState) -> Result<(), String> {
    let ids: Vec<i64> = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.keys().cloned().collect()
    };
    for id in ids {
        shutdown_client(state, id, "close").await?;
    }
    Ok(())
}

/// 为指定账户创建 TDLib 客户端并启动后台接收线程。
pub(super) fn create_client(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    session_id: i64,
) -> Result<(), String> {
    let sh = ensure_shared_loaded(app_handle, state)?;

    let db_dir = account_db_dir(&state.data_dir, session_id);
    let files_dir = account_files_dir(&state.data_dir, session_id);
    std::fs::create_dir_all(&db_dir)
        .map_err(|e| format!("Failed to create TDLib db directory: {e}"))?;
    std::fs::create_dir_all(&files_dir)
        .map_err(|e| format!("Failed to create TDLib files directory: {e}"))?;

    let client_ptr = unsafe { (sh.create_fn)() };
    if client_ptr.is_null() {
        return Err(
            "Failed to create TDLib client: td_json_client_create returned null".to_string(),
        );
    }

    // 应用代理配置（在授权开始前生效）
    let proxy_cfg = state
        .proxy_config
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    if proxy_cfg.mode != "disabled" {
        apply_proxy_to_client(sh.send_fn, client_ptr, &proxy_cfg);
    }

    let client = Arc::new(TdLibClient {
        id: session_id,
        client: client_ptr,
        destroy_fn: sh.destroy_fn,
        close_signal: Arc::new(Mutex::new(None)),
        chat_store: Arc::new(Mutex::new(ChatStore::new())),
        community_store: Arc::new(Mutex::new(CommunityStore::new())),
        connection_state: Arc::new(Mutex::new(None)),
        options: Arc::new(Mutex::new(HashMap::new())),
        me: Mutex::new(None),
        my_id: Mutex::new(None),
        avatar_file_id: Mutex::new(None),
        avatar_path: Mutex::new(None),
        authorization_state: Mutex::new(None),
    });

    state
        .clients
        .lock()
        .map_err(|e| e.to_string())?
        .insert(session_id, client.clone());
    state
        .account_meta
        .lock()
        .map_err(|e| e.to_string())?
        .entry(session_id)
        .or_insert_with(|| AccountRuntimeMeta {
            logged_in: false,
            avatar_path: None,
        });

    spawn_receive_loop(
        app_handle.clone(),
        Arc::new(state_snapshot(state)),
        session_id,
        client,
        sh,
        db_dir,
        files_dir,
    );
    Ok(())
}

/// 用当前已保存的参数（use_test_dc / api_id / api_hash）重建活动账户的客户端。
///
/// 对齐官方客户端：从二维码授权态切手机号时，先 logOut/close 释放当前会话，
/// 再 TryInitialize/create。客户端可能已因 logOut 进入 Closed（接收线程退出），
/// 此时 shutdown 会失败或超时——短超时后强制移除再重建。
#[tauri::command]
pub async fn restart_tdlib(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_id = state.active.load(Ordering::SeqCst);
    let exists = {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.contains_key(&session_id)
    };

    if exists && !close_within_5s(state.inner(), session_id).await {
        if let Ok(mut clients) = state.clients.lock() {
            clients.remove(&session_id);
        }
    }

    create_client(&app_handle, state.inner(), session_id)
}

/// 5 秒内优雅关闭，超时/异常返回 false（调用方降级为强制移除）。
async fn close_within_5s(state: &AppState, session_id: i64) -> bool {
    if shared(state).is_err() {
        return false;
    }
    matches!(
        tokio::time::timeout(
            Duration::from_secs(5),
            shutdown_client(state, session_id, "close")
        )
        .await,
        Ok(Ok(()))
    )
}

/// 退出当前账户登录：logOut（销毁本地数据），然后重建该账户客户端进入待登录状态。
/// 保留供「系统设置」旧流程使用；多账户下更推荐 logout_account。
#[tauri::command]
pub async fn logout_tdlib(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session_id = state.active.load(Ordering::SeqCst);
    shutdown_client(state.inner(), session_id, "logOut").await?;
    // 清理账户目录残留后重建
    let _ = std::fs::remove_dir_all(account_root_dir(&state.data_dir, session_id));
    create_client(&app_handle, state.inner(), session_id)
}

/// 强制销毁并重建活动账户客户端（登录态切换用）。
///
/// TDLib AuthManager 会把二维码 `login_token` 持久化到账户数据库；
/// 仅 close+create 会从库里恢复出**同一个** WaitOtherDeviceConfirmation。
/// 官方客户端用 logOut 清本地数据；这里在重建前删除该账户 tdlib_db
/// （仅用于尚未完成登录的会话切换），确保新客户端回到 WaitPhoneNumber。
#[tauri::command]
pub async fn force_reinit_active(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let session_id = state.active.load(Ordering::SeqCst);
    log_reinit(&format!("start session={session_id}"));

    // 1) 从 map 摘掉旧 client，并尝试 destroy/logOut 释放数据库文件锁
    let old = {
        let mut clients = state.clients.lock().map_err(|e| e.to_string())?;
        clients.remove(&session_id)
    };
    if let Some(old) = &old {
        log_reinit(&format!("old client ptr={:?}", old.client));
        if let Ok(sh) = shared(state.inner()) {
            if !old.client.is_null() {
                // destroy：关闭并销毁本地数据（含 binlog），比 logOut 更彻底
                let req = json!({ "@type": "destroy" });
                if let Ok(c_str) = CString::new(req.to_string()) {
                    unsafe { (sh.send_fn)(old.client, c_str.as_ptr()) };
                }
            }
        }
    } else {
        log_reinit("old client was not in map");
    }

    // 2) 等接收线程退出（Arc 在线程内持有，必须等它结束才会真正 destroy）
    tokio::time::sleep(Duration::from_millis(500)).await;
    drop(old);

    // 3) 反复尝试删除 tdlib_db，直到文件锁释放
    let db_dir = account_db_dir(&state.data_dir, session_id);
    let files_dir = account_files_dir(&state.data_dir, session_id);
    let mut cleared = false;
    for attempt in 0..25 {
        {
            // 确保 map 里没有残留
            if let Ok(mut clients) = state.clients.lock() {
                clients.remove(&session_id);
            }
        }
        if !db_dir.exists() {
            cleared = true;
            log_reinit(&format!("db_dir already gone (attempt {attempt})"));
            break;
        }
        match std::fs::remove_dir_all(&db_dir) {
            Ok(_) => {
                cleared = true;
                log_reinit(&format!("cleared db_dir attempt={attempt} {}", db_dir.display()));
                break;
            }
            Err(e) => {
                if attempt == 0 || attempt % 5 == 0 {
                    log_reinit(&format!("clear db_dir attempt={attempt} fail: {e}"));
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }
    }
    if !cleared {
        log_reinit("WARNING: db_dir not cleared, new client may restore QR token or fail to lock");
    }
    let _ = std::fs::create_dir_all(&db_dir);
    let _ = std::fs::create_dir_all(&files_dir);

    // 4) 重建
    create_client(&app_handle, state.inner(), session_id)?;
    {
        let clients = state.clients.lock().map_err(|e| e.to_string())?;
        match clients.get(&session_id) {
            Some(c) => log_reinit(&format!("new client ptr={:?}", c.client)),
            None => log_reinit("ERROR: new client missing from map"),
        }
    }

    // 5) 等接收线程跑完 setTdlibParameters，再查授权态
    tokio::time::sleep(Duration::from_millis(2000)).await;
    let auth = super::send_request(state.inner(), json!({ "_": "getAuthorizationState" })).await?;
    log_reinit(&format!("auth after reinit: {}", auth));
    Ok(json!({ "session_id": session_id, "auth": auth }))
}

/// 写一行诊断日志到应用数据目录，便于无 stdout 时排查。
fn log_reinit(msg: &str) {
    let dir = dirs_log_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[force_reinit] mkdir log fail: {e}");
        return;
    }
    let line = format!("[{}] {}\n", chrono_like_now(), msg);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("force_reinit.log"))
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    eprintln!("{}", msg);
}

fn dirs_log_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.catmoecircle.tdeeeg")
}

fn chrono_like_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "?".into())
}
