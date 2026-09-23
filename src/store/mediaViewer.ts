import { ref } from "vue";
import type { MediaViewerItem } from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";
import { tdlibSend } from "../utils/tdlib";
import type { message, SearchMessagesFilter$Input } from "tdlib-types";

/** 媒体查看器打开状态，供 TitleBar 等组件感知以调整样式 */
export const isMediaViewerActive = ref(false);

// 查看器状态
const viewerVisible = ref(false);
const viewerIndex = ref(0);
const viewerInitialTime = ref(0);
const viewerItems = ref<MediaViewerItem[]>([]);
/** 当前查看的视频所属消息 ID，用于关闭时同步时长 */
const viewerCurrentMsgId = ref(0);

/** 打开代次：关闭/重开后丢弃过期的 fetchNearbyMedia 结果 */
let openSeq = 0;

export function getViewerState() {
    return { viewerVisible, viewerIndex, viewerInitialTime, viewerItems, viewerCurrentMsgId };
}

/**
 * 打开媒体查看器。
 *
 * @param initialItem 初始定位的媒体项
 * @param initialTime 视频初始播放进度
 * @param siblingItems 已知同组媒体（如相册 media_group 全部消息），立刻可左右切换；
 *                     随后仍会异步按类型拉取附近媒体扩展列表
 */
export async function openMediaViewer(
    initialItem: MediaViewerItem,
    initialTime = 0,
    siblingItems?: MediaViewerItem[],
) {
    const msg = initialItem.message;
    if (!msg) return;

    const seq = ++openSeq;
    const targetId = initialItem.messageId ?? msg.id;

    if (siblingItems && siblingItems.length > 0) {
        const sorted = [...siblingItems].sort((a, b) => (a.messageId ?? 0) - (b.messageId ?? 0));
        viewerItems.value = sorted;
        const idx = sorted.findIndex(i => (i.messageId ?? 0) === targetId);
        viewerIndex.value = idx >= 0 ? idx : 0;
    } else {
        viewerItems.value = [initialItem];
        viewerIndex.value = 0;
    }
    viewerInitialTime.value = initialTime;
    viewerCurrentMsgId.value = msg.id;
    viewerVisible.value = true;
    isMediaViewerActive.value = true;

    // 异步获取附近同类媒体
    void fetchNearbyMedia(initialItem, msg, seq);
}

function pickDefined<T extends object>(obj: T): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null && v !== '') out[k] = v;
    }
    return out as Partial<T>;
}

/**
 * 异步获取附近同类媒体，**按消息列表方式插入**到当前项前后：
 * - 更旧 → 插到列表前部，不改动已有相对顺序
 * - 更新 → 插到列表后部
 * - 当前项下标按「前面插入了几条」平移，画面不跳、不整表重排
 */
async function fetchNearbyMedia(initialItem: MediaViewerItem, targetMsg: message, seq: number) {
    const chatId = targetMsg.chat_id;
    const content = targetMsg.content;

    // 根据消息内容类型选择过滤器
    let filter: SearchMessagesFilter$Input;
    if (content._ === 'messagePhoto') {
        filter = { _: 'searchMessagesFilterPhoto' };
    } else if (content._ === 'messageVideo') {
        filter = { _: 'searchMessagesFilterVideo' };
    } else if (content._ === 'messageAnimation') {
        filter = { _: 'searchMessagesFilterAnimation' };
    } else {
        return;
    }

    try {
        // TDLib searchChatMessages 语义（结果恒为逆序，message_id 递减）：
        // - offset=0：从 from_message_id（含）向更旧消息返回
        // - offset=-K：返回该消息及更新的若干条；此时 limit 必须 > K，否则直接报错
        // 因此旧消息用 offset=0，新消息用 offset=-50 + limit=51。
        const [olderRes, newerRes] = await Promise.all([
            tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatId,
                query: '',
                filter: filter as any,
                from_message_id: targetMsg.id,
                offset: 0,
                limit: 50,
            }) as Promise<{ messages: message[] }>,
            tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatId,
                query: '',
                filter: filter as any,
                from_message_id: targetMsg.id,
                offset: -50,
                limit: 51,
            }) as Promise<{ messages: message[] }>,
        ]);

        if (seq !== openSeq || !viewerVisible.value) return;

        const buildItem = (r: message): MediaViewerItem => {
            const c = r.content;
            let thumb = '';
            if (c._ === 'messagePhoto' && c.photo.minithumbnail?.data) thumb = `data:image/jpeg;base64,${c.photo.minithumbnail.data}`;
            else if (c._ === 'messageVideo') thumb = `data:image/jpeg;base64,${c.video.minithumbnail?.data || c.cover?.minithumbnail?.data || ''}`;
            else if (c._ === 'messageAnimation' && c.animation.minithumbnail?.data) thumb = `data:image/jpeg;base64,${c.animation.minithumbnail.data}`;
            const duration = c._ === 'messageVideo' ? c.video.duration : undefined;
            return { messageId: r.id, chatId: r.chat_id, topicId: initialItem.topicId, message: r, thumb, duration };
        };

        const current = viewerItems.value;
        const existingIds = new Set(current.map(i => i.messageId ?? i.message?.id).filter((x): x is number => x != null));
        const targetId = initialItem.messageId ?? targetMsg.id;

        // 更旧：升序收集「当前列表里还没有的」
        const olderNew: MediaViewerItem[] = [];
        for (const r of [...olderRes.messages].reverse()) {
            if (r.id === targetId || existingIds.has(r.id)) continue;
            olderNew.push(buildItem(r));
            existingIds.add(r.id);
        }
        // 更新：逆序结果反转成升序，同样只收新 id
        const newerNew: MediaViewerItem[] = [];
        for (const r of [...newerRes.messages].reverse()) {
            if (r.id === targetId || existingIds.has(r.id)) continue;
            newerNew.push(buildItem(r));
            existingIds.add(r.id);
        }

        // 保持已有项顺序不动：更旧插前、更新插后
        const next = [...olderNew, ...current, ...newerNew];

        // 初始项字段补全（readyPath/file/sender…），只原地合并，不挪位置
        for (let i = 0; i < next.length; i++) {
            if ((next[i].messageId ?? 0) === targetId) {
                next[i] = {
                    ...next[i],
                    ...pickDefined(initialItem),
                    messageId: targetId,
                    chatId: initialItem.chatId ?? targetMsg.chat_id,
                    message: initialItem.message ?? next[i].message,
                };
                break;
            }
        }

        // 前面插入 N 条 → 当前下标 +N，画面仍停在同一条
        const prepended = olderNew.length;
        if (prepended > 0 || newerNew.length > 0) {
            viewerItems.value = next;
            viewerIndex.value = Math.max(0, viewerIndex.value + prepended);
        }
    } catch (e) {
        console.warn('[MediaViewer] fetchNearbyMedia failed:', e);
    }
}

/** 关闭查看器 */
export function closeMediaViewer() {
    openSeq++;
    viewerVisible.value = false;
    isMediaViewerActive.value = false;
}
