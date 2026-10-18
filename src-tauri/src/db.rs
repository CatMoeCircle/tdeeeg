//! 应用本地 SQLite 数据库：下载记录 + AI 对话记录。
//!
//! 固定放在数据根目录的 `tdeeeg.db`，随数据目录一起迁移。
//! 不保留旧 JSON / 目录结构的兼容与迁移逻辑。

use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use rusqlite::Connection;

pub const DB_FILE: &str = "tdeeeg.db";

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS downloads (
    account_id         INTEGER NOT NULL,
    remote_id          TEXT    NOT NULL,
    session_file_id    INTEGER,
    file_id            INTEGER NOT NULL DEFAULT 0,
    file_name          TEXT    NOT NULL DEFAULT '',
    chat_title         TEXT    NOT NULL DEFAULT '',
    chat_id            INTEGER,
    message_id         INTEGER,
    total_size         INTEGER NOT NULL DEFAULT 0,
    downloaded_size    INTEGER NOT NULL DEFAULT 0,
    progress           REAL    NOT NULL DEFAULT 0,
    is_paused          INTEGER NOT NULL DEFAULT 0,
    is_completed       INTEGER NOT NULL DEFAULT 0,
    local_path         TEXT,
    thumbnail_data_url TEXT,
    file_type          TEXT    NOT NULL DEFAULT '',
    is_generic         INTEGER NOT NULL DEFAULT 0,
    hidden_category    TEXT,
    is_auto_photo      INTEGER NOT NULL DEFAULT 0,
    is_streaming       INTEGER NOT NULL DEFAULT 0,
    tags               TEXT    NOT NULL DEFAULT '[]',
    source_label       TEXT,
    dismissed          INTEGER NOT NULL DEFAULT 0,
    is_upload          INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL DEFAULT 0,
    completed_at       INTEGER NOT NULL DEFAULT 0,
    has_tdlib_update   INTEGER NOT NULL DEFAULT 0,
    in_tdlib_list      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, remote_id)
);

CREATE TABLE IF NOT EXISTS download_prefs (
    account_id      INTEGER PRIMARY KEY,
    show_hidden     INTEGER NOT NULL DEFAULT 0,
    show_auto_photos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    account_id        TEXT    NOT NULL,
    chat_id           INTEGER NOT NULL,
    id                TEXT    NOT NULL,
    title             TEXT    NOT NULL DEFAULT '',
    created_at        INTEGER NOT NULL DEFAULT 0,
    updated_at        INTEGER NOT NULL DEFAULT 0,
    requests          INTEGER NOT NULL DEFAULT 0,
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    cached_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    last_input_tokens INTEGER NOT NULL DEFAULT 0,
    last_output_tokens INTEGER NOT NULL DEFAULT 0,
    context_length    INTEGER NOT NULL DEFAULT 0,
    last_at           INTEGER NOT NULL DEFAULT 0,
    history           TEXT    NOT NULL DEFAULT '[]',
    PRIMARY KEY (account_id, chat_id, id)
);

CREATE TABLE IF NOT EXISTS ai_active (
    account_id      TEXT    NOT NULL,
    chat_id         INTEGER NOT NULL,
    conversation_id TEXT    NOT NULL,
    PRIMARY KEY (account_id, chat_id)
);
"#;

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
        let conn = Connection::open(data_dir.join(DB_FILE))
            .map_err(|e| format!("无法打开数据库: {e}"))?;
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(|e| format!("设置数据库超时失败: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("初始化数据库失败: {e}"))?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| format!("创建数据表失败: {e}"))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// 取连接。锁被毒化时照常复用：单条语句 panic 不该让整个应用失去持久化。
    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }
}
