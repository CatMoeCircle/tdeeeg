//! AI 会话（对话）记录：存放在 SQLite 的 `ai_conversations` / `ai_active` 表。
//!
//! - 一条会话一行：标题 / 时间 / 用量 / 消息正文（history 列，JSON 数组）。
//! - 每个 Telegram 聊天当前选中的会话记在 `ai_active`（chat_id → conversation id），
//!   `AiConversation.active` 是每次查询时算出来的派生值，不落库。
//! - 用量（请求次数 + 每次请求的 token）由真正发请求的一方调 `ai_conversation_usage` 记账；
//!   **接口没返回 usage 时前端本地估算**，估算结果也走这个入口写进来，两边不打架。
//!
//! 消息正文原先单独落 history.json；现在和元数据同一行，覆盖写天然原子。

use std::collections::HashMap;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::ai::ai_chat::ChatMessage;
use crate::tdlib::AppState;

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

/// 一条会话。正文在同表的 `history` 列，由 history 命令单独读写。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConversation {
    pub id: String,
    /// 归属的 Telegram 聊天
    pub chat_id: i64,
    pub title: String,
    /// 创建 / 最后更新时间（毫秒）
    pub created_at: u64,
    pub updated_at: u64,
    /// 是否该聊天当前选中的会话。由 `ai_active` 表决定，**必须发给前端**：
    /// 前端拿它认「当前会话」（底部用量、历史回铺、要不要新建都靠它）。
    pub active: bool,
    pub usage: ConversationUsage,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 账号在主键里的取值（未登录 / 老版本没有账号信息时用 `default` 兜底）。
fn account_key(account_id: &str) -> String {
    let s = account_id.trim();
    if s.is_empty() {
        "default".to_string()
    } else {
        s.to_string()
    }
}

fn db_err(e: rusqlite::Error) -> String {
    format!("数据库错误: {e}")
}

const COLUMNS: &str = "id, chat_id, title, created_at, updated_at, requests, input_tokens, \
                       output_tokens, cached_tokens, cache_write_tokens, last_input_tokens, \
                       last_output_tokens, context_length, last_at";

fn row_to_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiConversation> {
    Ok(AiConversation {
        id: row.get(0)?,
        chat_id: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        active: false,
        usage: ConversationUsage {
            requests: row.get(5)?,
            input_tokens: row.get(6)?,
            output_tokens: row.get(7)?,
            cached_tokens: row.get(8)?,
            cache_write_tokens: row.get(9)?,
            last_input_tokens: row.get(10)?,
            last_output_tokens: row.get(11)?,
            context_length: row.get(12)?,
            last_at: row.get(13)?,
        },
    })
}

fn insert_conversation(
    conn: &Connection,
    account: &str,
    c: &AiConversation,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO ai_conversations (
            account_id, chat_id, id, title, created_at, updated_at, requests, input_tokens,
            output_tokens, cached_tokens, cache_write_tokens, last_input_tokens,
            last_output_tokens, context_length, last_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            account,
            c.chat_id,
            c.id,
            c.title,
            c.created_at,
            c.updated_at,
            c.usage.requests,
            c.usage.input_tokens,
            c.usage.output_tokens,
            c.usage.cached_tokens,
            c.usage.cache_write_tokens,
            c.usage.last_input_tokens,
            c.usage.last_output_tokens,
            c.usage.context_length,
            c.usage.last_at,
        ],
    )?;
    Ok(())
}

fn list_conversations(
    conn: &Connection,
    account: &str,
    chat_id: i64,
) -> rusqlite::Result<Vec<AiConversation>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM ai_conversations
         WHERE account_id = ?1 AND chat_id = ?2
         ORDER BY updated_at DESC, rowid DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![account, chat_id], row_to_conversation)?;
    rows.collect()
}

fn all_conversations(conn: &Connection, account: &str) -> rusqlite::Result<Vec<AiConversation>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM ai_conversations
         WHERE account_id = ?1
         ORDER BY updated_at DESC, rowid DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([account], row_to_conversation)?;
    rows.collect()
}

fn find_conversation(
    conn: &Connection,
    account: &str,
    chat_id: i64,
    id: &str,
) -> rusqlite::Result<AiConversation> {
    let sql = format!(
        "SELECT {COLUMNS} FROM ai_conversations
         WHERE account_id = ?1 AND chat_id = ?2 AND id = ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    stmt.query_row(params![account, chat_id, id], row_to_conversation)
}

fn active_for(conn: &Connection, account: &str, chat_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT conversation_id FROM ai_active WHERE account_id = ?1 AND chat_id = ?2",
        params![account, chat_id],
        |r| r.get(0),
    )
    .ok()
}

fn active_map(conn: &Connection, account: &str) -> HashMap<i64, String> {
    let Ok(mut stmt) =
        conn.prepare("SELECT chat_id, conversation_id FROM ai_active WHERE account_id = ?1")
    else {
        return HashMap::new();
    };
    stmt.query_map([account], |r| Ok((r.get(0)?, r.get(1)?)))
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
}

fn save_active(
    conn: &Connection,
    account: &str,
    chat_id: i64,
    id: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO ai_active (account_id, chat_id, conversation_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(account_id, chat_id) DO UPDATE SET conversation_id = excluded.conversation_id",
        params![account, chat_id, id],
    )?;
    Ok(())
}

fn clear_active(conn: &Connection, account: &str, chat_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM ai_active WHERE account_id = ?1 AND chat_id = ?2",
        params![account, chat_id],
    )?;
    Ok(())
}

/// 新建对话：标题默认「新对话」（前端按语言本地化后写入）。返回新建的对话（已置为当前）。
#[tauri::command]
pub fn ai_conversation_create(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    title: String,
) -> Result<AiConversation, String> {
    let now = now_ms();
    let c = AiConversation {
        id: uuid(),
        chat_id,
        title: if title.trim().is_empty() {
            "New chat".to_string()
        } else {
            title.trim().to_string()
        },
        created_at: now,
        updated_at: now,
        active: true,
        usage: ConversationUsage::default(),
    };
    let account = account_key(&account_id);
    let conn = state.db.conn();
    insert_conversation(&conn, &account, &c).map_err(db_err)?;
    save_active(&conn, &account, chat_id, &c.id).map_err(db_err)?;
    Ok(c)
}

/// 某个聊天的全部对话（带 active 标记，已按更新时间倒序）。
#[tauri::command]
pub fn ai_conversation_list(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
) -> Result<Vec<AiConversation>, String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let mut list = list_conversations(&conn, &account, chat_id).map_err(db_err)?;
    // ai_active 里指定的那个优先；没有记录（旧数据 / 手删）就退回最新一个
    let picked = active_for(&conn, &account, chat_id)
        .filter(|id| list.iter().any(|c| &c.id == id));
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
    state: tauri::State<'_, AppState>,
    account_id: String,
) -> Result<Vec<AiConversation>, String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let mut out = all_conversations(&conn, &account).map_err(db_err)?;
    // 同聊天内已倒序；跨聊天再按更新时间整体倒序，最新用过的排最前
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    let active = active_map(&conn, &account);
    let mut marked: HashMap<i64, bool> = HashMap::new();
    for c in out.iter_mut() {
        c.active = active.get(&c.chat_id) == Some(&c.id);
        if c.active {
            marked.insert(c.chat_id, true);
        }
    }
    // 没有记录（旧数据 / 手删）的聊天退回它的最新一个
    for c in out.iter_mut() {
        if c.active || marked.contains_key(&c.chat_id) {
            continue;
        }
        c.active = true;
        marked.insert(c.chat_id, true);
    }
    Ok(out)
}

/// 选中某个对话为当前（切换聊天后接着用同一个）。空 id = 回到该聊天的第一个对话。
#[tauri::command]
pub fn ai_conversation_set_active(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<(), String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let id = if id.trim().is_empty() {
        list_conversations(&conn, &account, chat_id)
            .map_err(db_err)?
            .first()
            .map(|c| c.id.clone())
            .unwrap_or_default()
    } else {
        id
    };
    if id.is_empty() {
        clear_active(&conn, &account, chat_id).map_err(db_err)
    } else {
        save_active(&conn, &account, chat_id, &id).map_err(db_err)
    }
}

/// 重命名：只改标题 + 更新时间。找不到该对话就报错（前端拿它提示）。
#[tauri::command]
pub fn ai_conversation_rename(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
    title: String,
) -> Result<AiConversation, String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let changed = conn
        .execute(
            "UPDATE ai_conversations SET title = ?1, updated_at = ?2
             WHERE account_id = ?3 AND chat_id = ?4 AND id = ?5",
            params![title.trim(), now_ms(), account, chat_id, id],
        )
        .map_err(db_err)?;
    if changed == 0 {
        return Err("对话不存在".to_string());
    }
    find_conversation(&conn, &account, chat_id, &id).map_err(db_err)
}

/// 删除对话。删掉的若是当前选中项，自动改选剩下的第一个。
#[tauri::command]
pub fn ai_conversation_delete(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<(), String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    conn.execute(
        "DELETE FROM ai_conversations WHERE account_id = ?1 AND chat_id = ?2 AND id = ?3",
        params![account, chat_id, id],
    )
    .map_err(db_err)?;
    if active_for(&conn, &account, chat_id).as_deref() == Some(id.as_str()) {
        let next = list_conversations(&conn, &account, chat_id)
            .map_err(db_err)?
            .first()
            .map(|c| c.id.clone());
        match next {
            Some(next) => save_active(&conn, &account, chat_id, &next).map_err(db_err)?,
            None => clear_active(&conn, &account, chat_id).map_err(db_err)?,
        }
    }
    Ok(())
}

/// 清空某个聊天的全部对话。
#[tauri::command]
pub fn ai_conversation_clear_chat(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
) -> Result<usize, String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let count = conn
        .execute(
            "DELETE FROM ai_conversations WHERE account_id = ?1 AND chat_id = ?2",
            params![account, chat_id],
        )
        .map_err(db_err)?;
    clear_active(&conn, &account, chat_id).map_err(db_err)?;
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
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cached_tokens: Option<u64>,
    cache_write_tokens: Option<u64>,
    context_length: Option<u64>,
) -> Result<AiConversation, String> {
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let mut c = find_conversation(&conn, &account, chat_id, &id).map_err(db_err)?;
    c.usage.absorb(
        input_tokens,
        output_tokens,
        cached_tokens,
        cache_write_tokens,
        context_length,
        now_ms(),
    );
    c.updated_at = now_ms();
    conn.execute(
        "UPDATE ai_conversations SET
            updated_at = ?1, requests = ?2, input_tokens = ?3, output_tokens = ?4,
            cached_tokens = ?5, cache_write_tokens = ?6, last_input_tokens = ?7,
            last_output_tokens = ?8, context_length = ?9, last_at = ?10
         WHERE account_id = ?11 AND chat_id = ?12 AND id = ?13",
        params![
            c.updated_at,
            c.usage.requests,
            c.usage.input_tokens,
            c.usage.output_tokens,
            c.usage.cached_tokens,
            c.usage.cache_write_tokens,
            c.usage.last_input_tokens,
            c.usage.last_output_tokens,
            c.usage.context_length,
            c.usage.last_at,
            account,
            chat_id,
            id,
        ],
    )
    .map_err(db_err)?;
    Ok(c)
}

fn read_history(conn: &Connection, account: &str, chat_id: i64, id: &str) -> Option<String> {
    conn.query_row(
        "SELECT history FROM ai_conversations
         WHERE account_id = ?1 AND chat_id = ?2 AND id = ?3",
        params![account, chat_id, id],
        |r| r.get(0),
    )
    .ok()
}

/// 某个对话的落盘历史。对话不存在 / 读不出 = 空历史，不算错误。
/// 模型请求也直接用它（ai_chat 不再让前端把整段历史过 IPC 传回来）。
pub fn load_history(state: &AppState, account_id: &str, chat_id: i64, id: &str) -> Vec<ChatMessage> {
    let account = account_key(account_id);
    let conn = state.db.conn();
    read_history(&conn, &account, chat_id, id)
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// 读某个对话的落盘历史（前端回铺 / 调试用）。
#[tauri::command]
pub fn ai_conversation_history(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
) -> Result<Vec<ChatMessage>, String> {
    Ok(load_history(&state, &account_id, chat_id, &id))
}

/// 覆盖写某个对话的历史（agent 每轮之后调，见 utils/aiChat.ts）。
/// 对话不存在直接报错，不给它凭空建行。
#[tauri::command]
pub fn ai_conversation_save_history(
    state: tauri::State<'_, AppState>,
    account_id: String,
    chat_id: i64,
    id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let text = serde_json::to_string(&messages).map_err(|e| e.to_string())?;
    let account = account_key(&account_id);
    let conn = state.db.conn();
    let changed = conn
        .execute(
            "UPDATE ai_conversations SET history = ?1
             WHERE account_id = ?2 AND chat_id = ?3 AND id = ?4",
            params![text, account, chat_id, id],
        )
        .map_err(db_err)?;
    if changed == 0 {
        return Err("对话不存在".to_string());
    }
    Ok(())
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

/// 极简 uuid v4（只用来做会话 id，不需要密码学强度）。
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
    use crate::db::Db;

    fn temp_db(tag: &str) -> (std::path::PathBuf, Db) {
        let dir = std::env::temp_dir().join(format!("tdgram-ai-{}-{}", tag, now_ms()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let db = Db::open(&dir).expect("open db");
        (dir, db)
    }

    fn conv(id: &str, chat_id: i64, updated_at: u64) -> AiConversation {
        AiConversation {
            id: id.to_string(),
            chat_id,
            title: id.to_string(),
            created_at: updated_at,
            updated_at,
            ..Default::default()
        }
    }

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

    #[test]
    fn estimate_counts_cjk_per_char() {
        assert_eq!(estimate_tokens(100, 0), 100);
        assert_eq!(estimate_tokens(0, 100), 25);
        assert_eq!(estimate_tokens(10, 10), 13); // 10 + ceil(10/4)
        assert_eq!(estimate_tokens(0, 0), 0);
    }

    #[test]
    fn account_key_sanitises_empty() {
        assert_eq!(account_key(""), "default");
        assert_eq!(account_key("  "), "default");
        assert_eq!(account_key(" 123456 "), "123456");
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

    /// 会话行能增删改查；active 是 ai_active 的派生值；history 与元数据同表读写
    #[test]
    fn conversations_roundtrip_and_active_is_derived() {
        let (dir, db) = temp_db("roundtrip");
        let conn = db.conn();
        let account = account_key("42");

        insert_conversation(&conn, &account, &conv("a", 7, 1)).unwrap();
        insert_conversation(&conn, &account, &conv("b", 7, 2)).unwrap();
        save_active(&conn, &account, 7, "a").unwrap();

        let list = list_conversations(&conn, &account, 7).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "b", "按更新时间倒序");
        assert_eq!(active_for(&conn, &account, 7).as_deref(), Some("a"));

        // 历史正文与元数据同表
        conn.execute(
            "UPDATE ai_conversations SET history = ?1
             WHERE account_id = ?2 AND chat_id = 7 AND id = 'b'",
            params![r#"[{"role":"user"}]"#, account],
        )
        .unwrap();
        assert_eq!(
            read_history(&conn, &account, 7, "b").as_deref(),
            Some(r#"[{"role":"user"}]"#)
        );

        // 删除被选中的会话后不留 active
        conn.execute(
            "DELETE FROM ai_conversations WHERE account_id = ?1 AND chat_id = 7 AND id = 'a'",
            [&account],
        )
        .unwrap();
        clear_active(&conn, &account, 7).unwrap();
        assert!(active_for(&conn, &account, 7).is_none());

        // 换账号后互不可见
        insert_conversation(&conn, &account_key("other"), &conv("c", 7, 3)).unwrap();
        assert_eq!(list_conversations(&conn, &account, 7).unwrap().len(), 1);
        drop(conn);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
