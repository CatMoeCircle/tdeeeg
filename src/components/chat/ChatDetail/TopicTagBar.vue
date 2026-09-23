<template>
    <!-- 话题标签栏（tag 栏话题模式）
         - left ：图片样式窄栏 72px（对齐 Unigram ForumTopicVerticalCell）
         - top  ：悬浮分组栏（Header 与置顶栏之间）
         - bottom：悬浮分组栏（输入条上方）
         列表话题模式不使用本组件（话题在对话列表中展示）。 -->
    <div :class="[rootClass, animClass]" :style="rootStyle" :data-pos="position" data-topic-tag-bar
        @animationend="onAnimEnd">
        <!-- 分组栏样式（top / bottom）：通用 tag 栏（SlidingTabBar + folderStyle） -->
        <template v-if="position !== 'left'">
            <div class="pointer-events-auto w-full flex justify-center">
                <SlidingTabBar :tabs="slidingTabs" :active-id="activeTabId" :variant="folderStyle"
                    :tab-class="topicTabClass" :container-class="topicTabContainerClass"
                    :show-indicator="folderStyle === 'tabs' || folderStyle === 'soft'" @select="onSlidingSelect">
                    <template #default="{ tab, active }">
                        <span v-if="tab.kind === 'all'" class="shrink-0">
                            <MessageCircleIcon class="w-3.5 h-3.5" />
                        </span>
                        <span v-else-if="tab.kind === 'general'" class="text-sm font-bold leading-none shrink-0"
                            :class="active ? '' : ''"
                            :style="active ? undefined : { color: tab.color }">#</span>
                        <CustomEmojiInline v-else-if="tab.customEmojiId" :emojiId="tab.customEmojiId" :size="14"
                            class="shrink-0" />
                        <span v-else
                            class="w-4 h-4 rounded shrink-0 inline-flex items-center justify-center text-white text-[9px] font-bold leading-none"
                            :style="{ backgroundColor: tab.color }">
                            {{ tab.initial }}
                        </span>
                        <span class="max-w-28 truncate">{{ tab.label }}</span>
                        <span v-if="tab.unread > 0"
                            class="min-w-4 h-4 px-1 rounded-full text-[9px] font-bold leading-4 text-center shrink-0"
                            :class="active || folderStyle === 'soft' ? 'bg-blue-500' : 'bg-gray-400'">
                            {{ formatUnreadCount(tab.unread) }}
                        </span>
                    </template>
                </SlidingTabBar>
            </div>
        </template>

        <!-- 图片样式（left）：纵向图标 + 名称 -->
        <template v-else>
            <div class="h-full overflow-y-auto custom-scrollbar py-2 flex flex-col items-center gap-1" v-smooth-wheel>
                <button v-for="entry in entries" :key="entry.key" type="button"
                    class="image-tag relative w-full flex flex-col items-center gap-1 px-1 py-2 rounded-xl transition-colors select-none"
                    :class="entry.active
                        ? 'bg-white/85 dark:bg-gray-800/85 backdrop-blur-md shadow-sm'
                        : 'hover:bg-white/60 dark:hover:bg-gray-800/60'"
                    :title="entry.title" @click="entry.onClick">
                    <span v-if="entry.active"
                        class="absolute top-1/2 -translate-y-1/2 -left-0.5 w-0.5 h-5 bg-blue-500 rounded-full"></span>
                    <div class="relative w-11 h-11 shrink-0 flex items-center justify-center">
                        <div v-if="entry.kind === 'all'"
                            class="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800">
                            <MessageCircleIcon class="w-5 h-5" />
                        </div>
                        <div v-else-if="entry.kind === 'general'"
                            class="w-11 h-11 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                            :style="{ backgroundColor: entry.color }">#</div>
                        <CustomEmojiInline v-else-if="entry.customEmojiId" :emojiId="entry.customEmojiId" :size="40"
                            class="shrink-0" />
                        <div v-else
                            class="w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-bold"
                            :style="{ backgroundColor: entry.color }">
                            {{ entry.initial }}
                        </div>
                        <span v-if="entry.unread > 0"
                            class="absolute -bottom-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold leading-4 text-center border border-white dark:border-gray-900">
                            {{ formatUnreadCount(entry.unread) }}
                        </span>
                    </div>
                    <span
                        class="w-full text-[10px] leading-tight text-center text-gray-600 dark:text-gray-300 line-clamp-2 break-all">
                        {{ entry.label }}
                    </span>
                </button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { MessageCircleIcon } from 'lucide-vue-next';
import type { forumTopic, forumTopics } from 'tdlib-types';
import { tdlibSend } from '../../../utils/tdlib';
import CustomEmojiInline from '../../common/CustomEmojiInline.vue';
import SlidingTabBar from '../../common/SlidingTabBar.vue';
import { folderTabClass, folderTabContainerClass, type FolderStyle } from '../../../utils/folderPillsTabClass';
import { settings } from '../../../store/settings';

export type TopicTagPosition = 'left' | 'top' | 'bottom';

const props = withDefaults(defineProps<{
    chatId: number;
    topicId?: number | null;
    /** 标签栏位置 */
    position?: TopicTagPosition;
    /** top 模式相对 Header 底边的偏移 */
    topOffset?: number;
    /** bottom 模式相对底部的偏移 */
    bottomOffset?: number;
}>(), {
    topicId: null,
    position: 'left',
    topOffset: 4,
    bottomOffset: 76,
});

const emit = defineEmits<{
    select: [topicId: number | null];
    loaded: [count: number];
}>();

/** 话题列表缓存：位置切换会重建组件，避免每次都重新拉取导致闪空 */
const topicsCache = new Map<number, forumTopic[]>();

const router = useRouter();
// 同步读缓存：位置切换重挂载时首帧就有数据，不会闪空
const topics = ref<forumTopic[]>(topicsCache.get(props.chatId) ?? []);

const rootClass = computed(() => {
    if (props.position === 'left') {
        return 'absolute top-0 bottom-0 left-0 z-10 w-[72px] flex flex-col overflow-hidden';
    }
    // 悬浮分组栏
    return 'absolute z-10 flex justify-center pointer-events-none px-3';
});

/** 位置切换时的方向动画（不挂在 onMounted：切换话题导致重挂时不应重播展开动画） */
const animClass = ref<string>('');
watch(() => props.position, async (_pos, oldPos) => {
    // 仅在位置真正变化时播放；重挂载（切换话题）时 oldPos 为 undefined，跳过
    if (oldPos === undefined || oldPos === _pos) return;
    animClass.value = '';
    await nextTick();
    animClass.value = `tag-anim-${props.position}`;
});
/** 动画结束后清掉 class，避免残留导致下次重挂/重绘时重播 */
function onAnimEnd() {
    animClass.value = '';
}

const rootStyle = computed<Record<string, string>>(() => {
    // 始终写明确数值，避免删属性导致过渡跳动
    const style: Record<string, string> = {};
    if (props.position === 'top') {
        style.top = `${64 + props.topOffset}px`;
        style.bottom = 'auto';
        style.left = '0px';
        style.right = '0px';
        style.height = '40px';
        style.width = 'auto';
    } else if (props.position === 'bottom') {
        style.top = 'auto';
        style.bottom = `${props.bottomOffset}px`;
        style.left = '0px';
        style.right = '0px';
        style.height = '40px';
        style.width = 'auto';
    } else {
        // left
        style.top = '0px';
        style.bottom = '0px';
        style.left = '0px';
        style.right = 'auto';
        style.height = 'auto';
        style.width = '72px';
    }
    return style;
});

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
    return (name?.substring(0, 1) || '#').toUpperCase();
}

function topicIconCustomEmojiId(topic: forumTopic): string {
    if (topic.info.is_general) return '';
    const id = topic.info.icon.custom_emoji_id;
    return id && id !== '0' ? String(id) : '';
}

function formatUnreadCount(count: number): string {
    return count > 99 ? '99+' : String(count);
}

interface TagEntry {
    key: string;
    kind: 'all' | 'general' | 'topic';
    label: string;
    title: string;
    color: string;
    initial: string;
    customEmojiId: string;
    unread: number;
    active: boolean;
    onClick: () => void;
}

const entries = computed<TagEntry[]>(() => {
    const list: TagEntry[] = [];
    list.push({
        key: '__all__',
        kind: 'all',
        label: '全部',
        title: '全部话题',
        color: '',
        initial: '',
        customEmojiId: '',
        unread: topics.value.reduce((s, t) => s + (t.unread_count || 0), 0),
        active: !props.topicId,
        onClick: () => selectAll(),
    });
    for (const topic of topics.value) {
        const isGeneral = !!topic.info.is_general;
        list.push({
            key: String(topic.info.forum_topic_id),
            kind: isGeneral ? 'general' : 'topic',
            label: topic.info.name,
            title: topic.info.name,
            color: topicIconColor(topic.info.icon.color),
            initial: topicNameInitial(topic.info.name),
            customEmojiId: topicIconCustomEmojiId(topic),
            unread: topic.unread_count || 0,
            active: props.topicId === topic.info.forum_topic_id,
            onClick: () => selectTopic(topic.info.forum_topic_id),
        });
    }
    return list;
});

const folderStyle = computed<FolderStyle>(() => settings.folderStyle ?? 'soft');

/** SlidingTabBar 数据（top / bottom 通用 tag 栏） */
const slidingTabs = computed(() =>
    entries.value.map(e => ({
        id: e.key,
        kind: e.kind,
        label: e.label,
        title: e.title,
        color: e.color,
        initial: e.initial,
        customEmojiId: e.customEmojiId,
        unread: e.unread,
    }))
);
const activeTabId = computed(() => {
    if (!props.topicId) return '__all__';
    return String(props.topicId);
});
function topicTabClass(_id: string, active: boolean) {
    return folderTabClass(folderStyle.value, _id, active);
}
const topicTabContainerClass = computed(() => folderTabContainerClass(folderStyle.value));
function onSlidingSelect(id: string) {
    if (id === '__all__') selectAll();
    else selectTopic(Number(id));
}

function selectAll() {
    if (!props.chatId) return;
    if (!props.topicId) return;
    emit('select', null);
    router.push({
        name: 'chat-detail',
        params: { id: String(props.chatId) },
    });
}

function selectTopic(topicId: number) {
    if (!props.chatId) return;
    if (topicId === props.topicId) return;
    emit('select', topicId);
    router.push({
        name: 'chat-topic-detail',
        params: {
            id: String(props.chatId),
            topicId: String(topicId),
        },
    });
}

async function loadTopics() {
    if (!props.chatId) return;
    // 先用缓存立即渲染，避免位置切换重挂载时闪空
    const cached = topicsCache.get(props.chatId);
    if (cached) {
        topics.value = cached;
        emit('loaded', cached.length);
    }
    try {
        const result = await tdlibSend({
            _: 'getForumTopics',
            chat_id: props.chatId,
            offset_date: 0,
            offset_message_id: 0,
            offset_forum_topic_id: 0,
            limit: 50,
        }) as forumTopics;
        const list = [...result.topics];
        list.sort((a, b) => Number(b.info.is_general) - Number(a.info.is_general));
        topicsCache.set(props.chatId, list);
        topics.value = list;
        emit('loaded', list.length);
    } catch (e) {
        console.error('Failed to load topics for tag bar:', e);
        if (!cached) {
            topics.value = [];
            emit('loaded', 0);
        }
    }
}

let disposed = false;

onMounted(() => {
    disposed = false;
    loadTopics();
});

onUnmounted(() => {
    disposed = true;
});

watch(() => props.chatId, () => {
    if (disposed) return;
    loadTopics();
});
</script>

<style scoped>
.image-tag {
    content-visibility: auto;
    contain-intrinsic-size: 72px;
}
</style>
