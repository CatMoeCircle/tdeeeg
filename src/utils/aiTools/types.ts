/**
 * AI 工具层：公共类型。
 * 见 docs/ai-tools-internal.md（内部文档，不入库）。
 */

/**
 * 工具类别：
 * - read  只读，无副作用，不需要审核
 * - write 会改聊天（发送 / 编辑 / 删除 / 封禁 / 裸调 TDLib），**一律先过审核**
 * - local 本地元数据（改当前会话标题等）：不碰 Telegram、不改聊天，因此**不需要审核**
 */
export type ToolKind = "read" | "write" | "local";

/** 写类工具的审核等级，展示在审核卡片上供用户判断 */
export type ToolRisk = "send" | "modify" | "destructive" | "raw";

/** 审核策略（对齐 DSH 的 approval policy）：
 * - ask   默认：需要审核的调用弹卡片等用户决定
 * - never 一律不弹：需要审核的调用**自动拒绝**
 */
export type ApprovalPolicy = "ask" | "never";

/** 审核结果：一次性、绑定这次调用的确切参数；改了参数要重新审核 */
export type ApprovalDecision = { granted: true } | { granted: false; reason?: string };

/** 交给用户（或 UI 审核卡片）看的审核请求 */
export interface ApprovalRequest {
  tool: string;
  args: Record<string, unknown>;
  /** 模型给出的理由（写类工具必填 reason 参数），审核卡片上原样展示 */
  reason: string;
  risk: ToolRisk;
  /** 人话摘要，如「在群 -100123 发送消息：「收到」」 */
  summary: string;
}

/** 审核通道：由 UI 注入（弹卡片 / 通知 / 控制台）。没有通道时 fail closed —— 直接拒绝 */
export type ApprovalGate = (req: ApprovalRequest) => ApprovalDecision | Promise<ApprovalDecision>;

/** 线程类型：forum = 群组论坛话题；dm = 频道直通消息；comment = 频道帖子的评论线程 */
export type TurnThreadKind = "forum" | "dm" | "comment";

/** 这一轮用户所在线程；工具没显式传 thread_id 时用它兜底 */
export interface TurnThread {
  /** 话题 / 线程 id */
  id: number;
  /** 这些消息真正所在的会话：评论线程 = 讨论组，话题 = 当前聊天 */
  chatId: number;
  /** 线程类型：决定 topic_id 形态与读历史的接口 */
  kind: TurnThreadKind;
}

/**
 * 一次工具调用的上下文：**每一轮显式传参**，不再用模块级全局。
 *
 * 为什么必须是参数：AI 轮次是后台托管的（切走聊天不中断，见 store/aiRuntime），
 * 多个聊天 / 多个会话可能同时在跑。全局变量会被最后开始的那一轮覆盖，
 * 结果是 A 聊天的工具调用按 B 聊天的线程 / 供应商 / 审核通道执行 —— 数据会写错地方。
 */
export interface ToolContext {
  /** 这一轮所在的聊天（工具结果落盘 / 会话标题等按它定位） */
  chatId: number;
  /** 这一轮所在的会话 id：工具层要改「当前会话」时用它，而不是读界面选中项 */
  conversationId: string;
  /** 这一轮所在的线程（论坛话题 / 频道直信 / 评论线程）；null = 不在线程里 */
  thread: TurnThread | null;
  /** 这一轮真正在用的供应商 / 模型（客户端搜索的 Key 与模型兜底） */
  search: { providerId: string; model: string };
  /** 审核策略；缺省 ask。never = 需要审核的调用自动拒绝 */
  approvalPolicy?: ApprovalPolicy;
  /** 用户已明确跳过审核的工具名 */
  skipApproval?: readonly string[];
  /** 本轮的审核通道；不传 = 没有 answerer（写类调用 fail closed 拒绝） */
  approvalGate?: ApprovalGate | null;
  /** 本轮的临时图片路径收集器（read_image 转好的 JPEG 由下一轮请求作为附件发出） */
  pendingImages: string[];
}

export type ToolParamType = "string" | "number" | "boolean" | "string[]" | "number[]" | "object";

export interface ToolParam {
  name: string;
  type: ToolParamType;
  required?: boolean;
  desc: string;
  /** 数组 / 对象的入参规模上限；这两种类型必须声明 */
  maxItems?: number;
}

export interface ToolMeta {
  name: string;
  kind: ToolKind;
  desc: string;
  params: ToolParam[];
  /** 返回值是列表 → 必须登记 TOOL_LIMITS 且带 limit 参数 */
  returnsList?: boolean;
  /** write 类必须为 true */
  needsApproval?: boolean;
  risk?: ToolRisk;
  /** 审核卡片上的人话摘要 */
  summary?: (args: Record<string, unknown>) => string;
}

/** 所有工具的返回信封 */
export interface ToolResult<T = unknown> {
  tool: string;
  /** 本次实际生效的条数上限（单条工具记 1） */
  limit: number;
  returned: number;
  /** true = returned 已达 limit，可能还有更多 */
  truncated: boolean;
  next_cursor?: number;
  warnings?: string[];
  data: T;
}

export type ToolErrorCode = "bad_call" | "unknown_tool" | "invalid_args" | "denied" | "not_implemented" | "internal";

export interface ToolErrorResult {
  tool: string;
  error: {
    code: ToolErrorCode;
    message: string;
    /** 参数校验明细，逐条可读，供模型自查 */
    issues?: string[];
  };
}

/** 一次调用的产出：要么是结果信封，要么是结构化错误 */
export type ToolOutcome = ToolResult<unknown> | ToolErrorResult;

/** 成功时只回一个裸字符串（不包 JSON 信封）的结果，例如 set_conversation_title 只回 "OK" */
export type ToolRawReply = "OK";

/** 工具实现体的产出：结果信封 / 结构化错误 / 裸字符串成功 */
export type ToolReply = ToolOutcome | ToolRawReply;
