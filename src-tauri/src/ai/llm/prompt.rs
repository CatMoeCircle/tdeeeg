//! prompt 侧的小工具：图片读盘 / 转 data URL、工具定义归一化。
//!
//! 三个协议对图片和工具字段的写法不一样（`input_image` / `image_url` / `image`，
//! `type:function` / `type:function+function` / `input_schema`），这里只做**与协议无关**的
//! 那一半，各协议文件自己拼外壳。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use base64::Engine;

/// 扩展名 → IANA 媒体类型。只认图片：非 image/* 的附件模型也不会看。
pub(crate) fn media_type(path: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "heic" | "heif" => "image/heic",
        _ => return None,
    })
}

/// 图片字节缓存：路径 → (mtime, 字节)。agent 每轮都重建 prompt，同一张图不重复读盘。
/// ponytail: 满了整表清空而不是 LRU —— 单会话附件很少超过几张，真占内存再上 LRU。
const IMAGE_CACHE_MAX: usize = 8;

fn image_cache() -> &'static Mutex<HashMap<String, (SystemTime, Vec<u8>)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (SystemTime, Vec<u8>)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// 读本机图片（带 mtime 缓存）。读不到 / 读失败 = None：文件被删或改名不该让整段对话报错。
pub(crate) fn read_image(path: &str) -> Option<Vec<u8>> {
    let mtime = std::fs::metadata(path).ok()?.modified().ok()?;
    if let Ok(mut cache) = image_cache().lock() {
        if let Some((t, bytes)) = cache.get(path) {
            if *t == mtime {
                return Some(bytes.clone());
            }
        }
        let bytes = std::fs::read(path).ok()?;
        if cache.len() >= IMAGE_CACHE_MAX {
            cache.clear();
        }
        cache.insert(path.to_string(), (mtime, bytes.clone()));
        return Some(bytes);
    }
    std::fs::read(path).ok()
}

/// 本机图片 → `data:<mime>;base64,...`（OpenAI 两家都吃这个形状）
pub(crate) fn image_data_url(path: &str) -> Option<String> {
    let mime = media_type(path)?;
    let bytes = read_image(path)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

/// 归一化后的工具定义（前端 toolsSchema() 已经是 OpenAI 形状）
#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

pub fn tool_specs(defs: &[serde_json::Value]) -> Result<Vec<ToolSpec>, String> {
    defs.iter()
        .map(|d| {
            let f = d.get("function").ok_or("工具定义缺少 function")?;
            let name = f
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("工具定义缺少 name")?
                .to_string();
            Ok(ToolSpec {
                name,
                description: f.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                parameters: f.get("parameters").cloned().unwrap_or(serde_json::json!({
                    "type": "object",
                    "properties": {}
                })),
            })
        })
        .collect()
}
