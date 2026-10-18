<template>
    <!-- 相册描述：仅当恰好一条成员带非空描述时显示 -->
    <div v-if="captionText" class="px-2 pt-1.5 msg-body-text">
        <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" />
    </div>
    <!-- 回应：固定在内容与时间/观看量之间 -->
    <slot name="reactions" />
    <!-- 时间状态（图片/视频相册无 caption 时由相册内部悬浮显示，不走这里） -->
    <span v-if="showTime" class="block text-right px-2 pb-1"
        :class="isSelf ? 'text-black/50' : 'text-gray-400'">
        <MessageStatus :date="lastDate" :isOutgoing="isSelf" :sendingState="lastSendingState" :isRead="isRead"
            :viewCount="lastViewCount" :authorSignature="authorSignature" />
    </span>
</template>

<script setup lang="ts">
import type { message } from 'tdlib-types';
import MessageStatus from './MessageStatus.vue';
import MessageTextContent from './MessageTextContent.vue';
import { useAlbumContent } from '../../composables/useAlbumContent';

const props = defineProps<{
    messages: message[];
    isSelf: boolean;
    chatId?: number;
    /** 是否在 footer 底部显示时间/观看量；图片/视频相册无 caption 时为 false（改用媒体悬浮胶囊） */
    showTime: boolean;
    isRead?: boolean;
    authorSignature?: string;
}>();

const { captionText, captionFormatted, lastDate, lastSendingState, lastViewCount } =
    useAlbumContent(() => props.messages);
</script>
