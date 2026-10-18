import { computed } from 'vue';
import type { formattedText, message } from 'tdlib-types';

/**
 * 相册内容公共逻辑（图片/视频相册与文件相册共用）：
 * - caption 仅当恰好一条成员带非空描述时显示；
 * - 时间/发送状态/观看量取相册最后一条消息。
 *
 * @param messages - 返回相册消息数组的 getter（保持响应式）
 */
export function useAlbumContent(messages: () => message[]) {
    const captionedMessages = computed(() =>
        messages().filter((m) => {
            const c = m.content;
            return 'caption' in c && !!c.caption?.text;
        }),
    );

    const captionFormatted = computed<formattedText>(() => {
        if (captionedMessages.value.length !== 1) {
            return { _: 'formattedText', text: '', entities: [] };
        }
        const c = captionedMessages.value[0].content;
        if ('caption' in c && c.caption) return c.caption;
        return { _: 'formattedText', text: '', entities: [] };
    });

    const captionText = computed(() => captionFormatted.value.text);

    const lastMsg = computed(() => {
        const list = messages();
        return list[list.length - 1];
    });
    const lastDate = computed(() => lastMsg.value?.date || 0);
    const lastSendingState = computed(() => lastMsg.value?.sending_state);
    const lastViewCount = computed(() => lastMsg.value?.interaction_info?.view_count);

    return {
        captionedMessages,
        captionFormatted,
        captionText,
        lastMsg,
        lastDate,
        lastSendingState,
        lastViewCount,
    };
}
