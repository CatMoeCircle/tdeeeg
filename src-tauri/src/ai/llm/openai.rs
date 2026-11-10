//! OpenAI 两套协议：Responses（`/responses`）与 Chat Completions（`/chat/completions`）。
//!
//! 两边的思考链形状不一样，这里都收：
//! - Responses：`response.reasoning_text.delta`（DeepSeek / MiMo 等，`summary[]` 空）与
//!   `response.reasoning_summary_text.delta`（OpenAI 自家）都算思考；
//! - Chat：`delta.reasoning_content`（DeepSeek）、`delta.reasoning`（OpenRouter 等）、
//!   `delta.reasoning_details[].text` 依次兜底。

use serde_json::{json, Value};

use super::prompt;
use super::sse::Event;
use super::{s_field, u_field, ChatClient, ChatMessage, ChatReply, ChatStreamEvent, ChatToolCall, ChatUsage, Emit};

/* ===================== Chat Completions ===================== */

/// 推理模型的 `max_tokens` 已改名：老模型叫 max_tokens，o* / gpt-5 系只认 max_completion_tokens。
fn chat_token_key(model: &str) -> &'static str {
    let m = model.to_ascii_lowercase();
    if m.starts_with("o1") || m.starts_with("o3") || m.starts_with("o4") || m.starts_with("gpt-5") {
        "max_completion_tokens"
    } else {
        "max_tokens"
    }
}

pub fn chat_body(c: &ChatClient, messages: &[ChatMessage], stream: bool) -> Result<Value, String> {
    let mut body = json!({
        "model": c.model,
        "messages": chat_messages(messages),
        "stream": stream,
    });
    if stream {
        // 没有它，OpenAI 兼容实现大多不回 usage
        body["stream_options"] = json!({ "include_usage": true });
    }
    if let Some(n) = c.max_output_tokens {
        body[chat_token_key(c.model)] = json!(n);
    }
    let specs = prompt::tool_specs(c.tools)?;
    if !specs.is_empty() {
        let tools: Vec<Value> = specs
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                })
            })
            .collect();
        body["tools"] = json!(tools);
        body["tool_choice"] = json!("auto");
    }
    if let Some(e) = c.effort_on() {
        body["reasoning_effort"] = json!(e);
    }
    Ok(body)
}

fn chat_messages(messages: &[ChatMessage]) -> Vec<Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => out.push(json!({ "role": "system", "content": m.text })),
            "user" => {
                let images: Vec<String> = m.attachments.iter().filter_map(|p| prompt::image_data_url(p)).collect();
                let content = if images.is_empty() {
                    json!(m.text)
                } else {
                    let mut parts: Vec<Value> = Vec::new();
                    if !m.text.is_empty() {
                        parts.push(json!({ "type": "text", "text": m.text }));
                    }
                    for url in images {
                        parts.push(json!({ "type": "image_url", "image_url": { "url": url } }));
                    }
                    json!(parts)
                };
                out.push(json!({ "role": "user", "content": content }));
            }
            "assistant" => {
                let mut msg = json!({ "role": "assistant" });
                msg["content"] = if m.text.is_empty() { Value::Null } else { json!(m.text) };
                if !m.tool_calls.is_empty() {
                    let calls: Vec<Value> = m
                        .tool_calls
                        .iter()
                        .filter(|c| c.provider_executed != Some(true))
                        .map(|c| {
                            json!({
                                "id": c.id,
                                "type": "function",
                                "function": {
                                    "name": c.name,
                                    "arguments": tool_args_json(&c.arguments),
                                }
                            })
                        })
                        .collect();
                    if !calls.is_empty() {
                        msg["tool_calls"] = json!(calls);
                    }
                }
                out.push(msg);
            }
            "tool" => out.push(json!({
                "role": "tool",
                "tool_call_id": m.tool_call_id,
                "content": m.text,
            })),
            // 未知角色：不发（历史被外部改坏时别整轮失败）
            _ => {}
        }
    }
    out
}

/// Chat Completions 流式累积
#[derive(Default)]
pub struct ChatStream {
    reply: ChatReply,
    text_open: bool,
    reasoning_open: bool,
    /// 按 index 累积（OpenAI 用 index 标同一个调用的分段）
    calls: Vec<CallAcc>,
}

#[derive(Default)]
struct CallAcc {
    id: String,
    name: String,
    args: String,
    started: bool,
}

impl ChatStream {
    pub fn on_event(&mut self, ev: &Event, emit: Emit<'_>) -> Result<(), String> {
        let data = ev.data.trim();
        if data.is_empty() || data == "[DONE]" {
            return Ok(());
        }
        let v: Value = ev
            .json()
            .ok_or_else(|| "AI 对话失败: 流式数据不是 JSON".to_string())?;
        if let Some(err) = v.get("error") {
            let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误");
            return Err(format!("AI 对话失败: {msg}"));
        }
        if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
            self.reply.usage = chat_usage(u);
        }
        let Some(choice) = v.get("choices").and_then(|c| c.as_array()).and_then(|c| c.first()) else {
            return Ok(());
        };
        let Some(delta) = choice.get("delta") else { return Ok(()) };

        // 思考：reasoning_content → reasoning → reasoning_details[].text
        let rc = s_field(delta, "reasoning_content");
        let r = s_field(delta, "reasoning");
        let reasoning = if !rc.is_empty() {
            Some(rc.to_string())
        } else if !r.is_empty() {
            Some(r.to_string())
        } else {
            delta
                .get("reasoning_details")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|d| d.get("text").and_then(|t| t.as_str()))
                        .collect::<String>()
                })
                .filter(|s| !s.is_empty())
        };
        if let Some(text) = reasoning {
            if !self.reasoning_open {
                self.reasoning_open = true;
                emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
            }
            self.reply.reasoning.push_str(&text);
            emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: text })?;
        }

        if let Some(text) = delta.get("content").and_then(|c| c.as_str()).filter(|s| !s.is_empty()) {
            if !self.text_open {
                self.text_open = true;
                emit(ChatStreamEvent::TextStart { id: "text".into() })?;
            }
            self.reply.text.push_str(text);
            emit(ChatStreamEvent::TextDelta { id: "text".into(), delta: text.to_string() })?;
        }

        if let Some(calls) = delta.get("tool_calls").and_then(|c| c.as_array()) {
            for (i, c) in calls.iter().enumerate() {
                let idx = c.get("index").and_then(|x| x.as_u64()).map(|x| x as usize).unwrap_or(i);
                while self.calls.len() <= idx {
                    self.calls.push(CallAcc::default());
                }
                let acc = &mut self.calls[idx];
                if let Some(id) = c.get("id").and_then(|x| x.as_str()) {
                    acc.id = id.to_string();
                }
                if let Some(f) = c.get("function") {
                    if let Some(name) = f.get("name").and_then(|x| x.as_str()) {
                        if acc.name.is_empty() {
                            acc.name = name.to_string();
                        }
                    }
                    if let Some(args) = f.get("arguments").and_then(|x| x.as_str()) {
                        acc.args.push_str(args);
                        let id = tool_event_id(acc, idx);
                        if !acc.started {
                            acc.started = true;
                            emit(ChatStreamEvent::ToolInputStart { id: id.clone(), tool_name: acc.name.clone() })?;
                        }
                        emit(ChatStreamEvent::ToolInputDelta { id, delta: args.to_string() })?;
                    }
                }
                if !acc.started && !acc.name.is_empty() {
                    acc.started = true;
                    let id = tool_event_id(acc, idx);
                    emit(ChatStreamEvent::ToolInputStart { id, tool_name: acc.name.clone() })?;
                }
            }
        }
        Ok(())
    }

    pub fn finish(mut self) -> ChatReply {
        for (i, acc) in self.calls.into_iter().enumerate() {
            if acc.id.is_empty() && acc.name.is_empty() {
                continue;
            }
            self.reply.tool_calls.push(ChatToolCall {
                id: if acc.id.is_empty() { format!("call_{i}") } else { acc.id },
                name: acc.name,
                arguments: parse_args(&acc.args),
                provider_executed: None,
            });
        }
        self.reply
    }
}

fn tool_event_id(acc: &CallAcc, idx: usize) -> String {
    if acc.id.is_empty() {
        format!("call_{idx}")
    } else {
        acc.id.clone()
    }
}

pub fn parse_chat_reply(v: &Value) -> Result<ChatReply, String> {
    if let Some(err) = v.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误");
        return Err(format!("AI 对话失败: {msg}"));
    }
    let mut reply = ChatReply::default();
    if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
        reply.usage = chat_usage(u);
    }
    let Some(choice) = v.get("choices").and_then(|c| c.as_array()).and_then(|c| c.first()) else {
        return Ok(reply);
    };
    let msg = choice.get("message").cloned().unwrap_or_else(|| json!({}));
    reply.text = s_field(&msg, "content").to_string();
    reply.reasoning = {
        let rc = s_field(&msg, "reasoning_content");
        if !rc.is_empty() {
            rc.to_string()
        } else {
            s_field(&msg, "reasoning").to_string()
        }
    };
    for (i, c) in msg.get("tool_calls").and_then(|c| c.as_array()).into_iter().flatten().enumerate() {
        let f = c.get("function").cloned().unwrap_or_else(|| json!({}));
        reply.tool_calls.push(ChatToolCall {
            id: c
                .get("id")
                .and_then(|x| x.as_str())
                .map(str::to_owned)
                .unwrap_or_else(|| format!("call_{i}")),
            name: s_field(&f, "name").to_string(),
            arguments: parse_args(s_field(&f, "arguments")),
            provider_executed: None,
        });
    }
    Ok(reply)
}

fn chat_usage(u: &Value) -> ChatUsage {
    ChatUsage {
        input_tokens: u_field(u, "prompt_tokens"),
        output_tokens: u_field(u, "completion_tokens"),
        cached_tokens: u
            .get("prompt_tokens_details")
            .and_then(|d| u_field(d, "cached_tokens"))
            .or_else(|| u_field(u, "prompt_cache_hit_tokens")),
        cache_write_tokens: u.get("prompt_tokens_details").and_then(|d| u_field(d, "cache_write_tokens")),
    }
}

/* ===================== Responses ===================== */

pub fn responses_body(c: &ChatClient, messages: &[ChatMessage], stream: bool) -> Result<Value, String> {
    let mut body = json!({
        "model": c.model,
        "input": responses_items(messages),
        "stream": stream,
    });
    if c.effort_on().is_some() {
        // 不落 OpenAI 侧：思考块靠 encrypted_content 回传（见 include）。
        // 只有要思考时才发这两个字段 —— 别的实现未必认，无关的字段能不发就不发。
        body["store"] = json!(false);
        body["include"] = json!(["reasoning.encrypted_content"]);
    }
    if let Some(n) = c.max_output_tokens {
        body["max_output_tokens"] = json!(n);
    }
    let specs = prompt::tool_specs(c.tools)?;
    if !specs.is_empty() {
        let mut tools: Vec<Value> = specs
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                })
            })
            .collect();
        if c.hosted_web_search {
            tools.push(json!({ "type": "web_search", "external_web_access": true }));
        }
        body["tools"] = json!(tools);
        body["tool_choice"] = json!("auto");
    } else if c.hosted_web_search {
        body["tools"] = json!([{ "type": "web_search", "external_web_access": true }]);
    }
    if let Some(e) = c.effort_on() {
        // summary 要显式要，否则 OpenAI 的推理模型只回正文；effort 决定想多久
        body["reasoning"] = json!({ "effort": e, "summary": "auto" });
    }
    Ok(body)
}

fn responses_items(messages: &[ChatMessage]) -> Vec<Value> {
    let mut out = Vec::new();
    for m in messages {
        match m.role.as_str() {
            "system" => out.push(json!({ "role": "system", "content": m.text })),
            "user" => {
                let mut parts: Vec<Value> = Vec::new();
                if !m.text.is_empty() || m.attachments.is_empty() {
                    parts.push(json!({ "type": "input_text", "text": m.text }));
                }
                for p in &m.attachments {
                    if let Some(url) = prompt::image_data_url(p) {
                        parts.push(json!({ "type": "input_image", "image_url": url }));
                    }
                }
                out.push(json!({ "role": "user", "content": parts }));
            }
            "assistant" => {
                // 思考块要在正文 / 工具调用之前；store:false 下没有 encrypted_content 的
                // reasoning item 供应商会直接 400（MiMo 就只回 itemId 不回加密内容），
                // 所以两个凭据齐全才回传，缺一个就只发正文。
                let item_id = m
                    .provider_meta
                    .as_ref()
                    .and_then(|meta| meta.get("itemId"))
                    .and_then(|v| v.as_str());
                let encrypted = m
                    .provider_meta
                    .as_ref()
                    .and_then(|meta| meta.get("encryptedContent"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty());
                if !text_is_empty(&m.reasoning) {
                    if let (Some(id), Some(enc)) = (item_id, encrypted) {
                        out.push(json!({
                            "type": "reasoning",
                            "id": id,
                            "encrypted_content": enc,
                            "summary": [{ "type": "summary_text", "text": m.reasoning }],
                        }));
                    }
                }
                if !m.text.is_empty() {
                    out.push(json!({
                        "role": "assistant",
                        "content": [{ "type": "output_text", "text": m.text }],
                    }));
                }
                for c in m.tool_calls.iter().filter(|c| c.provider_executed != Some(true)) {
                    out.push(json!({
                        "type": "function_call",
                        "call_id": c.id,
                        "name": c.name,
                        "arguments": tool_args_json(&c.arguments),
                    }));
                }
            }
            "tool" => out.push(json!({
                "type": "function_call_output",
                "call_id": m.tool_call_id,
                "output": m.text,
            })),
            _ => {}
        }
    }
    out
}

fn text_is_empty(s: &str) -> bool {
    s.trim().is_empty()
}

/// 工具参数回传成字符串（历史里的 arguments 一定是对象；坏数据别发 "null" 出去）
fn tool_args_json(v: &Value) -> String {
    if v.is_null() {
        return "{}".into();
    }
    serde_json::to_string(v).unwrap_or_else(|_| "{}".into())
}

/// Responses 流式累积
#[derive(Default)]
pub struct ResponsesStream {
    reply: ChatReply,
    text_open: bool,
    reasoning_open: bool,
    /// item_id → (call_id, name, 参数 JSON 片段)
    calls: std::collections::HashMap<String, (String, String, String)>,
    /// 思考 item id → encrypted_content（`output_item.done` 才给）
    reasoning_items: std::collections::HashMap<String, Option<String>>,
}

impl ResponsesStream {
    pub fn on_event(&mut self, ev: &Event, emit: Emit<'_>) -> Result<(), String> {
        if ev.data.trim().is_empty() {
            return Ok(());
        }
        let v: Value = serde_json::from_str(ev.data.trim())
            .map_err(|e| format!("AI 对话失败: 流式数据不是 JSON: {e}"))?;
        let kind = if ev.event.is_empty() { s_field(&v, "type") } else { ev.event.as_str() };
        if kind == "error" || kind == "response.failed" {
            let msg = v
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .or_else(|| v.get("message").and_then(|m| m.as_str()))
                .unwrap_or("供应商返回错误");
            return Err(format!("AI 对话失败: {msg}"));
        }
        match kind {
            "response.output_text.delta" => {
                let delta = s_field(&v, "delta");
                if delta.is_empty() {
                    return Ok(());
                }
                if !self.text_open {
                    self.text_open = true;
                    emit(ChatStreamEvent::TextStart { id: "text".into() })?;
                }
                self.reply.text.push_str(delta);
                emit(ChatStreamEvent::TextDelta { id: "text".into(), delta: delta.to_string() })?;
            }
            // DeepSeek / MiMo：原始思考；OpenAI：思考摘要。两者都算思考链
            "response.reasoning_text.delta" | "response.reasoning_summary_text.delta" => {
                let delta = s_field(&v, "delta");
                if delta.is_empty() {
                    return Ok(());
                }
                if let Some(id) = v.get("item_id").and_then(|x| x.as_str()) {
                    self.reasoning_items.entry(id.to_string()).or_insert(None);
                }
                if !self.reasoning_open {
                    self.reasoning_open = true;
                    emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
                }
                self.reply.reasoning.push_str(delta);
                emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: delta.to_string() })?;
            }
            "response.output_item.added" => {
                let Some(item) = v.get("item") else { return Ok(()) };
                match s_field(item, "type") {
                    "function_call" => {
                        let item_id = s_field(item, "id").to_string();
                        if item_id.is_empty() {
                            return Ok(());
                        }
                        let name = s_field(item, "name").to_string();
                        let call_id = {
                            let c = s_field(item, "call_id");
                            if c.is_empty() { item_id.clone() } else { c.to_string() }
                        };
                        self.calls.insert(item_id.clone(), (call_id.clone(), name.clone(), String::new()));
                        emit(ChatStreamEvent::ToolInputStart { id: call_id, tool_name: name })?;
                    }
                    "reasoning" => {
                        if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                            self.reasoning_items.insert(id.to_string(), None);
                        }
                    }
                    _ => {}
                }
            }
            "response.function_call_arguments.delta" => {
                let item_id = s_field(&v, "item_id").to_string();
                let delta = s_field(&v, "delta").to_string();
                // 事件 id 必须与前端建条目时用的 id 一致（前端按 toolCallId 对账），
                // 所以这里用 call_id；拿不到才退回 item id。
                if let Some(acc) = self.calls.get_mut(&item_id) {
                    acc.2.push_str(&delta);
                    let id = if acc.0.is_empty() { item_id } else { acc.0.clone() };
                    emit(ChatStreamEvent::ToolInputDelta { id, delta })?;
                }
            }
            "response.output_item.done" => {
                let Some(item) = v.get("item") else { return Ok(()) };
                match s_field(item, "type") {
                    "function_call" => {
                        let call_id = {
                            let c = s_field(item, "call_id");
                            let i = s_field(item, "id");
                            if !c.is_empty() { c.to_string() } else { i.to_string() }
                        };
                        let args = s_field(item, "arguments").to_string();
                        if !call_id.is_empty() && !self.reply.tool_calls.iter().any(|c| c.id == call_id) {
                            self.reply.tool_calls.push(ChatToolCall {
                                id: call_id,
                                name: s_field(item, "name").to_string(),
                                arguments: parse_args(&args),
                                provider_executed: None,
                            });
                        }
                    }
                    "reasoning" => {
                        if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                            let enc = item.get("encrypted_content").and_then(|x| x.as_str()).map(str::to_owned);
                            self.reasoning_items.insert(id.to_string(), enc);
                        }
                        // 没有增量时（有的实现只在 item 里给全量）：补一次
                        let text = reasoning_text_of(item);
                        if self.reply.reasoning.is_empty() && !text.is_empty() {
                            if !self.reasoning_open {
                                self.reasoning_open = true;
                                emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
                            }
                            self.reply.reasoning.push_str(&text);
                            emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: text })?;
                        }
                    }
                    _ => {}
                }
            }
            "response.completed" | "response.incomplete" => {
                let resp = v.get("response").cloned().unwrap_or(Value::Null);
                if let Some(u) = resp.get("usage").filter(|u| !u.is_null()) {
                    self.reply.usage = responses_usage(u);
                }
                if let Some(items) = resp.get("output").and_then(|o| o.as_array()) {
                    self.absorb_output(items, emit)?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// 从完整的 `output[]` 里补全正文 / 思考 / 工具调用（没有增量流时的兜底）
    fn absorb_output(&mut self, items: &[Value], emit: Emit<'_>) -> Result<(), String> {
        for item in items {
            match s_field(item, "type") {
                "function_call" => {
                    let call_id = {
                        let c = s_field(item, "call_id");
                        let i = s_field(item, "id");
                        if !c.is_empty() { c.to_string() } else { i.to_string() }
                    };
                    if call_id.is_empty() || self.reply.tool_calls.iter().any(|c| c.id == call_id) {
                        continue;
                    }
                    self.reply.tool_calls.push(ChatToolCall {
                        id: call_id,
                        name: s_field(item, "name").to_string(),
                        arguments: parse_args(s_field(item, "arguments")),
                        provider_executed: None,
                    });
                }
                "reasoning" => {
                    if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                        let enc = item.get("encrypted_content").and_then(|x| x.as_str()).map(str::to_owned);
                        self.reasoning_items.insert(id.to_string(), enc);
                    }
                    if self.reply.reasoning.is_empty() {
                        let text = reasoning_text_of(item);
                        if !text.is_empty() {
                            if !self.reasoning_open {
                                self.reasoning_open = true;
                                emit(ChatStreamEvent::ReasoningStart { id: "reasoning".into() })?;
                            }
                            self.reply.reasoning.push_str(&text);
                            emit(ChatStreamEvent::ReasoningDelta { id: "reasoning".into(), delta: text })?;
                        }
                    }
                }
                "web_search_call" => {
                    // 供应商侧执行的搜索：前端只标「已执行」，不 dispatch
                    let id = s_field(item, "id");
                    if !id.is_empty() && !self.reply.tool_calls.iter().any(|c| c.id == id) {
                        self.reply.tool_calls.push(ChatToolCall {
                            id: id.to_string(),
                            name: "web_search".to_string(),
                            arguments: item.get("action").cloned().unwrap_or_else(|| json!({})),
                            provider_executed: Some(true),
                        });
                    }
                }
                "message" => {
                    if self.reply.text.is_empty() {
                        let text = message_text_of(item);
                        if !text.is_empty() {
                            if !self.text_open {
                                self.text_open = true;
                                emit(ChatStreamEvent::TextStart { id: "text".into() })?;
                            }
                            self.reply.text.push_str(&text);
                            emit(ChatStreamEvent::TextDelta { id: "text".into(), delta: text })?;
                        }
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn finish(mut self) -> ChatReply {
        // 思考块回传凭据：取第一个带 encrypted_content 的 reasoning item
        if let Some((id, Some(enc))) = self.reasoning_items.iter().find(|(_, v)| v.is_some()) {
            self.reply.reasoning_meta = Some(json!({ "itemId": id, "encryptedContent": enc }));
        } else if let Some((id, _)) = self.reasoning_items.iter().next() {
            self.reply.reasoning_meta = Some(json!({ "itemId": id }));
        }
        // 没有依赖 output_item.done 的兜底：流里只给了 added + 参数增量
        let streamed: Vec<(String, String, String)> = self.calls.into_iter().map(|(_, v)| v).collect();
        for (call_id, name, args) in streamed {
            if call_id.is_empty() || self.reply.tool_calls.iter().any(|c| c.id == call_id) {
                continue;
            }
            self.reply.tool_calls.push(ChatToolCall {
                id: call_id,
                name,
                arguments: parse_args(&args),
                provider_executed: None,
            });
        }
        self.reply
    }
}

pub fn parse_responses_reply(v: &Value) -> Result<ChatReply, String> {
    if let Some(err) = v.get("error").filter(|e| !e.is_null()) {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("未知错误");
        return Err(format!("AI 对话失败: {msg}"));
    }
    let mut reply = ChatReply::default();
    if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
        reply.usage = responses_usage(u);
    }
    let mut meta = None;
    for item in v.get("output").and_then(|o| o.as_array()).into_iter().flatten() {
        match s_field(item, "type") {
            "message" => reply.text.push_str(&message_text_of(item)),
            "reasoning" => {
                reply.reasoning.push_str(&reasoning_text_of(item));
                if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                    meta = Some(match item.get("encrypted_content").and_then(|x| x.as_str()) {
                        Some(enc) => json!({ "itemId": id, "encryptedContent": enc }),
                        None => json!({ "itemId": id }),
                    });
                }
            }
            "function_call" => {
                let call_id = {
                    let c = s_field(item, "call_id");
                    let i = s_field(item, "id");
                    if !c.is_empty() { c.to_string() } else { i.to_string() }
                };
                if call_id.is_empty() {
                    continue;
                }
                reply.tool_calls.push(ChatToolCall {
                    id: call_id,
                    name: s_field(item, "name").to_string(),
                    arguments: parse_args(s_field(item, "arguments")),
                    provider_executed: None,
                });
            }
            _ => {}
        }
    }
    reply.reasoning_meta = meta;
    Ok(reply)
}

/// `message` 输出项的正文：`content[].output_text.text`（也兼容 `text` 直给）
fn message_text_of(item: &Value) -> String {
    let mut out = String::new();
    for part in item.get("content").and_then(|c| c.as_array()).into_iter().flatten() {
        let kind = s_field(part, "type");
        if kind == "output_text" || kind == "text" {
            out.push_str(s_field(part, "text"));
        }
    }
    out
}

/// 思考项正文：优先 `summary[].text`（OpenAI），其次 `content[].text`（DeepSeek/MiMo 的 reasoning_text）
fn reasoning_text_of(item: &Value) -> String {
    for key in ["summary", "content"] {
        let parts = item.get(key).and_then(|c| c.as_array());
        let out: String = parts
            .into_iter()
            .flatten()
            .map(|part| s_field(part, "text"))
            .collect();
        if !out.is_empty() {
            return out;
        }
    }
    String::new()
}

fn responses_usage(u: &Value) -> ChatUsage {
    ChatUsage {
        input_tokens: u_field(u, "input_tokens"),
        output_tokens: u_field(u, "output_tokens"),
        cached_tokens: u.get("input_tokens_details").and_then(|d| u_field(d, "cached_tokens")),
        cache_write_tokens: u.get("input_tokens_details").and_then(|d| u_field(d, "cache_write_tokens")),
    }
}

fn parse_args(raw: &str) -> Value {
    let raw = raw.trim();
    if raw.is_empty() {
        return json!({});
    }
    serde_json::from_str(raw).unwrap_or_else(|_| {
        // 参数没拼成合法 JSON（截断 / 供应商怪癖）：至少把原文留住，工具层会给出可读错误
        json!({ "_raw": raw })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::Format;
    use std::sync::{Arc, Mutex};

    fn client<'a>(format: Format, model: &'a str, tools: &'a [Value]) -> ChatClient<'a> {
        ChatClient {
            format,
            endpoint: "https://example.com/v1",
            api_key: "k",
            model,
            tools,
            effort: None,
            max_output_tokens: None,
            hosted_web_search: false,
        }
    }

    fn collector() -> (Arc<Mutex<Vec<Value>>>, impl FnMut(ChatStreamEvent) -> Result<(), String>) {
        let seen: Arc<Mutex<Vec<Value>>> = Default::default();
        let sink = seen.clone();
        let emit = move |ev: ChatStreamEvent| {
            sink.lock().unwrap().push(serde_json::to_value(&ev).unwrap());
            Ok(())
        };
        (seen, emit)
    }

    fn feed(state: &mut dyn FnMut(&Event, Emit<'_>) -> Result<(), String>, raw: &str, emit: Emit<'_>) -> Result<(), String> {
        let mut p = super::super::sse::Parser::default();
        for ev in p.push(raw.as_bytes()) {
            state(&ev, emit)?;
        }
        for ev in p.finish() {
            state(&ev, emit)?;
        }
        Ok(())
    }

    /// Responses：reasoning_text.delta（DeepSeek / MiMo 的真实形状）必须变成思考，
    /// 工具调用按 item id 串起来，encrypted_content 要留进 meta（下一轮回传用）。
    #[test]
    fn responses_stream_yields_reasoning_tools_and_meta() {
        let raw = concat!(
            "event: response.output_item.added\n",
            "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"reasoning\",\"id\":\"rs1\",\"summary\":[],\"content\":[]}}\n\n",
            "event: response.reasoning_text.delta\n",
            "data: {\"type\":\"response.reasoning_text.delta\",\"item_id\":\"rs1\",\"content_index\":0,\"delta\":\"先想\"}\n\n",
            "event: response.reasoning_text.delta\n",
            "data: {\"type\":\"response.reasoning_text.delta\",\"item_id\":\"rs1\",\"content_index\":0,\"delta\":\"一下\"}\n\n",
            "event: response.output_item.added\n",
            "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"function_call\",\"id\":\"fc1\",\"call_id\":\"call_1\",\"name\":\"get_chats\",\"arguments\":\"\"}}\n\n",
            "event: response.function_call_arguments.delta\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc1\",\"delta\":\"{\\\"limit\\\":\"}\n\n",
            "event: response.function_call_arguments.delta\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc1\",\"delta\":\"1}\"}\n\n",
            "event: response.output_item.done\n",
            "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"function_call\",\"id\":\"fc1\",\"call_id\":\"call_1\",\"name\":\"get_chats\",\"arguments\":\"{\\\"limit\\\":1}\"}}\n\n",
            "event: response.output_text.delta\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"好的\"}\n\n",
            "event: response.output_item.done\n",
            "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"reasoning\",\"id\":\"rs1\",\"encrypted_content\":\"enc-1\",\"summary\":[],\"content\":[{\"type\":\"reasoning_text\",\"text\":\"先想一下\"}]}}\n\n",
            "event: response.completed\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":55,\"output_tokens\":25,\"input_tokens_details\":{\"cached_tokens\":7}}}}\n\n",
        );
        let (seen, mut emit) = collector();
        let mut state = ResponsesStream::default();
        feed(
            &mut |ev, e| state.on_event(ev, e),
            raw,
            &mut emit,
        )
        .unwrap();
        let reply = state.finish();
        assert_eq!(reply.text, "好的");
        assert_eq!(reply.reasoning, "先想一下");
        assert_eq!(reply.tool_calls.len(), 1);
        assert_eq!(reply.tool_calls[0].id, "call_1");
        assert_eq!(reply.tool_calls[0].name, "get_chats");
        assert_eq!(reply.tool_calls[0].arguments, json!({ "limit": 1 }));
        assert_eq!(reply.usage.input_tokens, Some(55));
        assert_eq!(reply.usage.output_tokens, Some(25));
        assert_eq!(reply.usage.cached_tokens, Some(7));
        assert_eq!(
            reply.reasoning_meta,
            Some(json!({ "itemId": "rs1", "encryptedContent": "enc-1" }))
        );

        // 事件形状必须与前端 aiChat.ts 对齐：reasoning-delta 带 delta
        let events = seen.lock().unwrap().clone();
        assert!(events
            .iter()
            .any(|e| e["type"] == "reasoning-delta" && e["delta"] == "先想"));
        assert!(events
            .iter()
            .any(|e| e["type"] == "tool-input-start" && e["toolName"] == "get_chats"));
    }

    /// Chat Completions：delta.reasoning_content 变成思考；工具参数按 index 拼接；usage 取末块
    #[test]
    fn chat_stream_yields_reasoning_and_tool_args() {
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"思考\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_a\",\"function\":{\"name\":\"get_chats\",\"arguments\":\"{\\\"limit\\\":\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"5}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":3,\"prompt_tokens_details\":{\"cached_tokens\":2}}}\n\n",
            "data: [DONE]\n\n",
        );
        let (seen, mut emit) = collector();
        let mut state = ChatStream::default();
        feed(&mut |ev, e| state.on_event(ev, e), raw, &mut emit).unwrap();
        let reply = state.finish();
        assert_eq!(reply.text, "你好");
        assert_eq!(reply.reasoning, "思考");
        assert_eq!(reply.tool_calls.len(), 1);
        assert_eq!(reply.tool_calls[0].id, "call_a");
        assert_eq!(reply.tool_calls[0].arguments, json!({ "limit": 5 }));
        assert_eq!(reply.usage.input_tokens, Some(10));
        assert_eq!(reply.usage.output_tokens, Some(3));
        assert_eq!(reply.usage.cached_tokens, Some(2));
        let events = seen.lock().unwrap().clone();
        assert!(events.iter().any(|e| e["type"] == "reasoning-delta" && e["delta"] == "思考"));
        assert!(events.iter().any(|e| e["type"] == "text-delta" && e["delta"] == "你"));
    }

    /// Responses 请求体：思考要显式带 summary，工具是扁平 function 形状，搜索工具只在允许时挂
    #[test]
    fn responses_body_requests_reasoning_and_tools() {
        let tools = vec![json!({
            "type": "function",
            "function": { "name": "get_chats", "description": "d", "parameters": { "type": "object", "properties": {} } }
        })];
        let mut c = client(Format::Responses, "deepseek-flash", &tools);
        c.effort = Some("medium");
        let body = responses_body(&c, &[ChatMessage { role: "user".into(), text: "hi".into(), ..Default::default() }], true).unwrap();
        assert_eq!(body["stream"], true);
        assert_eq!(body["reasoning"]["effort"], "medium");
        assert_eq!(body["reasoning"]["summary"], "auto");
        assert_eq!(body["input"][0]["content"][0]["type"], "input_text");
        assert_eq!(body["tools"][0]["type"], "function");
        assert_eq!(body["tools"][0]["name"], "get_chats");
        assert_eq!(body["include"][0], "reasoning.encrypted_content");

        // 关闭档不发明思考参数
        c.effort = Some("none");
        let body = responses_body(&c, &[], true).unwrap();
        assert!(body.get("reasoning").is_none());

        // 托管搜索：只有调用方允许时才挂
        c.effort = None;
        c.hosted_web_search = true;
        let body = responses_body(&c, &[], true).unwrap();
        assert!(body["tools"].as_array().unwrap().iter().any(|t| t["type"] == "web_search"));
    }

    /// 思考块要按 provider_meta 回传 reasoning item（store:false 时缺 encrypted_content 会被拒）
    #[test]
    fn responses_body_replays_reasoning_item_with_meta() {
        let no_tools: Vec<Value> = Vec::new();
        let c = client(Format::Responses, "m", &no_tools);
        let msgs = vec![
            ChatMessage {
                role: "assistant".into(),
                reasoning: "想一想".into(),
                text: "答案".into(),
                provider_meta: Some(json!({ "itemId": "rs1", "encryptedContent": "enc-1" })),
                ..Default::default()
            },
            ChatMessage { role: "user".into(), text: "继续".into(), ..Default::default() },
        ];
        let body = responses_body(&c, &msgs, false).unwrap();
        let input = body["input"].as_array().unwrap();
        assert_eq!(input[0]["type"], "reasoning");
        assert_eq!(input[0]["id"], "rs1");
        assert_eq!(input[0]["encrypted_content"], "enc-1");
        assert_eq!(input[0]["summary"][0]["type"], "summary_text");
        assert_eq!(input[1]["role"], "assistant");
        assert_eq!(input[1]["content"][0]["type"], "output_text");
    }

    /// 没凭据的思考块不回传（供应商会 400），正文照发
    #[test]
    fn responses_body_skips_reasoning_without_meta() {
        let no_tools: Vec<Value> = Vec::new();
        let c = client(Format::Responses, "m", &no_tools);
        let mut msgs = vec![ChatMessage {
            role: "assistant".into(),
            reasoning: "想一想".into(),
            text: "答案".into(),
            ..Default::default()
        }];
        let body = responses_body(&c, &msgs, false).unwrap();
        assert_eq!(body["input"].as_array().unwrap().len(), 1);
        assert_eq!(body["input"][0]["role"], "assistant");

        // 只有 itemId、没有 encrypted_content（MiMo 就是这样）也不回传
        msgs[0].provider_meta = Some(json!({ "itemId": "rs1" }));
        let body = responses_body(&c, &msgs, false).unwrap();
        assert_eq!(body["input"].as_array().unwrap().len(), 1);
        assert_eq!(body["input"][0]["role"], "assistant");
    }

    /// Chat 请求体：推理模型用 max_completion_tokens，老模型用 max_tokens
    #[test]
    fn chat_body_picks_token_field_and_reasoning_effort() {
        let no_tools: Vec<Value> = Vec::new();
        let mut c = client(Format::Chat, "o3-mini", &no_tools);
        c.effort = Some("low");
        c.max_output_tokens = Some(64);
        let body = chat_body(&c, &[], true).unwrap();
        assert_eq!(body["max_completion_tokens"], 64);
        assert_eq!(body["reasoning_effort"], "low");
        assert_eq!(body["stream_options"]["include_usage"], true);

        let mut c = client(Format::Chat, "deepseek-chat", &no_tools);
        c.max_output_tokens = Some(64);
        let body = chat_body(&c, &[], false).unwrap();
        assert_eq!(body["max_tokens"], 64);
        assert!(body.get("reasoning_effort").is_none());
    }

    /// Chat 历史里的工具调用 / 工具结果要转成 OpenAI 的 tool_calls + role:tool
    #[test]
    fn chat_body_converts_tool_round_trip() {
        let no_tools: Vec<Value> = Vec::new();
        let c = client(Format::Chat, "m", &no_tools);
        let msgs = vec![
            ChatMessage {
                role: "assistant".into(),
                text: String::new(),
                tool_calls: vec![ChatToolCall {
                    id: "call_1".into(),
                    name: "get_chats".into(),
                    arguments: json!({ "limit": 1 }),
                    provider_executed: None,
                }],
                ..Default::default()
            },
            ChatMessage {
                role: "tool".into(),
                tool_call_id: "call_1".into(),
                tool_name: "get_chats".into(),
                text: "{\"ok\":true}".into(),
                ..Default::default()
            },
        ];
        let body = chat_body(&c, &msgs, false).unwrap();
        let m = body["messages"].as_array().unwrap();
        assert_eq!(m[0]["role"], "assistant");
        assert_eq!(m[0]["content"], Value::Null);
        assert_eq!(m[0]["tool_calls"][0]["function"]["name"], "get_chats");
        assert_eq!(m[0]["tool_calls"][0]["function"]["arguments"], "{\"limit\":1}");
        assert_eq!(m[1]["role"], "tool");
        assert_eq!(m[1]["tool_call_id"], "call_1");
    }
}
