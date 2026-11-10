//! 极简 SSE 解析器：把字节流切成 `(event, data)`。
//!
//! 只做三协议需要的那部分（`event:` / `data:` / 空行分隔 / `[DONE]`）：
//! - 按字节缓存、按行切，**不会把 UTF-8 多字节字符切坏**（网络分片常常正好切在汉字中间）；
//! - 一条事件的多行 `data:` 用 `\n` 拼起来，与 SSE 规范一致；
//! - 注释行（`:` 开头）与未知字段忽略。

/// 一条 SSE 事件
#[derive(Debug, Clone, Default)]
pub struct Event {
    /// `event:` 字段；没写 = 空串（OpenAI Chat 的 `data: {...}` 就是这种）
    pub event: String,
    /// `data:` 拼起来的内容
    pub data: String,
}

impl Event {
    /// data 解析成 JSON（解析失败返回 None，调用方按「不认识的块」跳过）
    pub fn json(&self) -> Option<serde_json::Value> {
        serde_json::from_str(self.data.trim()).ok()
    }
}

#[derive(Default)]
pub struct Parser {
    buf: Vec<u8>,
    event: String,
    data: String,
    has_data: bool,
}

impl Parser {
    /// 喂一段字节，返回这次能切出来的完整事件
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Event> {
        self.buf.extend_from_slice(bytes);
        let mut out = Vec::new();
        while let Some(pos) = self.buf.iter().position(|b| *b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=pos).collect();
            line.pop(); // '\n'
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let text = String::from_utf8_lossy(&line).into_owned();
            self.line(&text, &mut out);
        }
        out
    }

    /// 连接结束时把缓冲区里剩下的半行也交出去（服务器没补最后的空行时用）
    pub fn finish(&mut self) -> Vec<Event> {
        let mut out = Vec::new();
        if !self.buf.is_empty() {
            let text = String::from_utf8_lossy(&self.buf).into_owned();
            self.buf.clear();
            self.line(&text, &mut out);
        }
        if self.has_data {
            out.push(Event { event: std::mem::take(&mut self.event), data: std::mem::take(&mut self.data) });
            self.has_data = false;
        }
        out
    }

    fn line(&mut self, line: &str, out: &mut Vec<Event>) {
        if line.is_empty() {
            // 空行 = 一条事件结束
            if self.has_data {
                out.push(Event {
                    event: std::mem::take(&mut self.event),
                    data: std::mem::take(&mut self.data),
                });
                self.has_data = false;
            }
            return;
        }
        if line.starts_with(':') {
            return; // 注释 / keep-alive
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line, ""),
        };
        match field {
            "event" => self.event = value.to_string(),
            "data" => {
                if self.has_data {
                    self.data.push('\n');
                }
                self.data.push_str(value);
                self.has_data = true;
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_events_and_joins_multiline_data() {
        let mut p = Parser::default();
        let mut evs = p.push(b"event: a\ndata: {\"x\":1}\n\ndata: line1\ndata: line2\n\n");
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0].event, "a");
        assert_eq!(evs[0].json().unwrap()["x"], 1);
        assert_eq!(evs[1].event, "");
        assert_eq!(evs[1].data, "line1\nline2");
        evs.clear();
        assert!(evs.is_empty());
    }

    #[test]
    fn survives_split_utf8_and_split_lines() {
        let mut p = Parser::default();
        let text = "data: {\"t\":\"思考\"}\n\n";
        let bytes = text.as_bytes();
        // 正好切在「思」的中间
        let cut = text.find('思').unwrap() + 1;
        let mut evs = p.push(&bytes[..cut]);
        assert!(evs.is_empty());
        evs.extend(p.push(&bytes[cut..]));
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].json().unwrap()["t"], "思考");
    }

    #[test]
    fn finish_flushes_partial_event() {
        let mut p = Parser::default();
        assert!(p.push(b"data: {\"a\":1}").is_empty());
        let evs = p.finish();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].json().unwrap()["a"], 1);
    }

    #[test]
    fn ignores_comments_and_unknown_fields() {
        let mut p = Parser::default();
        let evs = p.push(b": ping\nid: 7\ndata: x\n\n");
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].data, "x");
    }
}
