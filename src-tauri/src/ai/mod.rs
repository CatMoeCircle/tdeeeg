//! AI 能力：LLM 对话/翻译、会话记录、本地语种检测。

pub mod ai_chat;
pub mod ai_conversations;
pub mod ai_translate;
pub mod lang_detect;
/// 自研的三协议对话客户端（Responses / Chat Completions / Anthropic），见模块注释
pub mod llm;

/// 出站 AI 请求的 `User-Agent`：`tdeeeg/<版本> (+https://github.com/CatMoeCircle/tdeeeg)`，
/// 版本取自 Cargo 清单（与 tauri.conf.json 同步）。
///
/// 只用来让供应商侧识别调用方客户端，**不含**用户 id、会话 id、路径或机器信息；
/// 对话 / 翻译 / 补全 / 联网搜索 / 模型列表全都带它。
pub fn user_agent() -> String {
    format!(
        "tdeeeg/{} (+https://github.com/CatMoeCircle/tdeeeg)",
        env!("CARGO_PKG_VERSION")
    )
}
