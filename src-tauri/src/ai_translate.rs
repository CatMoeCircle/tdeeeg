//! AI 供应商：列表配置（名称 / 接口地址 / 协议 / 模型列表）、模型列表与翻译调用。
//!
//! - 供应商列表 → 应用配置目录 JSON（不含 API Key）
//! - 每个供应商的 API Key → tauri-plugin-keyring-store（系统钥匙串），账号 `ai.provider.{id}.api_key`
//! - 翻译与模型列表走 llmsdk（OpenAI Responses / OpenAI Compatible / Anthropic）

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_keyring_store::KeyringExt;

const CONFIG_FILE: &str = "ai_providers.json";

/// 接口协议：openai-responses | openai-compatible（默认，OpenAI Completions）| anthropic
const FORMAT_ANTHROPIC: &str = "anthropic";

/// AI 供应商（API Key 不在此结构内，单独存钥匙串）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiProvider {
    pub id: String,
    /// 供应商名称
    pub name: String,
    /// 接口地址（base_url，含版本路径，如 https://api.openai.com/v1）
    pub endpoint: String,
    /// 接口协议
    pub format: String,
    /// 图标：前端图标库的 key（如 kimi）或用户自定义图片的 data URL；空 = 用名称首字母
    pub icon: String,
    /// 用户添加到列表中的模型（可带上下文 / 最大输出 / 模态，可在设置里手改）
    pub models: Vec<AiModel>,
    /// 返回给前端：钥匙串里是否已保存 API Key（写入时忽略）
    pub has_api_key: bool,
}

fn key_account(id: &str) -> String {
    format!("ai.provider.{id}.api_key")
}

/// 模型条目：`id` 必有，其余字段视接口是否返回（OpenRouter 等才有名称 / 上下文 / 最大输出 / 模态），
/// 也可在设置里手改。持久化为对象，同时兼容旧版的纯字符串数组。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    /// 展示名（接口的 name / display_name），空 = 直接显示 id
    pub name: Option<String>,
    pub context_length: Option<u64>,
    pub max_output: Option<u64>,
    pub modality: Option<String>,
}

impl<'de> Deserialize<'de> for AiModel {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize, Default)]
        #[serde(rename_all = "camelCase", default)]
        struct Full {
            id: String,
            name: Option<String>,
            context_length: Option<u64>,
            max_output: Option<u64>,
            modality: Option<String>,
        }
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Repr {
            Id(String),
            Full(Full),
        }
        Ok(match Repr::deserialize(d)? {
            Repr::Id(id) => AiModel {
                id,
                name: None,
                context_length: None,
                max_output: None,
                modality: None,
            },
            Repr::Full(f) => AiModel {
                id: f.id,
                name: f.name,
                context_length: f.context_length,
                max_output: f.max_output,
                modality: f.modality,
            },
        })
    }
}

fn config_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    Ok(dir.join(CONFIG_FILE))
}

/// 解析配置文本：新格式是 `{providers, deletedPresets}` 对象，旧格式是裸数组（只有 providers）。
/// 先按对象解（数组解不成结构体），失败再按裸数组解，避免对象被当成 legacy 丢字段。
fn parse_config(text: &str) -> AiConfig {
    if let Ok(config) = serde_json::from_str::<AiConfig>(text) {
        return config;
    }
    if let Ok(providers) = serde_json::from_str::<Vec<AiProvider>>(text) {
        return AiConfig { providers, deleted_presets: Vec::new() };
    }
    AiConfig::default()
}

pub(crate) fn load_all<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> AiConfig {
    config_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|text| parse_config(&text))
        .unwrap_or_default()
}

fn write_all<R: tauri::Runtime>(app: &tauri::AppHandle<R>, config: &AiConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| format!("写入配置失败: {e}"))
}

pub(crate) fn saved_api_key<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Option<String> {
    app.keyring()
        .store
        .get_password(&key_account(id))
        .ok()
        .flatten()
        .filter(|k| !k.trim().is_empty())
}

fn with_key_flag<R: tauri::Runtime>(app: &tauri::AppHandle<R>, mut p: AiProvider) -> AiProvider {
    p.has_api_key = saved_api_key(app, &p.id).is_some();
    p
}

/// 联网搜索工具的专属 API Key（设置页「AI 工具」里填的）：与供应商 Key 分开存，互不覆盖；
/// 没配时调用方回退到当前供应商的 Key。
const SEARCH_KEY_ACCOUNT: &str = "ai.search.api_key";

pub(crate) fn saved_search_key<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    app.keyring()
        .store
        .get_password(SEARCH_KEY_ACCOUNT)
        .ok()
        .flatten()
        .filter(|k| !k.trim().is_empty())
}

/// 搜索工具是否已保存专属 Key（设置页用来显示「已保存」）
#[tauri::command]
pub fn has_ai_search_key(app: tauri::AppHandle) -> bool {
    saved_search_key(&app).is_some()
}

/// 保存搜索工具的专属 Key；传空 = 清掉。返回保存后是否仍有 Key。
#[tauri::command]
pub fn save_ai_search_key(app: tauri::AppHandle, api_key: String) -> Result<bool, String> {
    let key = api_key.trim();
    if key.is_empty() {
        app.keyring().store.delete(SEARCH_KEY_ACCOUNT).ok();
        return Ok(false);
    }
    app.keyring()
        .store
        .set_password(SEARCH_KEY_ACCOUNT, key)
        .map_err(|e| format!("保存搜索 API Key 到钥匙串失败: {e}"))?;
    Ok(true)
}

/// 供应商列表 + 被用户删掉的预设名（自定义项填同名保存即恢复该预设，见前端 presetForName）。
/// 旧版本文件是裸数组（只有 providers），由 parse_config 兼容。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConfig {
    pub providers: Vec<AiProvider>,
    /// 已删除的预设名称；同名供应商保存时由前端移出并复用预设 id
    pub deleted_presets: Vec<String>,
}

/// 供应商列表（设置页 / 翻译页进入时调用）。
#[tauri::command]
pub fn list_ai_providers(app: tauri::AppHandle) -> Result<AiConfig, String> {
    let mut config = load_all(&app);
    for p in config.providers.iter_mut() {
        p.has_api_key = saved_api_key(&app, &p.id).is_some();
    }
    Ok(config)
}

/// 新增或更新供应商：非敏感字段写 JSON；api_key 非空时写入钥匙串（空 = 保持已保存的 Key）。
/// 该名称若在「已删除预设」里，则一并移出（= 恢复该预设）。
#[tauri::command]
pub fn save_ai_provider(
    app: tauri::AppHandle,
    provider: AiProvider,
    api_key: String,
) -> Result<AiProvider, String> {
    let key = api_key.trim();
    if !key.is_empty() {
        app.keyring()
            .store
            .set_password(&key_account(&provider.id), key)
            .map_err(|e| format!("保存 API Key 到钥匙串失败: {e}"))?;
    }
    let mut config = load_all(&app);
    match config.providers.iter_mut().find(|p| p.id == provider.id) {
        Some(p) => *p = provider.clone(),
        None => config.providers.push(provider.clone()),
    }
    config
        .deleted_presets
        .retain(|n| !n.eq_ignore_ascii_case(provider.name.trim()));
    write_all(&app, &config)?;
    Ok(with_key_flag(&app, provider))
}

/// 删除自定义供应商：移除配置与钥匙串中的 API Key。
#[tauri::command]
pub fn delete_ai_provider(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut config = load_all(&app);
    config.providers.retain(|p| p.id != id);
    write_all(&app, &config)?;
    // Key 不存在时 delete 也视为成功
    app.keyring().store.delete(&key_account(&id)).ok();
    Ok(())
}

/// 删除预设：只清除该预设已保存的设置（配置 + Key）并记住它被删过，UI 上不再显示它。
#[tauri::command]
pub fn delete_ai_preset(app: tauri::AppHandle, id: String, name: String) -> Result<(), String> {
    let mut config = load_all(&app);
    config.providers.retain(|p| p.id != id);
    let name = name.trim().to_string();
    if !name.is_empty() && !config.deleted_presets.iter().any(|n| n.eq_ignore_ascii_case(&name)) {
        config.deleted_presets.push(name);
    }
    write_all(&app, &config)?;
    app.keyring().store.delete(&key_account(&id)).ok();
    Ok(())
}

/// 重置「被删除的预设」名单：清空后所有预设恢复显示（开发者选项），返回恢复的预设数。
#[tauri::command]
pub fn reset_ai_presets(app: tauri::AppHandle) -> Result<usize, String> {
    let mut config = load_all(&app);
    let count = config.deleted_presets.len();
    config.deleted_presets.clear();
    write_all(&app, &config)?;
    Ok(count)
}

/// 拉取模型列表（「测试连接」「获取模型列表」）。
/// `api_key` 非空则用入参，否则回退到钥匙串里该供应商已保存的 Key。
#[tauri::command]
pub async fn ai_list_models(
    app: tauri::AppHandle,
    provider: AiProvider,
    api_key: String,
) -> Result<Vec<AiModel>, String> {
    if provider.endpoint.trim().is_empty() {
        return Err("请先填写接口地址".to_string());
    }
    let input = api_key.trim();
    let key = if input.is_empty() {
        saved_api_key(&app, &provider.id).ok_or_else(|| "请先填写 API Key".to_string())?
    } else {
        input.to_string()
    };
    fetch_models(&provider.endpoint, &provider.format, &key).await
}

/// GET {endpoint}/models 拉取模型列表。
/// 三种协议的 endpoint 均含版本路径（…/v1），因此统一拼 {endpoint}/models。
async fn fetch_models(endpoint: &str, format: &str, api_key: &str) -> Result<Vec<AiModel>, String> {
    let base = endpoint.trim().trim_end_matches('/');
    let url = format!("{base}/models");
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    req = if format == FORMAT_ANTHROPIC {
        req.header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
    } else {
        req.header("Authorization", format!("Bearer {api_key}"))
    };
    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("模型列表请求失败 (HTTP {status}): {snippet}"));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models: Vec<AiModel> = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| arr.iter().filter_map(model_from_json).collect())
        .unwrap_or_default();
    if models.is_empty() {
        return Err("该接口未返回模型列表，请手动输入模型 ID".to_string());
    }
    Ok(models)
}

/// 单个模型：`id` 必然有；上下文 / 最大输出 / 模态只有部分接口返回（如 OpenRouter），
/// 字段名各家不一，逐个候选键探测，取不到就留空。
fn model_from_json(v: &serde_json::Value) -> Option<AiModel> {
    let num = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| v.get(*k).and_then(|x| x.as_u64()))
    };
    let nested_num = |parent: &str, key: &str| {
        v.get(parent).and_then(|p| p.get(key)).and_then(|x| x.as_u64())
    };
    let modality = v
        .get("architecture")
        .and_then(|a| a.get("modality"))
        .and_then(|x| x.as_str())
        .map(String::from)
        .or_else(|| {
            v.get("architecture")
                .and_then(|a| a.get("input_modalities"))
                .and_then(|x| x.as_array())
                .map(|a| a.iter().filter_map(|m| m.as_str()).collect::<Vec<_>>().join("+"))
        })
        .or_else(|| v.get("modality").and_then(|x| x.as_str()).map(String::from));

    Some(AiModel {
        id: v.get("id")?.as_str()?.to_string(),
        name: v
            .get("name")
            .or_else(|| v.get("display_name"))
            .and_then(|x| x.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(String::from),
        context_length: num(&["context_length", "context_window", "max_context_length"]),
        max_output: num(&["max_output_tokens", "max_completion_tokens"])
            .or_else(|| nested_num("top_provider", "max_completion_tokens")),
        modality,
    })
}

/// AI 翻译一段文本（翻译链路入口）：指定供应商 + 其列表中的模型。
#[tauri::command]
pub async fn ai_translate_text(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    text: String,
    to_language_code: String,
) -> Result<String, String> {
    let provider = load_all(&app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let api_key = saved_api_key(&app, &provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    translate_via_llmsdk(&provider.endpoint, &provider.format, &api_key, &model, &text, &to_language_code).await
}

/// LLM 请求用的 HTTP 客户端：**不设总超时**。
///
/// llmsdk 默认的 `HttpClient` 带 `timeout(60s)`（reqwest 的**总**超时，读 body 也算在内），
/// 流式回复超过一分钟就会被从中间掐断，前端拿到的错误是
/// 「api call to …/responses failed: stream read failed: error decoding response body」。
/// 这里只限连接（20s）和单次读取（120s 没有任何新数据才断），长回复 / 思考模型可以一直流。
pub(crate) fn llm_http_client() -> Result<llmsdk::utils::HttpClient, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    Ok(llmsdk::utils::HttpClient::from_reqwest(client))
}

/// 按接口协议构造 llmsdk 模型（翻译 / 对话共用）。endpoint、model_id 须已 trim 且非空。
pub(crate) fn build_language_model(
    endpoint: &str,
    format: &str,
    api_key: &str,
    model_id: &str,
) -> Result<Box<dyn llmsdk::LanguageModel>, String> {
    use llmsdk::{anthropic::Anthropic, openai::OpenAi};

    let http = llm_http_client()?;
    let model: Box<dyn llmsdk::LanguageModel> = match format {
        FORMAT_ANTHROPIC => {
            let provider = Anthropic::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .http_client(http)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.messages(model_id))
        }
        "openai-responses" => {
            let provider = OpenAi::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .http_client(http)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.responses(model_id))
        }
        // openai-compatible（默认）
        _ => {
            let provider = OpenAi::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .http_client(http)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.chat(model_id))
        }
    };
    Ok(model)
}

async fn translate_via_llmsdk(
    endpoint: &str,
    format: &str,
    api_key: &str,
    model_id: &str,
    text: &str,
    to_language_code: &str,
) -> Result<String, String> {
    use llmsdk::{CallOptions, Content, Message, TextPart, UserPart};

    let endpoint = endpoint.trim().trim_end_matches('/');
    let model_id = model_id.trim();
    if endpoint.is_empty() {
        return Err("接口地址为空".to_string());
    }
    if model_id.is_empty() {
        return Err("模型 ID 为空".to_string());
    }

    let model = build_language_model(endpoint, format, api_key, model_id)?;

    let system = format!(
        "You are a professional translation engine. Translate the user's text into the target \
         language ({to}). Preserve line breaks, punctuation, numbers and formatting. Output ONLY \
         the translated text — no explanations, no quotes, no prefixes.",
        to = if to_language_code.is_empty() {
            "the same language as the input"
        } else {
            to_language_code
        }
    );

    let options = CallOptions {
        prompt: vec![
            Message::System {
                content: system.into(),
                provider_options: None,
            },
            Message::User {
                content: vec![UserPart::Text(TextPart {
                    text: text.to_string(),
                    provider_options: None,
                })],
                provider_options: None,
            },
        ],
        max_output_tokens: Some(4096),
        ..Default::default()
    };

    let result = model
        .do_generate(options)
        .await
        .map_err(|e| format!("AI 翻译失败: {e}"))?;

    let out: String = result
        .content
        .iter()
        .filter_map(|c| match c {
            Content::Text(t) => Some(t.text.as_str()),
            _ => None,
        })
        .collect();
    if out.is_empty() {
        return Err("AI 返回了空译文".to_string());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openrouter_style_metadata() {
        let m = model_from_json(&serde_json::json!({
            "id": "openai/gpt-4o",
            "name": "GPT-4o",
            "context_length": 128000,
            "top_provider": { "max_completion_tokens": 16384 },
            "architecture": { "modality": "text+image->text" }
        }))
        .unwrap();
        assert_eq!(m.id, "openai/gpt-4o");
        assert_eq!(m.name.as_deref(), Some("GPT-4o"));
        assert_eq!(m.context_length, Some(128000));
        assert_eq!(m.max_output, Some(16384));
        assert_eq!(m.modality.as_deref(), Some("text+image->text"));
    }

    #[test]
    fn reads_anthropic_display_name() {
        let m = model_from_json(&serde_json::json!({
            "id": "claude-sonnet-4",
            "display_name": "Claude Sonnet 4",
            "type": "model"
        }))
        .unwrap();
        assert_eq!(m.name.as_deref(), Some("Claude Sonnet 4"));
    }

    #[test]
    fn parses_bare_model_and_skips_id_less_entries() {
        let m = model_from_json(&serde_json::json!({ "id": "gpt-4o-mini", "object": "model" })).unwrap();
        assert_eq!(m.id, "gpt-4o-mini");
        assert!(m.context_length.is_none() && m.max_output.is_none() && m.modality.is_none());
        assert!(model_from_json(&serde_json::json!({ "object": "model" })).is_none());
    }

    #[test]
    fn parses_legacy_provider_array_and_new_config_object() {
        // 旧格式：裸数组（只有 providers），没有已删预设
        let legacy = parse_config(r#"[{"id":"preset-deepseek","name":"DeepSeek"}]"#);
        assert_eq!(legacy.providers.len(), 1);
        assert!(legacy.deleted_presets.is_empty());

        // 新格式：对象 + 已删预设名
        let config = parse_config(
            r#"{"providers":[{"id":"a","name":"自定义"}],"deletedPresets":["DeepSeek","Kimi"]}"#,
        );
        assert_eq!(config.providers[0].id, "a");
        assert_eq!(config.deleted_presets, vec!["DeepSeek", "Kimi"]);

        // 缺字段 / 坏 JSON 都退回空配置，不 panic
        assert!(parse_config("{}").providers.is_empty());
        assert!(parse_config("not json").providers.is_empty());
    }

    #[test]
    fn config_round_trips_through_json() {
        let config = AiConfig {
            providers: vec![AiProvider { id: "preset-kimi".into(), name: "Kimi".into(), ..Default::default() }],
            deleted_presets: vec!["DeepSeek".into()],
        };
        let text = serde_json::to_string(&config).unwrap();
        let back = parse_config(&text);
        assert_eq!(back.providers[0].name, "Kimi");
        assert_eq!(back.deleted_presets, vec!["DeepSeek"]);
    }

    #[test]
    fn reads_legacy_string_and_object_model_lists() {        let legacy: AiProvider = serde_json::from_str(
            r#"{"id":"p","name":"n","endpoint":"https://x/v1","format":"openai-compatible","models":["gpt-4o","claude-3"]}"#,
        )
        .unwrap();
        assert_eq!(legacy.models.len(), 2);
        assert_eq!(legacy.models[0].id, "gpt-4o");
        assert!(legacy.models[0].context_length.is_none());

        let full: AiProvider = serde_json::from_str(
            r#"{"models":[{"id":"m","contextLength":4096,"maxOutput":1024,"modality":"text"}]}"#,
        )
        .unwrap();
        assert_eq!(full.models[0].context_length, Some(4096));
        assert_eq!(full.models[0].modality.as_deref(), Some("text"));
    }
}
