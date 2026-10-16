/**
 * TDLib 调用黑名单（纯逻辑，可单独跑自检）。
 *
 * 这些能力**物理上**不让 AI 碰 —— 即使审核通过也不执行，用户必须自己在应用里操作：
 * - 账号 / 登录 / 二次验证 / 账号找回：整个家族按前缀禁掉
 * - TDLib 生命周期与配置：close / destroy / setTdlibParameters / 本地加密密钥
 * - 离开 / 订阅：leaveChat，以及把成员设成 left
 * - 所有权：转让群主 / 频道
 * - 解散 / 清空：删聊天、解散社群与频道、清空聊天记录、批量删消息
 *
 * 只在这里加规则；write.ts 的 call_tdlib_method 在 tdlibSend 之前调用 assertTdlibMethodAllowed。
 */

/** 方法级黑名单：方法名 → 禁用原因（写成人话，会原样回给模型） */
const FORBIDDEN_METHODS: Record<string, string> = {
  // —— 账号 / 会话 ——
  logOut: "退出登录要用户自己在设置里操作",
  deleteAccount: "注销账号不可逆，要用户自己去 Telegram 设置里操作",
  terminateSession: "结束其它会话要用户自己在设置里操作",
  terminateAllOtherSessions: "结束其它会话要用户自己在设置里操作",
  setAccountTtl: "账号自动销毁时间属账号安全，要用户自己来",
  deleteSavedOrderInfo: "删已保存的支付信息要用户自己操作",
  // —— TDLib 生命周期 / 配置 ——
  close: "关闭 TDLib 是应用生命周期的事，AI 不能碰",
  destroy: "销毁 TDLib 客户端是应用生命周期的事，AI 不能碰",
  setTdlibParameters: "TDLib 参数（API / 设备信息）属应用配置，AI 不能碰",
  setDatabaseEncryptionKey: "本地数据库加密密钥属应用配置，AI 不能碰",
  // —— 离开 / 订阅 ——
  leaveChat: "退出群组 / 取消订阅要用户自己操作",
  // —— 所有权 ——
  transferChatOwnership: "转让群主 / 频道要用户自己操作",
  // —— 解散 / 清空（不可逆，影响整个聊天） ——
  deleteChat: "删除聊天 / 解散频道要用户自己操作",
  deleteCommunity: "解散社群要用户自己操作",
  deleteChatHistory: "清空聊天记录要用户自己操作",
  deleteDirectMessagesChatTopicHistory: "清空话题历史要用户自己操作",
  deleteChatMessagesByDate: "按日期批量删消息要用户自己操作",
  deleteChatMessagesBySender: "按发送者批量删消息要用户自己操作",
};

/**
 * 前缀黑名单：整个家族禁掉，将来 TDLib 新增同类方法也自动被拦。
 * 只放「登录 / 验证 / 账号找回」这种整体都不该由 AI 代做的家族。
 */
const FORBIDDEN_PREFIXES: [prefix: string, reason: string][] = [
  ["checkAuthentication", "登录 / 二次验证要用户自己来"],
  ["setAuthentication", "登录 / 二次验证要用户自己来"],
  ["sendAuthentication", "登录 / 二次验证要用户自己来"],
  ["resendAuthentication", "登录 / 二次验证要用户自己来"],
  ["reportAuthentication", "登录 / 二次验证要用户自己来"],
  ["requestAuthentication", "账号找回要用户自己来"],
  ["recoverAuthentication", "账号找回要用户自己来"],
  ["checkPhoneNumber", "手机号验证要用户自己来"],
  ["sendPhoneNumber", "手机号验证要用户自己来"],
  ["resendPhoneNumber", "手机号验证要用户自己来"],
  ["reportPhoneNumber", "手机号验证要用户自己来"],
  ["checkLoginEmailAddress", "登录邮箱验证要用户自己来"],
  ["setLoginEmailAddress", "登录邮箱验证要用户自己来"],
  ["resendLoginEmailAddress", "登录邮箱验证要用户自己来"],
  ["requestQrCodeAuthentication", "扫码登录要用户自己来"],
  ["confirmQrCodeAuthentication", "扫码登录要用户自己来"],
  ["registerUser", "注册账号要用户自己来"],
  ["deleteSavedCredentials", "删已保存的登录凭据要用户自己操作"],
];

/**
 * 返回禁用原因（null = 允许）。
 * 依次查：方法级黑名单 → 前缀家族 → 「方法合法但取值等于退出/转让」的参数级。
 */
export function deniedTdlibMethod(method: string, params?: Record<string, unknown>): string | null {
  const byName = FORBIDDEN_METHODS[method];
  if (byName) return byName;
  for (const [prefix, reason] of FORBIDDEN_PREFIXES) {
    if (method.startsWith(prefix)) return reason;
  }
  // setChatMemberStatus 把成员设成 left = 退出群组 / 取消订阅的另一种写法
  if (method === "setChatMemberStatus") {
    const status = params?.status as { _?: string } | undefined;
    if (status?._ === "chatMemberStatusLeft") {
      return "把成员设为已离开（退出群组 / 取消订阅）要用户自己操作";
    }
  }
  return null;
}

/** 禁用则抛错（错误文案面向模型：告诉它这活只能用户自己干） */
export function assertTdlibMethodAllowed(method: string, params?: Record<string, unknown>): void {
  const why = deniedTdlibMethod(method, params);
  if (why) throw new Error(`不允许调用 ${method}：${why}；这类操作需要用户自己在应用里完成`);
}
