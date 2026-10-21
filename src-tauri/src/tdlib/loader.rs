//! TDLib 动态库探测与加载（所有账户共用一份）。

use super::{
    AppState, TdJsonClientCreate, TdJsonClientDestroy, TdJsonClientExecute, TdJsonClientReceive,
    TdJsonClientSend, TdLibShared,
};
use libloading::Symbol;
use serde_json::json;
use std::ffi::CString;
use std::ptr;
use std::sync::Arc;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
use tauri::{Emitter, Manager};

/// 当前平台的 TDLib 动态库文件名。
fn tdjson_lib_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "tdjson.dll"
    }
    #[cfg(target_os = "macos")]
    {
        "libtdjson.dylib"
    }
    #[cfg(target_os = "linux")]
    {
        "libtdjson.so"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "tdjson"
    }
}

/// 候选的 TDLib 动态库搜索路径（可执行文件同级 + bin/ 子目录 + 打包后的资源目录）。
fn tdjson_candidate_paths(exe_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let name = tdjson_lib_name();
    let mut paths = vec![
        exe_dir.join(name),
        exe_dir.join("bin").join(name),
        exe_dir.join("Resources").join(name),
    ];
    // 打包布局：macOS 是 Contents/Resources/、Linux 是 /usr/lib/<product>/，
    // 都由 setup 写进 TURI_RESOURCE_DIR；resources 配的是 "./bin/*"，
    // 所以库里多一层 bin/。
    if let Ok(resource) = std::env::var("TURI_RESOURCE_DIR") {
        let dir = std::path::PathBuf::from(resource);
        paths.push(dir.join("bin").join(name));
        paths.push(dir.join(name));
    }
    paths
}

#[cfg(unix)]
fn preload_tdjson_dependencies(lib_dir: &std::path::Path) {
    #[cfg(target_os = "macos")]
    const RTLD_FLAGS: i32 = 0x1 | 0x8;
    #[cfg(not(target_os = "macos"))]
    const RTLD_FLAGS: i32 = 0x1 | 0x100;

    let Ok(entries) = std::fs::read_dir(lib_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|n| n.to_str()) == Some(tdjson_lib_name()) {
            continue;
        }
        let is_lib = path
            .extension()
            .map(|e| e == "so" || e == "dylib")
            .unwrap_or(false);
        if is_lib {
            unsafe {
                let _ = libloading::os::unix::Library::open(Some(&path), RTLD_FLAGS);
            }
        }
    }
}

/// 首次调用时加载 TDLib 动态库，之后复用同一份符号表。
pub(super) fn ensure_shared_loaded(
    app_handle: &tauri::AppHandle,
    state: &AppState,
) -> Result<Arc<TdLibShared>, String> {
    if let Some(sh) = state
        .tdlib_shared
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
    {
        return Ok(sh);
    }

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Cannot get exe directory")?;
    let possible_paths = tdjson_candidate_paths(exe_dir);

    let mut found = None;
    for path in &possible_paths {
        let _ = app_handle.emit("tdlib-log", format!("Checking library at: {:?}", path));
        if path.exists() {
            found = Some(path.clone());
            break;
        }
    }
    let Some(dll_path) = found else {
        let err_msg = format!(
            "{} not found. Checked paths: {:?}. Please ensure the TDLib dynamic library is placed correctly.",
            tdjson_lib_name(),
            possible_paths
        );
        let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
        return Err(err_msg);
    };

    #[cfg(windows)]
    if let Some(parent) = dll_path.parent() {
        if parent != exe_dir {
            let wide: Vec<u16> = parent
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            extern "system" {
                fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
            }
            unsafe {
                SetDllDirectoryW(wide.as_ptr());
            }
        }
    }

    #[cfg(unix)]
    if let Some(parent) = dll_path.parent() {
        preload_tdjson_dependencies(parent);
    }

    let lib = unsafe {
        libloading::Library::new(&dll_path).map_err(|e| {
            let err_msg = format!("Failed to load {}: {}", dll_path.display(), e);
            let _ = app_handle.emit("tdlib-init-error", json!({ "message": err_msg }));
            err_msg
        })?
    };
    let _ = app_handle.emit("tdlib-log", "TDLib library loaded successfully");

    let client_create: Symbol<TdJsonClientCreate> =
        unsafe { lib.get(b"td_json_client_create").map_err(|e| e.to_string())? };
    let client_send: Symbol<TdJsonClientSend> =
        unsafe { lib.get(b"td_json_client_send").map_err(|e| e.to_string())? };
    let client_receive: Symbol<TdJsonClientReceive> =
        unsafe { lib.get(b"td_json_client_receive").map_err(|e| e.to_string())? };
    let client_execute: Symbol<TdJsonClientExecute> =
        unsafe { lib.get(b"td_json_client_execute").map_err(|e| e.to_string())? };
    let client_destroy: Symbol<TdJsonClientDestroy> =
        unsafe { lib.get(b"td_json_client_destroy").map_err(|e| e.to_string())? };

    let (create_fn, send_fn, receive_fn, execute_fn, destroy_fn) = (
        *client_create,
        *client_send,
        *client_receive,
        *client_execute,
        *client_destroy,
    );

    // 设置日志等级
    let log_config =
        CString::new(r#"{"@type": "setLogVerbosityLevel", "new_verbosity_level": 1}"#).unwrap();
    unsafe { execute_fn(ptr::null_mut(), log_config.as_ptr()) };

    // 注册 TDLib 数据目录到 asset protocol 作用域，使前端能加载图片等文件
    let tdlib_data_dir = state.data_dir.join("TDLib");
    std::fs::create_dir_all(&tdlib_data_dir)
        .map_err(|e| format!("Failed to create TDLib data directory: {}", e))?;
    let _ = app_handle
        .asset_protocol_scope()
        .allow_directory(tdlib_data_dir.clone(), true);

    let shared = Arc::new(TdLibShared {
        _lib: lib,
        create_fn,
        send_fn,
        receive_fn,
        destroy_fn,
    });
    *state.tdlib_shared.lock().map_err(|e| e.to_string())? = Some(shared.clone());
    Ok(shared)
}
