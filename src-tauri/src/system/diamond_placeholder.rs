//! 钻石首帧占位图缓存（跨启动）。
//!
//! 背景：钻石首次出现的大头不是 IO、也不是 JS，而是驱动编译那份 37 KB 的
//! 片元着色器（冷启动以秒计，见 `utils/diamond/scene.ts`）。这一步在 WebView
//! 里无法提前完成，Rust 也帮不上忙；能立刻解决的是「第一眼」——把已经渲染好的
//! 首帧 PNG 落盘，下次启动时在 WebGL 预热完成前先贴到画布上，观感等于一次
//! 图片解码。
//!
//! 只读写一张小 PNG（≤ 256 KB），按 key 分文件（key 由前端带版本号，着色器
//! 升级时改版本即可让旧图自然失效）。写入走「临时文件 + rename」，避免进程
//! 中途退出留下半张图。

use std::fs;
use std::path::PathBuf;

use tauri::ipc::Response;

/// 单张占位图体积上限（PNG，112–256 px 量级，实际约 5–40 KB）
const MAX_BYTES: usize = 256 * 1024;
/// key 上限（避免超长文件名）
const MAX_KEY_LEN: usize = 64;
/// PNG 魔数：只认自己写的 PNG，防止把别的文件当图贴上去
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

/// 占位图目录：跟随数据目录策略（AppData / 便携模式），放在 `cache` 下，
/// 属于可随时删除的派生数据。
fn placeholder_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = crate::system::data_loc::resolve_current_data_dir(app)?
        .join("cache")
        .join("diamond");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建钻石占位图目录: {e}"))?;
    Ok(dir)
}

/// 只允许 `[A-Za-z0-9_-]`：key 来自前端，绝不能拼进路径分隔符或 `..`
fn sanitize_key(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.len() > MAX_KEY_LEN {
        return None;
    }
    if !raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(raw.to_string())
}

/// 读取某个配色的首帧占位图。
///
/// 不存在 / 损坏 / 目录不可用都返回空字节（调用方按「没有占位图」处理），
/// 不让缓存问题影响钻石本身。
#[tauri::command]
pub fn load_diamond_placeholder(
    app: tauri::AppHandle,
    key: String,
) -> Result<Response, String> {
    let Some(key) = sanitize_key(&key) else {
        return Ok(Response::new(Vec::new()));
    };
    let Ok(dir) = placeholder_dir(&app) else {
        return Ok(Response::new(Vec::new()));
    };
    let Ok(bytes) = fs::read(dir.join(format!("{key}.png"))) else {
        return Ok(Response::new(Vec::new()));
    };
    if bytes.len() < PNG_MAGIC.len()
        || bytes.len() > MAX_BYTES
        || !bytes.starts_with(&PNG_MAGIC)
    {
        return Ok(Response::new(Vec::new()));
    }
    Ok(Response::new(bytes))
}

/// 保存某个配色的首帧占位图。
///
/// 请求体是原始字节（不走 JSON，避免把 PNG 展开成数字数组）：
/// `[u8 key_len][key utf8][png bytes]`。
#[tauri::command]
pub fn save_diamond_placeholder(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(payload) = request.body() else {
        return Err("expected raw diamond placeholder bytes".to_string());
    };
    if payload.len() < 1 + PNG_MAGIC.len() {
        return Err("diamond placeholder payload is empty".to_string());
    }
    let key_len = payload[0] as usize;
    if key_len == 0 || key_len > MAX_KEY_LEN || payload.len() < 1 + key_len {
        return Err("diamond placeholder key length is invalid".to_string());
    }
    let key = String::from_utf8(payload[1..1 + key_len].to_vec())
        .map_err(|_| "diamond placeholder key is not utf-8".to_string())?;
    let Some(key) = sanitize_key(&key) else {
        return Err("diamond placeholder key is invalid".to_string());
    };
    let png = &payload[1 + key_len..];
    if png.len() > MAX_BYTES {
        return Err("diamond placeholder is too large".to_string());
    }
    if !png.starts_with(&PNG_MAGIC) {
        return Err("diamond placeholder is not a png".to_string());
    }

    let dir = placeholder_dir(&app)?;
    let path = dir.join(format!("{key}.png"));
    let tmp = dir.join(format!("{key}.png.tmp"));
    fs::write(&tmp, png).map_err(|e| format!("写入钻石占位图失败: {e}"))?;
    // rename 覆盖旧图：Windows 上 std::fs::rename 遇到已存在目标会失败，先删再改名
    let _ = fs::remove_file(&path);
    fs::rename(&tmp, &path).map_err(|e| format!("提交钻石占位图失败: {e}"))?;
    Ok(())
}
