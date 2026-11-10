//! 三协议对话客户端（自研）：OpenAI Responses / OpenAI Chat Completions / Anthropic Messages。
//!
//! ## 为什么自己实现三协议
//!
//! 早期用 llmsdk 0.1.1（crates.io 上唯一版本）发请求，但它的流式解析器：
//! - **Responses**：只认 `response.reasoning_summary_*`；DeepSeek / MiMo 这些实现走的是
//!   `response.reasoning_text.delta`（`summary[]` 恒为空），事件落到 `#[serde(other)] Unknown`
//!   被静默丢掉 —— 思考链一条都到不了界面；
//! - **Chat Completions**：`delta.reasoning_content` / `delta.reasoning` 根本没建模；
//! - **Anthropic**：`thinking_delta` 是认的，但它回传历史时会丢掉 thinking 签名
//!   （多轮工具调用会被 Anthropic 以 400 拒绝）。
//!
//! 实测（2026-11，DeepSeek `deepseek-flash` / MiMo `mimo-v2.6-flash`，`/v1/responses`）：
//! 两者都发 `response.reasoning_text.delta`，`usage.output_tokens_details.reasoning_tokens`
//! 也在涨 —— 模型确实思考了，只是 SDK 不认。现在**整个链路**（含翻译 / 补全 / 联网搜索）
//! 都走这一层，llmsdk 依赖已移除。
//!
//! ## 对外契约
//!
//! 事件序列化后与原来 llmsdk `StreamPart` 里前端真正用到的那几个形状完全一致
//! （`text-delta` / `reasoning-delta` / `tool-input-start` / `tool-input-delta`，
//! 字段 `delta` / `id` / `toolName`），前端 `utils/aiChat.ts` 不需要改。

pub mod anthropic;
pub mod openai;
pub mod prompt;
pub mod sse;

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::oneshot;

use sse::Event;

/* ===== 线上消息 / 回复（与前端 utils/aiChatHistory.ts 的 ChatWireMessage 对齐） ===== */

/// 一条消息：既是发给模型的内容，也是落盘历史（ai_conversation_history）的格式。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChatMessage {
    /// system | user | assistant | tool
    pub role: String,
    /// 正文；tool 消息里即工具结果 JSON
    #[serde(skip_serializing_if = "String::is_empty")]
    pub text: String,
    /// assistant 的思考过程
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reasoning: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ChatToolCall>,
    /// tool 消息：对应的调用 id / 工具名
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tool_call_id: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub tool_name: String,
    /// user 消息里带的图片（本机绝对路径）：每次请求现读现转，历史里只留路径
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<String>,
    /// assistant 这一轮思考了多久（毫秒）：只给界面留「已思考 X」，不参与 prompt
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought_ms: Option<u64>,
    /// 思考块的**供应商回传凭据**（不透明）：
    /// - Responses：`{ itemId, encryptedContent }`，`store:false` 下必须原样回传才能续上思考；
    /// - Anthropic：`{ signature }`，带思考的多轮工具调用少了它直接 400。
    /// 只在本轮回复里产生、跟着历史落盘、下一轮回传，前端只是原样搬运。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_meta: Option<serde_json::Value>,
}

/// 工具调用（进出共用）：arguments 为 JSON 对象。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
    /// 供应商侧执行（如 web_search）：结果已在响应里，前端不要再 dispatch，也不写进历史
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_executed: Option<bool>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub text: String,
    pub reasoning: String,
    pub tool_calls: Vec<ChatToolCall>,
    pub usage: ChatUsage,
    /// 见 ChatMessage::provider_meta；前端拿到后原样贴回 assistant 消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_meta: Option<serde_json::Value>,
}

/* ===== 流式事件（形状必须与前端 aiChat.ts 的 switch 对齐） ===== */

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ChatStreamEvent {
    TextStart {
        id: String,
    },
    TextDelta {
        id: String,
        delta: String,
    },
    TextEnd {
        id: String,
    },
    ReasoningStart {
        id: String,
    },
    ReasoningDelta {
        id: String,
        delta: String,
    },
    ReasoningEnd {
        id: String,
    },
    ToolInputStart {
        id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
    },
    ToolInputDelta {
        id: String,
        delta: String,
    },
    Finish {
        usage: ChatUsage,
    },
}

/// 事件回调：返回 Err = 前端通道坏了（IPC 断开），整轮直接失败。
/// `Send` 是 Tauri 命令的硬要求（future 必须能跨线程）。
pub type Emit<'a> = &'a mut (dyn FnMut(ChatStreamEvent) -> Result<(), String> + Send);

/* ===== 协议 / 客户端 ===== */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// OpenAI Responses（`POST {base}/responses`）
    Responses,
    /// OpenAI Chat Completions（`POST {base}/chat/completions`，默认）
    Chat,
    /// Anthropic Messages（`POST {base}/messages`）
    Anthropic,
}

impl Format {
    pub fn of(format: &str) -> Self {
        match format {
            "openai-responses" => Self::Responses,
            "anthropic" => Self::Anthropic,
            _ => Self::Chat,
        }
    }
}

/// 一次对话请求的全部输入（供应商 / Key / 模型 / 工具 / 思考档位）。
pub struct ChatClient<'a> {
    pub format: Format,
    /// base_url，含版本路径（如 https://api.deepseek.com/v1）
    pub endpoint: &'a str,
    pub api_key: &'a str,
    pub model: &'a str,
    /// 前端 toolsSchema() 的 OpenAI 形状
    pub tools: &'a [serde_json::Value],
    /// 思考档位的 API 参数值（空 / none / off = 不发思考参数）
    pub effort: Option<&'a str>,
    pub max_output_tokens: Option<u32>,
    /// 是否挂供应商侧的托管 web_search（调用方已按供应商判定过）
    pub hosted_web_search: bool,
}

impl<'a> ChatClient<'a> {
    /// 思考档位是否要求「开思考」：空 / none / off 都不发参数
    pub fn effort_on(&self) -> Option<&'a str> {
        self.effort
            .map(str::trim)
            .filter(|e| !e.is_empty() && !e.eq_ignore_ascii_case("none") && !e.eq_ignore_ascii_case("off"))
    }

    async fn post(&self, path: &str, body: &serde_json::Value) -> Result<reqwest::Response, String> {
        let url = format!("{}{}", self.endpoint.trim_end_matches('/'), path);
        let mut req = http_client()?.post(&url).json(body);
        req = match self.format {
            Format::Anthropic => req
                .header("x-api-key", self.api_key)
                .header("anthropic-version", "2023-06-01"),
            _ => req.bearer_auth(self.api_key),
        };
        let resp = req.send().await.map_err(|e| format!("AI 对话失败: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(400).collect();
            return Err(format!("AI 对话失败 (HTTP {status}): {snippet}"));
        }
        Ok(resp)
    }

    /// 一次性请求（流式不可用时的兜底）
    pub async fn generate(&self, messages: &[ChatMessage]) -> Result<ChatReply, String> {
        let (path, body) = match self.format {
            Format::Responses => ("/responses", openai::responses_body(self, messages, false)?),
            Format::Chat => ("/chat/completions", openai::chat_body(self, messages, false)?),
            Format::Anthropic => ("/messages", anthropic::body(self, messages, false)?),
        };
        let resp = self.post(path, &body).await?;
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("AI 对话失败: 响应不是合法 JSON: {e}"))?;
        match self.format {
            Format::Responses => openai::parse_responses_reply(&v),
            Format::Chat => openai::parse_chat_reply(&v),
            Format::Anthropic => anthropic::parse_reply(&v),
        }
    }

    /// 流式请求：边解析边把事件推给前端，返回拼好的完整回复。
    ///
    /// `cancel`：前端点停止时触发 —— 直接丢掉连接、返回空回复（与旧实现一致：
    /// 这一轮不会被写进历史）。
    pub async fn stream(
        &self,
        messages: &[ChatMessage],
        mut cancel: oneshot::Receiver<()>,
        emit: Emit<'_>,
    ) -> Result<ChatReply, String> {
        let (path, body) = match self.format {
            Format::Responses => ("/responses", openai::responses_body(self, messages, true)?),
            Format::Chat => ("/chat/completions", openai::chat_body(self, messages, true)?),
            Format::Anthropic => ("/messages", anthropic::body(self, messages, true)?),
        };
        let mut resp = self.post(path, &body).await?;
        let mut parser = sse::Parser::default();
        let mut state = StreamState::new(self.format);
        loop {
            tokio::select! {
                biased;
                // 已停止：丢掉连接（服务端随之断开），返回空回复
                _ = &mut cancel => return Ok(ChatReply::default()),
                chunk = resp.chunk() => {
                    let Some(bytes) = chunk.map_err(|e| format!("AI 对话失败: {e}"))? else { break };
                    for ev in parser.push(&bytes) {
                        state.on_event(&ev, emit)?;
                    }
                }
            }
        }
        for ev in parser.finish() {
            state.on_event(&ev, emit)?;
        }
        let reply = state.finish();
        // 收尾事件：前端目前不消费，但保持与旧 llmsdk 一致的事件序列（结束块要收口）
        if !reply.text.is_empty() {
            let _ = emit(ChatStreamEvent::TextEnd { id: "text".into() });
        }
        if !reply.reasoning.is_empty() {
            let _ = emit(ChatStreamEvent::ReasoningEnd { id: "reasoning".into() });
        }
        let _ = emit(ChatStreamEvent::Finish { usage: reply.usage.clone() });
        Ok(reply)
    }
}

/// 流式状态机：三协议各自的累积器
enum StreamState {
    Responses(openai::ResponsesStream),
    Chat(openai::ChatStream),
    Anthropic(anthropic::Stream),
}

impl StreamState {
    fn new(format: Format) -> Self {
        match format {
            Format::Responses => Self::Responses(openai::ResponsesStream::default()),
            Format::Chat => Self::Chat(openai::ChatStream::default()),
            Format::Anthropic => Self::Anthropic(anthropic::Stream::default()),
        }
    }

    fn on_event(&mut self, ev: &Event, emit: Emit<'_>) -> Result<(), String> {
        match self {
            Self::Responses(s) => s.on_event(ev, emit),
            Self::Chat(s) => s.on_event(ev, emit),
            Self::Anthropic(s) => s.on_event(ev, emit),
        }
    }

    fn finish(self) -> ChatReply {
        match self {
            Self::Responses(s) => s.finish(),
            Self::Chat(s) => s.finish(),
            Self::Anthropic(s) => s.finish(),
        }
    }
}

/// 对话用的 HTTP 客户端：**不设总超时**（流式回答可能持续很久），只限连接与读间隔。
fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(20))
                .read_timeout(Duration::from_secs(120))
                .build()
                .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// 事件里的字符串字段（缺省 = 空串）
pub(crate) fn s_field<'v>(v: &'v serde_json::Value, key: &str) -> &'v str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

/// 事件里的 u64 字段（有的供应商发字符串）
pub(crate) fn u_field(v: &serde_json::Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| {
        x.as_u64()
            .or_else(|| x.as_str().and_then(|s| s.parse().ok()))
    })
}

#[cfg(test)]
mod live_smoke {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// 真实接口冒烟（默认不跑）：验证流式思考 / 非流式思考 / 工具调用 / 工具回合回传。
    ///
    /// 用法（`TDG_LLM_FORMAT` 可选 openai-responses / openai-compatible / anthropic）：
    /// `TDG_LLM_KEY=... TDG_LLM_URL=https://api.deepseek.com/v1 TDG_LLM_MODEL=deepseek-flash cargo test --lib live_reasoning_smoke -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "真实接口，需要 TDG_LLM_KEY"]
    async fn live_reasoning_smoke() {
        let key = std::env::var("TDG_LLM_KEY").expect("TDG_LLM_KEY");
        let base = std::env::var("TDG_LLM_URL").expect("TDG_LLM_URL");
        let model = std::env::var("TDG_LLM_MODEL").expect("TDG_LLM_MODEL");
        let format = match std::env::var("TDG_LLM_FORMAT").unwrap_or_else(|_| "openai-responses".into()).as_str() {
            "anthropic" => Format::Anthropic,
            "openai-compatible" | "chat" => Format::Chat,
            _ => Format::Responses,
        };
        let no_tools: Vec<serde_json::Value> = Vec::new();
        let client = ChatClient {
            format,
            endpoint: base.as_str(),
            api_key: key.as_str(),
            model: model.as_str(),
            tools: &no_tools,
            effort: Some("medium"),
            max_output_tokens: Some(200),
            hosted_web_search: false,
        };
        let msgs = vec![ChatMessage {
            role: "user".into(),
            text: "A farmer has 17 sheep, all but 9 run away. How many are left? Answer with just the number.".into(),
            ..Default::default()
        }];
        let (_tx, rx) = oneshot::channel();
        let seen: Arc<Mutex<Vec<serde_json::Value>>> = Default::default();
        let sink = seen.clone();
        let mut emit = move |ev: ChatStreamEvent| {
            sink.lock().unwrap().push(serde_json::to_value(&ev).unwrap());
            Ok(())
        };
        let reply = client.stream(&msgs, rx, &mut emit).await.expect("stream failed");
        let events = seen.lock().unwrap().clone();
        let reasoning_deltas = events.iter().filter(|e| e["type"] == "reasoning-delta").count();
        println!("TEXT={:?}", reply.text);
        println!("REASONING={:?}", reply.reasoning);
        println!("META={:?}", reply.reasoning_meta);
        println!("REASONING_EVENTS={reasoning_deltas}");
        assert!(!reply.reasoning.trim().is_empty(), "reasoning 为空");
        assert!(reasoning_deltas > 0, "没有 reasoning-delta 事件");

        // 非流式兜底（ai_chat）也要能拿到思考
        let plain = client.generate(&msgs).await.expect("generate failed");
        println!("NONSTREAM_TEXT={:?}", plain.text);
        println!("NONSTREAM_REASONING={:?}", plain.reasoning);
        assert!(!plain.reasoning.trim().is_empty(), "非流式 reasoning 为空");

        // 工具轮：把带凭据的思考块回传，第二轮必须还能成功（这是 agent 循环的真实形状）
        let tools = vec![serde_json::json!({
            "type": "function",
            "function": {
                "name": "get_clock",
                "description": "Return the current time as a string",
                "parameters": { "type": "object", "properties": {} }
            }
        })];
        let tool_client = ChatClient {
            format,
            endpoint: base.as_str(),
            api_key: key.as_str(),
            model: model.as_str(),
            tools: &tools,
            effort: Some("medium"),
            max_output_tokens: Some(400),
            hosted_web_search: false,
        };
        let first = tool_client
            .generate(&[ChatMessage {
                role: "user".into(),
                text: "What time is it? You must call get_clock first.".into(),
                ..Default::default()
            }])
            .await
            .expect("tool turn 1 failed");
        let call = first.tool_calls.first().expect("模型没有发起工具调用").clone();
        println!("TOOL_CALL={} {}", call.name, call.arguments);
        let second = tool_client
            .generate(&[
                ChatMessage {
                    role: "user".into(),
                    text: "What time is it? You must call get_clock first.".into(),
                    ..Default::default()
                },
                ChatMessage {
                    role: "assistant".into(),
                    text: first.text.clone(),
                    reasoning: first.reasoning.clone(),
                    tool_calls: first.tool_calls.clone(),
                    provider_meta: first.reasoning_meta.clone(),
                    ..Default::default()
                },
                ChatMessage {
                    role: "tool".into(),
                    tool_call_id: call.id.clone(),
                    tool_name: call.name.clone(),
                    text: "{\"time\":\"12:00\"}".into(),
                    ..Default::default()
                },
            ])
            .await
            .expect("工具轮回传思考块失败");
        println!("ROUND2_TEXT={:?}", second.text);
        println!("ROUND2_REASONING={:?}", second.reasoning);
    }
}
