<template>
    <!-- 递归渲染 RichText 树 -->
    <template v-for="(node, i) in nodes" :key="i">
        <b v-if="node.type === 'bold'" class="font-semibold">
            <RichText :text="node.text" />
        </b>
        <i v-else-if="node.type === 'italic'" class="italic">
            <RichText :text="node.text" />
        </i>
        <u v-else-if="node.type === 'underline'" class="underline">
            <RichText :text="node.text" />
        </u>
        <s v-else-if="node.type === 'strikethrough'" class="line-through">
            <RichText :text="node.text" />
        </s>
        <SpoilerSpan v-else-if="node.type === 'spoiler'">
            <RichText :text="node.text" />
        </SpoilerSpan>
        <sub v-else-if="node.type === 'subscript'" class="text-xs">
            <RichText :text="node.text" />
        </sub>
        <sup v-else-if="node.type === 'superscript'" class="text-xs">
            <RichText :text="node.text" />
        </sup>
        <mark v-else-if="node.type === 'marked'" class="bg-yellow-200/70 rounded px-0.5 dark:bg-yellow-500/30">
            <RichText :text="node.text" />
        </mark>
        <CopyableText v-else-if="node.type === 'fixed'" :text="extractText(node.text)" class="font-mono">
            <RichText :text="node.text" />
        </CopyableText>
        <CopyableText v-else-if="node.type === 'bankCard'" :text="extractText(node.text)" class="font-mono">
            <RichText :text="node.text" />
        </CopyableText>
        <a v-else-if="node.href" :href="node.href"
            class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
            @click.prevent.stop="handleClick($event, node)">
            <RichText :text="node.text" />
        </a>
        <span
            v-else-if="node.type === 'hashtag' || node.type === 'cashtag' || node.type === 'botCommand' || node.type === 'mention'"
            class="text-blue-500 dark:text-blue-400">
            <RichText :text="node.text" />
        </span>
        <a v-else-if="node.type === 'mentionName'" :href="`tg://user?id=${node.userId}`"
            class="text-blue-500 hover:underline dark:text-blue-400 transition-colors"
            @click.prevent.stop="handleClick($event, node)">
            <RichText :text="node.text" />
        </a>
        <CustomEmojiInline v-else-if="node.type === 'customEmoji' && node.emojiId" :emojiId="node.emojiId"
            :size="emojiSize" :fallback-text="node.textStr" />
        <LatexFormula v-else-if="node.type === 'mathematicalExpression'" :expression="node.textStr ?? ''"
            class="mx-0.5" />
        <template v-else-if="node.type === 'texts'">
            <RichText v-for="(child, ci) in node.children" :key="ci" :text="child" />
        </template>
        <template v-else-if="node.type === 'reference'">
            <RichText :text="node.text" />
        </template>
        <template v-else>
            <RichText v-if="node.text" :text="node.text" />
            <template v-else>{{ node.textStr }}</template>
        </template>
    </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RichText } from 'tdlib-types';
import LatexFormula from './LatexFormula.vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useRouter } from 'vue-router';
import CustomEmojiInline from '../../../../common/CustomEmojiInline.vue';
import SpoilerSpan from '../spoiler/SpoilerSpan.vue';
import { confirmAndOpenExternalLink } from '../../../../../utils/openExternalLink';
import { resolveInternalLink as resolveInternalLinkUtil } from '../../../../../utils/openInternalLink';

const props = defineProps<{
    text?: RichText;
}>();

const router = useRouter();
const emojiSize = 22;

type RichNode = {
    type: string;
    /** 需要递归渲染的子富文本 */
    text?: RichText;
    /** richTexts 的多个子节点 */
    children?: RichText[];
    /** 直接渲染的文本串（仅 plain / expression 等节点） */
    textStr?: string;
    href?: string;
    userId?: number;
    emojiId?: string;
};

/** 将 TDLib RichText 转成便于模板渲染的节点树；href/mention 等直接携带 */
function normalize(t: RichText): RichNode {
    switch (t._) {
        case 'richTextBold': return { type: 'bold', text: t.text };
        case 'richTextItalic': return { type: 'italic', text: t.text };
        case 'richTextUnderline': return { type: 'underline', text: t.text };
        case 'richTextStrikethrough': return { type: 'strikethrough', text: t.text };
        case 'richTextSpoiler': return { type: 'spoiler', text: t.text };
        case 'richTextSubscript': return { type: 'subscript', text: t.text };
        case 'richTextSuperscript': return { type: 'superscript', text: t.text };
        case 'richTextMarked': return { type: 'marked', text: t.text };
        case 'richTextFixed': return { type: 'fixed', text: t.text };
        case 'richTextUrl': return { type: 'url', text: t.text, href: t.url };
        case 'richTextEmailAddress': return { type: 'email', text: t.text, href: `mailto:${t.email_address}` };
        case 'richTextPhoneNumber': return { type: 'phone', text: t.text, href: `tel:${t.phone_number}` };
        case 'richTextMention': return { type: 'mention', text: t.text, href: `https://t.me/${t.username.replace(/^@/, '')}` };
        case 'richTextHashtag': return { type: 'hashtag', text: t.text };
        case 'richTextCashtag': return { type: 'cashtag', text: t.text };
        case 'richTextBankCardNumber': return { type: 'bankCard', text: t.text };
        case 'richTextBotCommand': return { type: 'botCommand', text: t.text };
        case 'richTextMentionName': return { type: 'mentionName', text: t.text, userId: t.user_id };
        case 'richTextCustomEmoji': return { type: 'customEmoji', emojiId: String(t.custom_emoji_id), textStr: t.alternative_text ?? '' };
        case 'richTextMathematicalExpression': return { type: 'mathematicalExpression', textStr: t.expression ?? '' };
        case 'richTextReferenceLink': return { type: 'refLink', text: t.text, href: t.url };
        case 'richTextAnchorLink': return { type: 'anchorLink', text: t.text, href: t.url };
        case 'richTextAnchor': return { type: 'anchor', textStr: '' };
        case 'richTexts': return { type: 'texts', children: t.texts, textStr: '' };
        case 'richTextReference': return { type: 'reference', text: t.text };
        case 'richTextDiff': return { type: 'diff', text: t.text };
        case 'richTextIcon': return { type: 'icon', textStr: '[图片]' };
        case 'richTextDateTime': return { type: 'dateTime', text: t.text };
        case 'richTextPlain':
        default: return { type: 'plain', textStr: t.text ?? '' };
    }
}

const nodes = computed<RichNode[]>(() => {
    const t = props.text;
    if (!t) return [];
    // richTexts 是一个数组，拆分成多个节点
    if (t._ === 'richTexts') {
        return t.texts.map((child) => normalize(child));
    }
    return [normalize(t)];
});

/** 递归文本提取（用于复制等场景，当前仅为 plain 节点时的 fallback 判断） */
function shouldSkipHrefOpen(node: RichNode): boolean {
    return node.href === undefined;
}

function handleClick(_event: MouseEvent, node: RichNode) {
    if (shouldSkipHrefOpen(node)) {
        // 无可跳转链接，尝试复制
        copyPlainText(node.text);
        return;
    }
    const href = node.href!;
    if (href.startsWith('https://t.me/') || href.startsWith('tg://')) {
        resolveInternalLink(href);
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        // 外部链接：先询问用户是否跳转外部
        confirmAndOpenExternalLink(href).catch(() => { /* 用户取消 */ });
    }
}

function copyPlainText(t?: RichText): void {
    if (!t) return;
    const text = extractText(t);
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => { });
}

function extractText(t?: RichText): string {
    if (!t) return '';
    switch (t._) {
        case 'richTextPlain': return t.text ?? '';
        case 'richTexts': return t.texts.map(extractText).join('');
        case 'richTextCustomEmoji': return t.alternative_text ?? '';
        case 'richTextMathematicalExpression': return t.expression ?? '';
        default:
            if ('text' in t && t.text) return extractText(t.text as RichText);
            return '';
    }
}

async function resolveInternalLink(href: string) {
    try {
        await resolveInternalLinkUtil(href, router);
    } catch (e) {
        console.warn('Failed to resolve internal link, opening externally:', e);
        openUrl(href);
    }
}
</script>
