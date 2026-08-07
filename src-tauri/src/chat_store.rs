use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: i64,
    #[serde(rename = "type")]
    pub chat_type: Value,
    pub title: String,
    #[serde(default)]
    pub unread_count: i32,
    pub last_message: Option<Value>,
    pub positions: Option<Vec<Value>>,
    pub chat_lists: Option<Vec<Value>>,
    pub photo: Option<Value>,
    pub draft_message: Option<Value>,
    #[serde(default)]
    pub notification_settings: Option<Value>,
    /// 是否为话题模式论坛群组（view_as_topics）
    #[serde(default)]
    pub view_as_topics: bool,
    /// 名称/文本 accent 色 id（用于群聊名称、频道；群组用 chat.accent_color_id）
    #[serde(default)]
    pub accent_color_id: i32,
    /// 头像渐变 profile accent 色 id（-1 表示无）
    #[serde(default)]
    pub profile_accent_color_id: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatListState {
    pub list_key: String,
    pub chat_ids: Vec<i64>,
    #[serde(skip)]
    pub orders: HashMap<i64, u64>,
}

impl ChatListState {
    pub fn new(list_key: String) -> Self {
        Self {
            list_key,
            chat_ids: Vec::new(),
            orders: HashMap::new(),
        }
    }

    pub fn update_order(&mut self, chat_id: i64, order: u64) {
        if order == 0 {
            self.orders.remove(&chat_id);
        } else {
            self.orders.insert(chat_id, order);
        }
        self.sort();
    }

    fn sort(&mut self) {
        let mut ids: Vec<i64> = self.orders.keys().cloned().collect();
        ids.sort_by(|a, b| {
            let order_a = self.orders.get(a).unwrap_or(&0);
            let order_b = self.orders.get(b).unwrap_or(&0);
            match order_b.cmp(order_a) {
                Ordering::Equal => b.cmp(a),
                other => other,
            }
        });
        self.chat_ids = ids;
    }
}

pub struct ChatStore {
    pub chats: HashMap<i64, Chat>,
    pub lists: HashMap<String, ChatListState>,
    pub folders: Vec<Value>,
}

impl ChatStore {
    pub fn new() -> Self {
        Self {
            chats: HashMap::new(),
            lists: HashMap::new(),
            folders: Vec::new(),
        }
    }

    pub fn get_list_key(list: &Value) -> Option<String> {
        let type_ = list.get("_")?.as_str()?;
        match type_ {
            "chatListMain" => Some("chatListMain".to_string()),
            "chatListArchive" => Some("chatListArchive".to_string()),
            "chatListFolder" => {
                let id = list.get("chat_folder_id")?.as_i64()?;
                Some(format!("chat_folder_id{}", id))
            }
            "chatFolderInfo" => {
                let id = list.get("id")?.as_i64()?;
                Some(format!("chat_folder_id{}", id))
            }
            _ => None,
        }
    }

    pub fn get_all_chat_lists_value(&self) -> Value {
        let mut lists = Vec::new();
        lists.push(serde_json::json!({ "_": "chatListMain" }));
        lists.push(serde_json::json!({ "_": "chatListArchive" }));
        for folder in &self.folders {
            lists.push(folder.clone());
        }
        serde_json::Value::Array(lists)
    }

    pub fn handle_update(&mut self, update: &Value) -> Option<Vec<(String, Value)>> {
        let type_ = update.get("_")?.as_str()?;
        let mut events = Vec::new();

        match type_ {
            "updateChatFolders" => {
                if let Some(folders) = update.get("chat_folders").and_then(|f| f.as_array()) {
                    self.folders = folders.clone();
                    events.push((
                        "chat-folders-update".to_string(),
                        self.get_all_chat_lists_value(),
                    ));
                }
            }
            "updateNewChat" => {
                if let Ok(chat) = serde_json::from_value::<Chat>(update["chat"].clone()) {
                    self.chats.insert(chat.id, chat.clone());

                    // 关键: 先发出 chat-update，确保前端先收到对话数据
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(&chat).unwrap(),
                    ));

                    // 再发出 chat-list-update，此时前端已经有对话数据可用
                    if let Some(positions) = &chat.positions {
                        for pos in positions {
                            if let Some(list) = pos.get("list") {
                                if let Some(key) = Self::get_list_key(list) {
                                    let order_str =
                                        pos.get("order").and_then(|v| v.as_str()).unwrap_or("0");
                                    let order = order_str.parse::<u64>().unwrap_or(0);

                                    let list_state = self
                                        .lists
                                        .entry(key.clone())
                                        .or_insert_with(|| ChatListState::new(key.clone()));
                                    list_state.update_order(chat.id, order);

                                    events.push((
                                        "chat-list-update".to_string(),
                                        serde_json::to_value(list_state).unwrap(),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "updateChatPosition" => {
                let chat_id = update["chat_id"].as_i64()?;
                let position = &update["position"];
                let list = position.get("list")?;
                let order_str = position
                    .get("order")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let order = order_str.parse::<u64>().unwrap_or(0);
                // 顶置状态从 position.is_pinned 读取（排序也会随置顶变化）
                let is_pinned = position
                    .get("is_pinned")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if let Some(key) = Self::get_list_key(list) {
                    let list_state = self
                        .lists
                        .entry(key.clone())
                        .or_insert_with(|| ChatListState::new(key.clone()));
                    list_state.update_order(chat_id, order);
                    events.push((
                        "chat-list-update".to_string(),
                        serde_json::to_value(list_state).unwrap(),
                    ));
                }

                // 同步更新 chat.positions（按 list 匹配合并），保证前端 chat 的
                // positions 始终反映最新的置顶/排序状态，进而驱动置顶图标的显示。
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    let mut positions = chat.positions.clone().unwrap_or_default();
                    let has_list = positions.iter().any(|p| {
                        p.get("list").and_then(|l| Self::get_list_key(l))
                            == Self::get_list_key(list)
                    });
                    if has_list {
                        for p in positions.iter_mut() {
                            if p.get("list").and_then(|l| Self::get_list_key(l))
                                == Self::get_list_key(list)
                            {
                                let pos = position.clone();
                                p["order"] = pos["order"].clone();
                                p["is_pinned"] = serde_json::json!(is_pinned);
                                break;
                            }
                        }
                    } else {
                        positions.push(position.clone());
                    }
                    chat.positions = Some(positions);
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat.clone()).unwrap(),
                    ));
                }
            }
            "updateChatLastMessage" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.last_message = Some(update["last_message"].clone());

                    // 先发出 chat-update（clone 避免移动引用）
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat.clone()).unwrap(),
                    ));

                    // 再更新列表排序
                    if let Some(positions) = update.get("positions").and_then(|p| p.as_array()) {
                        chat.positions = Some(positions.clone());
                        for pos in positions {
                            if let Some(list) = pos.get("list") {
                                if let Some(key) = Self::get_list_key(list) {
                                    let order_str =
                                        pos.get("order").and_then(|v| v.as_str()).unwrap_or("0");
                                    let order = order_str.parse::<u64>().unwrap_or(0);

                                    let list_state = self
                                        .lists
                                        .entry(key.clone())
                                        .or_insert_with(|| ChatListState::new(key.clone()));
                                    list_state.update_order(chat_id, order);

                                    events.push((
                                        "chat-list-update".to_string(),
                                        serde_json::to_value(list_state).unwrap(),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "updateChatAddedToList" => {
                let chat_id = update["chat_id"].as_i64()?;
                let new_list = &update["chat_list"];

                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    let mut updated_lists = chat.chat_lists.clone().unwrap_or_default();

                    // Logic to add/replace list
                    // If list type exists, replace it.
                    let new_list_type = new_list.get("_").and_then(|v| v.as_str()).unwrap_or("");
                    let new_folder_id = new_list.get("chat_folder_id").and_then(|v| v.as_i64());

                    let mut found = false;
                    for list in &mut updated_lists {
                        let list_type = list.get("_").and_then(|v| v.as_str()).unwrap_or("");
                        if list_type == new_list_type {
                            if list_type == "chatListFolder" {
                                let folder_id = list.get("chat_folder_id").and_then(|v| v.as_i64());
                                if folder_id == new_folder_id {
                                    *list = new_list.clone();
                                    found = true;
                                    break;
                                }
                            } else {
                                *list = new_list.clone();
                                found = true;
                                break;
                            }
                        }
                    }
                    if !found {
                        updated_lists.push(new_list.clone());
                    }

                    chat.chat_lists = Some(updated_lists);
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(&*chat).unwrap(),
                    ));

                    // 将对话加入对应分组/列表（chat-list-update），确保新对话能出现在该分组中
                    if let Some(key) = Self::get_list_key(new_list) {
                        // 顺序从 chat.positions 中取该列表对应的 order（updateChatPosition 也会校正）
                        let order = chat
                            .positions
                            .as_ref()
                            .and_then(|positions| {
                                positions.iter().find_map(|pos| {
                                    let pos_list = pos.get("list")?;
                                    if Self::get_list_key(pos_list).as_deref() == Some(key.as_str())
                                    {
                                        pos.get("order")?.as_str()
                                    } else {
                                        None
                                    }
                                })
                            })
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(0);
                        if order != 0 {
                            let list_state = self
                                .lists
                                .entry(key.clone())
                                .or_insert_with(|| ChatListState::new(key.clone()));
                            list_state.update_order(chat_id, order);
                            events.push((
                                "chat-list-update".to_string(),
                                serde_json::to_value(list_state).unwrap(),
                            ));
                        }
                    }
                }
            }
            "updateChatPhoto" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.photo = Some(update["photo"].clone());
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            "updateChatTitle" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    if let Some(title) = update["title"].as_str() {
                        chat.title = title.to_string();
                        events.push((
                            "chat-update".to_string(),
                            serde_json::to_value(chat).unwrap(),
                        ));
                    }
                }
            }
            "updateChatViewAsTopics" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    if let Some(view_as_topics) = update["view_as_topics"].as_bool() {
                        chat.view_as_topics = view_as_topics;
                        events.push((
                            "chat-update".to_string(),
                            serde_json::to_value(chat).unwrap(),
                        ));
                    }
                }
            }
            "updateChatDraftMessage" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.draft_message = Some(update["draft_message"].clone());

                    // 先发出 chat-update（clone 避免移动引用）
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat.clone()).unwrap(),
                    ));

                    // 再更新列表排序
                    if let Some(positions) = update.get("positions").and_then(|p| p.as_array()) {
                        chat.positions = Some(positions.clone());
                        for pos in positions {
                            if let Some(list) = pos.get("list") {
                                if let Some(key) = Self::get_list_key(list) {
                                    let order_str =
                                        pos.get("order").and_then(|v| v.as_str()).unwrap_or("0");
                                    let order = order_str.parse::<u64>().unwrap_or(0);
                                    let list_state = self
                                        .lists
                                        .entry(key.clone())
                                        .or_insert_with(|| ChatListState::new(key.clone()));
                                    list_state.update_order(chat_id, order);
                                    events.push((
                                        "chat-list-update".to_string(),
                                        serde_json::to_value(list_state).unwrap(),
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "updateChatReadInbox" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    if let Some(cnt) = update["unread_count"].as_i64() {
                        chat.unread_count = cnt as i32;
                    }
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            "updateChatNotificationSettings" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.notification_settings = Some(update["notification_settings"].clone());
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            "updateChatReadOutbox" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            "updateChatUnreadMentionCount" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            "updateChatIsMarkedAsUnread" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
                }
            }
            _ => {}
        }

        if events.is_empty() {
            None
        } else {
            Some(events)
        }
    }
}
