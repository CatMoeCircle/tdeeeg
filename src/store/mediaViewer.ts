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

export function getViewerState() {
    return { viewerVisible, viewerIndex, viewerInitialTime, viewerItems, viewerCurrentMsgId };
}

/**
 * 打开媒体查看器：仅传入一个初始媒体项，异步使用 SearchChatMessages
 * 以当前消息为中心取附近 100 条同类型媒体补齐列表。
 */
export async function openMediaViewer(
    initialItem: MediaViewerItem,
    initialTime = 0,
) {
    const msg = initialItem.message;
    if (!msg) return;

    // 立即显示初始项
    viewerItems.value = [initialItem];
    viewerIndex.value = 0;
    viewerInitialTime.value = initialTime;
    viewerCurrentMsgId.value = msg.id;
    viewerVisible.value = true;
    isMediaViewerActive.value = true;

    // 异步获取附近同类媒体
    void fetchNearbyMedia(initialItem, msg);
}

/** 异步获取附近同类媒体并插入列表 */
async function fetchNearbyMedia(initialItem: MediaViewerItem, targetMsg: message) {
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
        // 以 targetMsg.id 为中心获取消息：offset<0 取较旧的，offset>0 取较新的
        const [olderRes, newerRes] = await Promise.all([
            tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatId,
                query: '',
                filter: filter as any,
                from_message_id: targetMsg.id,
                offset: -50,
                limit: 50,
            }) as Promise<{ messages: message[] }>,
            tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatId,
                query: '',
                filter: filter as any,
                from_message_id: targetMsg.id,
                offset: 0,
                limit: 50,
            }) as Promise<{ messages: message[] }>,
        ]);

        // 合并、去重（保留初始项的 senderName/captionFormatted/file）
        const existingIds = new Set(initialItem.message ? [initialItem.message.id] : []);
        const merged: MediaViewerItem[] = [];

        const buildItem = (r: message): MediaViewerItem => {
            const c = r.content;
            let thumb = '';
            if (c._ === 'messagePhoto' && c.photo.minithumbnail?.data) thumb = `data:image/jpeg;base64,${c.photo.minithumbnail.data}`;
            else if (c._ === 'messageVideo') thumb = `data:image/jpeg;base64,${c.video.minithumbnail?.data || c.cover?.minithumbnail?.data || ''}`;
            else if (c._ === 'messageAnimation' && c.animation.minithumbnail?.data) thumb = `data:image/jpeg;base64,${c.animation.minithumbnail.data}`;
            const duration = c._ === 'messageVideo' ? c.video.duration : undefined;
            return { messageId: r.id, chatId: r.chat_id, topicId: initialItem.topicId, message: r, thumb, duration };
        };

        // 旧消息需要反转（searchChatMessages 返回最新在前）
        const reversedOlder = [...olderRes.messages].reverse();
        for (const r of reversedOlder) {
            if (existingIds.has(r.id)) continue;
            existingIds.add(r.id);
            merged.push(buildItem(r));
        }
        for (const r of newerRes.messages) {
            if (existingIds.has(r.id)) continue;
            existingIds.add(r.id);
            merged.push(buildItem(r));
        }

        // 按消息 ID 升序排列
        merged.sort((a, b) => (a.messageId ?? 0) - (b.messageId ?? 0));

        // 在正确位置插入初始项（保留其 senderName/captionFormatted/file）
        const targetIdx = merged.findIndex(i => i.messageId === targetMsg.id);
        if (targetIdx >= 0) {
            merged.splice(targetIdx, 0, initialItem);
        } else {
            merged.unshift(initialItem);
        }

        viewerItems.value = merged;
        // 定位到目标消息
        const idx = merged.findIndex(i => i.messageId === targetMsg.id);
        if (idx >= 0) viewerIndex.value = idx;
    } catch (e) {
        console.warn('[MediaViewer] fetchNearbyMedia failed:', e);
    }
}

/** 关闭查看器 */
export function closeMediaViewer() {
    viewerVisible.value = false;
    isMediaViewerActive.value = false;
}
