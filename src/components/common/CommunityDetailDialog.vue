<template>
    <Teleport to="body">
        <Transition name="community-dialog">
            <div v-if="open" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="community-dialog-title" @mousedown.self="close">
                <div @keydown.esc.stop="close"
                    class="flex max-h-[90vh] w-105 max-w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-gray-100 shadow-2xl dark:border-white/10 dark:bg-gray-900">
                    <!-- 头部：小头像 + 社区名；右侧设置（仅管理员）和关闭 -->
                    <div class="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
                        <CommunityAvatar :photo="photo" :title="name" size-class="w-10 h-10" />
                        <div class="min-w-0 flex-1">
                            <h2 id="community-dialog-title"
                                class="truncate text-lg font-semibold text-gray-900 dark:text-white">
                                <GlobalEmojiText :text="name" />
                            </h2>
                        </div>
                        <!-- TODO: 社区设置页尚未实现，此入口先只按身份显示 -->
                        <button v-if="isCommunityAdmin" type="button" :aria-label="t('lng_manage_community_title')"
                            :title="t('lng_manage_community_title')"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="settingsOpen = true">
                            <Settings2Icon class="h-4.5 w-4.5" />
                        </button>
                        <button type="button" :aria-label="t('lng_close')"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="close">
                            <XIcon class="h-5 w-5" />
                        </button>
                    </div>

                    <!-- 群组列表：已加入的聊天（一整块圆角卡片） / 可查看的聊天 / 隐藏的聊天 -->
                    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                        <template v-if="loading">
                            <div class="rounded-xl bg-gray-100 dark:bg-gray-700/50 p-2">
                                <div v-for="n in 5" :key="n" class="flex items-center gap-3 px-3 py-2.5">
                                    <div class="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"></div>
                                    <div class="flex-1">
                                        <div class="mb-1.5 h-3.5 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                                        <div class="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template v-else>
                            <template v-for="section in sections" :key="section.key">
                                <template v-if="section.rows.length">
                                    <h3 class="px-1 pb-1.5 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                        {{ t(section.label) }}
                                    </h3>
                                    <!-- 每个分段是一整块圆角区域，背景使用白色 -->
                                    <div class="mb-2 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                                        <button v-for="(row, index) in section.rows" :key="row.chat.id" type="button"
                                            class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                            :class="{ 'border-t border-gray-100 dark:border-gray-700': index > 0 }"
                                            @click="openChat(row.chat.id)">
                                            <div class="h-10 w-10 shrink-0">
                                                <Avatar :photo="row.chat.photo" :title="row.chat.title"
                                                    :radius="settings.chatList.avatarCornerRadius" />
                                            </div>
                                            <div class="min-w-0 flex-1">
                                                <div class="mb-0.5 flex items-baseline justify-between gap-2">
                                                    <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                        <GlobalEmojiText :text="row.chat.title" />
                                                    </h3>
                                                    <span v-if="row.chat.last_message"
                                                        class="shrink-0 text-xs text-gray-400">
                                                        {{ formatTime(row.chat.last_message.date) }}
                                                    </span>
                                                </div>
                                                <div class="flex items-center gap-2">
                                                    <p v-if="row.preview" class="min-w-0 flex-1 truncate text-xs text-gray-500">
                                                        <FormattedTextInline :formattedText="row.preview" :size="14" />
                                                    </p>
                                                    <span
                                                        class="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-[#168acd] dark:bg-sky-900/30 dark:text-sky-400">
                                                        {{ typeLabel(row.chat) }}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                </template>
                            </template>
                            <p v-if="!rows.length" class="px-3 py-8 text-center text-sm text-gray-400">
                                {{ t('lng_community_chats', { count: 0 }) }}
                            </p>
                        </template>
                    </div>

                    <!-- 社区设置弹窗 -->
                    <CommunitySettingsDialog v-model:open="settingsOpen" :community-id="communityId"
                        :name="name" :photo="photo" :community-chats="rows.map(r => r.chat)"
                        @deleted="close" />
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Settings2Icon, XIcon } from 'lucide-vue-next';
import type {
    ChatMemberStatus,
    chat,
    chatPhotoInfo,
    communityFullInfo,
    formattedText,
    message,
} from 'tdlib-types';
import { tdlibSend } from '../../utils/tdlib';
import { settings } from '../../store/settings';
import { useCommunityStore } from '../../store/community';
import Avatar from '../chat/avatar.vue';
import FormattedTextInline from '../chat/FormattedTextInline.vue';
import GlobalEmojiText from './GlobalEmojiText.vue';
import CommunityAvatar from './CommunityAvatar.vue';
import CommunitySettingsDialog from './CommunitySettingsDialog.vue';
import formatTime from '../../utils/formatTime';

const props = defineProps<{
    open: boolean;
    communityId: number;
    /** 社区名/头像（社区入口卡片已取得，未传则回退到 store 缓存） */
    name?: string;
    photo?: chatPhotoInfo;
}>();

const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

const { t } = useI18n();
const router = useRouter();
const communityStore = useCommunityStore();

/** 社群对象（含当前用户身份），来自 updateCommunity 缓存 */
const communityInfo = computed(() => communityStore.communities[props.communityId]);
/** 社区名称：优先使用后端 store 缓存，其次 props，最后回退 */
const name = computed(() => communityInfo.value?.name || props.name || t('lng_community_title'));
const photo = computed(() => communityInfo.value?.photo || props.photo);

/** 社区管理员或拥有者：右上角显示社区设置入口 */
const isCommunityAdmin = computed(() => {
    const st = communityInfo.value?.status;
    return !!communityInfo.value?.have_access
        && (st?._ === 'communityMemberStatusCreator' || st?._ === 'communityMemberStatusAdministrator');
});

/** 社区设置弹窗开关 */
const settingsOpen = ref(false);

interface CommunityChatRow {
    chat: chat;
    /** 已在聊天内（已加入） */
    joined: boolean;
    /** 在社群聊天列表中隐藏（仅管理员能收到该标记） */
    hidden: boolean;
    /** 最后一条消息的纯文本预览；无文字内容时为空 */
    preview?: formattedText;
}

const rows = shallowRef<CommunityChatRow[]>([]);
const loading = ref(false);

/** 三个分段与 Telegram 官方文案一致：已加入 / 可查看 / 隐藏 */
const sections = computed(() => [
    { key: 'joined', label: 'lng_community_chats_joined', rows: rows.value.filter((r) => !r.hidden && r.joined) },
    { key: 'viewable', label: 'lng_community_chats_viewable', rows: rows.value.filter((r) => !r.hidden && !r.joined) },
    { key: 'hidden', label: 'lng_community_chats_requestable', rows: rows.value.filter((r) => r.hidden) },
]);

function close() {
    emit('update:open', false);
}

function openChat(chatId: number) {
    close();
    router.push({ name: 'chat-detail', params: { id: String(chatId) } });
}

/** 成员身份：创建者/管理员/成员算已加入，受限成员看 is_member，退出/被封禁不算 */
function statusIsMember(status: ChatMemberStatus): boolean {
    switch (status._) {
        case 'chatMemberStatusCreator':
        case 'chatMemberStatusAdministrator':
        case 'chatMemberStatusMember':
            return true;
        case 'chatMemberStatusRestricted':
            return status.is_member;
        default:
            return false;
    }
}

async function isJoined(chatObj: chat): Promise<boolean> {
    // 与机器人的私聊天然在聊天列表里；超级群/频道看成员身份
    if (chatObj.type._ !== 'chatTypeSupergroup') return true;
    try {
        const sg = await tdlibSend({ _: 'getSupergroup', supergroup_id: chatObj.type.supergroup_id });
        return statusIsMember(sg.status);
    } catch (e) {
        console.error('Failed to load community chat member status', e);
        return false;
    }
}

/** 最后一条消息的纯文本预览：只取正文/媒体说明，不臆造媒体占位文案 */
function previewText(m?: message): formattedText | undefined {
    const content = m?.content;
    if (!content) return undefined;
    if (content._ === 'messageText') return content.text.text ? content.text : undefined;
    if ('caption' in content && content.caption?.text) return content.caption;
    return undefined;
}

/** 聊天类型标签 */
function typeLabel(chatObj: chat): string {
    if (chatObj.type._ === 'chatTypeSupergroup') {
        return t(chatObj.type.is_channel ? 'lng_sr_chat_channel' : 'lng_sr_chat_group');
    }
    if (chatObj.type._ === 'chatTypePrivate') return t('lng_sr_chat_bot');
    return t('lng_sr_chat_group');
}

async function load() {
    const id = props.communityId;
    if (!id) return;
    loading.value = true;
    rows.value = [];
    try {
        // 主动从后端获取社区信息（确保名称等数据就绪）
        await communityStore.fetchCommunity(id);

        const full = (await tdlibSend({
            _: 'getCommunityFullInfo',
            community_id: id,
        })) as communityFullInfo;
        const loaded = await Promise.all(
            full.chats.map(async (c): Promise<CommunityChatRow | null> => {
                try {
                    const chatObj = (await tdlibSend({ _: 'getChat', chat_id: c.chat_id })) as chat;
                    return {
                        chat: chatObj,
                        joined: await isJoined(chatObj),
                        hidden: c.is_hidden,
                        preview: previewText(chatObj.last_message),
                    };
                } catch (e) {
                    console.error('Failed to load community chat', c.chat_id, e);
                    return null;
                }
            }),
        );
        if (props.communityId !== id) return;
        rows.value = loaded.filter((r): r is CommunityChatRow => r !== null);
    } catch (e) {
        console.error('Failed to load community full info', e);
    } finally {
        if (props.communityId === id) loading.value = false;
    }
}

// 每次打开都重新拉取：群组可能被增删，成员身份也可能变化
watch(
    () => props.open,
    (open) => {
        if (open) void load();
    },
    { immediate: true },
);
</script>

<style scoped>
.community-dialog-enter-active,
.community-dialog-leave-active {
    transition: opacity 0.2s ease;
}

.community-dialog-enter-from,
.community-dialog-leave-to {
    opacity: 0;
}
</style>
