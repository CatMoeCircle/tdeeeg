/**
 * 聊天间导航来源标记。
 *
 * 聊天详情里的跳转（转发来源、消息内链接、内联按钮、发送者频道…）和从会话列表
 * 点开聊天，在路由层面都属于「聊天 → 聊天」的历史前进，仅看 router history
 * 无法区分。但两者返回行为不同：
 * - 聊天内跳转：按原路一层层退回上一个会话（A → B → C，返回依次回 C → B → A）
 * - 从列表打开：返回直接收起聊天面板，回到空状态（类似刚打开应用）
 *
 * 因此由列表侧在导航前显式打标记，聊天详情侧在路由落到聊天页时消费。
 */

/** 标记有效期：点击列表到路由落定通常在同一轮事件循环内完成，留一点余量 */
const FLAT_NAV_TTL_MS = 1000;
let flatNavAt = 0;

/** 会话列表 / 列表内搜索等「平级入口」打开聊天前调用 */
export function markChatNavFromList() {
    flatNavAt = Date.now();
}

/** 聊天详情在路由落到聊天页时消费该标记（超时的标记视为无效，避免误判） */
export function consumeChatNavFromList(): boolean {
    const marked = flatNavAt !== 0 && Date.now() - flatNavAt <= FLAT_NAV_TTL_MS;
    flatNavAt = 0;
    return marked;
}

/** 路径是否属于聊天详情（chat-detail / chat-topic-detail / chat-thread-detail 共用 /home/chat 前缀） */
export function isChatRoutePath(path: string): boolean {
    return path === '/home/chat' || path.startsWith('/home/chat/');
}

/**
 * 栏目空页：只有当聊天是从这些页面打开时，返回才是「收起聊天面板 → 空状态」。
 * 从资料页（用户 / 频道 / 群组）、编辑页、设置二级页等内容页打开的聊天，
 * 返回应该回到那个页面。
 */
const CHAT_PANE_SECTIONS = ['/home', '/home/chats', '/home/contacts', '/home/archived', '/home/settings'];

/** 该路径是否为栏目空页（而非资料页等内容页） */
export function isChatPaneSectionPath(path: string | null | undefined): boolean {
    if (!path) return true;
    const bare = path.split(/[?#]/)[0];
    return CHAT_PANE_SECTIONS.includes(bare);
}
