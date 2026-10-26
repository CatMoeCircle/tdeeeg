<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button"
                class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('lng_filters_title') }}</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <div class="flex items-center gap-3">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_filters_subtitle') }}
                        </h3>
                        <p class="text-xs text-gray-400 mt-1">{{ t('lng_filters_about') }}</p>
                    </div>
                    <BaseButton type="button" size="sm" class="shrink-0 inline-flex items-center gap-1.5"
                        @click="openCreate">
                        <PlusIcon class="w-3.5 h-3.5" />
                        {{ t('lng_filters_new') }}
                    </BaseButton>
                </div>

                <LoadingSkeleton v-if="loading" class="py-2" :rows="5" :label="t('lng_context_seen_loading')" />

                <div v-else-if="folders.length === 0"
                    class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-10 text-center">
                    <FolderIcon class="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">{{ t('folderSettings.empty') }}</p>
                </div>

                <div v-else
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800">
                    <div v-for="f in folders" :key="f.id" class="flex items-center gap-3 px-3 py-2.5">
                        <button type="button" class="flex items-center gap-3 flex-1 min-w-0 text-left" @click="openEdit(f)">
                            <div
                                class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                                <component :is="folderIconFor(f.icon?.name)" class="w-[18px] h-[18px]" :stroke-width="1.5" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {{ f.name?.text?.text || t('lng_sr_chat_folder') }}
                                </p>
                                <p v-if="f.is_shareable" class="text-xs text-gray-400 truncate mt-0.5">
                                    {{ t('lng_filters_shareable_status') }}
                                </p>
                            </div>
                        </button>
                        <button type="button"
                            class="p-1.5 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors"
                            :title="t('lng_filters_by_link_remove')" @click="removeFolder(f)">
                            <Trash2Icon class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <!-- 底部：分组标签开关（会员在对话卡片底部显示分组标签；每个分组的颜色在分组设置里选） -->
                <section>
                    <div
                        class="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md">
                        <div class="min-w-0 pr-3">
                            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {{ t('lng_filters_enable_tags') }}
                            </h4>
                            <p class="text-xs text-gray-500 mt-0.5">{{ t('lng_filters_enable_tags_about') }}</p>
                        </div>
                        <ToggleSwitch :model-value="folderTagsEnabled" @update:model-value="setTagsEnabled" />
                    </div>
                    <p v-if="!isPremium" class="mt-2 text-xs text-amber-600 dark:text-amber-400"
                        v-html="tdHtml('lng_filters_enable_tags_about_premium', { link: t('lng_article_premium_required_link') })" />
                </section>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ChevronLeftIcon, Plus as PlusIcon, Trash2 as Trash2Icon, Folder as FolderIcon } from 'lucide-vue-next';
import type { chatFolderInfo } from 'tdlib-types';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import ToggleSwitch from '../../components/ui/toggle/ToggleSwitch.vue';
import { useChatStore } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { folderTagsEnabled, initFolderTags, setFolderTagsEnabled } from '../../store/folderTags';
import { folderIconFor } from '../../utils/folderIcons';
import { tdHtml } from '../../utils/tdLang';
import { tdlibSend } from '../../utils/tdlib';
import { toast } from '../../utils/toast';

const { t } = useI18n();
const router = useRouter();
const chatStore = useChatStore();
const userStore = useUserStore();

const loading = ref(true);
const isPremium = computed(() => !!userStore.userProfile?.is_premium);

/** 分组列表直接取 TDLib 的 chatFolderInfo（updateChatFolders 已在 Rust 侧缓存） */
const folders = computed(() =>
    chatStore.chatLists.filter((l): l is chatFolderInfo => l._ === 'chatFolderInfo'),
);

// 页面被 KeepAlive 缓存：每次从编辑页返回都重新同步一次分组列表
onActivated(() => {
    void reload();
});

async function reload() {
    // 保存后刷新时列表已有内容，不再闪一次 loading
    if (folders.value.length === 0) loading.value = true;
    try {
        await Promise.all([chatStore.loadChatLists(), initFolderTags()]);
    } catch (e) {
        console.warn('Failed to load chat folders:', e);
    } finally {
        loading.value = false;
    }
}

/** 切换后立即写回 TDLib；失败时回滚开关，避免显示与实际不符 */
async function setTagsEnabled(value: boolean) {
    const previous = folderTagsEnabled.value;
    folderTagsEnabled.value = value;
    try {
        await setFolderTagsEnabled(value);
    } catch (e: any) {
        folderTagsEnabled.value = previous;
        toast.error(e?.message || t('context.actionFailed'));
    }
}

function goBack() {
    router.back();
}

function openCreate() {
    router.push('/home/settings/folders/new');
}

function openEdit(f: chatFolderInfo) {
    router.push(`/home/settings/folders/${f.id}`);
}

/** 删除分组：TDLib 要求带上「建议退出」的对话，这里问一次是否一并退出 */
async function removeFolder(f: chatFolderInfo) {
    const name = f.name?.text?.text || t('lng_sr_chat_folder');
    if (!window.confirm(t('lng_filters_delete_sure'))) return;

    let leaveIds: number[] = [];
    try {
        const res = await tdlibSend({ _: 'getChatFolderChatsToLeave', chat_folder_id: f.id } as any) as any;
        leaveIds = res?.chat_ids ?? [];
    } catch {
        leaveIds = [];
    }
    if (leaveIds.length > 0 && !window.confirm(t('lng_filters_by_link_remove_sure', { folder: name }))) {
        leaveIds = [];
    }

    try {
        await tdlibSend({ _: 'deleteChatFolder', chat_folder_id: f.id, leave_chat_ids: leaveIds } as any);
    } catch (e: any) {
        toast.error(e?.message || t('context.actionFailed'));
    }
}
</script>
