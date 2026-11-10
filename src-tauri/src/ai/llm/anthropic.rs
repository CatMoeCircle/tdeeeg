//! Anthropic Messages（`/messages`）。
//!
//! 思考链在 Anthropic 这边本来就有（`thinking_delta`），难点是**回传**：
//! 开了 extended thinking 又带工具调用时，下一轮必须把上一轮 assistant 的
//! `thinking` 块连同 `signature` 原样发回去，否则直接 400。签名随流式
//! `signature_delta` 到达，这里存进 `reasoning_meta`，跟历史一起落盘再回传。
//!
//! ## 实测过的 Anthropic 兼容端点（2026-11，base_url 填到 `/anthropic/v1`）
//!
//! - **DeepSeek** `https://api.deepseek.com/anthropic/v1`：`deepseek-flash` 默认就思考
//!   （不发 `thinking` 也回 `thinking` 块），`signature_delta` 有值（是响应 id），
//!   流式 / 非流式 / 工具轮回传全部正常；
//! - **MiMo** `https://api.xiaomimimo.com/anthropic/v1`：`mimo-v2.6-flash` 发 `thinking`
//!   就会思考，但**不回 `signature`** —— 这种情况我们按「没有凭据就不回传思考块」处理，
//!   实测第二轮（带 tool_result）照样成功；
//! - `/v1/messages`（不带 `/anthropic`）在两家都是 404，地址别填错。

use base64::Engine;
use serde_json::{json, Value};

use super::prompt;
use super::sse::Event;
use super::{s_field, u_field, ChatClient, ChatMessage, ChatReply, ChatStreamEvent, ChatToolCall, ChatUsage, Emit};

const DEFAULT_MAX_TOKENS: u32 = 4096;

/// 思考档位 → 思考预算（tokens）。Anthropic 的预算是**额外**算在 max_tokens 之外的。
fn thinking_budget(effort: &str) -> u32 {
    match effort.trim().to_ascii_lowercase().as_str() {
        "minimal" => 1024,
        "low" => 2048,
        "medium" => 4096,
        "high" => 8192,
        "xhigh" | "max" | "ultra" => 16384,
        other => other.parse::<u32>().ok().filter(|n| *n >= 1024).unwrap_or(4096),
    }
}

pub fn body(c: &ChatClient, messages: &[ChatMessage], stream: bool) -> Result<Value, String> {
    let effort = c.effort_on();
    let budget = effort.map(thinking_budget);
    // extended thinking：预算算在 max_tokens 之外，必须留出余量（budget < max_tokens）
    let base = c.max_output_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
    let max_tokens = base + budget.unwrap_or(0);

    let system = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.text.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut body = json!({
        "model": c.model,
        "max_tokens": max_tokens,
        "messages": convert_messages(messages),
        "stream": stream,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    let specs = prompt::tool_specs(c.tools)?;
    if !specs.is_empty() {
        let mut tools: Vec<Value> = specs
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            })
            .collect();
        if c.hosted_web_search {
            // Anthropic 的服务端搜索工具
            tools.push(json!({ "type": "web_search_20250305", "name": "web_search", "max_uses": 5 }));
        }
        body["tools"] = json!(tools);
        body["tool_choice"] = json!({ "type": "auto" });
    } else if c.hosted_web_search {
        body["tools"] = json!([{ "type": "web_search_20250305", "name": "web_search", "max_uses": 5 }]);
    }
    if let Some(b) = budget {
        body["thinking"] = json!({ "type": "enabled", "budget_tokens": b });
    }
    Ok(body)
}

/// 历史 → messages。Anthropic 要求 user / assistant 交替：相邻同角色合并成一条，
/// 工具结果作为 user 的 `tool_result` 块。
fn convert_messages(messages: &[ChatMessage]) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let mut push = |role: &str, blocks: Vec<Value>| {
        if blocks.is_empty() {
            return;
        }
        if let Some(last) = out.last_mut() {
            if last.get("role").and_then(|r| r.as_str()) == Some(role) {
                if let Some(arr) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                    arr.extend(blocks);
                    return;
                }
            }
        }
        out.push(json!({ "role": role, "content": blocks }));
    };

    for m in messages {
        match m.role.as_str() {
            "user" => {
                let mut blocks = Vec::new();
                if !m.text.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.text }));
                }
                for p in &m.attachments {
                    let Some(mime) = prompt::media_type(p) else { continue };
                    let Some(bytes) = prompt::read_image(p) else { continue };
                    blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                        }
                    }));
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "text", "text": "" }));
                }
                push("user", blocks);
            }
            "assistant" => {
                let mut blocks = Vec::new();
                // 带签名的思考块必须是第一个
                if !m.reasoning.trim().is_empty() {
                    if let Some(sig) = m
                        .provider_meta
                        .as_ref()
                        .and_then(|meta| meta.get("signature"))
                        .and_then(|v| v.as_str())
                    {
                        if !sig.is_empty() {
                            blocks.push(json!({
                                "type": "thinking",
                                "thinking": m.reasoning,
                                "signature": sig,
                            }));
                        }
                    }
                }
                if !m.text.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.text }));
                }
                for c in m.tool_calls.iter().filter(|c| c.provider_executed != Some(true)) {
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": c.id,
                        "name": c.name,
                        "input": if c.arguments.is_null() { json!({}) } else { c.arguments.clone() },
                    }));
                }
                push("assistant", blocks);
            }
            "tool" => push(
                "user",
                vec![json!({
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id,
                    "content": m.text,
                })],
            ),
            _ => {}
        }
    }
    out
}

/// 流式累积
#[derive(Default)]
pub struct Stream {
    reply: ChatReply,
    text_open: bool,
    reasoning_open: bool,
    /// content block index → 块
    blocks: std::collections::HashMap<u64, Block>,
    /// 当前块的签名（`signature_delta`）
    signature: String,
}

enum Block {
    Text,
    Thinking,
    ToolUse { id: String, name: String, json: String, provider_executed: bool },
}

impl Stream {
    pub fn on_event(&mut self, ev: &Event, emit: Emit<'_>) -> Result<(), String> {
        let v: Value = match serde_json::from_str(ev.data.trim()) {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
        let kind = if ev.event.is_empty() { s_field(&v, "type") } else { ev.event.as_str() };
        match kind {
            "message_start" => {
                if let Some(u) = v.get("message").and_then(|m| m.get("usage")) {
                    self.reply.usage = usage_of(u);
                }
            }
            "content_block_start" => {
                let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                let block = v.get("content_block").cloned().unwrap_or_else(|| json!({}));
                match s_field(&block, "type") {
                    "text" => {
                        self.blocks.insert(idx, Block::Text);
                        if !self.text_open {
                            self.text_open = true;
                            emit(ChatStreamEvent::TextStart { id: "text".into() })?;
                        }
                    }
                    "thinking" | "redacted_thinking" => {
                        self.blocks.insert(idx, Block::Thinking);
                        if !self.reasoning_open {
                            self.reasoning_open = true;
                            emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
                        }
                        // 有的实现把思考正文直接塞在 start 块里
                        let text = s_field(&block, "thinking");
                        if !text.is_empty() {
                            self.reply.reasoning.push_str(text);
                            emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: text.to_string() })?;
                        }
                    }
                    "tool_use" | "server_tool_use" => {
                        // server_tool_use = Anthropic 自己执行的（托管 web_search）：标 provider_executed，
                        // 前端只把它画成「已执行」，不会再去 dispatch
                        let id = s_field(&block, "id").to_string();
                        let name = s_field(&block, "name").to_string();
                        let provider_executed = s_field(&block, "type") == "server_tool_use";
                        self.blocks.insert(
                            idx,
                            Block::ToolUse { id: id.clone(), name: name.clone(), json: String::new(), provider_executed },
                        );
                        emit(ChatStreamEvent::ToolInputStart { id, tool_name: name })?;
                    }
                    _ => {}
                }
            }
            "content_block_delta" => {
                let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                let delta = v.get("delta").cloned().unwrap_or_else(|| json!({}));
                match s_field(&delta, "type") {
                    "text_delta" => {
                        let text = s_field(&delta, "text");
                        if !text.is_empty() {
                            if !self.text_open {
                                self.text_open = true;
                                emit(ChatStreamEvent::TextStart { id: "text".into() })?;
                            }
                            self.reply.text.push_str(text);
                            emit(ChatStreamEvent::TextDelta { id: "text".into(), delta: text.to_string() })?;
                        }
                    }
                    "thinking_delta" => {
                        let text = s_field(&delta, "thinking");
                        if !text.is_empty() {
                            if !self.reasoning_open {
                                self.reasoning_open = true;
                                emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
                            }
                            self.reply.reasoning.push_str(text);
                            emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: text.to_string() })?;
                        }
                    }
                    "signature_delta" => self.signature.push_str(s_field(&delta, "signature")),
                    "input_json_delta" => {
                        let part = s_field(&delta, "partial_json");
                        if let Some(Block::ToolUse { id, json: buf, .. }) = self.blocks.get_mut(&idx) {
                            buf.push_str(part);
                            emit(ChatStreamEvent::ToolInputDelta { id: id.clone(), delta: part.to_string() })?;
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                if let Some(Block::ToolUse { id, name, json, provider_executed }) = self.blocks.remove(&idx) {
                    self.reply.tool_calls.push(ChatToolCall {
                        id,
                        name,
                        arguments: parse_args(&json),
                        provider_executed: provider_executed.then_some(true),
                    });
                }
            }
            "message_delta" => {
                if let Some(u) = v.get("usage") {
                    let out_tokens = u_field(u, "output_tokens");
                    self.reply.usage.output_tokens = out_tokens.or(self.reply.usage.output_tokens);
                }
            }
            "error" => {
                let msg = v
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("供应商返回错误");
                return Err(format!("AI 对话失败: {msg}"));
            }
            _ => {}
        }
        Ok(())
    }

    pub fn finish(mut self) -> ChatReply {
        if !self.signature.is_empty() {
            self.reply.reasoning_meta = Some(json!({ "signature": self.signature }));
        }
        self.reply
    }
}

pub fn parse_reply(v: &Value) -> Result<ChatReply, String> {
    if s_field(v, "type") == "error" {
        let msg = v
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("AI 对话失败: {msg}"));
    }
    let mut reply = ChatReply::default();
    if let Some(u) = v.get("usage") {
        reply.usage = usage_of(u);
    }
    let mut signature = String::new();
    for block in v.get("content").and_then(|c| c.as_array()).into_iter().flatten() {
        match s_field(block, "type") {
            "text" => reply.text.push_str(s_field(block, "text")),
            "thinking" => {
                reply.reasoning.push_str(s_field(block, "thinking"));
                signature.push_str(s_field(block, "signature"));
            }
            "tool_use" => {
                let id = s_field(block, "id").to_string();
                if id.is_empty() {
                    continue;
                }
                reply.tool_calls.push(ChatToolCall {
                    id,
                    name: s_field(block, "name").to_string(),
                    arguments: block.get("input").cloned().unwrap_or_else(|| json!({})),
                    provider_executed: None,
                });
            }
            _ => {}
        }
    }
    if !signature.is_empty() {
        reply.reasoning_meta = Some(json!({ "signature": signature }));
    }
    Ok(reply)
}

fn usage_of(u: &Value) -> ChatUsage {
    ChatUsage {
        input_tokens: u_field(u, "input_tokens"),
        output_tokens: u_field(u, "output_tokens"),
        cached_tokens: u_field(u, "cache_read_input_tokens"),
        cache_write_tokens: u_field(u, "cache_creation_input_tokens"),
    }
}

fn parse_args(raw: &str) -> Value {
    let raw = raw.trim();
    if raw.is_empty() {
        return json!({});
    }
    serde_json::from_str(raw).unwrap_or_else(|_| json!({ "_raw": raw }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn client<'a>(tools: &'a [Value], effort: Option<&'a str>) -> ChatClient<'a> {
        ChatClient {
            format: super::super::Format::Anthropic,
            endpoint: "https://api.anthropic.com/v1",
            api_key: "k",
            model: "claude-sonnet-4",
            tools,
            effort,
            max_output_tokens: Some(1000),
            hosted_web_search: false,
        }
    }

    fn collector() -> (Arc<Mutex<Vec<Value>>>, impl FnMut(super::super::ChatStreamEvent) -> Result<(), String>) {
        let seen: Arc<Mutex<Vec<Value>>> = Default::default();
        let sink = seen.clone();
        let emit = move |ev: super::super::ChatStreamEvent| {
            sink.lock().unwrap().push(serde_json::to_value(&ev).unwrap());
            Ok(())
        };
        (seen, emit)
    }

    /// thinking_delta 要变成思考、signature_delta 要留进 meta、input_json_delta 要拼成工具参数
    #[test]
    fn stream_yields_thinking_tools_and_signature() {
        let raw = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":20,\"cache_read_input_tokens\":5}}}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"想\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig-1\"}}\n\n",
            "event: content_block_stop\n",
            "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"get_chats\",\"input\":{}}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"limit\\\":5}\"}}\n\n",
            "event: content_block_stop\n",
            "data: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
            "event: content_block_start\n",
            "data: {\"type\":\"content_block_start\",\"index\":2,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"index\":2,\"delta\":{\"type\":\"text_delta\",\"text\":\"好\"}}\n\n",
            "event: message_delta\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":12}}\n\n",
            "event: message_stop\n",
            "data: {\"type\":\"message_stop\"}\n\n",
        );
        let (seen, mut emit) = collector();
        let mut state = Stream::default();
        let mut parser = super::super::sse::Parser::default();
        for ev in parser.push(raw.as_bytes()) {
            state.on_event(&ev, &mut emit).unwrap();
        }
        let reply = state.finish();
        assert_eq!(reply.text, "好");
        assert_eq!(reply.reasoning, "想");
        assert_eq!(reply.tool_calls.len(), 1);
        assert_eq!(reply.tool_calls[0].id, "toolu_1");
        assert_eq!(reply.tool_calls[0].arguments, json!({ "limit": 5 }));
        assert_eq!(reply.usage.input_tokens, Some(20));
        assert_eq!(reply.usage.cached_tokens, Some(5));
        assert_eq!(reply.usage.output_tokens, Some(12));
        assert_eq!(reply.reasoning_meta, Some(json!({ "signature": "sig-1" })));
        let events = seen.lock().unwrap().clone();
        assert!(events.iter().any(|e| e["type"] == "reasoning-delta" && e["delta"] == "想"));
        assert!(events.iter().any(|e| e["type"] == "tool-input-start" && e["toolName"] == "get_chats"));
        assert!(events.iter().any(|e| e["type"] == "tool-input-delta" && e["delta"] == "{\"limit\":5}"));
    }

    /// 请求体：开思考要有 budget，max_tokens 要把预算加在基础值之外；工具用 input_schema
    #[test]
    fn body_enables_thinking_with_budget_and_maps_tools() {
        let tools = vec![json!({
            "type": "function",
            "function": { "name": "get_chats", "description": "d", "parameters": { "type": "object", "properties": {} } }
        })];
        let c = client(&tools, Some("medium"));
        let req = body(&c, &[ChatMessage { role: "system".into(), text: "sys".into(), ..Default::default() }], true).unwrap();
        assert_eq!(req["thinking"]["type"], "enabled");
        assert_eq!(req["thinking"]["budget_tokens"], 4096);
        assert_eq!(req["max_tokens"], 1000 + 4096);
        assert_eq!(req["system"], "sys");
        assert_eq!(req["tools"][0]["input_schema"]["type"], "object");
        assert!(req["messages"].as_array().unwrap().is_empty());

        // 关掉思考就不带 thinking，max_tokens 也不加预算
        let c = client(&tools, None);
        let req = body(&c, &[], true).unwrap();
        assert!(req.get("thinking").is_none());
        assert_eq!(req["max_tokens"], 1000);
    }

    /// 历史回传：带签名的思考块 + 工具结果要合并进同一条 user 消息（Anthropic 要求严格交替）
    #[test]
    fn history_replays_signed_thinking_and_merges_tool_results() {
        let no_tools: Vec<Value> = Vec::new();
        let c = client(&no_tools, Some("low"));
        let msgs = vec![
            ChatMessage {
                role: "assistant".into(),
                reasoning: "想一想".into(),
                text: "查一下".into(),
                tool_calls: vec![ChatToolCall {
                    id: "toolu_1".into(),
                    name: "get_chats".into(),
                    arguments: json!({ "limit": 5 }),
                    provider_executed: None,
                }],
                provider_meta: Some(json!({ "signature": "sig-1" })),
                ..Default::default()
            },
            ChatMessage {
                role: "tool".into(),
                tool_call_id: "toolu_1".into(),
                tool_name: "get_chats".into(),
                text: "{\"ok\":true}".into(),
                ..Default::default()
            },
        ];
        let req = body(&c, &msgs, false).unwrap();
        let m = req["messages"].as_array().unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!(m[0]["content"][0]["type"], "thinking");
        assert_eq!(m[0]["content"][0]["signature"], "sig-1");
        assert_eq!(m[0]["content"][1]["type"], "text");
        assert_eq!(m[0]["content"][2]["type"], "tool_use");
        assert_eq!(m[0]["content"][2]["input"]["limit"], 5);
        assert_eq!(m[1]["role"], "user");
        assert_eq!(m[1]["content"][0]["type"], "tool_result");
        assert_eq!(m[1]["content"][0]["tool_use_id"], "toolu_1");
    }

    /// 没有签名就不回传思考块（Anthropic 会 400），但正文和工具照发
    #[test]
    fn history_skips_thinking_without_signature() {
        let no_tools: Vec<Value> = Vec::new();
        let c = client(&no_tools, None);
        let msgs = vec![ChatMessage {
            role: "assistant".into(),
            reasoning: "想一想".into(),
            text: "答案".into(),
            ..Default::default()
        }];
        let req = body(&c, &msgs, false).unwrap();
        let blocks = req["messages"][0]["content"].as_array().unwrap();
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0]["type"], "text");
    }
}
