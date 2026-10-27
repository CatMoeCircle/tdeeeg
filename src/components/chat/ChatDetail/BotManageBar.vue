<template>
    <!-- 业务机器人接管当前聊天时的顶栏：头像 + 名称/状态 + 暂停/恢复 + 更多 -->
    <div class="px-3 pt-1">
        <div
            class="flex items-center gap-2.5 h-12 pl-2 pr-1.5 rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <Avatar :photo="botUser?.profile_photo" :title="botName" :first-name="botUser?.first_name"
                :last-name="botUser?.last_name" sizeClass="!w-9 !h-9" />
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ botName }}</p>
                <p class="text-xs text-gray-400 truncate">{{ statusText }}</p>
            </div>
            <!-- 暂停/恢复：仅当机器人当前有回复权限时可用（状态由 TDLib update 回填） -->
            <button v-if="bar.can_bot_reply" type="button" :disabled="busy" @click="togglePaused"
                class="shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-60 disabled:active:scale-100 transition-[background-color,transform] duration-150">
                {{ bar.is_bot_paused ? t('lng_chatbot_button_resume') : t('lng_chatbot_button_pause') }}
            </button>
            <button type="button" @click="openMenu"
                class="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/10 active:scale-95 transition-[background-color,transform] duration-150"
                :aria-label="t('lng_chatbot_menu_manage')" :title="t('lng_chatbot_menu_manage')">
                <MoreHorizontalIcon class="w-4.5 h-4.5" />
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { MoreHorizontal as MoreHorizontalIcon, Settings as SettingsIcon, Trash2 as Trash2Icon } from 'lucide-vue-next';
import type { businessBotManageBar } from 'tdlib-types';
import Avatar from '../avatar.vue';
import { tdlibSend } from '../../../utils/tdlib';
import { ensureUser, getReactiveUser } from '../../../utils/senderInfo';
import { userNameOf } from '../../../utils/groupRights';
import { openContextMenu } from '../../../store/contextMenu';
import { openAnyLink } from '../../../utils/openInternalLink';
import { toast } from '../../../utils/toast';
import type { ContextMenuItem } from '../../contextMenu/types';

const props = defineProps<{
    chatId?: number;
    bar: businessBotManageBar;
}>();

const { t } = useI18n();
const router = useRouter();
const busy = ref(false);

const botUser = computed(() => getReactiveUser(props.bar.bot_user_id));
const botName = computed(() => userNameOf(props.bar.bot_user_id));

/** 状态文案：已暂停 > 可回复（管理此聊天） > 仅有访问权限 */
const statusText = computed(() => {
    if (props.bar.is_bot_paused) return t('lng_chatbot_status_paused');
    return props.bar.can_bot_reply
        ? t('lng_chatbot_status_can_reply')
        : t('lng_chatbot_status_views');
});

/** 机器人用户信息缺失时补拉（头像/名称可能还没进缓存） */
watch(() => props.bar.bot_user_id, (id) => {
    if (id) void ensureUser(id);
}, { immediate: true });

async function togglePaused() {
    if (busy.value || props.chatId === undefined) return;
    busy.value = true;
    try {
        await tdlibSend({
            _: 'toggleBusinessConnectedBotChatIsPaused',
            chat_id: props.chatId,
            is_paused: !props.bar.is_bot_paused,
        });
    } catch (e: any) {
        toast.error(e?.message || t('lng_settings_save'));
    } finally {
        busy.value = false;
    }
}

/** 打开机器人自己的管理页（manage_url）：t.me 深层链接内部处理，只有真的外部链接才走浏览器 */
function manageBot() {
    const url = props.bar.manage_url;
    if (!url) return;
    void openAnyLink(url, router);
}

/** 把该聊天从机器人管理中移除 */
async function removeBot() {
    if (props.chatId === undefined) return;
    try {
        await tdlibSend({
            _: 'removeBusinessConnectedBotFromChat',
            chat_id: props.chatId,
        });
    } catch (e: any) {
        toast.error(e?.message || t('lng_settings_save'));
    }
}

function openMenu(e: MouseEvent) {
    const items: ContextMenuItem[] = [
        {
            key: 'manage',
            label: t('lng_chatbot_menu_manage'),
            icon: SettingsIcon,
            onClick: manageBot,
        },
        {
            key: 'remove',
            label: t('lng_chatbot_menu_remove'),
            icon: Trash2Icon,
            danger: true,
            onClick: () => { void removeBot(); },
        },
    ];
    openContextMenu(e.clientX, e.clientY, items, e.currentTarget as HTMLElement);
}
</script>
