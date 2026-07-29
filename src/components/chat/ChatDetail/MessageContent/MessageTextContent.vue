<template>
    <p class="text-sm whitespace-pre-wrap leading-5">
        <template v-for="(group, gi) in renderGroups" :key="gi">
            <!-- Blockquote group: 用容器包裹，加引用竖线 -->
            <span v-if="group.type === 'blockquote'"
                class="relative block border-l-2 border-gray-300 dark:border-gray-600 pl-2 my-0.5 text-gray-600 dark:text-gray-400">
                <!-- 可折叠引用：默认折叠，点击展开（4行+底部渐变） -->
                <span v-if="group.isExpandable"
                    :ref="(el) => measureContent(gi, el as HTMLElement | null)"
                    class="block overflow-hidden transition-[max-height] duration-300 ease-in-out"
                    :class="{ 'mask-fade-bottom': !isExpanded(gi) }"
                    :style="{ maxHeight: isExpanded(gi) ? (contentHeights[gi] ?? 9999) + 'px' : '5rem' }">
                    <template v-for="(segment, si) in group.segments" :key="si">
                        <CustomEmojiInline v-if="segment.customEmojiId" :emojiId="segment.customEmojiId" :size="emojiSize" />
                        <a v-else-if="segment.href" :href="segment.href"
                            class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
                            :class="[segment.className, loadingLinks.has(segment.href) ? 'animate-pulse bg-blue-400/20 dark:bg-blue-300/20 rounded' : '']"
                            @click.prevent.stop="handleSegmentClick($event, segment)">{{ segment.text }}</a>
                        <span v-else :class="[segment.className, { 'cursor-pointer': segment.copyable }]"
                            @click="segment.copyable ? handleSegmentClick($event, segment) : undefined">{{ segment.text }}</span>
                    </template>
                </span>
                <!-- 普通引用：全部显示 -->
                <template v-else>
                    <template v-for="(segment, si) in group.segments" :key="si">
                        <CustomEmojiInline v-if="segment.customEmojiId" :emojiId="segment.customEmojiId" :size="emojiSize" />
                        <a v-else-if="segment.href" :href="segment.href"
                            class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
                            :class="[segment.className, loadingLinks.has(segment.href) ? 'animate-pulse bg-blue-400/20 dark:bg-blue-300/20 rounded' : '']"
                            @click.prevent.stop="handleSegmentClick($event, segment)">{{ segment.text }}</a>
                        <span v-else :class="[segment.className, { 'cursor-pointer': segment.copyable }]"
                            @click="segment.copyable ? handleSegmentClick($event, segment) : undefined">{{ segment.text }}</span>
                    </template>
                </template>
                <!-- 右下角折叠/展开三角图标 -->
                <button v-if="group.isExpandable" type="button"
                    class="absolute bottom-0.5 right-0.5 flex items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    @click.stop="toggleExpand(gi)">
                    <svg class="w-3.5 h-3.5 transition-transform duration-200"
                        :class="{ 'rotate-180': isExpanded(gi) }"
                        viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </span>
            <!-- Normal group -->
            <template v-else>
                <template v-for="(segment, si) in group.segments" :key="si">
                    <CustomEmojiInline v-if="segment.customEmojiId" :emojiId="segment.customEmojiId" :size="emojiSize" />
                    <a v-else-if="segment.href" :href="segment.href"
                        class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
                        :class="[segment.className, loadingLinks.has(segment.href) ? 'animate-pulse bg-blue-400/20 dark:bg-blue-300/20 rounded' : '']"
                        @click.prevent.stop="handleSegmentClick($event, segment)">{{ segment.text }}</a>
                    <span v-else :class="[segment.className, { 'cursor-pointer': segment.copyable }]"
                        @click="segment.copyable ? handleSegmentClick($event, segment) : undefined">{{ segment.text }}</span>
                </template>
            </template>
        </template>
    </p>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { formattedText, textEntity, InternalLinkType } from 'tdlib-types';
import { openUrl } from '@tauri-apps/plugin-opener';
import { tdlibSend } from '../../../../utils/tdlib';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import CustomEmojiInline from './CustomEmojiInline.vue';
const props = defineProps<{
    formattedText: formattedText;
}>();

const router = useRouter();
const loadingLinks = ref<Set<string>>(new Set());
const emojiSize = 22; // 自定义 emoji 显示尺寸（px）

type Segment = {
    text: string;
    href?: string;
    className: string;
    /** 自定义 emoji ID（有值时表示这是一个自定义 emoji 段） */
    customEmojiId?: string;
    /** 是否可点击复制 */
    copyable?: boolean;
    /** 是否在引用块内 */
    isBlockquote?: boolean;
    /** 引用块类型：'expandable' 表示可折叠引用 */
    blockquoteType?: 'normal' | 'expandable';
};

type RenderGroup = {
    type: 'normal' | 'blockquote';
    segments: Segment[];
    /** 是否可折叠展开 */
    isExpandable?: boolean;
};

const segments = computed<Segment[]>(() => {
    const text = props.formattedText.text;
    if (!text) return [];

    const entities = (props.formattedText.entities ?? [])
        .map(entity => ({
            entity,
            start: Math.max(0, Math.min(text.length, entity.offset)),
            end: Math.max(0, Math.min(text.length, entity.offset + entity.length)),
        }))
        .filter(item => item.end > item.start);
    const boundaries = new Set([0, text.length]);
    for (const entity of entities) {
        boundaries.add(entity.start);
        boundaries.add(entity.end);
    }
    const offsets = [...boundaries].sort((a, b) => a - b);

    return offsets.slice(0, -1).map((start, index) => {
        const end = offsets[index + 1];
        const segmentText = text.slice(start, end);
        const activeEntities = entities
            .filter(item => item.start <= start && item.end >= end)
            .map(item => item.entity);

        // 检查是否包含自定义 emoji
        const customEmojiEntity = activeEntities.find(
            e => e.type._ === 'textEntityTypeCustomEmoji'
        );
        if (customEmojiEntity) {
            const emojiId = (customEmojiEntity.type as any).custom_emoji_id as string;
            const hasExpandableBq = activeEntities.some(e => e.type._ === 'textEntityTypeExpandableBlockQuote');
            const hasNormalBq = activeEntities.some(e => e.type._ === 'textEntityTypeBlockQuote');
            return {
                text: segmentText,
                href: undefined,
                className: '',
                customEmojiId: emojiId,
                copyable: false,
                isBlockquote: hasExpandableBq || hasNormalBq,
                blockquoteType: hasExpandableBq ? 'expandable' : hasNormalBq ? 'normal' : undefined,
            };
        }

        const href = activeEntities
            .map(entity => getEntityHref(entity, segmentText))
            .find((value): value is string => !!value);
        // 判断是否在引用块内
        const hasExpandableBq = activeEntities.some(e => e.type._ === 'textEntityTypeExpandableBlockQuote');
        const hasNormalBq = activeEntities.some(e => e.type._ === 'textEntityTypeBlockQuote');
        const isBlockquote = hasExpandableBq || hasNormalBq;
        const blockquoteType: 'expandable' | 'normal' | undefined =
            hasExpandableBq ? 'expandable' : hasNormalBq ? 'normal' : undefined;
        // 排除引用块样式（由外层容器控制），保留其他实体样式
        const className = activeEntities
            .filter(e => e.type._ !== 'textEntityTypeBlockQuote' && e.type._ !== 'textEntityTypeExpandableBlockQuote')
            .map(getEntityClass)
            .filter(Boolean)
            .join(' ');
        const copyable = activeEntities.some(e => isCopyableEntity(e));
        return { text: segmentText, href, className, copyable, isBlockquote, blockquoteType };
    });
});

const renderGroups = computed<RenderGroup[]>(() => {
    const segs = segments.value;
    if (!segs.length) return [];
    const groups: RenderGroup[] = [];
    let current: Segment[] = [];
    let currentIsBlockquote = false;
    let currentIsExpandable = false;
    for (const seg of segs) {
        if (seg.isBlockquote !== currentIsBlockquote) {
            if (current.length) {
                groups.push({
                    type: currentIsBlockquote ? 'blockquote' : 'normal',
                    segments: current,
                    isExpandable: currentIsExpandable,
                });
            }
            current = [seg];
            currentIsBlockquote = !!seg.isBlockquote;
            currentIsExpandable = seg.blockquoteType === 'expandable';
        } else {
            current.push(seg);
        }
    }
    if (current.length) {
        groups.push({
            type: currentIsBlockquote ? 'blockquote' : 'normal',
            segments: current,
            isExpandable: currentIsExpandable,
        });
    }
    return groups;
});

/** 可折叠引用展开状态：group 索引 -> 是否展开 */
const expandedGroups = reactive<Set<number>>(new Set());

function isExpanded(gi: number): boolean {
    return expandedGroups.has(gi);
}

function toggleExpand(gi: number) {
    if (expandedGroups.has(gi)) {
        expandedGroups.delete(gi);
    } else {
        expandedGroups.add(gi);
    }
}

/** 缓存每个可折叠引用的实际内容高度，用于平滑 max-height 动画 */
const contentHeights = reactive<Record<number, number>>({});

function measureContent(gi: number, el: HTMLElement | null) {
    if (el && !contentHeights[gi]) {
        contentHeights[gi] = el.scrollHeight;
    }
}

function getEntityHref(entity: textEntity, text: string): string | undefined {
    switch (entity.type._) {
        case 'textEntityTypeTextUrl': return entity.type.url;
        case 'textEntityTypeUrl': return text;
        case 'textEntityTypeEmailAddress': return `mailto:${text}`;
        case 'textEntityTypePhoneNumber': return `tel:${text}`;
        case 'textEntityTypeMention': return `https://t.me/${text.replace(/^@/, '')}`;
        case 'textEntityTypeMentionName': return `tg://user?id=${entity.type.user_id}`;
        default: return undefined;
    }
}

function getEntityClass(entity: textEntity): string {
    switch (entity.type._) {
        case 'textEntityTypeBold': return 'font-semibold';
        case 'textEntityTypeItalic': return 'italic';
        case 'textEntityTypeUnderline': return 'underline';
        case 'textEntityTypeStrikethrough': return 'line-through';
        case 'textEntityTypeCode':
        case 'textEntityTypePre':
        case 'textEntityTypePreCode':
            return 'rounded bg-black/5 px-0.5 font-mono dark:bg-white/10';
        case 'textEntityTypeSpoiler': return 'cursor-pointer rounded bg-black/20 dark:bg-white/20 hover:bg-black/30 dark:hover:bg-white/30';
        default: return '';
    }
}

function isCopyableEntity(entity: textEntity): boolean {
    switch (entity.type._) {
        case 'textEntityTypeUrl':
        case 'textEntityTypeTextUrl':
        case 'textEntityTypeEmailAddress':
        case 'textEntityTypePhoneNumber':
        case 'textEntityTypeCode':
        case 'textEntityTypePre':
        case 'textEntityTypePreCode':
        case 'textEntityTypeHashtag':
        case 'textEntityTypeCashtag':
        case 'textEntityTypeBotCommand':
        case 'textEntityTypeBankCardNumber':
        case 'textEntityTypeMention':
        case 'textEntityTypeMentionName':
            return true;
        default:
            return false;
    }
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        await MessagePlugin.success({ content: '已复制', placement: 'top-right' });
    } catch (e) {
        console.error('Copy failed:', e);
    }
}

function handleSegmentClick(event: MouseEvent, segment: Segment) {
    if (segment.href) {
        // 链接：复制文本 + 导航
        if (segment.copyable) {
            copyToClipboard(segment.text);
        }
        openLink(segment.href);
    } else if (segment.copyable) {
        // 纯可复制实体：仅复制
        copyToClipboard(segment.text);
    }
}

async function openLink(href: string) {
    if (href.startsWith('https://t.me/') || href.startsWith('tg://')) {
        await resolveInternalLink(href);
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        openUrl(href);
    }
}

async function resolveInternalLink(href: string) {
    loadingLinks.value = new Set(loadingLinks.value).add(href);
    try {
        const linkType = await tdlibSend({ _: 'getInternalLinkType', link: href }) as InternalLinkType;

        switch (linkType._) {
            case 'internalLinkTypeMessage': {
                const info = await tdlibSend({ _: 'getMessageLinkInfo', url: linkType.url });
                if (info.chat_id) {
                    const query: Record<string, string> = {};
                    if (info.message) {
                        query.message = String(info.message.id);
                    }
                    await router.push({
                        name: 'chat-detail',
                        params: { id: String(info.chat_id) },
                        query: Object.keys(query).length > 0 ? query : undefined,
                    });
                }
                break;
            }
            case 'internalLinkTypePublicChat': {
                const chat = await tdlibSend({ _: 'searchPublicChat', username: linkType.chat_username });
                await router.push(`/home/chats/${chat.id}`);
                break;
            }
            default: {
                openUrl(href);
                break;
            }
        }
    } catch (e) {
        console.warn('Failed to resolve internal link, opening externally:', e);
        openUrl(href);
    } finally {
        const next = new Set(loadingLinks.value);
        next.delete(href);
        loadingLinks.value = next;
    }
}
</script>

<style scoped>
.mask-fade-bottom {
    -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
}
</style>
