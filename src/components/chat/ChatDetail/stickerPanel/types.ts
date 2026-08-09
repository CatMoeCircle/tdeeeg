import { ref } from 'vue';
import type { chat } from 'tdlib-types';

/** 面板 Tab 类型 */
export type StickerPanelTab = 'emoji' | 'gif' | 'sticker';

/** 面板默认设置（可从 settings store 覆盖） */
export interface StickerPanelConfig {
    /** 是否启用悬停打开 */
    openOnHover: boolean;
    /** 皮肤色调 0-6 */
    skinTone: number;
}

/**
 * 表情包面板的共享响应式状态。
 *
 * 由于面板由输入框按钮触发、但在 ChatDetail 内部渲染，子抽屉（Emoji/Gif/Sticker）
 * 需要在一个共享 store 中读取「是否打开 / 激活哪个 Tab / 当前会话」等状态。
 * 发送动作通过注入的 onSelectMedia / onSelectEmoji 回调回传给 ChatDetail 统一处理。
 */
export const stickerPanelState = ref<{
    /** 面板是否打开 */
    open: boolean;
    /** 当前激活 Tab */
    tab: StickerPanelTab;
    /** 当前会话（用于发送与权限） */
    chat: chat | undefined;
    /** 是否拥有 Premium */
    isPremium: boolean;
    /** 会话是否允许发基本消息 */
    canSendBasic: boolean;
    /** 会话是否允许发贴纸/GIF */
    canSendOther: boolean;
    /** 点击普通 emoji 的回调（插入输入框） */
    onPickEmoji: ((emoji: string) => void) | null;
    /** 点击自定义 emoji 的回调（插入富文本） */
    onPickCustomEmoji: ((id: string) => void) | null;
    /** 点击贴纸的回调（发送） */
    onPickSticker: ((stickerId: string) => void) | null;
    /** 点击动画/GIF 的回调（发送） */
    onPickAnimation: ((fileId: number, stickerId: string) => void) | null;
}>({
    open: false,
    tab: 'emoji',
    chat: undefined,
    isPremium: false,
    canSendBasic: true,
    canSendOther: true,
    onPickEmoji: null,
    onPickCustomEmoji: null,
    onPickSticker: null,
    onPickAnimation: null,
});

/** 打开面板并切换到指定 Tab */
export function openStickerPanel(tab: StickerPanelTab) {
    stickerPanelState.value.open = true;
    stickerPanelState.value.tab = tab;
}

/** 关闭面板 */
export function closeStickerPanel() {
    stickerPanelState.value.open = false;
}
