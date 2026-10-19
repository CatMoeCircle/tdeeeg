<template>
    <Teleport to="body">
        <Transition name="community-settings">
            <div v-if="open"
                class="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" @mousedown.self="close">
                <div @keydown.esc.stop="close"
                    class="flex max-h-[90vh] w-105 max-w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-gray-100 shadow-2xl dark:border-white/10 dark:bg-gray-900">
                    <!-- 头部：返回按钮 + 标题 -->
                    <div class="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
                        <button type="button" :aria-label="t('lng_menu_back')"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="close">
                            <ArrowLeftIcon class="h-5 w-5" />
                        </button>
                        <div class="min-w-0 flex-1">
                            <h2 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
                                {{ t('lng_manage_community_title') }}
                            </h2>
                        </div>
                        <!-- 有未保存改动时右上角出现保存 -->
                        <button v-if="dirty" type="button" :disabled="saving" @click="save"
                            class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-(--app-brand) transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
                            {{ t('lng_settings_save') }}
                        </button>
                    </div>

                    <!-- 内容区域 -->
                    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                        <!-- 头像区域：选好本地文件后直接预览，保存时按路径上传 -->
                        <div class="mb-4 flex flex-col items-center">
                            <img v-if="pickedPhotoPath" :src="pickedPhotoUrl" alt=""
                                class="h-24 w-24 rounded-full object-cover" />
                            <CommunityAvatar v-else :photo="photo" :title="name" size-class="w-24 h-24" />
                        </div>

                        <!-- 更改头像按钮 -->
                        <div class="mb-3 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <button type="button" @click="pickPhoto"
                                class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60">
                                <CameraIcon class="h-6 w-6 text-(--app-brand)" />
                                <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('lng_settings_upload') }}
                                </span>
                            </button>
                        </div>

                        <!-- 社群名称 -->
                        <div class="mb-3 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <div class="px-4 py-3">
                                <p class="mb-2 text-sm font-medium text-(--app-brand)">
                                    {{ t('lng_community_manage_name') }}
                                </p>
                                <input v-model="editName" type="text"
                                    class="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 focus:border-(--app-brand) focus:outline-none dark:border-gray-700 dark:text-gray-100"
                                    :placeholder="name" />
                            </div>
                        </div>

                        <!-- 谁可以添加聊天：直接改社区权限 can_edit_chat_list -->
                        <div class="mb-3 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <div class="px-4 py-3">
                                <p class="mb-3 text-sm font-medium text-(--app-brand)">
                                    {{ t('lng_community_manage_who_add') }}
                                </p>
                                <div class="space-y-3">
                                    <label class="flex items-start gap-3 cursor-pointer">
                                        <input v-model="whoAdd" type="radio" value="all_members"
                                            class="mt-1 h-5 w-5 shrink-0" />
                                        <div class="min-w-0">
                                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {{ t('lng_community_manage_all_members') }}
                                            </p>
                                            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                {{ t('lng_community_manage_all_members_about') }}
                                            </p>
                                        </div>
                                    </label>
                                    <label class="flex items-start gap-3 cursor-pointer">
                                        <input v-model="whoAdd" type="radio" value="admins_only"
                                            class="mt-1 h-5 w-5 shrink-0" />
                                        <div class="min-w-0">
                                            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {{ t('lng_community_manage_only_admins') }}
                                            </p>
                                            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                {{ t('lng_community_manage_only_admins_about') }}
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- 社区管理员 / 待处理申请 / 已移除用户：仅显示数量 -->
                        <div class="mb-3 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <div class="flex items-center gap-3 px-4 py-3">
                                <ShieldCheckIcon class="h-6 w-6 text-gray-500" />
                                <span class="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('lng_manage_peer_administrators') }}
                                </span>
                                <span class="text-sm text-(--app-brand)">{{ fullInfo?.administrator_count ?? 0
                                }}</span>
                            </div>
                            <div
                                class="flex items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
                                <InboxIcon class="h-6 w-6 text-gray-500" />
                                <span class="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('lng_community_requests_title') }}
                                </span>
                                <span class="text-sm text-(--app-brand)">{{ fullInfo?.add_chat_request_count ?? 0
                                }}</span>
                            </div>
                            <div
                                class="flex items-center gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
                                <UserMinusIcon class="h-6 w-6 text-gray-500" />
                                <span class="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {{ t('lng_manage_peer_removed_users') }}
                                </span>
                                <span class="text-sm text-(--app-brand)">{{ fullInfo?.banned_count ?? 0 }}</span>
                            </div>
                        </div>

                        <!-- 社区对话列表 -->
                        <div class="rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <div v-if="loadingChats" class="p-2">
                                <div v-for="n in 5" :key="n" class="flex items-center gap-3 px-2 py-2">
                                    <div
                                        class="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700">
                                    </div>
                                    <div class="flex-1">
                                        <div
                                            class="mb-1.5 h-3.5 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700">
                                        </div>
                                        <div class="h-3 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                                    </div>
                                </div>
                            </div>
                            <template v-else>
                                <button v-for="(chatItem, index) in chats" :key="chatItem.id" type="button"
                                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60"
                                    :class="{ 'border-t border-gray-100 dark:border-gray-700': index > 0 }"
                                    @click="openChat(chatItem.id)">
                                    <div class="h-10 w-10 shrink-0">
                                        <Avatar :photo="chatItem.photo" :title="chatItem.title"
                                            :radius="settings.chatList.avatarCornerRadius" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="mb-0.5 flex items-baseline justify-between gap-2">
                                            <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                <GlobalEmojiText :text="chatItem.title" />
                                            </h3>
                                            <span v-if="chatItem.last_message" class="shrink-0 text-xs text-gray-400">
                                                {{ formatTime(chatItem.last_message.date) }}
                                            </span>
                                        </div>
                                        <p v-if="previewText(chatItem.last_message)"
                                            class="min-w-0 truncate text-xs text-gray-500">
                                            <FormattedTextInline :formattedText="previewText(chatItem.last_message)!"
                                                :size="14" />
                                        </p>
                                    </div>
                                </button>
                            </template>
                        </div>

                        <!-- 删除社区（仅创建者有权限） -->
                        <div v-if="isOwner" class="mt-3 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
                            <button type="button"
                                class="flex w-full items-center gap-3 px-4 py-3 text-left text-red-500 transition-colors hover:bg-red-500/10"
                                @click="deleteOpen = true">
                                <Trash2Icon class="h-6 w-6" />
                                <span class="text-sm font-medium">{{ t('lng_community_delete') }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <!-- 二级确认：删除社区 -->
        <Transition name="community-settings">
            <div v-if="deleteOpen"
                class="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                role="alertdialog" aria-modal="true" @mousedown.self="deleteOpen = false">
                <div class="w-80 max-w-full rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800">
                    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {{ t('lng_community_delete') }}
                    </h3>
                    <p class="mt-2 text-sm leading-5 text-gray-500 dark:text-gray-400">
                        {{ t('lng_community_delete_sure') }}
                    </p>
                    <div class="mt-5 flex justify-end gap-2">
                        <button type="button" :disabled="deleting"
                            class="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="deleteOpen = false">
                            {{ t('lng_cancel') }}
                        </button>
                        <button type="button" :disabled="deleting"
                            class="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            @click="deleteCommunity">
                            {{ t('lng_community_delete') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import {
    ArrowLeft as ArrowLeftIcon,
    Camera as CameraIcon,
    ShieldCheckIcon,
    Inbox as InboxIcon,
    UserMinus as UserMinusIcon,
    Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import type { chatPhotoInfo, communityFullInfo, formattedText, message } from 'tdlib-types';
import Avatar from '../chat/avatar.vue';
import FormattedTextInline from '../chat/FormattedTextInline.vue';
import GlobalEmojiText from './GlobalEmojiText.vue';
import CommunityAvatar from './CommunityAvatar.vue';
import formatTime from '../../utils/formatTime';
import { tdlibSend } from '../../utils/tdlib';
import { toast } from '../../utils/toast';
import { settings } from '../../store/settings';
import { useCommunityStore } from '../../store/community';
import type { Chat } from '../../store/chat';

const props = defineProps<{
    open: boolean;
    communityId: number;
    name: string;
    photo?: chatPhotoInfo;
    /** 已加载的社区对话列表（从 CommunityDetailDialog 传入） */
    communityChats?: Chat[];
}>();

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void;
    (e: 'deleted'): void;
}>();

const { t } = useI18n();
const router = useRouter();
const communityStore = useCommunityStore();

/** 只有创建者能删除社区（TDLib deleteCommunity 需要 owner 权限） */
const isOwner = computed(() =>
    communityStore.communities[props.communityId]?.status?._ === 'communityMemberStatusCreator',
);

const deleteOpen = ref(false);
const deleting = ref(false);

// 保存基线：用它们判断是否有未保存的改动
const editName = ref(props.name);
const savedName = ref(props.name);
const whoAdd = ref<'all_members' | 'admins_only'>('admins_only');
const savedWhoAdd = ref<'all_members' | 'admins_only'>('admins_only');

/** 选中的本地头像文件路径（保存时作为 inputFileLocal 上传） */
const pickedPhotoPath = ref('');
const pickedPhotoUrl = computed(() => (pickedPhotoPath.value ? convertFileSrc(pickedPhotoPath.value) : ''));

const saving = ref(false);
const dirty = computed(
    () =>
        !!pickedPhotoPath.value
        || editName.value.trim() !== savedName.value
        || whoAdd.value !== savedWhoAdd.value,
);

const fullInfo = ref<communityFullInfo | undefined>(undefined);

// 对话列表相关
const chats = ref<Chat[]>([]);
const loadingChats = ref(false);

watch(
    () => props.open,
    async (open) => {
        if (!open) return;
        pickedPhotoPath.value = '';
        savedName.value = props.name;
        editName.value = props.name;
        await Promise.all([loadChats(), loadPermissions()]);
    },
    { immediate: true },
);

async function fetchFullInfo(): Promise<communityFullInfo> {
    if (!fullInfo.value) {
        fullInfo.value = (await tdlibSend({
            _: 'getCommunityFullInfo',
            community_id: props.communityId,
        })) as communityFullInfo;
    }
    return fullInfo.value;
}

async function loadChats() {
    loadingChats.value = true;
    try {
        // 管理员/申请/已移除的数量都来自 fullInfo，所以不管父组件有没有传对话列表都要拉一次
        const full = await fetchFullInfo();
        // 父组件已加载过社区对话列表，直接用，省一轮 getChat
        if (props.communityChats) {
            chats.value = props.communityChats;
            return;
        }
        const loaded = await Promise.all(
            full.chats.map(async (c): Promise<Chat | null> => {
                try {
                    return (await tdlibSend({ _: 'getChat', chat_id: c.chat_id })) as Chat;
                } catch (e) {
                    console.error('Failed to load community chat', c.chat_id, e);
                    return null;
                }
            }),
        );
        chats.value = loaded.filter((c): c is Chat => c !== null);
    } catch (e) {
        console.error('Failed to load community chats', e);
    } finally {
        loadingChats.value = false;
    }
}

/** 当前社区权限来自 Rust 侧缓存的 community 对象（updateCommunity → community-store） */
async function loadPermissions() {
    await communityStore.fetchCommunity(props.communityId);
    const canEdit = !!communityStore.communities[props.communityId]?.permissions?.can_edit_chat_list;
    whoAdd.value = canEdit ? 'all_members' : 'admins_only';
    savedWhoAdd.value = whoAdd.value;
}

/** 选本地图片：只记路径 + 预览，真正上传在保存时 */
async function pickPhoto() {
    try {
        const selected = await openFileDialog({
            multiple: false,
            title: t('avatar.pickImage'),
            filters: [{ name: t('lng_in_dlg_photo'), extensions: ['jpg', 'jpeg', 'png'] }],
        });
        if (!selected || Array.isArray(selected)) return;
        pickedPhotoPath.value = selected;
    } catch (e) {
        console.error('Pick community photo failed', e);
    }
}

/** 保存：头像按本地路径上传 → 名称 → 谁可以添加聊天，逐项只在有改动时发请求 */
async function save() {
    if (saving.value || !dirty.value) return;
    saving.value = true;
    try {
        if (pickedPhotoPath.value) {
            await tdlibSend({
                _: 'setCommunityPhoto',
                community_id: props.communityId,
                photo: {
                    _: 'inputChatPhotoStatic',
                    photo: { _: 'inputFileLocal', path: pickedPhotoPath.value },
                },
            });
        }
        const name = editName.value.trim();
        if (name && name !== savedName.value) {
            await tdlibSend({
                _: 'setCommunityName',
                community_id: props.communityId,
                name,
            });
        }
        if (whoAdd.value !== savedWhoAdd.value) {
            await tdlibSend({
                _: 'setCommunityPermissions',
                community_id: props.communityId,
                permissions: { _: 'communityPermissions', can_edit_chat_list: whoAdd.value === 'all_members' },
            });
        }
        // 保存成功后重置基线（成功后不弹提示，按钮消失即为反馈）
        pickedPhotoPath.value = '';
        savedName.value = name || savedName.value;
        savedWhoAdd.value = whoAdd.value;
    } catch (e) {
        console.error('Save community settings failed', e);
        toast.error((e as { message?: string })?.message || t('lng_settings_save'));
    } finally {
        saving.value = false;
    }
}

function openChat(chatId: number) {
    close();
    router.push({ name: 'chat-detail', params: { id: String(chatId) } });
}

/** 预览只用消息正文/媒体说明，不臆造媒体占位文案 */
function previewText(m?: message): formattedText | undefined {
    const content = m?.content;
    if (!content) return undefined;
    if (content._ === 'messageText') return content.text.text ? content.text : undefined;
    if ('caption' in content && content.caption?.text) return content.caption;
    return undefined;
}

/** 确认删除：成功后关掉设置与上层详情，让 TDLib 的 updateCommunity 事件驱动缓存清理 */
async function deleteCommunity() {
    if (deleting.value) return;
    deleting.value = true;
    try {
        await tdlibSend({ _: 'deleteCommunity', community_id: props.communityId });
        deleteOpen.value = false;
        emit('deleted');
        close();
    } catch (e) {
        console.error('Failed to delete community', e);
        const msg = (e as { message?: string })?.message;
        if (msg) toast.error(msg);
    } finally {
        deleting.value = false;
    }
}

function close() {
    deleteOpen.value = false;
    emit('update:open', false);
}
</script>

<style scoped>
.community-settings-enter-active,
.community-settings-leave-active {
    transition: opacity 0.2s ease;
}

.community-settings-enter-from,
.community-settings-leave-to {
    opacity: 0;
}
</style>
