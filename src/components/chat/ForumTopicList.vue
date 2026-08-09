<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <!-- Header -->
        <div class="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <button type="button" @click="goBack"
                class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0 -ml-1"
                aria-label="返回">
                <ArrowLeftIcon class="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div class="flex items-center gap-3 ml-2 min-w-0">
                <div class="w-10 h-10 shrink-0">
                    <Avatar v-if="chat" :photo="chat.photo" :title="chat.title" sizeClass="!w-10 !h-10" square
                        :accentColorId="(chat as any).profile_accent_color_id" />
                    <div v-else class="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                </div>
                <div class="flex flex-col min-w-0">
                    <h2 class="font-semibold text-lg text-gray-800 dark:text-gray-100 leading-tight truncate">
                        <GlobalEmojiText :text="chat?.title || '话题'" />
                    </h2>
                    <span class="text-xs text-gray-400 truncate">{{ topics.length }} 个话题</span>
                </div>
            </div>
        </div>

        <!-- Topic List -->
        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <!-- Loading -->
            <div v-if="loading" class="flex flex-col gap-2 p-4">
                <div v-for="n in 6" :key="n" class="flex items-center gap-3 p-3">
                    <div class="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                    <div class="flex-1">
                        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2 animate-pulse"></div>
                        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
                    </div>
                </div>
            </div>

            <!-- Empty -->
            <div v-else-if="topics.length === 0 && !loading"
                class="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageCircleIcon class="w-12 h-12 mb-3 opacity-50" />
                <p class="text-sm">暂无话题</p>
            </div>

            <!-- Topics -->
            <div v-else class="py-2">
                <button v-for="topic in topics" :key="topic.info.forum_topic_id" type="button"
                    @click="selectTopic(topic.info.forum_topic_id)"
                    class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                    <!-- Topic Icon -->
                    <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-lg font-bold"
                        :style="{ backgroundColor: topicIconColor(topic.info.icon.color) }">
                        {{ topicNameInitial(topic.info.name) }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-baseline mb-0.5">
                            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                <GlobalEmojiText :text="topic.info.name" />
                                <span v-if="topic.info.is_closed" class="text-xs text-gray-400 ml-1">[已关闭]</span>
                            </h3>
                            <span class="text-xs text-gray-400 ml-2 shrink-0">{{ formatTime(topic.last_message?.date)
                                }}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <p class="flex-1 min-w-0 text-xs text-gray-500 truncate"><GlobalEmojiText :text="getTopicPreview(topic)" /></p>
                            <span v-if="topic.unread_count > 0"
                                class="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-[11px] font-semibold leading-5 text-center">
                                {{ formatUnreadCount(topic.unread_count) }}
                            </span>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftIcon, MessageCircleIcon } from 'lucide-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import type { chat, forumTopic, forumTopics, supergroup } from 'tdlib-types';
import Avatar from './avatar.vue';
import GlobalEmojiText from '../common/GlobalEmojiText.vue';
const route = useRoute();
const router = useRouter();

const chatId = computed(() => {
    const id = route.params.id;
    return id ? parseInt(id as string) : undefined;
});

const chat = ref<chat | undefined>(undefined);
const supergroupInfo = ref<supergroup | undefined>(undefined);
const topics = ref<forumTopic[]>([]);
const loading = ref(true);

// Pagination state
let nextOffsetDate = 0;
let nextOffsetMessageId = 0;
let nextOffsetForumTopicId = 0;
let hasMore = true;

async function loadTopics(loadMore = false) {
    if (!chatId.value) return;
    if (loadMore && !hasMore) return;

    loading.value = !loadMore;

    try {
        const result = await tdlibSend({
            _: 'getForumTopics',
            chat_id: chatId.value,
            offset_date: loadMore ? nextOffsetDate : 0,
            offset_message_id: loadMore ? nextOffsetMessageId : 0,
            offset_forum_topic_id: loadMore ? nextOffsetForumTopicId : 0,
            limit: 50,
        }) as forumTopics;

        if (loadMore) {
            topics.value = [...topics.value, ...result.topics];
        } else {
            topics.value = result.topics;
        }

        nextOffsetDate = result.next_offset_date;
        nextOffsetMessageId = result.next_offset_message_id;
        nextOffsetForumTopicId = result.next_offset_forum_topic_id;
        hasMore = result.topics.length > 0 && topics.value.length < result.total_count;
    } catch (e) {
        console.error('Failed to load forum topics:', e);
    } finally {
        loading.value = false;
    }
}

onMounted(async () => {
    if (!chatId.value) return;

    try {
        const chatData = await tdlibSend({ _: 'getChat', chat_id: chatId.value }) as chat;
        chat.value = chatData;

        // 获取 supergroup 信息以检查 is_forum
        if (chatData.type?._ === 'chatTypeSupergroup') {
            const sg = await tdlibSend({
                _: 'getSupergroup',
                supergroup_id: chatData.type.supergroup_id,
            }) as supergroup;
            supergroupInfo.value = sg;
        }
    } catch (e) {
        console.error('Failed to load chat:', e);
    }

    await loadTopics();
});

onUnmounted(() => {
    // cleanup
});

function goBack() {
    router.push('/home/chats');
}

function selectTopic(topicId: number) {
    if (!chatId.value) return;
    router.push(`/home/chat/${chatId.value}/topics/${topicId}`);
}

const topicIconColors: Record<number, string> = {
    0x6FB9F0: '#6FB9F0',
    0xFFD67E: '#FFD67E',
    0xCB86DB: '#CB86DB',
    0x8EEE98: '#8EEE98',
    0xFF93B2: '#FF93B2',
    0xFB6F5F: '#FB6F5F',
};

function topicIconColor(color: number): string {
    return topicIconColors[color] || '#6FB9F0';
}

function topicNameInitial(name: string): string {
    return name.substring(0, 1).toUpperCase() || '#';
}

function formatTime(timestamp: number | undefined): string {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    }
    return date.toLocaleDateString();
}

function formatUnreadCount(count: number): string {
    return count > 99 ? '99+' : count.toString();
}

function getTopicPreview(topic: forumTopic): string {
    const msg = topic.last_message;
    if (!msg) return '';

    const content = msg.content;
    if (!content) return '';

    if (content._ === 'messageText') {
        return content.text.text;
    }
    if (content._ === 'messagePhoto') {
        return content.caption.text || '[图片]';
    }
    if (content._ === 'messageVideo') {
        return content.caption.text || '[视频]';
    }
    if (content._ === 'messageAnimation') {
        return content.caption.text || '[GIF]';
    }
    if (content._ === 'messageDocument') {
        return content.caption.text || `[文件] ${content.document.file_name}`.trim();
    }
    if (content._ === 'messageSticker') {
        return `${content.sticker.emoji || ''} [贴纸]`.trim();
    }
    if (content._ === 'messageVoiceNote') {
        return '[语音]';
    }
    if (content._ === 'messageAudio') {
        return content.caption.text || `[音乐] ${content.audio.title || content.audio.file_name}`.trim();
    }
    if (content._ === 'messageVideoNote') {
        return '[视频消息]';
    }
    return '[消息]';
}
</script>

<style scoped></style>
