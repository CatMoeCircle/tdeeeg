//! AI 会话（对话）持久化：分账号 → 分 chat_id → 一个对话一个文件夹。
//!
//! 布局与 DSH 的 `~/.dsh/sessions/<workspace>/session-<uuid>/` 同构：
//!
//! ```text
//! <data_dir>/ai_conversations/
//!   <account_id>/                     # 每个登录账号一棵树（id 用 `default` 兜底）
//!     active.json                     # chat_id → 当前选中的对话 id
//!     <chat_id>/                      # 归属维度：一个 Telegram 聊天一组对话
//!       conversation-<uuid>/
//!         metadata.json               # 标题 / 时间 / 用量（不含消息正文）
//!         history.json                # 消息正文（agent 每轮之后覆盖写；见 ai_chat::ChatMessage）
//! ```
//!
//! 会话管理页只做标题 / 重命名 / 删除，不提供消息查看；但对话的**上下文历史**要跨进程保留，
//! 所以正文单独落 history.json（删对话会连它一起删）。
//! 用量（请求次数 + 每次请求的 token）由真正发请求的一方调 `ai_conversation_usage` 记账；
//! **接口没返回 usage 时前端本地估算**，估算结果也走这个入口写进来，两边不打架。
//!
//! 文件读不出 / 坏 JSON 一律跳过，不 panic：坏一个对话不该让整个列表消失。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ai_chat::ChatMessage;

const DIR: &str = "ai_conversations";
const META: &str = "metadata.json";
const HISTORY: &str = "history.json";
const ACTIVE: &str = "active.json";
/// 账号 id 取不到时的兜底目录名（未登录 / 老版本没有账号信息）
const DEFAULT_ACCOUNT: &str = "default";

/// 单次请求的用量（各家接口字段名不同，前端统一成这一套；取不到就是 None）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConversationUsage {
    /// 累计请求次数
    pub requests: u64,
    /// 累计输入 token（prompt）
    pub input_tokens: u64,
    /// 累计输出 token（completion）
    pub output_tokens: u64,
    /// 累计命中缓存的输入 token（prompt_cache_hit / cache_read）
    pub cached_tokens: u64,
    /// 累计写入缓存的 token（Anthropic cache_creation）
    pub cache_write_tokens: u64,
    /// 最近一次请求的输入 token：= 当前上下文占用（上下文窗口里有这么多）
    pub last_input_tokens: u64,
    /// 最近一次请求的输出 token
    pub last_output_tokens: u64,
    /// 该模型上下文窗口（来自供应商模型配置），用于算占用百分比；0 = 未知
    pub context_length: u64,
    /// 最近一次请求时间（毫秒）
    pub last_at: u64,
}

impl ConversationUsage {
    /// 把一次请求的增量并进累计值。`*_tokens` 为 None = 该接口没返回这项，累计值不动。
    fn absorb(
        &mut self,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        cached_tokens: Option<u64>,
        cache_write_tokens: Option<u64>,
        context_length: Option<u64>,
        at: u64,
    ) -> bool {
        let mut touched = false;
        if let Some(v) = input_tokens {
            self.input_tokens = self.input_tokens.saturating_add(v);
            self.last_input_tokens = v;
            touched = true;
        }
        if let Some(v) = output_tokens {
            self.output_tokens = self.output_tokens.saturating_add(v);
            self.last_output_tokens = v;
            touched = true;
        }
        if let Some(v) = cached_tokens {
            self.cached_tokens = self.cached_tokens.saturating_add(v);
            touched = true;
        }
        if let Some(v) = cache_write_tokens {
            self.cache_write_tokens = self.cache_write_tokens.saturating_add(v);
            touched = true;
        }
        if let Some(v) = context_length.filter(|v| *v > 0) {
            self.context_length = v;
            touched = true;
        }
        if touched {
            self.requests = self.requests.saturating_add(1);
            self.last_at = at;
        }
        touched
    }
}

/// 一个会话的元数据。正文在 history.json。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConversation {
    pub id: String,
    /// 归属的 Telegram 聊天（= 归属维度，对应 DSH 的 workspace）
    pub chat_id: i64,
    pub title: String,
    /// 创建 / 最后更新时间（毫秒）
    pub created_at: u64,
    pub updated_at: u64,
    /// 是否该聊天当前选中的会话。由 active.json 决定，**必须发给前端**：
    /// 前端拿它认「当前会话」（底部用量、历史回铺、要不要新建都靠它）。
    /// 磁盘上那份不可信 —— 落盘时用 [`disk_copy`] 清成 false。
    ///
    /// 踩过的坑：这里原来写的是 `#[serde(skip)]`，那是**收发一起掐**，
    /// 于是前端永远收不到当前会话，表现成「底部用量不显示 / 历史读不出来 / 每次发消息都新建一个会话」。
    pub active: bool,
    pub usage: ConversationUsage,
}

/// 落盘用的副本：`active` 是派生值（每次由 active.json 算出来），不写进 metadata.json，
/// 免得以后读到过期的「当前会话」。注意只影响落盘，**发给前端的结构保留 active**。
fn disk_copy(c: &AiConversation) -> AiConversation {
    AiConversation { active: false, ..c.clone() }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn account_dir(account_id: &str) -> String {
    let s = account_id.trim();
    if s.is_empty() {
        DEFAULT_ACCOUNT.to_string()
    } else {
        // 目录名，别让分隔符 / 相对路径逃出去
        s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()
    }
}

fn root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = crate::data_loc::resolve_current_data_dir(app)?.join(DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建 AI 会话目录: {e}"))?;
    Ok(dir)
}

fn chat_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account_id: &str,
    chat_id: i64,
) -> Result<PathBuf, String> {
    let dir = root(app)?.join(account_dir(account_id)).join(chat_id.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建会话目录: {e}"))?;
    Ok(dir)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok())
}

/// 写文件：先写 `.tmp` 再 rename，避免中途挂掉留下半个 JSON。
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("写入失败: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("写入失败: {e}"))
}

fn write_meta<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account_id: &str,
    c: &AiConversation,
) -> Result<(), String> {
    let dir = conv_dir(app, account_id, c.chat_id, &c.id)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建会话目录: {e}"))?;
    let text = serde_json::to_string_pretty(&disk_copy(c)).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(META), &text)
}

/// 当前选中的对话：chat_id → conversation id。
fn load_active<R: tauri::Runtime>(app: &tauri::AppHandle<R>, account_id: &str) -> serde_json::Map<String, serde_json::Value> {
    root(app)
        .ok()
        .map(|r| r.join(account_dir(account_id)).join(ACTIVE))
        .and_then(|p| read_json(&p))
        .unwrap_or_default()
}

fn save_active<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account_id: &str,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let dir = root(app)?.join(account_dir(account_id));
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建会话目录: {e}"))?;
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(ACTIVE), &text)
}

/// 该聊天下的全部对话，按最后更新倒序。
fn list_chat<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account_id: &str,
    chat_id: i64,
) -> Vec<AiConversation> {
    let Ok(dir) = chat_dir(app, account_id, chat_id) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<AiConversation> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| read_json::<AiConversation>(&e.path().join(META)))
        .filter(|c| !c.id.is_empty())
        .collect();
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    out
}

/// 账号目录下的全部聊天 id。
fn chat_ids<R: tauri::Runtime>(app: &tauri::AppHandle<R>, account_id: &str) -> Vec<i64> {
    let Ok(dir) = root(app).map(|r| r.join(account_dir(account_id))) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<i64> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().to_str().and_then(|s| s.parse::<i64>().ok()))
        .collect();
    out.sort_unstable();
    out
}

/// 新建对话：标题默认「新对话」（前端按语言本地化后写入）。返回新建的对话（已置为当前）。
#[tauri::command]
pub fn ai_conversation_create(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    title: String,
) -> Result<AiConversation, String> {
    let now = now_ms();
    let c = AiConversation {
        id: uuid(),
        chat_id,
        title: if title.trim().is_empty() { "New chat".to_string() } else { title.trim().to_string() },
        created_at: now,
        updated_at: now,
        active: true,
        usage: ConversationUsage::default(),
    };
    write_meta(&app, &account_id, &c)?;
    let mut map = load_active(&app, &account_id);
    map.insert(chat_id.to_string(), serde_json::Value::String(c.id.clone()));
    save_active(&app, &account_id, &map)?;
    Ok(c)
}

/// 某个聊天的全部对话（带 active 标记，已按更新时间倒序）。
#[tauri::command]
pub fn ai_conversation_list(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
) -> Result<Vec<AiConversation>, String> {
    let active = load_active(&app, &account_id)
        .get(&chat_id.to_string())
        .and_then(|v| v.as_str())
        .map(String::from);
    let mut list = list_chat(&app, &account_id, chat_id);
    // active.json 里指定的那个优先；没有记录（旧数据 / 手删）就退回最新一个
    let picked = active.filter(|id| list.iter().any(|c| &c.id == id));
    for c in list.iter_mut() {
        c.active = Some(c.id.clone()) == picked;
    }
    if !list.is_empty() && !list.iter().any(|c| c.active) {
        list[0].active = true;
    }
    Ok(list)
}

/// 账号下全部聊天的全部对话（AI 配置页的「总管理」入口用）。
#[tauri::command]
pub fn ai_conversation_list_all(
    app: tauri::AppHandle,
    account_id: String,
) -> Result<Vec<AiConversation>, String> {
    let active = load_active(&app, &account_id);
    let mut out = Vec::new();
    for chat_id in chat_ids(&app, &account_id) {
        let picked = active.get(&chat_id.to_string()).and_then(|v| v.as_str()).map(String::from);
        let mut list = list_chat(&app, &account_id, chat_id);
        let picked = picked.filter(|id| list.iter().any(|c| &c.id == id));
        for c in list.iter_mut() {
            c.active = Some(c.id.clone()) == picked;
        }
        if !list.is_empty() && !list.iter().any(|c| c.active) {
            list[0].active = true;
        }
        out.extend(list);
    }
    // 同聊天内已倒序；跨聊天再按更新时间整体倒序，最新用过的排最前
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

/// 选中某个对话为当前（切换聊天后接着用同一个）。空 id = 回到该聊天的第一个对话。
#[tauri::command]
pub fn ai_conversation_set_active(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<(), String> {
    let id = if id.trim().is_empty() {
        list_chat(&app, &account_id, chat_id).first().map(|c| c.id.clone()).unwrap_or_default()
    } else {
        id
    };
    let mut map = load_active(&app, &account_id);
    if id.is_empty() {
        map.remove(&chat_id.to_string());
    } else {
        map.insert(chat_id.to_string(), serde_json::Value::String(id));
    }
    save_active(&app, &account_id, &map)
}

/// 重命名：只改标题 + 更新时间。找不到该对话就报错（前端拿它提示）。
#[tauri::command]
pub fn ai_conversation_rename(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
    title: String,
) -> Result<AiConversation, String> {
    let mut list = list_chat(&app, &account_id, chat_id);
    let c = list
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| "对话不存在".to_string())?;
    c.title = title.trim().to_string();
    c.updated_at = now_ms();
    write_meta(&app, &account_id, c)?;
    Ok(c.clone())
}

/// 删除对话：连它的文件夹一起删。删掉的若是当前选中项，自动改选剩下的第一个。
#[tauri::command]
pub fn ai_conversation_delete(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<(), String> {
    let dir = conv_dir(&app, &account_id, chat_id, &id)?;
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("删除失败: {e}"))?;
    }
    let mut map = load_active(&app, &account_id);
    if map.get(&chat_id.to_string()).and_then(|v| v.as_str()) == Some(id.as_str()) {
        let next = list_chat(&app, &account_id, chat_id).first().map(|c| c.id.clone());
        match next {
            Some(next) => {
                map.insert(chat_id.to_string(), serde_json::Value::String(next));
            }
            None => {
                map.remove(&chat_id.to_string());
            }
        }
        save_active(&app, &account_id, &map)?;
    }
    Ok(())
}

/// 清空某个聊天的全部对话。
#[tauri::command]
pub fn ai_conversation_clear_chat(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
) -> Result<usize, String> {
    let list = list_chat(&app, &account_id, chat_id);
    let count = list.len();
    let dir = chat_dir(&app, &account_id, chat_id)?;
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("清空失败: {e}"))?;
    }
    let mut map = load_active(&app, &account_id);
    map.remove(&chat_id.to_string());
    save_active(&app, &account_id, &map)?;
    Ok(count)
}

/// 给某个对话记一次请求的用量。
///
/// 三个来源都走这里，谁先有数据谁先写：
/// - 接口返回的 usage（真实 token）
/// - 接口没返回、前端本地估算（估算结果也当真实值记，UI 不区分）
/// - 只有上下文窗口长度变了（模型换了）也允许单独更新
///
/// 全为 None 时不算一次请求（requests 不加），避免空调用把次数刷上去。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn ai_conversation_usage(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cached_tokens: Option<u64>,
    cache_write_tokens: Option<u64>,
    context_length: Option<u64>,
) -> Result<AiConversation, String> {
    let mut list = list_chat(&app, &account_id, chat_id);
    let c = list
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| "对话不存在".to_string())?;
    c.usage.absorb(
        input_tokens,
        output_tokens,
        cached_tokens,
        cache_write_tokens,
        context_length,
        now_ms(),
    );
    c.updated_at = now_ms();
    write_meta(&app, &account_id, c)?;
    Ok(c.clone())
}

/// 某个对话自己的目录（`conversation-<id>`）。
fn conv_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    account_id: &str,
    chat_id: i64,
    id: &str,
) -> Result<PathBuf, String> {
    Ok(chat_dir(app, account_id, chat_id)?.join(format!("conversation-{id}")))
}

/// 读某个对话的落盘历史。文件不存在（新对话 / 旧数据）= 空历史，不算错误。
#[tauri::command]
pub fn ai_conversation_history(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<Vec<ChatMessage>, String> {
    let path = conv_dir(&app, &account_id, chat_id, &id)?.join(HISTORY);
    Ok(read_json(&path).unwrap_or_default())
}

/// 覆盖写某个对话的历史（agent 每轮之后调，见 utils/aiChat.ts）。
/// 对话不存在直接报错，不给它凭空建目录。
#[tauri::command]
pub fn ai_conversation_save_history(
    app: tauri::AppHandle,
    account_id: String,
    chat_id: i64,
    id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let dir = conv_dir(&app, &account_id, chat_id, &id)?;
    if !dir.is_dir() {
        return Err("对话不存在".to_string());
    }
    let text = serde_json::to_string_pretty(&messages).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(HISTORY), &text)
}

/// 前端本地估算要用的换算：`value` 是字符数，按当前模型把字符数折成 token。
///
/// 后端不做启发式判断，只存数；估算规则（CJK 1 字符 ≈ 1 token、其余 4 字符 ≈ 1 token）
/// 放在前端，因为只有前端知道这次发出去的是中文还是英文。
#[tauri::command]
pub fn ai_conversation_estimate_tokens(chars_cjk: u64, chars_other: u64) -> u64 {
    estimate_tokens(chars_cjk, chars_other)
}

/// CJK 按 1 字符 1 token、其余按 4 字符 1 token 估算（向上取整）。
pub fn estimate_tokens(chars_cjk: u64, chars_other: u64) -> u64 {
    chars_cjk + chars_other.div_ceil(4)
}

/// 极简 uuid v4（只用来做文件夹名，不需要密码学强度）。
fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut seed = nanos as u64 ^ (std::process::id() as u64) << 32;
    let mut next = || {
        // xorshift64*：够随机，且不引入 rand 依赖
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed.wrapping_mul(0x2545_F491_4F6C_DD1D)
    };
    let hex = |v: u64, n: usize| format!("{:0width$x}", v & ((1u128 << (n * 4)) - 1) as u64, width = n);
    format!(
        "{}-{}-4{}-a{}-{}",
        hex(next(), 8),
        hex(next(), 4),
        hex(next(), 3),
        hex(next(), 3),
        hex(next(), 12)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absorbs_usage_and_keeps_last_values() {
        let mut u = ConversationUsage::default();
        assert!(u.absorb(Some(1000), Some(200), Some(800), None, Some(128_000), 1));
        assert!(u.absorb(Some(1500), Some(300), None, Some(0), None, 2));
        assert_eq!(u.requests, 2);
        assert_eq!(u.input_tokens, 2500);
        assert_eq!(u.output_tokens, 500);
        assert_eq!(u.cached_tokens, 800);
        // 最后一次的输入 = 当前上下文占用
        assert_eq!(u.last_input_tokens, 1500);
        assert_eq!(u.last_output_tokens, 300);
        assert_eq!(u.context_length, 128_000);
        assert_eq!(u.last_at, 2);
    }

    #[test]
    fn empty_usage_does_not_count_as_request() {
        let mut u = ConversationUsage::default();
        assert!(!u.absorb(None, None, None, None, None, 5));
        assert_eq!(u.requests, 0);
        // 只更新窗口长度也算一次改动
        assert!(u.absorb(None, None, None, None, Some(64_000), 6));
        assert_eq!(u.requests, 1);
    }

    /// active 必须出现在发给前端的 JSON 里（前端靠它认当前会话），但**不能**落盘。
    /// 这条断言挡住的是「#[serde(skip)] 把收发一起掐掉」那类回归。
    #[test]
    fn active_flag_travels_to_frontend_but_stays_out_of_metadata() {
        let c = AiConversation { id: "x".into(), chat_id: 7, active: true, ..Default::default() };
        let ipc = serde_json::to_value(&c).unwrap();
        assert_eq!(ipc["active"], true, "发给前端的那份要带 active");
        let disk = serde_json::to_value(disk_copy(&c)).unwrap();
        assert_eq!(disk["active"], false, "落盘的那份不带 active（派生值）");
        assert_eq!(disk["id"], "x", "其余字段照旧落盘");
    }

    #[test]
    fn estimate_counts_cjk_per_char() {
        assert_eq!(estimate_tokens(100, 0), 100);
        assert_eq!(estimate_tokens(0, 100), 25);
        assert_eq!(estimate_tokens(10, 10), 13); // 10 + ceil(10/4)
        assert_eq!(estimate_tokens(0, 0), 0);
    }

    #[test]
    fn account_dir_is_sanitised() {
        assert_eq!(account_dir(""), DEFAULT_ACCOUNT);
        assert_eq!(account_dir("  "), DEFAULT_ACCOUNT);
        assert_eq!(account_dir("123456"), "123456");
        assert_eq!(account_dir("../etc"), "___etc");
    }

    #[test]
    fn uuid_has_v4_shape_and_is_unique() {
        let a = uuid();
        let b = uuid();
        assert_ne!(a, b);
        let parts: Vec<&str> = a.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!([8, 4, 4, 4, 12], [parts[0].len(), parts[1].len(), parts[2].len(), parts[3].len(), parts[4].len()]);
        assert!(parts[2].starts_with('4'));
        assert!(parts[3].starts_with('a'));
    }
}
