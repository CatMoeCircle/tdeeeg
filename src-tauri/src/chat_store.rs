use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: i64,
    pub title: String,
    #[serde(default)]
    pub unread_count: i32,
    pub last_message: Option<Value>,
    pub positions: Option<Vec<Value>>,
    pub chat_lists: Option<Vec<Value>>,
    pub photo: Option<Value>,
    pub draft_message: Option<Value>,
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

                    // Initialize positions if any
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
                    // Emit chat update as well so frontend has the data
                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(&chat).unwrap(),
                    ));
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
            }
            "updateChatLastMessage" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.last_message = Some(update["last_message"].clone());

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

                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
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
                        serde_json::to_value(chat).unwrap(),
                    ));
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
            "updateChatDraftMessage" => {
                let chat_id = update["chat_id"].as_i64()?;
                if let Some(chat) = self.chats.get_mut(&chat_id) {
                    chat.draft_message = Some(update["draft_message"].clone());

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

                    events.push((
                        "chat-update".to_string(),
                        serde_json::to_value(chat).unwrap(),
                    ));
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
