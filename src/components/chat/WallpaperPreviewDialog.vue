<template>
    <Teleport to="body">
        <Transition name="wp-preview">
            <div v-if="open" class="wp-preview fixed inset-0 z-9998 flex flex-col overflow-hidden bg-neutral-900"
                role="dialog" aria-modal="true" aria-labelledby="wallpaper-preview-title">
                <!-- 壁纸背景：整屏铺满 -->
                <ChatBackgroundLayers :render="previewRender" :overlay-opacity="0" />

                <!-- 上下压暗：花哨壁纸上标题 / 按钮仍可读 -->
                <div class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent">
                </div>
                <div
                    class="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/45 to-transparent">
                </div>

                <!-- 标题 -->
                <div class="relative z-10 flex shrink-0 items-center justify-center px-12 pb-2 pt-4">
                    <h2 id="wallpaper-preview-title" class="truncate text-base font-semibold text-white drop-shadow">
                        {{ t('lng_background_header') }}
                    </h2>
                    <!-- 关闭按钮固定在左上角：右上角是应用自身的窗口按钮，放那里会点不到、还会误关窗口 -->
                    <button type="button" :aria-label="t('lng_close')"
                        class="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 hover:bg-black/60"
                        @click="emit('close')">
                        <XIcon class="h-5 w-5" />
                    </button>
                </div>

                <!-- 预览区：独立提示行 + 左右聊天气泡 -->
                <div class="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-3 px-8 py-4">
                    <div class="flex justify-center">
                        <span
                            class="max-w-full truncate rounded-full bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
                            {{ t('lng_background_other_info', { user: userName }) }}
                        </span>
                    </div>
                    <div class="flex justify-start">
                        <div
                            class="max-w-[70%] rounded-2xl rounded-bl-md bg-white px-2.5 py-1.5 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-200">
                            {{ t('lng_background_apply1') }}
                        </div>
                    </div>
                    <div class="flex justify-end">
                        <div class="max-w-[70%] rounded-2xl rounded-br-md px-2.5 py-1.5 text-sm text-gray-900 shadow-sm"
                            :style="selfBubbleStyle">
                            {{ t('lng_background_apply2') }}
                        </div>
                    </div>
                </div>

                <!-- 模糊勾选 + 底部按键 -->
                <div class="relative z-10 shrink-0 px-6 pb-6">
                    <label
                        class="mx-auto flex w-fit cursor-pointer select-none items-center gap-2 text-sm font-medium text-white drop-shadow">
                        <input type="checkbox" class="peer sr-only" :checked="blurred" @change="toggleBlur" />
                        <span
                            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white/85 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-white/70"
                            :class="blurred ? 'bg-white text-[#3390ec]' : 'bg-black/20'">
                            <CheckIcon v-if="blurred" class="h-3.5 w-3.5" :stroke-width="3" />
                        </span>
                        {{ t('lng_background_blur') }}
                    </label>

                    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <button type="button" class="wp-btn" :disabled="!canApplySelf || applying" @click="apply(true)">
                            {{ t('lng_background_apply_me') }}
                        </button>
                        <button type="button" class="wp-btn" :disabled="!canApplyBoth || !isPremium || applying"
                            @click="apply(false)">
                            <!-- 为自己和对方应用需要 Telegram Premium -->
                            <LockIcon v-if="!isPremium" class="h-3.5 w-3.5 shrink-0" />
                            {{ t('lng_background_apply_both', { user: userName }) }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { CheckIcon, Lock as LockIcon, XIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import type { BackgroundType, BackgroundType$Input, InputBackground$Input, chatBackground } from 'tdlib-types';
import ChatBackgroundLayers from './ChatBackgroundLayers.vue';
import { useUserStore } from '../../store/user';
import { isDark } from '../../store/theme';
import { emojiChatThemes } from '../../store/chatBackground';
import {
    backgroundDocumentFile,
    resolveChatBackground,
    type ChatBackgroundRender,
} from '../../utils/chatBackground';
import { ensureLocalFilePath, tdlibSend } from '../../utils/tdlib';

const props = defineProps<{
    open: boolean;
    /** 服务消息里的对话背景（chatBackground：background + dark_theme_dimming） */
    wallpaper?: chatBackground | null;
    /** 提示与按钮里的 {user}（对话对方名称） */
    userName?: string;
    /** 目标对话 id（应用壁纸需要） */
    chatId?: number;
    /** 该壁纸所属的服务消息 id（沿用消息里的背景需要） */
    messageId?: number;
}>();

const emit = defineEmits<{
    close: [];
}>();

const userStore = useUserStore();

/** 「为自己和对方应用」仅限 Telegram Premium */
const isPremium = computed(() => !!userStore.userProfile?.is_premium);

/** 与自己消息气泡同色（见 ChatDetail/composables/bubbleStyle.ts 的 SELF_BUBBLE_GREEN） */
const selfBubbleStyle = { background: 'rgb(227,254,224)' };

const render = ref<ChatBackgroundRender | null>(null);
/** 模糊勾选：对应 TDLib backgroundTypeWallpaper.is_blurred */
const blurred = ref(false);

/** 预览用背景模型：模糊取勾选框，暗色主题压暗与聊天区保持一致 */
const previewRender = computed<ChatBackgroundRender | null>(() => {
    const current = render.value;
    if (!current) return null;
    return {
        ...current,
        wallpaper: current.wallpaper ? { ...current.wallpaper, blurred: blurred.value } : undefined,
        dimming: isDark.value ? props.wallpaper?.dark_theme_dimming ?? 0 : 0,
    };
});

async function resolveRender() {
    const background = props.wallpaper?.background;
    render.value = background
        ? await resolveChatBackground(background, {
            dark: isDark.value,
            emojiThemes: emojiChatThemes(),
            files: 'full',
        })
        : null;
}

// 打开时解析背景；原图 / 图案文档常未下载，取回后重算，避免整屏只有模糊缩略图
watch(
    () => [props.open, props.wallpaper] as const,
    async ([open, wallpaper]) => {
        if (!open) return;
        const background = wallpaper?.background ?? null;
        blurred.value = background?.type?._ === 'backgroundTypeWallpaper' ? background.type.is_blurred : false;
        await resolveRender();
        const document = background ? backgroundDocumentFile(background) : null;
        if (document && !document.local?.is_downloading_completed && document.local?.can_be_downloaded) {
            if (await ensureLocalFilePath(document)) await resolveRender();
        }
    },
    { immediate: true },
);

/** 应用时提交的背景类型（壁纸的模糊状态取勾选框；chat theme 不能用于私聊，交给 TDLib 选默认） */
const inputType = computed<BackgroundType$Input | undefined>(() => {
    const type: BackgroundType | undefined = props.wallpaper?.background?.type;
    switch (type?._) {
        case 'backgroundTypeWallpaper':
            return { _: 'backgroundTypeWallpaper', is_blurred: blurred.value, is_moving: type.is_moving };
        case 'backgroundTypePattern':
            return {
                _: 'backgroundTypePattern',
                fill: type.fill,
                intensity: type.intensity,
                is_inverted: type.is_inverted,
                is_moving: type.is_moving,
            };
        case 'backgroundTypeFill':
            return { _: 'backgroundTypeFill', fill: type.fill };
        default:
            return undefined;
    }
});

/**
 * 「为自己应用」走 inputBackgroundPrevious：沿用这条消息里那张背景，而不是提交一张新背景。
 * inputBackgroundRemote 会被服务端当成「新设置了一次壁纸」，多出一条「你为此聊天设置了新壁纸」
 * 服务消息。实测（本对话，TDLib）：previous / remote 都会让服务端记录一条消息，但只有 remote
 * 会生成「新壁纸」那条；previous 记录的是「与对方相同的壁纸」这类既有提示。
 */
const selfInput = computed<InputBackground$Input | null>(() =>
    props.messageId ? { _: 'inputBackgroundPrevious', message_id: props.messageId } : null,
);

/** 「为自己和对方应用」：TDLib 不允许 previous 配 only_for_self=false，只能提交云端背景 id */
const bothInput = computed<InputBackground$Input | null>(() => {
    const id = props.wallpaper?.background?.id;
    return id ? { _: 'inputBackgroundRemote', background_id: id } : null;
});

const canApplySelf = computed(() => !!props.chatId && !!selfInput.value);
const canApplyBoth = computed(() => !!props.chatId && !!bothInput.value);

const applying = ref(false);

function toggleBlur() {
    blurred.value = !blurred.value;
}

/** 应用壁纸：onlyForSelf=true 只为自己，false 为自己和对方（会员） */
async function apply(onlyForSelf: boolean) {
    const chatId = props.chatId;
    const background = onlyForSelf ? selfInput.value : bothInput.value;
    if (!chatId || !background || applying.value) return;
    applying.value = true;
    try {
        await tdlibSend({
            _: 'setChatBackground',
            chat_id: chatId,
            background,
            type: inputType.value,
            dark_theme_dimming: props.wallpaper?.dark_theme_dimming ?? 0,
            only_for_self: onlyForSelf,
        });
        emit('close');
    } catch (e) {
        console.error('[wallpaper] setChatBackground failed:', e);
        const detail = (e as { message?: string })?.message;
        MessagePlugin.error(detail || t('wallpaper.previewApplyFailed'));
    } finally {
        applying.value = false;
    }
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.wp-preview {
    isolation: isolate;
}

.wp-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border-radius: 9999px;
    background: rgb(255 255 255 / 0.16);
    padding: 0.5rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #fff;
    backdrop-filter: blur(4px);
    transition: background-color 0.15s ease;
}

.wp-btn:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.26);
}

.wp-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.wp-btn:focus-visible {
    outline: 2px solid rgb(255 255 255 / 0.7);
    outline-offset: 2px;
}

.wp-preview-enter-active,
.wp-preview-leave-active {
    transition: opacity 0.16s ease;
}

.wp-preview-enter-from,
.wp-preview-leave-to {
    opacity: 0;
}
</style>
