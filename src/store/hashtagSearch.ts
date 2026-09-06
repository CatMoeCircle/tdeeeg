import { ref } from 'vue';

/**
 * 跨组件「点击 #标签 → 激活聊天内搜索」的轻量单例。
 *
 * 深层消息组件（如 MessageTextContent / MessageFileContent caption）点击
 * 话题标签（textEntityTypeHashtag）时，调用 `requestHashtagSearch(tag)` 把
 * 要搜索的标签写入响应式队列；ChatDetail/index.vue watch 该值并打开搜索栏
 * 且预填该标签。消费完成后调用方需 `clearPendingHashtag()` 清空，防止重复触发。
 */
const pendingHashtag = ref<string | null>(null);

/** 请求打开聊天内搜索并搜索某标签（文本形如 #tag） */
export function requestHashtagSearch(hashtag: string): void {
    pendingHashtag.value = hashtag;
}

/** 读取待搜索的标签（供消费方读取/清空） */
export function useHashtagSearch() {
    return { pendingHashtag };
}

/** 清空待搜索标签（消费完成后调用） */
export function clearPendingHashtag(): void {
    pendingHashtag.value = null;
}
