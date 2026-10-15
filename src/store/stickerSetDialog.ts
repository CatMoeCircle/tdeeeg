import { ref } from 'vue';

/**
 * 贴纸 / 自定义表情的所属贴纸包信息弹窗状态（参考 Unigram StickersPopup）。
 * 点击对话中的贴纸或自定义表情时打开，由 ChatDetail 全局挂载一个实例。
 */
export const stickerSetDialogState = ref<{ open: boolean; setId: string }>({ open: false, setId: '' });

/** 打开指定贴纸包信息；setId 为 0 / 空时（无所属包）忽略 */
export function openStickerSetDialog(setId: string | number | undefined | null) {
    const id = setId == null ? '' : String(setId);
    if (!id || id === '0') return;
    stickerSetDialogState.value = { open: true, setId: id };
}

export function closeStickerSetDialog() {
    stickerSetDialogState.value = { ...stickerSetDialogState.value, open: false };
}
