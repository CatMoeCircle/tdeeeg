<template>
    <!-- 与 ChatDetail / 群事件日志一致：专属背景或关闭全屏显示时自己铺壁纸，否则透出 HomeView 默认壁纸 -->
    <div class="h-full relative overflow-hidden chat-wallpaper-root flex flex-col" :style="rootStyle">
        <ChatBackgroundLayers v-if="drawsOwnWallpaper" :render="render" :overlay-opacity="overlayOpacity"
            :blur-px="blurPx" />

        <div
            class="relative z-10 p-4 border-b border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md flex items-center gap-3 shrink-0">
            <button type="button" :aria-label="t('lng_menu_back')"
                class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold flex-1 truncate">{{ title }}</h2>
            <button type="button" :aria-label="t('lng_scheduled_messages')" :disabled="loading"
                class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                @click="reload">
                <RefreshCwIcon class="w-4.5 h-4.5 text-gray-500" />
            </button>
        </div>

        <div class="relative z-10 flex-1 overflow-y-auto custom-scrollbar" :style="messagesStyle">
            <div class="max-w-3xl mx-auto w-full px-4 py-3">
                <template v-if="loading && items.length === 0">
                    <LoadingSkeleton variant="list" :rows="6" :label="t('lng_context_seen_loading')" />
                </template>

                <div v-else-if="items.length === 0"
                    class="rounded-xl border border-dashed border-gray-300/70 dark:border-gray-600/70 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    {{ t('lng_scheduled_messages_empty') }}
                </div>

                <template v-for="(item, index) in items" :key="item.id">
                    <!-- 日期分隔：与聊天历史一致；「在线时发送」用官方状态文案 -->
                    <div v-if="showDivider(index)" class="flex justify-center my-2">
                        <span
                            class="msg-notice-surface text-xs text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full leading-none select-none">
                            {{ dividerLabel(index) }}
                        </span>
                    </div>

                    <!-- 单条定时消息：按历史消息的行 / 气泡样式渲染（自己发送 → 右侧气泡） -->
                    <!-- .stop 必须加：main.ts 的全局 contextmenu 监听会先 closeContextMenu()，
                         不阻断冒泡会把刚打开的菜单立刻关掉 -->
                    <div class="msg-list-item group flex justify-end mb-1"
                        @contextmenu.prevent.stop="onRowContextMenu($event, item)">
                        <div class="relative flex min-w-0 max-w-[70%] flex-col items-end">
                            <button type="button"
                                class="absolute -left-9 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity"
                                :aria-label="t('lng_scheduled_messages')"
                                @click="onRowContextMenu($event, item)">
                                <MoreHorizontalIcon class="w-4 h-4" />
                            </button>
                            <div :data-bubble-msg-id="item.id" :class="bubbleClass(item)"
                                :style="bubbleStyleFor(item)">
                                <MessageContent :content="item.content" :isSelf="true"
                                    :date="scheduledDate(item)" :scheduled="true" :chatId="chatId" :messageId="item.id"
                                    :message="item" :messageList="items"
                                    :replyTo="item.reply_to && item.reply_to._ === 'messageReplyToMessage' ? item.reply_to : undefined"
                                    :inlineTime="true" />
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <ScheduleMessageDialog v-model="rescheduleOpen" mode="reschedule" :initial-date="rescheduleDate"
            :allow-until-online="canSendWhenOnline" @submit="onRescheduleSubmit" />
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    ChevronLeft as ChevronLeftIcon, MoreHorizontal as MoreHorizontalIcon,
    RefreshCw as RefreshCwIcon, RotateCw as RotateCwIcon,
    SendHorizontal as SendHorizontalIcon, Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import type { $Function, chat, message, messages, user } from 'tdlib-types';
import { storeToRefs } from 'pinia';
import { tdlibSend } from '../../utils/session/tdlib';
import { onTdlibUpdates } from '../../store/session/tdlibBus';
import { useUserStore } from '../../store/session/user';
import { toast } from '../../utils/ui/toast';
import { ensureUser, getReactiveUser } from '../../utils/profile/senderInfo';
import {
    canScheduleUntilOnline, privatePeerUserId, schedulingStateAt, schedulingStateWhenOnline,
} from '../../utils/chat/chatScheduling';
import { isSavedMessagesChat } from '../../utils/chat/savedMessages';
import { settings } from '../../store/settings/settings';
import { useColors } from '../../store/settings/colors';
import { useChatWallpaper } from '../../composables/useChatWallpaper';
import ChatBackgroundLayers from '../../components/chat/ChatBackgroundLayers.vue';
import { useCustomBubbleSkin } from '../../composables/useCustomBubbleSkin';
import { openContextMenu } from '../../store/chat/contextMenu';
import type { ContextMenuItem } from '../../components/contextMenu/types';
import {
    bubbleStyle as computeBubbleStyle,
    messagesStyleCss,
} from '../../components/chat/ChatDetail/composables/bubbleStyle';
import {
    isMediaMessage, isStandaloneMessage, isBubblelessMediaMessage,
} from '../../components/chat/ChatDetail/composables/messageType';
import { formatDateLabel, isSameCalendarDay } from '../../components/chat/ChatDetail/composables/dateLabel';
import MessageContent from '../../components/chat/ChatDetail/MessageContent/index.vue';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import ScheduleMessageDialog, { type ScheduleSubmitPayload } from '../../components/chat/ChatDetail/ScheduleMessageDialog.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const { accentColorStyle, isDark } = useColors();

const chatId = computed(() => Number(route.params.id));
const chatInfo = ref<chat | undefined>(undefined);
const items = ref<message[]>([]);
const loading = ref(true);

/** 对话背景：定时消息页与聊天 / 评论线程使用同一套壁纸逻辑 */
const { drawsOwnWallpaper, render, overlayOpacity, blurPx, rootStyle } = useChatWallpaper(chatInfo);

const title = computed(() =>
    chatInfo.value && isSavedMessagesChat(chatInfo.value, userProfile.value?.id)
        ? t('lng_reminder_messages')
        : t('lng_scheduled_messages')
);

/** 私聊对端用户：决定「在线时发送」是否可用（改时间时同样适用） */
const peerUser = computed<user | undefined>(() => {
    const uid = privatePeerUserId(chatInfo.value);
    return uid ? getReactiveUser(uid) : undefined;
});
const canSendWhenOnline = computed(() => canScheduleUntilOnline(peerUser.value));

const messagesStyle = computed<Record<string, string>>(() => messagesStyleCss(settings.message));

/* ===== 消息渲染：与历史消息一致的气泡样式 ===== */
const customBubbleSkin = useCustomBubbleSkin();

const bubbleDeps = () => ({
    messages: items.value,
    bubbleWidths: {} as Record<number, number>,
    isSelf: () => true,
    getSenderAccentId: () => undefined,
    accentColorStyle,
    isDark: isDark.value,
    settings: settings.message,
    customSkin: customBubbleSkin.value,
});

/** 定时消息全都是自己发的 → 统一右侧气泡；分组按单条处理（首尾都是自己） */
function bubbleStyleFor(item: message): Record<string, string> {
    return computeBubbleStyle(
        { msg: item, isFirstInGroup: true, isLastInGroup: true, index: 0 },
        bubbleDeps(),
    );
}

/** 气泡容器 class：与历史消息的行内 class 规则保持一致 */
function bubbleClass(item: message): string | (string | string[])[] {
    if (isMediaMessage(item)) {
        return [
            'w-fit max-w-full min-w-0 overflow-hidden',
            isBubblelessMediaMessage(item) ? '' : 'shadow-sm',
        ];
    }
    if (isStandaloneMessage(item)) return 'relative max-w-full';
    return ['px-2 py-1.5 shadow-sm max-w-full min-w-30', 'text-gray-900'];
}

/** 定时消息的发送时间（「在线时发送」没有具体时间） */
function scheduledDate(item: message): number | undefined {
    const state = item.scheduling_state;
    if (!state) return undefined;
    return 'send_date' in state && state.send_date ? state.send_date : undefined;
}

function isUntilOnline(item: message): boolean {
    return item.scheduling_state?._ === 'messageSchedulingStateSendWhenOnline';
}

/** 日期分隔：换天时出现；「在线时发送」用官方文案单独标记 */
function showDivider(index: number): boolean {
    const current = items.value[index];
    const previous = items.value[index - 1];
    if (!current) return false;
    if (isUntilOnline(current)) return !previous || !isUntilOnline(previous);
    const currentAt = scheduledDate(current);
    if (!currentAt) return false;
    const previousAt = previous ? scheduledDate(previous) : undefined;
    if (!previousAt || isUntilOnline(previous)) return true;
    return !isSameCalendarDay(currentAt, previousAt);
}

function dividerLabel(index: number): string {
    const current = items.value[index];
    if (!current) return '';
    if (isUntilOnline(current)) return t('lng_scheduled_date_until_online');
    const at = scheduledDate(current);
    return at ? formatDateLabel(at) : '';
}

/** 右键 / 悬浮按钮：与历史消息的右键菜单一致，只保留定时消息相关操作 */
function onRowContextMenu(event: MouseEvent, item: message) {
    const menuItems: ContextMenuItem[] = [
        {
            key: 'scheduled-send-now',
            label: t('lng_context_send_now_msg'),
            icon: SendHorizontalIcon,
            onClick: () => { void sendNow(item); },
        },
        {
            key: 'scheduled-reschedule',
            label: t('lng_context_reschedule'),
            icon: RotateCwIcon,
            onClick: () => openReschedule(item),
        },
        { divider: true, label: '' },
        {
            key: 'scheduled-delete',
            label: t('lng_context_delete_msg'),
            icon: Trash2Icon,
            danger: true,
            onClick: () => { void remove(item); },
        },
    ];
    openContextMenu(event.clientX, event.clientY, menuItems);
}

async function loadChat() {
    if (!chatId.value) return;
    try {
        chatInfo.value = await tdlibSend({ _: 'getChat', chat_id: chatId.value });
        // 私聊对端：拉一次用户信息，在线状态用于「在线时发送」
        const uid = privatePeerUserId(chatInfo.value);
        if (uid) await ensureUser(uid);
    } catch (e) {
        console.warn('load chat for scheduled messages failed:', e);
    }
}

async function reload() {
    if (!chatId.value) return;
    loading.value = true;
    try {
        const res = await tdlibSend({
            _: 'getChatScheduledMessages',
            chat_id: chatId.value,
        }) as messages;
        items.value = (res.messages ?? [])
            .filter((m): m is message => !!m)
            .sort((a, b) => scheduledSortKey(a) - scheduledSortKey(b));
    } catch (e: any) {
        console.error('getChatScheduledMessages failed:', e);
        toast.error(e?.message || String(e));
    } finally {
        loading.value = false;
    }
}

/** 排序键：具体时间在前，按时间升序；「在线时发送」排在最后 */
function scheduledSortKey(item: message): number {
    return scheduledDate(item) ?? Number.MAX_SAFE_INTEGER;
}

/** 合并短时间内的多次更新，避免批量删除 / 发送时反复整表重拉 */
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void reload();
    }, 250);
}

function goBack() {
    // 有历史记录按原路返回；直接打开该路由时回到会话页
    const previous = router.options.history.state.back;
    if (previous) router.back();
    else void router.replace({ name: 'chat-detail', params: { id: String(chatId.value) } });
}

async function sendNow(item: message) {
    try {
        await tdlibSend({
            _: 'editMessageSchedulingState',
            chat_id: chatId.value,
            message_id: item.id,
            // TDLib：传 null 表示立即发送
            scheduling_state: null,
        } as unknown as $Function);
        items.value = items.value.filter((m) => m.id !== item.id);
    } catch (e: any) {
        console.error('send scheduled message now failed:', e);
        toast.error(e?.message || String(e));
    }
}

async function remove(item: message) {
    try {
        await tdlibSend({
            _: 'deleteMessages',
            chat_id: chatId.value,
            message_ids: [item.id],
            revoke: true,
        });
        items.value = items.value.filter((m) => m.id !== item.id);
    } catch (e: any) {
        console.error('delete scheduled message failed:', e);
        toast.error(e?.message || String(e));
    }
}

/* ===== 重新定时 ===== */
const rescheduleOpen = ref(false);
const rescheduleDate = ref(0);
const rescheduleItem = ref<message | undefined>(undefined);

function openReschedule(item: message) {
    rescheduleItem.value = item;
    const at = scheduledDate(item);
    rescheduleDate.value = at ?? 0;
    rescheduleOpen.value = true;
}

async function onRescheduleSubmit(payload: ScheduleSubmitPayload) {
    const item = rescheduleItem.value;
    if (!item) return;
    const state = payload.untilOnline
        ? schedulingStateWhenOnline()
        : schedulingStateAt(payload.sendAt ?? 0);
    try {
        await tdlibSend({
            _: 'editMessageSchedulingState',
            chat_id: chatId.value,
            message_id: item.id,
            scheduling_state: state,
        } as $Function);
        rescheduleItem.value = undefined;
        void reload();
    } catch (e: any) {
        console.error('reschedule scheduled message failed:', e);
        toast.error(e?.message || String(e));
    }
}

/* ===== 更新订阅：定时消息的增删 / 发送完成都触发重拉 ===== */
let unsubscribeUpdates: (() => void) | null = null;
onMounted(() => {
    void loadChat();
    void reload();
    unsubscribeUpdates = onTdlibUpdates(['message', 'chat'], (update) => {
        switch (update._) {
            case 'updateNewMessage': {
                const m = update.message as message;
                if (m?.chat_id === chatId.value && m.scheduling_state) scheduleReload();
                break;
            }
            case 'updateDeleteMessages': {
                if ((update as { chat_id?: number }).chat_id === chatId.value) scheduleReload();
                break;
            }
            case 'updateMessageSendSucceeded': {
                const m = (update as { message?: message }).message;
                if (m?.chat_id === chatId.value) scheduleReload();
                break;
            }
            case 'updateMessageContent': {
                if ((update as { chat_id?: number }).chat_id !== chatId.value) break;
                if (items.value.some((m) => m.id === (update as { message_id?: number }).message_id)) {
                    scheduleReload();
                }
                break;
            }
            case 'updateChatHasScheduledMessages': {
                if ((update as { chat_id?: number }).chat_id !== chatId.value) break;
                if (chatInfo.value) {
                    chatInfo.value.has_scheduled_messages =
                        (update as { has_scheduled_messages?: boolean }).has_scheduled_messages ?? false;
                }
                scheduleReload();
                break;
            }
            default:
                break;
        }
    });
});

onBeforeUnmount(() => {
    unsubscribeUpdates?.();
    unsubscribeUpdates = null;
    if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
    }
});
</script>
