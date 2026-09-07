//! 多账户清单管理
//!
//! 每个账户对应一个独立的 TDLib 客户端实例，账户清单持久化到
//! `data_dir/accounts.json`，记录账户 id 列表、最近已知的姓名/用户名、
//! 以及当前活动账户。运行时元数据（是否已登录、头像本地路径）由
//! tdlib.rs 侧在内存中维护（`account_meta`）。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 单个账户的持久化记录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: i64,
    #[serde(default)]
    pub first_name: String,
    #[serde(default)]
    pub last_name: String,
    #[serde(default)]
    pub username: String,
    /// 该账户创建/登录时使用的 api_id（None 时使用全局默认值）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_id: Option<i32>,
    /// 该账户创建/登录时使用的 api_hash
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_hash: Option<String>,
    /// 该账户创建/登录时是否使用测试数据中心
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_test_dc: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_api_creds: Option<bool>,
}

/// accounts.json 的磁盘结构。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountsFile {
    #[serde(default)]
    pub active: i64,
    #[serde(default = "default_next_id")]
    pub next_id: i64,
    #[serde(default)]
    pub accounts: Vec<AccountRecord>,
}

fn default_next_id() -> i64 {
    1
}

impl Default for AccountsFile {
    fn default() -> Self {
        Self {
            active: 0,
            next_id: 1,
            accounts: Vec::new(),
        }
    }
}

/// 账户清单的内存包装，负责加载 / 保存与账户增删改。
pub struct AccountsStore {
    path: PathBuf,
    file: AccountsFile,
}

impl AccountsStore {
    /// 从 `path` 加载账户清单；文件不存在或损坏时从空清单开始，
    /// 并保证至少存在一个账户（id=0），以便首次启动即可进入登录流程。
    pub fn load(path: PathBuf) -> Self {
        let file = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<AccountsFile>(&s).ok())
            .unwrap_or_default();
        let mut store = Self { path, file };
        if store.file.accounts.is_empty() {
            store.file.accounts.push(AccountRecord {
                id: 0,
                first_name: String::new(),
                last_name: String::new(),
                username: String::new(),
                api_id: None,
                api_hash: None,
                use_test_dc: None,
                custom_api_creds: None,
            });
            store.file.active = 0;
            store.file.next_id = 1;
            let _ = store.save();
        }
        store
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建账户配置目录失败: {e}"))?;
        }
        let content =
            serde_json::to_string_pretty(&self.file).map_err(|e| format!("序列化账户配置失败: {e}"))?;
        std::fs::write(&self.path, content).map_err(|e| format!("写入账户配置失败: {e}"))
    }

    pub fn active(&self) -> i64 {
        self.file.active
    }

    /// 切换活动账户。目标账户必须存在于清单中。
    pub fn set_active(&mut self, id: i64) -> Result<(), String> {
        if !self.file.accounts.iter().any(|a| a.id == id) {
            return Err(format!("账户 {id} 不存在"));
        }
        self.file.active = id;
        self.save()
    }

    pub fn records(&self) -> &Vec<AccountRecord> {
        &self.file.accounts
    }

    /// 所有账户 id（按清单顺序）
    pub fn ids(&self) -> Vec<i64> {
        self.file.accounts.iter().map(|a| a.id).collect()
    }

    #[allow(dead_code)]
    pub fn contains(&self, id: i64) -> bool {
        self.file.accounts.iter().any(|a| a.id == id)
    }

    /// 新增一个账户，返回新分配的 id。
    pub fn add(&mut self) -> i64 {
        let id = self.file.next_id;
        self.file.next_id += 1;
        self.file.accounts.push(AccountRecord {
            id,
            first_name: String::new(),
            last_name: String::new(),
            username: String::new(),
            api_id: None,
            api_hash: None,
            use_test_dc: None,
            custom_api_creds: None,
        });
        id
    }

    /// 移除一个账户；若移除的是活动账户则切换到剩余最小 id。
    pub fn remove(&mut self, id: i64) -> Result<(), String> {
        let before = self.file.accounts.len();
        self.file.accounts.retain(|a| a.id != id);
        if self.file.accounts.len() == before {
            return Err(format!("账户 {id} 不存在"));
        }
        if self.file.active == id {
            self.file.active = self
                .file
                .accounts
                .iter()
                .map(|a| a.id)
                .min()
                .unwrap_or(0);
        }
        if self.file.accounts.is_empty() {
            self.file.accounts.push(AccountRecord {
                id: 0,
                first_name: String::new(),
                last_name: String::new(),
                username: String::new(),
                api_id: None,
                api_hash: None,
                use_test_dc: None,
                custom_api_creds: None,
            });
            self.file.active = 0;
        }
        self.save()
    }

    /// 更新账户最近已知的姓名 / 用户名并持久化。
    pub fn update_profile(&mut self, id: i64, first_name: String, last_name: String, username: String) {
        if let Some(rec) = self.file.accounts.iter_mut().find(|a| a.id == id) {
            rec.first_name = first_name;
            rec.last_name = last_name;
            rec.username = username;
            let _ = self.save();
        }
    }

    /// 保存账户的 TDLib 凭据（api_id / api_hash / use_test_dc），登录时调用一次。
    pub fn set_tdlib_params(
        &mut self,
        id: i64,
        api_id: Option<i32>,
        api_hash: Option<&str>,
        use_test_dc: bool,
        custom_api_creds: bool,
    ) {
        if let Some(rec) = self.file.accounts.iter_mut().find(|a| a.id == id) {
            rec.use_test_dc = Some(use_test_dc);
            rec.custom_api_creds = Some(custom_api_creds);
            if custom_api_creds {
                rec.api_id = api_id;
                rec.api_hash = api_hash.map(|s| s.to_string());
            } else {
                rec.api_id = None;
                rec.api_hash = None;
            }
            let _ = self.save();
        }
    }

    /// 获取账户的 TDLib 凭据；返回 (api_id, api_hash, use_test_dc)。
    /// 任一字段缺失时返回 None（调用方应 fallback 到全局 config）。
    pub fn get_tdlib_params(&self, id: i64) -> Option<(i32, String, bool)> {
        let rec = self.file.accounts.iter().find(|a| a.id == id)?;
        let api_id = rec.api_id?;
        let api_hash = rec.api_hash.as_deref()?;
        let use_test_dc = rec.use_test_dc?;
        Some((api_id, api_hash.to_string(), use_test_dc))
    }

    /// 获取账户是否使用了自定义凭据。
    pub fn is_custom_api_creds(&self, id: i64) -> Option<bool> {
        self.file.accounts.iter().find(|a| a.id == id)?.custom_api_creds
    }
}