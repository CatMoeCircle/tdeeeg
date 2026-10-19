use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Community {
    pub id: i64,
    pub have_access: bool,
    pub name: String,
    pub photo: Option<Value>,
    pub date: i64,
    pub status: Value,
    /// 社区级权限（普通成员能做什么）。TDLib 不保证一直返回，缺省为 null
    #[serde(default)]
    pub permissions: Option<Value>,
}

pub struct CommunityStore {
    pub communities: HashMap<i64, Community>,
}

impl CommunityStore {
    pub fn new() -> Self {
        Self {
            communities: HashMap::new(),
        }
    }

    pub fn get_community(&self, community_id: i64) -> Option<&Community> {
        self.communities.get(&community_id)
    }

    pub fn handle_update(&mut self, update: &Value) -> Option<Vec<(String, Value)>> {
        let type_ = update.get("_")?.as_str()?;
        let mut events = Vec::new();

        match type_ {
            "updateCommunity" => {
                if let Ok(community) = serde_json::from_value::<Community>(update["community"].clone()) {
                    if community.have_access {
                        self.communities.insert(community.id, community.clone());
                        events.push((
                            "community-update".to_string(),
                            serde_json::to_value(&community).unwrap(),
                        ));
                    } else {
                        self.communities.remove(&community.id);
                        events.push((
                            "community-removed".to_string(),
                            serde_json::json!({ "id": community.id }),
                        ));
                    }
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
