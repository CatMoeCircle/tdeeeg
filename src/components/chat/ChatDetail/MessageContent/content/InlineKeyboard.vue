<template>
    <div v-if="rows.length" class="flex w-full flex-col gap-1 px-0.5 pb-0.5">
        <div v-for="(row, ri) in rows" :key="ri" class="flex gap-1">
            <button v-for="(button, bi) in row" :key="bi" type="button" class="relative"
                :class="[
                    baseButtonClass,
                    buttonStyleClass(button.style),
                    button.type._ === 'inlineKeyboardButtonTypeBuy' ? 'pr-5' : '',
                ]" :disabled="pendingKey === buttonKey(ri, bi)"
                @click.stop="handleClick(button, ri, bi)">
                <CustomEmojiInline v-if="String(button.icon_custom_emoji_id || 0) !== '0'"
                    :emojiId="String(button.icon_custom_emoji_id)" :size="18"
                    :fallback-text="button.text.slice(0, 1)" />
                <span class="min-w-0 whitespace-pre-wrap wrap-break-word text-center">
                    <GlobalEmojiText :text="button.text" />
                </span>
                <!-- 购买按钮：右上角信用卡图标（tgico U+E94C） -->
                <span v-if="button.type._ === 'inlineKeyboardButtonTypeBuy'"
                    class="tgico tgico-card absolute top-1 right-1.5 text-[12px] leading-none opacity-80 pointer-events-none" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { inlineKeyboardButton } from 'tdlib-types';
import { buttonStyleClass, runInlineButtonType } from '../../../../../utils/inlineButton';
import CustomEmojiInline from '../../../../common/CustomEmojiInline.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';

const props = defineProps<{
    rows: inlineKeyboardButton[][];
    chatId?: number;
    messageId?: number;
}>();

const pendingKey = ref<string | null>(null);

/**
 * 锁定状态由上级（消息列表组件）在收到消息更新时主动刷新：
 * 消息更新（updateMessageContent / updateMessageEdited 等）后，回调期间的按钮锁定
 * 可能已失效——按钮文本可能已变，或该按钮在更新中已被移除。上级在下一次更新时
 * 通过本方法释放锁定，避免按钮持续被禁用或残留锁定拦截后续点击。
 */
function resetLock() {
    pendingKey.value = null;
}

defineExpose({ resetLock });

function buttonKey(ri: number, bi: number): string {
    return `${ri}:${bi}`;
}

// 共享的按钮布局样式
const baseButtonClass =
    'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-50';

async function handleClick(button: inlineKeyboardButton, ri: number, bi: number) {
    if (pendingKey.value) return;
    // 回调按钮：等 bot 应答期间锁住该按钮，避免重复点击
    if (button.type._ === 'inlineKeyboardButtonTypeCallback') pendingKey.value = buttonKey(ri, bi);
    try {
        await runInlineButtonType(button.type, {
            chatId: props.chatId,
            messageId: props.messageId,
            buttonText: button.text,
        });
    } finally {
        pendingKey.value = null;
    }
}
</script>
