<template>
    <!-- 富文本消息里的按钮（richTextButton / pageBlockButtonRow）：点击按类型发回调或打开链接 -->
    <button type="button" :class="[baseClass, styleClass]" :disabled="pending" @click.stop="press">
        <!-- 按钮文案只允许 文本 / 自定义 emoji（TDLib 限制），就地渲染，不经过 RichText -->
        <template v-for="(seg, si) in segments" :key="si">
            <RichMonoEmoji v-if="seg.emojiId && monochrome" :emoji-id="seg.emojiId" :size="14" />
            <CustomEmojiInline v-else-if="seg.emojiId" :emojiId="seg.emojiId" :size="14" />
            <!-- 长文案在按钮内换行，不撑出气泡 -->
            <span v-else class="min-w-0 [overflow-wrap:anywhere]">{{ seg.text }}</span>
        </template>
        <!-- 按钮类型角标：外链 / 复制 / 小程序 / 联系人（回调等无对应动作，不加） -->
        <component :is="trailingIcon" v-if="trailingIcon" class="ml-auto h-3 w-3 shrink-0 opacity-70" />
    </button>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { inlineButton } from 'tdlib-types';
import { CopyIcon, ExternalLinkIcon, AppWindowIcon, UserRoundIcon } from 'lucide-vue-next';
import { buttonStyleClass, isTelegramInternalUrl, runInlineButtonType, type InlineButtonContext } from '../../../../../utils/inlineButton';
import CustomEmojiInline from '../../../../common/CustomEmojiInline.vue';
import RichMonoEmoji from './RichMonoEmoji.vue';

const props = defineProps<{
    button: inlineButton;
    /** 无对齐要求时按钮行拉满剩余宽度（与行内键盘一致） */
    grow?: boolean;
    /** 图标跟随按钮文字颜色（按钮行用；表格里的棋盘格保留 emoji 原色） */
    monochrome?: boolean;
}>();

/** 按钮所在富文本消息的 chat/message 上下文（MessageRichMessage provide） */
const ctx = inject<InlineButtonContext>('richMessageContext', {});

const pending = ref(false);

/** 链接样式（仅富文本消息，表格格子基本都是它）：无底色的文字/图标按钮 */
const isLink = computed(() => props.button.style?._ === 'buttonStyleLink');

/** 按钮类型 → 右侧角标图标：外链 / 复制 / 小程序 / 联系人；回调等默认无 */
const trailingIcon = computed(() => {
    const type = props.button.type;
    switch (type._) {
        case 'inlineKeyboardButtonTypeCopyText': return CopyIcon;
        case 'inlineKeyboardButtonTypeWebApp': return AppWindowIcon;
        case 'inlineKeyboardButtonTypeUser': return UserRoundIcon;
        // t.me / tg:// 在应用内跳转，不算外链
        case 'inlineKeyboardButtonTypeUrl': return isTelegramInternalUrl(type.url) ? null : ExternalLinkIcon;
        default: return null;
    }
});

/**
 * 富文本消息里的按钮统一胶囊状（rounded-full），配色跟随主题色（--app-brand）。
 * 链接样式（表格格子里的棋子等）不给背景色：平时完全透明，只有 hover 才亮一下。
 */
const baseClass = computed(() => (isLink.value
    ? 'inline-flex max-w-full min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-0 text-[12px] leading-5 align-middle transition-colors hover:bg-[var(--app-brand-soft)] disabled:cursor-default disabled:opacity-50'
    : [
        // inline-flex：段落里的多个按钮排在同一行、按可用宽度自动换行（不像 flex 那样各自独占一行）
        'inline-flex max-w-full min-w-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-5 font-medium align-middle transition-colors disabled:cursor-default disabled:opacity-50',
        props.grow ? 'flex-1' : '',
    ]));

/** 第二个参数：跟随主题色（富文本按钮用；消息外的行内键盘保持原配色） */
const styleClass = computed(() => buttonStyleClass(props.button.style, true));

/** 按钮文案拆成 文本 / 自定义 emoji 片段 */
const segments = computed<Array<{ text: string; emojiId?: string }>>(() => {
    const rt = props.button.text;
    const parts = rt._ === 'richTexts' ? rt.texts : [rt];
    return parts.map((part) => (part._ === 'richTextCustomEmoji'
        ? { text: part.alternative_text ?? '', emojiId: String(part.custom_emoji_id) }
        : { text: plainText(part) }));
});

/**
 * 取出文本节点的文字：richTextPlain 的 text 是**字符串**，
 * 其余富文本节点的 text 才是嵌套 RichText；richTexts 是子节点数组。
 */
function plainText(node: { _: string }): string {
    const n = node as {
        _: string;
        texts?: Array<{ _: string }>;
        text?: unknown;
        alternative_text?: string;
    };
    if (n._ === 'richTexts') return (n.texts ?? []).map(plainText).join('');
    if (n._ === 'richTextPlain') return typeof n.text === 'string' ? n.text : '';
    if (n._ === 'richTextCustomEmoji') return n.alternative_text ?? '';
    return n.text && typeof n.text === 'object' ? plainText(n.text as { _: string }) : '';
}

async function press() {
    if (pending.value) return;
    pending.value = true;
    try {
        await runInlineButtonType(props.button.type, ctx);
    } finally {
        pending.value = false;
    }
}
</script>
