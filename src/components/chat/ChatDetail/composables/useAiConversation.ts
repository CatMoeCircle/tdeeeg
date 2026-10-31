/**
 * @deprecated 已由 `store/aiRuntime.ts` + `components/ai/AiInputArea.vue` 取代。
 *
 * 原来的实现把 AI 会话列表 / 活动条历史 / 轮次停止都挂在 `ChatDetail` 里，
 * 导致两个问题（见 aiRuntime 顶部注释）：
 * 1. 切走聊天时 `resetState()` 会停掉正在跑的轮次 —— 离开就等于任务没了；
 * 2. 活动条条目与轮次状态住在聊天页组件里，流式增量会拖着整棵消息列表一起重渲染。
 *
 * 现在：轮次状态按 `chatId` 存在 `store/aiRuntime`，聊天页只做订阅者；
 * 会话管理（新建 / 打开 / 重命名 / 删除）与历史回铺都在 `AiInputArea.vue` 里。
 *
 * 本文件保留为空壳只为避免旧分支产生 import 报错，请勿再往这里加逻辑。
 */
export {};
