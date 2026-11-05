import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { remove, stat } from '@tauri-apps/plugin-fs';

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
    /** 发送时以剧透方式遮挡预览（仅图片 / 视频支持） */
    spoiler?: boolean;
}

let uid = 0;
function nextId(): string {
    uid += 1;
    return `att-${Date.now()}-${uid}`;
}

/**
 * 待发送附件的浏览器级缓存（sessionStorage）。
 *
 * 只存元数据（路径 / 类型 / 尺寸 / 描述），文件本身还在磁盘上：
 * webview 刷新、退出聊天再进来，列表都还在；窗口关闭（webview 销毁）随会话消失，
 * 不落 SQLite —— 这是「还没发出去」的临时状态，不该跨进程留。
 */
const STORAGE_KEY = 'tdgram-pending-attachments';

function loadPersistedItems(): AttachmentItem[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((it): it is AttachmentItem => {
            const v = it as AttachmentItem;
            return !!v && typeof v.id === 'string' && typeof v.path === 'string' && typeof v.name === 'string';
        });
    } catch {
        return [];
    }
}

function persistItems(list: AttachmentItem[]) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        // 隐私模式 / 配额不足：忽略，退化成纯内存
    }
}

export const useAttachmentStore = defineStore('attachment', () => {
    const items = ref<AttachmentItem[]>(loadPersistedItems());

    // 元数据随变更落 sessionStorage：刷新 / 重进聊天后列表还在
    watch(items, (list) => persistItems(list), { deep: true });

    /** 恢复后校验文件还在（临时文件可能已被清理 / 用户删了源文件）：不在的条目静默丢掉 */
    async function pruneMissingFiles() {
        if (!items.value.length) return;
        const alive: AttachmentItem[] = [];
        for (const it of items.value) {
            try {
                await stat(it.path);
                alive.push(it);
            } catch {
                // 文件不在了：丢掉这一项（tempFile 也无需清理）
            }
        }
        if (alive.length !== items.value.length) items.value = alive;
    }
    void pruneMissingFiles();

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

    /** 设置/取消某附件的剧透遮挡 */
    function setSpoiler(id: string, spoiler: boolean) {
        const it = items.value.find((i) => i.id === id);
        if (it) it.spoiler = spoiler;
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

    return { items, add, remove, clear, clearWithCleanup, setKind, setMetadata, setCaption, setCover, setSpoiler, reorder };
});

/** 删除临时文件（幂等，失败静默） */
async function cleanupTempFile(path: string) {
    try {
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
