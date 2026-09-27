//! AI 翻译提供方：配置保存（API Key 存系统钥匙串）、模型列表与翻译调用。
//!
//! 前端负责收集配置，本模块负责持久化与执行：
//! - 非敏感配置（名称 / 接口 / 格式 / 模型）→ 应用配置目录 JSON
//! - API Key → tauri-plugin-keyring-store（Windows 凭据管理器等系统钥匙串）
//! - 翻译与模型列表走 llmsdk（OpenAI Responses / OpenAI Compatible / Anthropic）

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_keyring_store::KeyringExt;

const CONFIG_FILE: &str = "ai_translate_config.json";
const KEYRING_ACCOUNT: &str = "translate.ai.api_key";

/// 接口格式：openai-responses | openai-compatible | anthropic
const FORMAT_ANTHROPIC: &str = "anthropic";

/// AI 翻译配置（不含 API Key，Key 单独存钥匙串）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslateConfig {
    /// 配置显示名称
    pub name: String,
    /// 接口地址（base_url，含版本路径，如 https://api.openai.com/v1）
    pub endpoint: String,
    /// 接口格式
    pub format: String,
    /// 模型 ID
    pub model: String,
}

impl Default for AiTranslateConfig {
    fn default() -> Self {
        Self {
            name: String::new(),
            endpoint: String::new(),
            format: "openai-compatible".to_string(),
            model: String::new(),
        }
    }
}

impl AiTranslateConfig {
    /// 是否已具备发起调用的基本条件
    fn is_complete(&self) -> bool {
        !self.endpoint.trim().is_empty() && !self.model.trim().is_empty()
    }
}

/// 返回给前端的配置视图（Key 只回传「是否已保存」）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigView {
    pub name: String,
    pub endpoint: String,
    pub format: String,
    pub model: String,
    pub has_api_key: bool,
}

fn config_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
    Ok(dir.join(CONFIG_FILE))
}

fn load_config<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> AiTranslateConfig {
    config_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &AiTranslateConfig,
) -> Result<(), String> {
    let path = config_path(app)?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| format!("写入配置失败: {e}"))
}

fn saved_api_key<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    app.keyring()
        .store
        .get_password(KEYRING_ACCOUNT)
        .ok()
        .flatten()
        .filter(|k| !k.trim().is_empty())
}

fn to_view<R: tauri::Runtime>(app: &tauri::AppHandle<R>, config: AiTranslateConfig) -> AiConfigView {
    AiConfigView {
        name: config.name,
        endpoint: config.endpoint,
        format: config.format,
        model: config.model,
        has_api_key: saved_api_key(app).is_some(),
    }
}

/// 读取当前配置（前端进入设置页时调用）。
#[tauri::command]
pub fn get_ai_translate_config(app: tauri::AppHandle) -> Result<AiConfigView, String> {
    let config = load_config(&app);
    Ok(to_view(&app, config))
}

/// 保存配置：非敏感字段写 JSON；api_key 非空时写入系统钥匙串（空字符串 = 保持已保存的 Key 不变）。
#[tauri::command]
pub fn save_ai_translate_config(
    app: tauri::AppHandle,
    config: AiTranslateConfig,
    api_key: String,
) -> Result<AiConfigView, String> {
    write_config(&app, &config)?;
    let key = api_key.trim();
    if !key.is_empty() {
        app.keyring()
            .store
            .set_password(KEYRING_ACCOUNT, key)
            .map_err(|e| format!("保存 API Key 到钥匙串失败: {e}"))?;
    }
    Ok(to_view(&app, config))
}

/// 清除配置：删除 JSON 与钥匙串中的 API Key，返回空配置视图。
#[tauri::command]
pub fn clear_ai_translate_config(app: tauri::AppHandle) -> Result<AiConfigView, String> {
    if let Ok(path) = config_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    // Key 不存在时 delete 也视为成功
    app.keyring().store.delete(KEYRING_ACCOUNT).ok();
    Ok(AiConfigView {
        name: String::new(),
        endpoint: String::new(),
        format: AiTranslateConfig::default().format,
        model: String::new(),
        has_api_key: false,
    })
}

/// 拉取模型列表（「测试」链接）。
/// `api_key` 非空则用入参，否则回退到钥匙串里已保存的 Key。
#[tauri::command]
pub async fn ai_list_models(
    app: tauri::AppHandle,
    config: AiTranslateConfig,
    api_key: String,
) -> Result<Vec<String>, String> {
    if config.endpoint.trim().is_empty() {
        return Err("请先填写接口地址".to_string());
    }
    let key = {
        let input = api_key.trim();
        if input.is_empty() {
            saved_api_key(&app).ok_or_else(|| "请先填写 API Key".to_string())?
        } else {
            input.to_string()
        }
    };
    fetch_models(&config, &key).await
}

/// GET {endpoint}/models 拉取模型 ID 列表。
/// 三种格式的 endpoint 均含版本路径（…/v1），因此统一拼 {endpoint}/models。
async fn fetch_models(config: &AiTranslateConfig, api_key: &str) -> Result<Vec<String>, String> {
    let base = config.endpoint.trim().trim_end_matches('/');
    let url = format!("{base}/models");
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    req = if config.format == FORMAT_ANTHROPIC {
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
    let ids: Vec<String> = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Err("该接口未返回模型列表，请手动输入模型 ID".to_string());
    }
    Ok(ids)
}

/// AI 翻译一段文本（翻译链路入口）。
#[tauri::command]
pub async fn ai_translate_text(
    app: tauri::AppHandle,
    text: String,
    to_language_code: String,
) -> Result<String, String> {
    let config = load_config(&app);
    if !config.is_complete() {
        return Err("AI 翻译未配置，请在设置中完成接口配置".to_string());
    }
    let api_key = saved_api_key(&app).ok_or_else(|| "未保存 API Key".to_string())?;
    translate_via_llmsdk(&config, &api_key, &text, &to_language_code).await
}

async fn translate_via_llmsdk(
    config: &AiTranslateConfig,
    api_key: &str,
    text: &str,
    to_language_code: &str,
) -> Result<String, String> {
    use llmsdk::{
        anthropic::Anthropic, openai::OpenAi, CallOptions, Content, LanguageModel, Message,
        TextPart, UserPart,
    };

    let endpoint = config.endpoint.trim().trim_end_matches('/');
    let model_id = config.model.trim();
    if endpoint.is_empty() {
        return Err("接口地址为空".to_string());
    }
    if model_id.is_empty() {
        return Err("模型 ID 为空".to_string());
    }

    let model: Box<dyn LanguageModel> = match config.format.as_str() {
        FORMAT_ANTHROPIC => {
            let provider = Anthropic::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.messages(model_id))
        }
        "openai-responses" => {
            let provider = OpenAi::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.responses(model_id))
        }
        // openai-compatible（默认）
        _ => {
            let provider = OpenAi::builder()
                .api_key(api_key)
                .base_url(endpoint)
                .build()
                .map_err(|e| e.to_string())?;
            Box::new(provider.chat(model_id))
        }
    };

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
