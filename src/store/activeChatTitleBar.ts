import { reactive } from "vue";
import type { chatPhotoInfo, profilePhoto } from "tdlib-types";

/**
 * 轻量级活跃聊天信息存储，供 TitleBar 在 "titlebar" 头像位置模式下读取。
 * 由 ChatDetail 组件在聊天激活/切换/关闭时更新。
 */
export const activeChatTitleBar = reactive({
    /** 当前聊天标题 */
    title: "" as string,
    /** 当前聊天头像 */
    photo: undefined as chatPhotoInfo | profilePhoto | undefined,
    /** 当前聊天状态文本（由 Header.vue 更新） */
    statusText: "" as string,
});

export function updateActiveChatTitleBar(data: {
    title?: string;
    photo?: chatPhotoInfo | profilePhoto;
    statusText?: string;
}) {
    if (data.title !== undefined) activeChatTitleBar.title = data.title;
    if (data.photo !== undefined) activeChatTitleBar.photo = data.photo;
    if (data.statusText !== undefined) activeChatTitleBar.statusText = data.statusText;
}

export function clearActiveChatTitleBar() {
    activeChatTitleBar.title = "";
    activeChatTitleBar.photo = undefined;
    activeChatTitleBar.statusText = "";
}
