<template>
    <!--
        转发的动态（messageStory）：按「带文案的视频消息」排布——无内边距气泡内依次是
            已转发的动态            ← 顶部标签
            [头像] 发布者名称       ← 动态来自哪个对话
            [动态封面 9:16，右下角时间]
            动态文案
        点击封面打开动态播放器。
    -->
    <div class="message-story relative w-[176px] max-w-full">
        <!-- 回复预览（与媒体消息一致：放在媒体容器内，避免撑宽气泡） -->
        <MessageReply v-if="replyTo" :replyTo="replyTo" :isSelf="isSelf" :chatId="chatId" :messageList="messageList"
            :accentColorId="accentColorId" @jump="(id) => emit('jumpToMessage', id)" />

        <!-- 头部：已转发的动态 + 发布者头像/对话名称 -->
        <div class="px-2 pt-1.5 pb-1">
            <span class="block text-[11px] font-medium leading-none" :style="accentTextStyle">
                {{ t('content.forwardedStory') }}
            </span>
            <button v-if="posterChat" type="button"
                class="mt-1 flex min-w-0 max-w-full items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                :aria-label="posterName" @click.stop="openPosterChat">
                <Avatar :photo="posterChat.photo" :title="posterName" :first-name="posterNames.first"
                    :last-name="posterNames.last" :accent-color-id="posterAccentId" sizeClass="!w-5 !h-5" />
                <span class="min-w-0 truncate text-xs font-semibold" :style="accentTextStyle">
                    <GlobalEmojiText :text="posterName" />
                </span>
            </button>
        </div>

        <!-- 动态封面（照片/视频）：点击打开动态播放器。圆角由气泡裁切，与视频消息一致 -->
        <div class="relative w-full select-none overflow-hidden bg-black/10 dark:bg-white/10"
            :class="story ? 'cursor-pointer' : 'cursor-default'" :style="cardStyle" @click.stop="openStory">
            <!-- minithumbnail 先垫底，缩略图就绪后覆盖 -->
            <img v-if="miniSrc" :src="miniSrc" alt="" class="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />
            <img v-if="coverSrc" :src="coverSrc" alt="" class="absolute inset-0 h-full w-full object-cover" />
            <span v-if="!coverSrc" class="absolute inset-0 flex items-center justify-center">
                <LoaderIndicator v-if="loading" size="28" color="#9ca3af" />
                <span v-else-if="!story" class="px-2 text-center text-xs text-gray-500 dark:text-gray-400">
                    {{ t('lng_forwarded_story_expired') }}
                </span>
            </span>
            <!-- 播放提示 -->
            <span v-if="story" class="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-black/45">
                    <PlayIcon class="h-4 w-4 translate-x-px text-white" fill="currentColor" />
                </span>
            </span>
            <!-- 时间：媒体风格压在封面右下角 -->
            <div v-if="date"
                class="absolute right-1.5 bottom-1.5 bg-black/60 text-white px-1.5 py-0.5 rounded-md leading-none select-none pointer-events-none flex items-center">
                <MessageStatus :date="date" :isOutgoing="isSelf" :sendingState="sendingState" :isRead="isRead"
                    :viewCount="viewCount" :authorSignature="authorSignature" overMedia />
            </div>
        </div>

        <!-- 动态文案 -->
        <div v-if="story?.caption?.text" class="caption-text msg-body-text px-2 pt-1 pb-1.5">
            <MessageTextContent :formattedText="story.caption" :chatId="chatId" />
        </div>

        <!-- 回应 / 译文（与带文案的媒体消息一致：文案与时间之后） -->
        <slot name="reactions" />
        <slot name="translation" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Play as PlayIcon } from 'lucide-vue-next';
import type {
    file,
    message,
    messageReplyToMessage,
    messageStory,
    MessageSendingState,
    story,
} from 'tdlib-types';
import Avatar from '../../../avatar.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';
import LoaderIndicator from '../../../../common/LoaderIndicator';
import MessageReply from './MessageReply.vue';
import MessageStatus from './MessageStatus.vue';
import MessageTextContent from './MessageTextContent.vue';
import { tdlibSend } from '../../../../../utils/tdlib';
import { downloadFileUrl } from '../../../../../utils/profileMedia';
import { isThumbnailImgRenderable } from '../../../../../utils/thumbnail';
import {
    ensureChat,
    getChatProfileAccentColorId,
    getChatTitle,
    getChatUserNames,
    getReactiveChat,
} from '../../../../../utils/senderInfo';
import { openStoryViewer } from '../../../../../store/storyViewer';

/**
 * 转发的动态（messageStory）。内容只有 story_poster_chat_id + story_id，
 * 封面/文案都要 getStory 补全；发布者头像名称走 senderInfo 的对话缓存。
 */
const props = defineProps<{
    content: messageStory;
    isSelf: boolean;
    date?: number;
    sendingState?: MessageSendingState;
    isRead?: boolean;
    viewCount?: number;
    authorSignature?: string;
    chatId?: number;
    replyTo?: messageReplyToMessage;
    messageList?: message[];
    accentColorId?: number;
}>();

const emit = defineEmits<{
    jumpToMessage: [messageId: number];
}>();

const { t } = useI18n();
const router = useRouter();

/** 发布者对话（响应式缓存：getChat 返回后头像/名称自动刷新） */
const posterChatId = computed(() => props.content.story_poster_chat_id);
const posterChat = computed(() => (posterChatId.value ? getReactiveChat(posterChatId.value) : undefined));
const posterName = computed(() => getChatTitle(posterChat.value));
const posterNames = computed(() => getChatUserNames(posterChat.value));
const posterAccentId = computed(() => getChatProfileAccentColorId(posterChat.value));

watch(posterChatId, (id) => { if (id) void ensureChat(id); }, { immediate: true });

/** 标签/名称配色：自己气泡内用浅色，他人用转发行惯用的蓝色 */
const accentTextStyle = computed(() =>
    props.isSelf ? { color: 'rgba(0,0,0,0.55)' } : { color: 'rgb(59,130,246)' },
);

/** 动态为手机竖屏比例 */
const cardStyle = { aspectRatio: '9 / 16' };

const story = ref<story | undefined>(undefined);
const miniSrc = ref('');
const coverSrc = ref('');
const loading = ref(false);

/** 代次守卫：消息内容切换后丢弃过期的异步结果 */
let loadSeq = 0;

watch(() => props.content, (c) => void loadStory(c), { immediate: true });

async function loadStory(c: messageStory) {
    const seq = ++loadSeq;
    story.value = undefined;
    miniSrc.value = '';
    coverSrc.value = '';
    loading.value = true;
    try {
        const st = (await tdlibSend({
            _: 'getStory',
            story_poster_chat_id: c.story_poster_chat_id,
            story_id: c.story_id,
        })) as story;
        if (seq !== loadSeq) return;
        story.value = st;
        miniSrc.value = miniThumbSrc(st);
        const cover = pickCoverFile(st);
        if (!cover) return;
        const url = await downloadFileUrl(cover, `story_${st.poster_chat_id}_${st.id}.jpg`, 'story_cover', {
            tags: ['动态封面', '缩略图', '动态'],
            sourceLabel: posterName.value || undefined,
            // 动态属于发起者的资料页/频道：面板据此跳回去
            sourceKind: 'chat',
            sourceId: st.poster_chat_id ? Number(st.poster_chat_id) : undefined,
        });
        // 期间消息已切换则丢弃结果
        if (seq === loadSeq && url) coverSrc.value = url;
    } catch {
        /* 动态已过期 / 不可用：保持空态，卡片显示「动态已过期」 */
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

/** minithumbnail（base64，无需下载）作为封面占位 */
function miniThumbSrc(st: story): string {
    const c = st.content;
    const data = c?._ === 'storyContentPhoto'
        ? c.photo.minithumbnail?.data
        : c?._ === 'storyContentVideo'
            ? c.video.minithumbnail?.data
            : undefined;
    return data ? `data:image/jpeg;base64,${data}` : '';
}

/**
 * 封面文件：视频取官方缩略图（仅静态位图格式）；
 * 照片取不小于卡片宽度（176px）的最小尺寸，避免为小预览拉整张 1080 大图。
 */
function pickCoverFile(st: story): file | undefined {
    const c = st.content;
    if (!c) return undefined;
    if (c._ === 'storyContentPhoto') {
        const sizes = (c.photo?.sizes ?? [])
            .filter((sz) => !!sz.photo)
            .sort((a, b) => a.width * a.height - b.width * b.height);
        const pick = sizes.find((sz) => sz.width >= 176) ?? sizes[sizes.length - 1];
        return pick?.photo;
    }
    if (c._ === 'storyContentVideo') {
        const th = c.video?.thumbnail;
        return th && th._ === 'thumbnail' && isThumbnailImgRenderable(th.format) ? th.file : undefined;
    }
    return undefined;
}

/** 点击封面：打开动态播放器（播放这条动态） */
function openStory() {
    const st = story.value;
    if (!st) return;
    openStoryViewer([st], 0);
}

/** 点击发布者头像/名称：跳转到动态来源频道或对话 */
async function openPosterChat() {
    const id = posterChatId.value;
    if (!id) return;
    try {
        await router.push({ name: 'chat-detail', params: { id: String(id) } });
    } catch (error) {
        console.error('Failed to open story poster chat:', error);
    }
}
</script>
