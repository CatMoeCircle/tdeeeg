import { defineStore } from 'pinia';
import { ref } from 'vue';
import { stat } from '@tauri-apps/plugin-fs';

/** 附件最终发送类型 */
export type AttachmentKind = 'photo' | 'video' | 'animation' | 'document' | 'audio';

/** 待发送附件项 */
export interface AttachmentItem {
    id: string;
    /** 本地绝对路径（TDLib inputFileLocal 使用） */
    path: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
    size: number;
    kind: AttachmentKind;
    /** 是否为粘贴位图写入的临时文件（发送后需要清理） */
    tempFile?: boolean;
    width?: number;
    height?: number;
    duration?: number;
    /** 探针失败（无法解码）时为 true */
    probeFailed?: boolean;
    /** 该文件单独的描述（相册中各文件可单独添加） */
    caption?: string;
    /** 该文件的自定义封面（本地绝对路径，音乐/视频/文档可设置） */
    cover?: string;
}

let uid = 0;
function nextId(): string {
    uid += 1;
    return `att-${Date.now()}-${uid}`;
}

export const useAttachmentStore = defineStore('attachment', () => {
    const items = ref<AttachmentItem[]>([]);

    function add(item: Omit<AttachmentItem, 'id'>): AttachmentItem {
        const full: AttachmentItem = { id: nextId(), ...item };
        items.value.push(full);
        return full;
    }

    function remove(id: string) {
        const idx = items.value.findIndex((i) => i.id === id);
        if (idx === -1) return;
        const [removed] = items.value.splice(idx, 1);
        if (removed?.tempFile) cleanupTempFile(removed.path).catch(() => { });
    }

    function clear() {
        items.value = [];
    }

    /** 清空并清理所有临时文件 */
    async function clearWithCleanup() {
        const temps = items.value.filter((i) => i.tempFile).map((i) => i.path);
        items.value = [];
        await Promise.allSettled(temps.map((p) => cleanupTempFile(p)));
    }

    function setKind(id: string, kind: AttachmentKind) {
        const it = items.value.find((i) => i.id === id);
        if (it) it.kind = kind;
    }

    function setMetadata(id: string, meta: { width?: number; height?: number; duration?: number; probeFailed?: boolean }) {
        const it = items.value.find((i) => i.id === id);
        if (!it) return;
        if (meta.width !== undefined) it.width = meta.width;
        if (meta.height !== undefined) it.height = meta.height;
        if (meta.duration !== undefined) it.duration = meta.duration;
        if (meta.probeFailed !== undefined) it.probeFailed = meta.probeFailed;
    }

    function setCaption(id: string, caption: string) {
        const it = items.value.find((i) => i.id === id);
        if (it) it.caption = caption;
    }

    /** 设置/清除某附件的封面（cover 传 null 或空字符串则清除） */
    function setCover(id: string, cover: string | null) {
        const it = items.value.find((i) => i.id === id);
        if (!it) return;
        it.cover = cover ? cover : undefined;
    }

    /** 拖拽重排：把 fromId 移动到 toId 的位置 */
    function reorder(fromId: string, toId: string) {
        const list = items.value;
        const fromIdx = list.findIndex((i) => i.id === fromId);
        const toIdx = list.findIndex((i) => i.id === toId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
    }

    return { items, add, remove, clear, clearWithCleanup, setKind, setMetadata, setCaption, setCover, reorder };
});

/** 删除临时文件（幂等，失败静默） */
async function cleanupTempFile(path: string) {
    try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path);
    } catch {
        // 静默
    }
}

/** 获取本地文件大小（字节） */
export async function getFileSize(path: string): Promise<number> {
    try {
        const info = await stat(path);
        return info.size;
    } catch {
        return 0;
    }
}
