import { ref } from "vue";

/**
 * 右侧聊天详情面板是否正在显示。
 *
 * 聊天面板独立于路由：切到设置 / 联系人 / 归档等栏目时只替换左侧列表，
 * 右侧仍然保留对话（见 HomeView 的 showActiveChat）。因此「聊天是否打开」
 * 不能用 route.path 推断——在 /home/settings 这类路由下会被判成未打开，
 * 侧栏于是再渲染一份播放器入口，与对话顶部的那份重复。
 *
 * 唯一决定聊天面板挂载与否的是 HomeView，由它调用 setChatPaneVisible 同步。
 */
export const chatPaneVisible = ref(false);

export function setChatPaneVisible(visible: boolean) {
    chatPaneVisible.value = visible;
}
