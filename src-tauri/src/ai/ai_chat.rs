//! AI 对话的一次模型调用（可带工具）。多轮 agent 循环在前端 utils/aiChat.ts，这里只管单次请求。
//!
//! 所有模型调用（流式对话 / 一次性补全 / 翻译 / 联网搜索）统一走**自研的三协议客户端**
//! （[`crate::ai::llm`]）：llmsdk 的流式解析器不认 Responses 的 `reasoning_text` 与 Chat 的
//! `reasoning_content`，思考链永远显示不出来，因此整条链路都由自己实现，不再依赖 llmsdk。
//! 供应商 / 钥匙串 / 协议选择复用 ai_translate（只读写配置与钥匙串，不发请求）。

use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

use tauri::Manager;

use crate::ai::ai_conversations::load_history;
use crate::ai::ai_translate::{load_all, saved_api_key, saved_search_key};
use crate::ai::llm::{ChatClient, ChatReply, ChatStreamEvent, Format};
use crate::tdlib::AppState;

pub use crate::ai::llm::ChatMessage;

/// 正在跑的流式请求：request_id → 取消信号。前端点「停止」时通过 ai_chat_cancel 触发。
#[derive(Default)]
pub struct AiCancelState(Mutex<HashMap<String, oneshot::Sender<()>>>);

/// 托管 web_search 只对**确定支持**的供应商开：OpenAI 自家（Responses）与 Anthropic。
///
/// 实测（别删，这条注释就是证据）：
/// - MiMo 的 `/v1/responses` 遇到 `web_search` 直接 400 `responses_feature_not_supported`
///   —— 挂上去会让整轮对话失败，比没有搜索坏得多；
/// - DeepSeek 收下但从不执行（输出里没有 `web_search_call`），它有独立的 `/v1/tools/search`；
/// - Gemini 的 OpenAI 兼容层压根没有 `/responses`；
/// - GLM / Kimi / MiniMax 没实测过，不赌 —— 要搜索就让用户在「AI 工具」里配搜索接口
///   （客户端调用失败只影响那一次搜索，不会毁掉整轮对话）。
fn hosted_web_search_supported(endpoint: &str, format: &str) -> bool {
    match format {
        "anthropic" => true,
        "openai-responses" => endpoint.contains("api.openai.com"),
        _ => false,
    }
}

/// DeepSeek 的联网搜索**不在** Responses 里：托管 `web_search` 它接受（HTTP 200）但从不执行
/// （实测输出里没有 `web_search_call`，模型直接答「我无法获取实时数据」），
/// 真正的搜索是独立的 Tools API：`POST {base}/tools/search`。见 api-docs.deepseek.com/zh-cn/guides/search。
fn uses_tools_search(base: &str) -> bool {
    base.contains("deepseek.com")
}

/// DeepSeek 搜索结果 → 给模型看的文本（标题 / 站点 / 日期 / 摘要 / 链接）。
fn search_results_text(v: &serde_json::Value) -> Result<String, String> {
    let results = v
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| "搜索接口没有返回 results".to_string())?;
    if results.is_empty() {
        return Err("搜索没有结果".to_string());
    }
    let mut out = String::new();
    for (i, r) in results.iter().take(8).enumerate() {
        let s = |k: &str| r.get(k).and_then(|x| x.as_str()).unwrap_or("");
        let (title, url, summary, date, site) =
            (s("title"), s("url"), s("summary"), s("date"), s("site_name"));
        out.push_str(&format!("{}. {title}", i + 1));
        if !site.is_empty() {
            out.push_str(&format!("（{site}）"));
        }
        if !date.is_empty() {
            out.push_str(&format!(" {date}"));
        }
        out.push('\n');
        if !summary.is_empty() {
            out.push_str(summary.trim());
            out.push('\n');
        }
        if !url.is_empty() {
            out.push_str(url);
            out.push('\n');
        }
        out.push('\n');
    }
    Ok(out.trim_end().to_string())
}

/// 调 DeepSeek 的 Tools API 搜索，把结果原文给模型（不再多花一次模型调用）。
async fn tools_search(base: &str, key: &str, query: &str) -> Result<String, String> {
    let url = format!("{base}/tools/search");
    let resp = reqwest::Client::new()
        .post(&url)
        .bearer_auth(key)
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| format!("联网搜索失败: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("搜索接口请求失败 (HTTP {status}): {snippet}"));
    }
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("搜索接口返回不合法 JSON: {e}"))?;
    search_results_text(&v)
}

/// 一次性解析：供应商 id / 模型 id → 接口地址、协议、模型 id、API Key。
/// 自研对话客户端 / 一次性补全 / 联网搜索共用，别各找一遍。
fn resolve_provider(
    app: &tauri::AppHandle,
    provider_id: &str,
    model: &str,
) -> Result<(String, String, String, String), String> {
    let provider = load_all(app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let api_key = saved_api_key(app, provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    let endpoint = provider.endpoint.trim().trim_end_matches('/').to_string();
    let model_id = model.trim().to_string();
    if endpoint.is_empty() {
        return Err("接口地址为空".to_string());
    }
    if model_id.is_empty() {
        return Err("模型 ID 为空".to_string());
    }
    Ok((endpoint, provider.format, model_id, api_key))
}

/// 单次对话请求（可带工具），一次性返回。`tools` 是 toolsSchema() 的结果，
/// `effort` 为该档位的思考参数值（内置枚举键，或设置页里按模型自定义的值；可空 = 不发）。
/// 流式入口是 ai_chat_stream；这个留着做流式不可用时的兜底。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    mut messages: Vec<ChatMessage>,
    account_id: String,
    chat_id: i64,
    conversation_id: String,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    web_search: Option<bool>,
) -> Result<ChatReply, String> {
    messages.extend(load_history(&app.state::<AppState>(), &account_id, chat_id, &conversation_id));
    let (endpoint, format, model_id, api_key) = resolve_provider(&app, &provider_id, &model)?;
    let hosted = web_search.unwrap_or(true) && hosted_web_search_supported(&endpoint, &format);
    ChatClient {
        format: Format::of(&format),
        endpoint: &endpoint,
        api_key: &api_key,
        model: &model_id,
        tools: &tools,
        effort: effort.as_deref(),
        max_output_tokens,
        hosted_web_search: hosted,
    }
    .generate(&messages)
    .await
}

/// 一次性补全：`messages` 就是完整 prompt（system 在最前），不带会话历史、不带工具。
///
/// 私聊接管（模仿 / AI 接管 / 上下文压缩）用它：接管的会话历史由前端自己攒、自己压缩，
/// 写进 AI 会话表反而会跟用户在 AI 输入框里的对话互相污染，所以这里直接不碰历史。
#[tauri::command]
pub async fn ai_complete(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    messages: Vec<ChatMessage>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
) -> Result<ChatReply, String> {
    let (endpoint, format, model_id, api_key) = resolve_provider(&app, &provider_id, &model)?;
    ChatClient {
        format: Format::of(&format),
        endpoint: &endpoint,
        api_key: &api_key,
        model: &model_id,
        tools: &[],
        effort: effort.as_deref(),
        max_output_tokens,
        hosted_web_search: false,
    }
    .generate(&messages)
    .await
}

/// 流式对话：一边把增量事件推给前端（界面逐字更新），一边在 Rust 侧拼出完整回复返回。
///
/// 两件事都做是有意的：界面要增量，循环要确定的结果。让前端自己拼「最终文本 / 工具调用」的话，
/// 一旦 IPC 消息比命令返回晚到，就会漏掉工具调用 —— 那种 bug 极难查。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiCancelState>,
    provider_id: String,
    model: String,
    mut messages: Vec<ChatMessage>,
    account_id: String,
    chat_id: i64,
    conversation_id: String,
    tools: Vec<serde_json::Value>,
    effort: Option<String>,
    max_output_tokens: Option<u32>,
    web_search: Option<bool>,
    request_id: String,
    on_event: tauri::ipc::Channel<ChatStreamEvent>,
) -> Result<ChatReply, String> {
    messages.extend(load_history(&app.state::<AppState>(), &account_id, chat_id, &conversation_id));
    let (endpoint, format, model_id, api_key) = resolve_provider(&app, &provider_id, &model)?;
    let hosted = web_search.unwrap_or(true) && hosted_web_search_supported(&endpoint, &format);
    let client = ChatClient {
        format: Format::of(&format),
        endpoint: &endpoint,
        api_key: &api_key,
        model: &model_id,
        tools: &tools,
        effort: effort.as_deref(),
        max_output_tokens,
        hosted_web_search: hosted,
    };
    // 先登记取消信号再开流：前端一按停止（ai_chat_cancel）这里立刻就能收到
    let (tx, rx) = oneshot::channel::<()>();
    state.0.lock().unwrap().insert(request_id.clone(), tx);
    let mut emit = |ev: ChatStreamEvent| -> Result<(), String> {
        on_event.send(ev).map_err(|e| format!("流式推送失败: {e}"))
    };
    let out = client.stream(&messages, rx, &mut emit).await;
    state.0.lock().unwrap().remove(&request_id);
    out
}

/// 停止正在跑的流式请求：前端点「停止」时调用。找不到 id = 请求已经结束，忽略。
#[tauri::command]
pub fn ai_chat_cancel(state: tauri::State<'_, AiCancelState>, request_id: String) {
    if let Some(tx) = state.0.lock().unwrap().remove(&request_id) {
        let _ = tx.send(());
    }
}

/// 搜索工具（前端那个客户端 web_search）的执行出口：把一次检索交给「搜索接口」跑，返回结果文本。
///
/// - `endpoint` 非空 = 用搜索自己配的接口：按 OpenAI 兼容的 `/responses` + 服务端 web_search 工具，
///   Key 用搜索专属 Key（没配就回退当前供应商的 Key），模型用 `search_model`（空 = 会话模型）；
/// - 空 = 用当前 AI 供应商的地址 / Key / 协议（供应商自己会搜时走这条）。
#[tauri::command]
pub async fn ai_web_search(
    app: tauri::AppHandle,
    provider_id: String,
    model: String,
    query: String,
    endpoint: String,
    search_model: String,
) -> Result<String, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("搜索词为空".to_string());
    }
    let provider = load_all(&app)
        .providers
        .into_iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| "AI 供应商不存在，请在设置中重新配置".to_string())?;
    let provider_key =
        saved_api_key(&app, &provider_id).ok_or_else(|| "未保存 API Key".to_string())?;
    let custom = endpoint.trim().trim_end_matches('/');
    let (url, format, model_id, key) = if custom.is_empty() {
        (
            provider.endpoint.trim().trim_end_matches('/').to_string(),
            provider.format.clone(),
            model.trim().to_string(),
            provider_key,
        )
    } else {
        (
            custom.to_string(),
            "openai-responses".to_string(),
            search_model.trim().to_string(),
            saved_search_key(&app).unwrap_or(provider_key),
        )
    };
    // DeepSeek 只认自己的 Tools API：直接搜，不需要搜索模型（也不需要多一次模型调用）
    if uses_tools_search(&url) {
        return tools_search(&url, &key, &query).await;
    }
    // 搜索模型留空 = 沿用当前会话的模型（两边都空才算真的没模型）
    let model_id = if model_id.is_empty() {
        model.trim().to_string()
    } else {
        model_id
    };
    if model_id.is_empty() {
        return Err("搜索模型为空：请在设置「AI 工具」里填写搜索模型".to_string());
    }
    // 用户显式配置了搜索接口，或供应商确定支持托管 web_search 时才挂
    if custom.is_empty() && !hosted_web_search_supported(&url, &format) {
        return Err(
            "当前供应商协议不支持联网搜索：请在设置「AI 工具」里给搜索配置接口地址".to_string(),
        );
    }
    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            text: "你是搜索助手：先用 web_search 检索，再用简洁的中文要点回答，并带上来源链接；不要反问、不要编造没搜到的内容。".to_string(),
            ..Default::default()
        },
        ChatMessage { role: "user".to_string(), text: query, ..Default::default() },
    ];
    let reply = ChatClient {
        format: Format::of(&format),
        endpoint: &url,
        api_key: &key,
        model: &model_id,
        tools: &[],
        effort: None,
        max_output_tokens: Some(2048),
        hosted_web_search: true,
    }
    .generate(&messages)
    .await
    .map_err(|e| format!("联网搜索失败: {e}"))?;
    if reply.text.trim().is_empty() {
        return Err("搜索接口没有返回内容".to_string());
    }
    Ok(reply.text)
}

/// 工具图片文件名的去重序号（同一毫秒内多次调用不能互相覆盖）
static IMAGE_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// AI 工具（read_image）转好的图片落盘：写进**数据目录**（设置里的存储位置，AppData 或便携目录）
/// 下的 `ai_images/`，不用系统 Temp —— 便携版不该把缓存塞到 C 盘，用户迁移 / 清理数据目录时也能一起带走。
/// 返回绝对路径：前端把它当作下一条「图片消息」的附件（见 utils/aiChat.ts）。
#[tauri::command]
pub fn ai_save_tool_image(state: tauri::State<'_, AppState>, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("图片数据为空".to_string());
    }
    let dir = state.data_dir.join("ai_images");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建图片目录失败: {e}"))?;
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let seq = IMAGE_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let path = dir.join(format!("ai_image_{ms}_{seq}.jpg"));
    std::fs::write(&path, &bytes).map_err(|e| format!("写入图片失败: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 历史落盘的字段名必须和前端 camelCase 完全对上，错了会静默丢历史
    #[test]
    fn history_json_uses_frontend_field_names() {
        let m: ChatMessage = serde_json::from_value(serde_json::json!({
            "role": "tool", "text": "{}", "toolCallId": "c1", "toolName": "t"
        }))
        .unwrap();
        let v = serde_json::to_value(&m).unwrap();
        assert_eq!(v["role"], "tool");
        assert_eq!(v["toolCallId"], "c1");
        assert_eq!(v["toolName"], "t");
        // 空字段不落盘（history.json 小一点，也不会把默认值当数据）
        assert!(v.get("reasoning").is_none() && v.get("toolCalls").is_none());
    }

    #[test]
    fn image_media_type_only_knows_images() {
        assert_eq!(crate::ai::llm::prompt::media_type("a/b.PNG"), Some("image/png"));
        assert_eq!(crate::ai::llm::prompt::media_type("a.jpeg"), Some("image/jpeg"));
        assert_eq!(crate::ai::llm::prompt::media_type("Heic"), None); // 没有扩展名
        assert_eq!(crate::ai::llm::prompt::media_type("notes.txt"), None);
    }

    /// DeepSeek 搜索结果 → 文本：标题 / 站点 / 摘要 / 链接都在；没有结果要报错。
    /// 顺带钉住「DeepSeek 走 Tools API、别的接口不走」这个判断。
    #[test]
    fn formats_search_results_text() {
        let v = serde_json::json!({
            "results": [
                { "title": "成都市天气", "site_name": "墨迹天气",
                  "date": "2026-10-17T16:00:00+00:00",
                  "url": "https://tianqi.moji.com/weather/china/sichuan/chengdu",
                  "summary": "阴 今天12:03更新" }
            ]
        });
        let text = search_results_text(&v).unwrap();
        assert!(text.contains("成都市天气"));
        assert!(text.contains("墨迹天气"));
        assert!(text.contains("tianqi.moji.com"));
        assert!(text.contains("阴"));
        assert!(search_results_text(&serde_json::json!({ "results": [] })).is_err());
        assert!(search_results_text(&serde_json::json!({})).is_err());

        assert!(uses_tools_search("https://api.deepseek.com/v1"));
        assert!(!uses_tools_search("https://api.openai.com/v1"));
    }
}
