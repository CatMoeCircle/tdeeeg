<template>
    <!-- 列表顶部卡片：新设备登录提示 + 生日横幅 + 音乐播放条合并成一张卡。
         音乐是否显示由父组件决定（打开对话时音乐让位给对话页顶部，生日仍留在列表） -->
    <div v-if="store.unconfirmed || store.showBirthdayBanner || showMusic" class="mx-1 mt-1 rounded-xl overflow-hidden"
        :class="UI_GLASS_SURFACE">
        <!-- 新设备登录待确认 -->
        <div v-if="store.unconfirmed" class="flex flex-col items-center px-3 py-2.5">
            <p class="text-xs font-bold text-gray-900 dark:text-gray-100 text-center">
                {{ t('lng_unconfirmed_auth_title') }}
            </p>
            <p v-if="sessionText" class="mt-1 text-[11px] text-gray-500 dark:text-gray-400 text-center">
                {{ sessionText }}
            </p>
            <div v-if="store.unconfirmedSessionId" class="mt-2 flex items-center justify-center gap-10">
                <button type="button" :disabled="busy" @click="confirmSession"
                    class="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 transition-colors">
                    {{ t('lng_unconfirmed_auth_confirm') }}
                </button>
                <button type="button" :disabled="busy" @click="denySession"
                    class="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 transition-colors">
                    {{ t('lng_unconfirmed_auth_deny') }}
                </button>
            </div>
            <div v-else class="mt-2">
                <button type="button" @click="openDevices"
                    class="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                    {{ t('topTips.sessionReview') }}
                </button>
            </div>
        </div>

        <!-- 新设备登录与下方内容的分隔线 -->
        <div v-if="store.unconfirmed && (store.showBirthdayBanner || showMusic)" class="h-px bg-gray-200/70 dark:bg-gray-700/70"></div>

        <!-- 生日 -->
        <div v-if="store.showBirthdayBanner" class="flex items-center gap-1.5 pl-2.5 pr-2.5 py-1">
            <div role="button" tabindex="0" class="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                @click="openBirthdayChat" @keydown.enter.prevent="openBirthdayChat"
                @keydown.space.prevent="openBirthdayChat">
                <Avatar :photo="primaryUser?.profile_photo" :title="displayName" :first-name="primaryUser?.first_name"
                    :last-name="primaryUser?.last_name" sizeClass="!w-8 !h-8" class="shrink-0" />
                <div class="min-w-0 flex-1">
                    <!-- 文案来自 TDLib 语言包（含 **加粗**），样式里把加粗段落染成链接色 -->
                    <p v-html="titleHtml" class="birthday-title text-xs leading-tight text-gray-900 dark:text-gray-100">
                    </p>
                    <p class="text-[10px] leading-tight text-gray-500 dark:text-gray-400">{{ subtitle }}</p>
                </div>
            </div>
            <button type="button" :aria-label="t('lng_close')"
                class="w-5 h-5 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                @click="dismissBirthday">
                <X class="w-3 h-3" />
            </button>
        </div>

        <!-- 生日与音乐之间的分隔线 -->
        <div v-if="store.showBirthdayBanner && showMusic" class="h-px bg-gray-200/70 dark:bg-gray-700/70"></div>

        <!-- 音乐播放条（合并模式：无自身容器、无左侧分隔线） -->
        <MusicPlayerEntry v-if="showMusic" compact merged />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { X } from 'lucide-vue-next';
import Avatar from './avatar.vue';
import MusicPlayerEntry from '../audio/MusicPlayerEntry.vue';
import { toast } from '../../utils/toast';
import { tdlibSend } from '../../utils/tdlib';
import { UI_GLASS_SURFACE } from '../../utils/folderPillsTabClass';
import { tdHtml, tdPlural } from '../../utils/tdLang';
import { tdHtmlText } from '../../utils/tdMarkdown';
import { ensureUser, getReactiveUser, getUserDisplayName } from '../../utils/senderInfo';
import { useTopTipsStore } from '../../store/topTips';
import { useAudioPlayerStore } from '../../store/audioPlayer';

const props = withDefaults(
    defineProps<{
        /** 列表里是否显示音乐行：打开对话时由父组件关掉（音乐已移到对话页顶部） */
        showMusic?: boolean;
    }>(),
    { showMusic: true },
);

const { t } = useI18n();
const router = useRouter();
const store = useTopTipsStore();
const player = useAudioPlayerStore();

const hasMusic = computed(() => player.showEntry && !!player.currentTrack);
/** 实际渲染的音乐行：父组件允许且确实有曲目 */
const showMusic = computed(() => props.showMusic && hasMusic.value);
/** 会话操作进行中，避免重复发请求 */
const busy = ref(false);

const sessionText = computed(() => {
    const session = store.unconfirmed;
    if (!session) return '';
    const from = session.device_model?.trim() ?? '';
    const country = session.location?.trim() ?? '';
    const count = store.unconfirmedCount > 1 ? store.unconfirmedCount : 1;
    if (count > 1) {
        return country
            ? t('lng_unconfirmed_auth_multiple_from', { count, country })
            : t('lng_unconfirmed_auth_multiple', { count });
    }
    return t('lng_unconfirmed_auth_single', { from, country });
});

async function confirmSession() {
    if (busy.value) return;
    busy.value = true;
    try {
        await store.confirmUnconfirmedSession();
        toast.success(t('lng_unconfirmed_auth_confirmed'));
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    } finally {
        busy.value = false;
    }
}

async function denySession() {
    if (busy.value) return;
    busy.value = true;
    const country = store.unconfirmed?.location?.trim() ?? '';
    try {
        await store.terminateUnconfirmedSession();
        toast.success(country
            ? t('lng_unconfirmed_auth_denied_single', { country })
            : t('lng_unconfirmed_auth_denied_title', { count: 1 }));
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    } finally {
        busy.value = false;
    }
}

function openDevices() {
    void router.push({ name: 'settings-devices' });
}

const birthdayCount = computed(() => store.birthdayRows.length);
const primaryUser = computed(() => {
    const row = store.birthdayRows[0];
    return row ? getReactiveUser(row.userId) : undefined;
});
const displayName = computed(() => {
    const row = store.birthdayRows[0];
    if (!row) return '';
    // 用户资料还没拉回来时先占位，避免出现“今天是  的生日”
    return getUserDisplayName(row.userId) || '…';
});

/** 标题：官方文案里 {text} 是用户链接，这里包一层 ** 让样式统一成链接色 */
const titleHtml = computed(() => {
    if (birthdayCount.value > 1) {
        return tdHtmlText(tdPlural('lng_dialogs_suggestions_birthday_contacts_title', birthdayCount.value));
    }
    return tdHtml('lng_dialogs_suggestions_birthday_contact_title', { text: `**${displayName.value}**` });
});

const subtitle = computed(() =>
    birthdayCount.value > 1
        ? t('lng_dialogs_suggestions_birthday_contacts_about')
        : t('lng_dialogs_suggestions_birthday_contact_about'),
);

// 生日名单里的人可能还没缓存，按需拉一次；加载完成后头像/名字自动刷新
watch(
    () => store.birthdayRows,
    (rows) => {
        for (const row of rows) {
            void ensureUser(row.userId);
        }
    },
    { immediate: true },
);

async function dismissBirthday() {
    try {
        await store.hideContactBirthdays();
        toast.info(t('lng_dialogs_suggestions_birthday_contact_dismiss'));
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    }
}

async function openBirthdayChat() {
    const row = store.birthdayRows[0];
    if (!row) return;
    try {
        const chat = (await tdlibSend({ _: 'createPrivateChat', user_id: row.userId, force: false })) as { id?: number };
        if (chat?.id) {
            void router.push({ name: 'chat-detail', params: { id: String(chat.id) } });
        }
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    }
}
</script>

<style scoped>
/* v-html 内容不带 scoped 属性，用 :deep 命中官方文案里的 **加粗** 段落 */
.birthday-title :deep(strong) {
    color: #3b82f6;
    font-weight: inherit;
}
</style>
