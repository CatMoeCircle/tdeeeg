<template>
    <p class="text-sm whitespace-pre-wrap break-words leading-5">
        <template v-for="(segment, index) in segments" :key="index">
            <a v-if="segment.href" :href="segment.href"
                class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
                :class="[segment.className, loadingLinks.has(segment.href) ? 'animate-pulse bg-blue-400/20 dark:bg-blue-300/20 rounded' : '']"
                @click.prevent.stop="openLink(segment.href)">{{ segment.text }}</a>
            <span v-else :class="segment.className">{{ segment.text }}</span>
        </template>
    </p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { formattedText, textEntity, InternalLinkType } from 'tdlib-types';
import { openUrl } from '@tauri-apps/plugin-opener';
import { tdlibSend } from '../../../../utils/tdlib';
import { useRouter } from 'vue-router';

const props = defineProps<{
    formattedText: formattedText;
}>();

const router = useRouter();
const loadingLinks = ref<Set<string>>(new Set());

type Segment = {
    text: string;
    href?: string;
    className: string;
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
        const href = activeEntities
            .map(entity => getEntityHref(entity, segmentText))
            .find((value): value is string => !!value);
        const className = activeEntities.map(getEntityClass).filter(Boolean).join(' ');
        return { text: segmentText, href, className };
    });
});

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
        case 'textEntityTypeBlockQuote':
        case 'textEntityTypeExpandableBlockQuote':
            return 'block border-l-2 border-gray-300 dark:border-gray-600 pl-2 italic text-gray-600 dark:text-gray-400';
        default: return '';
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
