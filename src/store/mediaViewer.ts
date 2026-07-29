import { ref, reactive } from "vue";
import type { MediaViewerItem } from "../components/chat/ChatDetail/MessageContent/MediaViewer.vue";

/** 媒体查看器打开状态，供 TitleBar 等组件感知以调整样式 */
export const isMediaViewerActive = ref(false);

// ==================== 全局媒体注册表 ====================
// 以消息 ID 为 key 注册每条消息的媒体项，用于全对话媒体导航
const itemsByMsgId = reactive(new Map<number, MediaViewerItem>());

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

/** 注册或更新某条消息的媒体项 */
export function registerMediaItem(msgId: number, item: MediaViewerItem) {
    const existing = itemsByMsgId.get(msgId);
    if (!existing || existing.src !== item.src || existing.type !== item.type) {
        itemsByMsgId.set(msgId, item);
    }
}

/** 移除某条消息的媒体项 */
export function unregisterMediaItem(msgId: number) {
    itemsByMsgId.delete(msgId);
}

/** 打开查看器，定位到指定消息的媒体 */
export function openMediaViewer(targetMsgId: number, subIndex = 0, initialTime = 0) {
    const sortedIds = [...itemsByMsgId.keys()].sort((a, b) => a - b);
    viewerItems.value = sortedIds.map((id) => itemsByMsgId.get(id)!);

    const idx = sortedIds.indexOf(targetMsgId);
    viewerIndex.value = Math.max(0, idx) + subIndex;
    viewerInitialTime.value = initialTime;
    viewerCurrentMsgId.value = targetMsgId;
    viewerVisible.value = true;
    isMediaViewerActive.value = true;
}

/** 关闭查看器 */
export function closeMediaViewer() {
    viewerVisible.value = false;
    isMediaViewerActive.value = false;
}
