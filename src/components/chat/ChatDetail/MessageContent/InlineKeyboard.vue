<template>
    <div v-if="rows.length" class="flex w-full flex-col gap-1 px-0.5 pb-0.5">
        <div v-for="(row, ri) in rows" :key="ri" class="flex gap-1">
            <button v-for="(button, bi) in row" :key="bi" type="button"
                class="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300/60 bg-gray-100/80 px-2 py-1.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200/80 disabled:cursor-default disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15"
                :disabled="pendingKey === buttonKey(ri, bi)"
                @click.stop="handleClick(button, ri, bi)">
                <CustomEmojiInline v-if="String(button.icon_custom_emoji_id || 0) !== '0'"
                    :emojiId="String(button.icon_custom_emoji_id)" :size="18"
                    :fallback-text="button.text.slice(0, 1)" />
                <span class="min-w-0 whitespace-pre-wrap break-words text-center">{{ button.text }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import { MessagePlugin } from 'tdesign-vue-next';
import type { inlineKeyboardButton, LoginUrlInfo } from 'tdlib-types';
import { tdlibSend } from '../../../../utils/tdlib';
import { confirmExternalLink } from '../../../../store/externalLink';
import CustomEmojiInline from './CustomEmojiInline.vue';

const props = defineProps<{
    rows: inlineKeyboardButton[][];
    chatId?: number;
    messageId?: number;
}>();

const router = useRouter();
const pendingKey = ref<string | null>(null);

function buttonKey(ri: number, bi: number): string {
    return `${ri}:${bi}`;
}

async function handleClick(button: inlineKeyboardButton, ri: number, bi: number) {
    const key = buttonKey(ri, bi);
    if (pendingKey.value) return;

    switch (button.type._) {
        case 'inlineKeyboardButtonTypeUrl':
            await openButtonUrl(button.type.url);
            break;
        case 'inlineKeyboardButtonTypeLoginUrl':
            await openLoginUrl(button.type.id, button.type.url);
            break;
        case 'inlineKeyboardButtonTypeWebApp':
            await openButtonUrl(button.type.url);
            break;
        case 'inlineKeyboardButtonTypeCallback':
            await sendCallback(key, { _: 'callbackQueryPayloadData', data: button.type.data });
            break;
        case 'inlineKeyboardButtonTypeCallbackWithPassword':
            await MessagePlugin.error({ content: '暂不支持密码回调按钮', placement: 'top-right' });
            break;
        case 'inlineKeyboardButtonTypeCallbackGame':
            await MessagePlugin.error({ content: '暂不支持游戏回调按钮', placement: 'top-right' });
            break;
        case 'inlineKeyboardButtonTypeSwitchInline':
            await MessagePlugin.error({ content: '暂不支持切换内联查询按钮', placement: 'top-right' });
            break;
        case 'inlineKeyboardButtonTypeBuy':
            await MessagePlugin.error({ content: '暂不支持购买按钮', placement: 'top-right' });
            break;
        case 'inlineKeyboardButtonTypeUser':
            await openUserButton(button.type.user_id);
            break;
        case 'inlineKeyboardButtonTypeCopyText':
            await copyButtonText(button.type.text);
            break;
    }
}

async function openButtonUrl(url: string) {
    try {
        await openUrl(url);
    } catch (e) {
        console.error('Open inline keyboard URL failed:', e);
    }
}

async function openLoginUrl(buttonId: number, fallbackUrl: string) {
    if (!props.chatId || !props.messageId) {
        await openButtonUrl(fallbackUrl);
        return;
    }

    try {
        const info = await tdlibSend({
            _: 'getLoginUrlInfo',
            chat_id: props.chatId,
            message_id: props.messageId,
            button_id: buttonId,
        }) as LoginUrlInfo;

        if (info._ === 'loginUrlInfoOpen' && info.skip_confirmation) {
            await openButtonUrl(info.url);
            return;
        }

        try {
            await confirmExternalLink(info.url);
        } catch {
            return;
        }

        if (info._ === 'loginUrlInfoOpen') {
            await openButtonUrl(info.url);
            return;
        }

        const url = await tdlibSend({
            _: 'getLoginUrl',
            chat_id: props.chatId,
            message_id: props.messageId,
            button_id: buttonId,
            allow_write_access: false,
        }) as { url: string };
        await openButtonUrl(url.url);
    } catch (e) {
        console.warn('Failed to resolve login URL, opening original:', e);
        await openButtonUrl(fallbackUrl);
    }
}

async function sendCallback(key: string, payload: { _: 'callbackQueryPayloadData'; data: string }) {
    if (!props.chatId || !props.messageId) return;
    pendingKey.value = key;
    try {
        const answer = await tdlibSend({
            _: 'getCallbackQueryAnswer',
            chat_id: props.chatId,
            message_id: props.messageId,
            payload,
        }) as { text: string; show_alert: boolean; url: string };

        if (answer.url) await openButtonUrl(answer.url);
        if (answer.text) {
            const options = { content: answer.text, placement: 'top-right' as const, duration: answer.show_alert ? 5000 : 2500 };
            if (answer.show_alert) {
                await MessagePlugin.error(options);
            } else {
                await MessagePlugin.success(options);
            }
        }
    } catch (e) {
        console.error('Callback query failed:', e);
    } finally {
        pendingKey.value = null;
    }
}

async function openUserButton(userId: number) {
    try {
        const chat = await tdlibSend({ _: 'createPrivateChat', user_id: userId, force: false }) as { id: number };
        await router.push(`/home/chat/${chat.id}`);
    } catch (e) {
        console.error('Open inline keyboard user button failed:', e);
    }
}

async function copyButtonText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        await MessagePlugin.success({ content: '已复制', placement: 'top-right' });
    } catch (e) {
        console.error('Copy inline keyboard button text failed:', e);
    }
}
</script>
