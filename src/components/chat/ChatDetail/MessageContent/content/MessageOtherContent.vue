<template>
    <div>
        <!-- Location -->
        <!-- 位置地图：TDLib 生成的地图缩略图，中间叠加定位针（针尖位于地图中心，同 Unigram）；未加载时为纯色占位 -->
        <button v-if="content._ === 'messageLocation'" type="button"
            class="relative block w-80 max-w-full aspect-[8/5] overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800"
            @click="openLocation">
            <img v-if="mapSrc" :src="mapSrc" alt="" class="h-full w-full object-cover" />
            <!-- 定位针：红色 MapPin + 头部中心白色实心圆，针尖落在地图中心 -->
            <span class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full items-center justify-center">
                <MapPinIcon class="h-10 w-10 fill-red-500 text-red-500" />
                <span class="absolute h-3.5 w-3.5 rounded-full bg-white" style="top: 9px;"></span>
            </span>
        </button>

        <!-- Venue -->
        <div v-else-if="content._ === 'messageVenue'" class="flex flex-col gap-1 text-sm">
            <div class="flex items-center gap-2">
                <MapPinIcon class="w-4 h-4 text-red-500 shrink-0" />
                <span class="font-medium">{{ content.venue.title }}</span>
            </div>
            <span class="text-gray-500 text-xs ml-6">{{ content.venue.address }}</span>
        </div>

        <!-- Contact -->
        <div v-else-if="content._ === 'messageContact'" class="flex items-center gap-2 text-sm">
            <PhoneIcon class="w-4 h-4 text-green-500 shrink-0" />
            <div class="flex flex-col">
                <span class="font-medium">{{ content.contact.first_name }} {{ content.contact.last_name }}</span>
                <span class="text-xs text-gray-500">{{ content.contact.phone_number }}</span>
            </div>
        </div>

        <!-- Poll -->
        <MessagePollContent v-else-if="content._ === 'messagePoll'" :content="content" :chat-id="chatId"
            :message-id="messageId" />

        <!-- Game -->
        <div v-else-if="content._ === 'messageGame'" class="text-sm">
            <p class="font-medium">{{ content.game.title }}</p>
            <p class="text-xs text-gray-500">{{ content.game.description }}</p>
        </div>

        <!-- Invoice -->
        <MessageInvoiceContent v-else-if="content._ === 'messageInvoice'" :content="content" :chat-id="chatId"
            :message-id="messageId" :message="message" :topic-id="topicId" :sender-name="senderName" />

        <!-- Call -->
        <div v-else-if="content._ === 'messageCall'" class="flex items-center gap-2 text-sm">
            <component :is="content.is_video ? VideoIcon : PhoneIcon" class="w-4 h-4 shrink-0"
                :class="content.is_video ? 'text-green-500' : 'text-blue-500'" />
            <span>{{ content.is_video ? t('service.videoCall') : t('lng_settings_notifications_calls_title') }}</span>
        </div>

        <!-- 未适配的消息类型：统一走卡片，不再用斜体红字兜底 -->
        <MessageUnsupportedContent v-else :content="content" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { ref, watch } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MessageContent, message } from 'tdlib-types';
import { MapPinIcon, PhoneIcon, VideoIcon } from 'lucide-vue-next';
import { ensureLocalFilePath, tdlibSend } from '../../../../../utils/tdlib';
import MessagePollContent from './MessagePollContent.vue';
import MessageInvoiceContent from './MessageInvoiceContent.vue';
import MessageUnsupportedContent from './MessageUnsupportedContent.vue';
import { confirmAndOpenExternalLink } from '../../../../../utils/openExternalLink';
// GlobalEmojiInline removed - using global Apple Color Emoji font

const props = defineProps<{
    content: MessageContent;
    chatId?: number;
    messageId?: number;
    message?: message;
    topicId?: number;
    senderName?: string;
}>();

/** 位置地图缩略图（asset 地址），未就绪时为空 */
const mapSrc = ref('');

/**
 * 通过 getMapThumbnailFile 取地图 PNG（与 Unigram ImageView 一致），
 * 尺寸按设备像素比取 scale（1-3），下载完成后再显示。
 */
watch(
    () => props.content,
    async (c) => {
        mapSrc.value = '';
        if (c._ !== 'messageLocation') return;
        try {
            const scale = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
            const file = await tdlibSend({
                _: 'getMapThumbnailFile',
                location: c.location,
                zoom: 14,
                width: 320,
                height: 200,
                scale,
                chat_id: props.chatId ?? 0,
            });
            const path = await ensureLocalFilePath(file);
            // 期间消息已切换则丢弃结果
            if (path && props.content === c) mapSrc.value = convertFileSrc(path);
        } catch (e) {
            console.error('Load location map failed:', e);
        }
    },
    { immediate: true },
);

/** 点击位置卡片：在浏览器中打开 Google 地图搜索该坐标（外链需先经过确认弹窗） */
function openLocation() {
    const c = props.content;
    if (c._ !== 'messageLocation') return;
    const { latitude, longitude } = c.location;
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    // 用户取消确认时 promise 会 reject，这里忽略即可
    void confirmAndOpenExternalLink(url).catch(() => { });
}
</script>
