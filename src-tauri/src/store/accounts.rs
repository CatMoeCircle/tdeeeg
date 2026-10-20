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

impl AccountRecord {
    fn empty(id: i64) -> Self {
        Self {
            id,
            first_name: String::new(),
            last_name: String::new(),
            username: String::new(),
            api_id: None,
            api_hash: None,
            use_test_dc: None,
            custom_api_creds: None,
        }
    }
}

/// 账户清单的内存包装，负责加载 / 保存与账户增删改。
pub struct AccountsStore {
    path: PathBuf,
    file: AccountsFile,
}

fn sibling(path: &std::path::Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", path.display()))
}

fn read_accounts(path: &std::path::Path) -> Option<AccountsFile> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl AccountsStore {
    /// 从 `path` 加载账户清单。
    ///
    /// 主文件无法解析时：改名留证（`.corrupt-<时间戳>`），从 `.bak` 恢复；
    /// 备份也读不到时从空清单开始，并保证至少存在一个账户（id=0），
    /// 以便首次启动即可进入登录流程。
    pub fn load(path: PathBuf) -> Self {
        let backup = sibling(&path, ".bak");
        let mut file = read_accounts(&path);
        if file.is_none() {
            if path.exists() {
                let corrupt = sibling(&path, &format!(".corrupt-{}", now_secs()));
                let _ = std::fs::rename(&path, &corrupt);
                eprintln!(
                    "[accounts] {} 无法解析，已另存为 {}，尝试从备份恢复",
                    path.display(),
                    corrupt.display()
                );
            }
            file = read_accounts(&backup);
        }
        let mut store = Self {
            path,
            file: file.unwrap_or_default(),
        };
        if store.file.accounts.is_empty() {
            store.file.accounts.push(AccountRecord::empty(0));
            store.file.active = 0;
            store.file.next_id = store.file.next_id.max(1);
        }
        // 主文件不存在（首次启动 / 刚从备份恢复）：立刻落一份完整清单
        if !store.path.exists() {
            let _ = store.save();
        }
        store
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建账户配置目录失败: {e}"))?;
        }
        let content = serde_json::to_string_pretty(&self.file)
            .map_err(|e| format!("序列化账户配置失败: {e}"))?;
        // 原子替换：先写临时文件再 rename。直接 write 到目标时被中断会留下半截文件，
        // 下次启动就会当成损坏的清单（历史事故来源）。
        let tmp = sibling(&self.path, ".tmp");
        std::fs::write(&tmp, &content).map_err(|e| format!("写入账户配置失败: {e}"))?;
        if self.path.exists() {
            let _ = std::fs::copy(&self.path, sibling(&self.path, ".bak"));
        }
        std::fs::rename(&tmp, &self.path).map_err(|e| format!("替换账户配置失败: {e}"))
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

    /// 使用内置 API（非自定义凭据）的账户数量。
    /// `custom_api_creds == Some(true)` 的账户不算在内。
    pub fn count_builtin_accounts(&self) -> usize {
        self.file
            .accounts
            .iter()
            .filter(|a| a.custom_api_creds != Some(true))
            .count()
    }

    /// 内置 API 账户上限。
    pub const BUILTIN_API_LIMIT: usize = 5;

    /// 新增一个账户，返回新分配的 id。
    pub fn add(&mut self) -> i64 {
        let id = self.file.next_id;
        self.file.next_id += 1;
        self.file.accounts.push(AccountRecord::empty(id));
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
            self.file.active = self.file.accounts.iter().map(|a| a.id).min().unwrap_or(0);
        }
        if self.file.accounts.is_empty() {
            self.file.accounts.push(AccountRecord::empty(0));
            self.file.active = 0;
        }
        self.save()
    }

    /// 更新账户最近已知的姓名 / 用户名并持久化。
    pub fn update_profile(
        &mut self,
        id: i64,
        first_name: String,
        last_name: String,
        username: String,
    ) {
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

    /// 获取账户的 TDLib 凭据；返回 (api_id?, api_hash?, use_test_dc?)。
    /// 内置凭据时 api_id/api_hash 为 None（不保存到磁盘防泄露）。
    /// use_test_dc 可能为 None（旧账户或尚未保存），调用方需 fallback。
    pub fn get_tdlib_params(&self, id: i64) -> Option<(Option<i32>, Option<String>, Option<bool>)> {
        let rec = self.file.accounts.iter().find(|a| a.id == id)?;
        Some((rec.api_id, rec.api_hash.clone(), rec.use_test_dc))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tdgram-accounts-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 多账户清单必须原样往返，且空账户不能被别人的名字污染
    #[test]
    fn roundtrips_multiple_accounts() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("accounts.json");
        let mut store = AccountsStore::load(path.clone());
        let a = store.add();
        let b = store.add();
        store.set_active(b).unwrap();
        store.update_profile(a, "A".into(), String::new(), "ua".into());

        let reloaded = AccountsStore::load(path);
        assert_eq!(reloaded.ids(), vec![0, a, b]);
        assert_eq!(reloaded.active(), b);
        assert_eq!(reloaded.records()[1].first_name, "A");
        assert!(reloaded.records()[0].first_name.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 主文件写坏（进程被中断）时从 .bak 恢复，绝不抹成单账户 0
    #[test]
    fn corrupted_file_recovers_from_backup() {
        let dir = temp_dir("corrupt");
        let path = dir.join("accounts.json");
        let mut store = AccountsStore::load(path.clone());
        let a = store.add();
        store.add();
        store.set_active(a).unwrap();
        store.update_profile(a, "A".into(), String::new(), String::new());
        assert!(dir.join("accounts.json.bak").exists(), "每次 save 都应留备份");

        // 模拟写到一半被杀：留下半截 JSON
        std::fs::write(&path, br#"{"active":0,"next_id":3,"acc"#).unwrap();
        let recovered = AccountsStore::load(path.clone());
        assert_eq!(recovered.ids(), vec![0, 1, 2], "多账户清单不能被抹成单账户");
        assert_eq!(recovered.active(), a);
        // 备份落后一次保存（update_profile 那次），账户名丢了但清单没丢
        assert_eq!(recovered.records()[1].first_name, "");
        // 损坏文件留证，不静默删除
        let kept = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(kept, "损坏的主文件应另存留证");
        // 恢复后主文件立刻重建，下次启动不必再依赖备份
        assert_eq!(AccountsStore::load(path).ids(), vec![0, 1, 2]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
