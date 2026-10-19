<template>
    <!-- 社区入口卡片：点击打开社区详情弹窗 -->
    <div class="px-4 mt-3">
        <button type="button" @click="dialogOpen = true"
            class="flex w-full items-center gap-3 px-3 py-2 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md cursor-pointer text-left hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <CommunityAvatar :photo="photo" :title="name" />
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {{ t('lng_community_profile_status', { count: chatCount }) }}
                </p>
            </div>
            <ChevronRight class="w-4 h-4 text-gray-400 shrink-0" />
        </button>
        <CommunityDetailDialog v-model:open="dialogOpen" :community-id="communityId" :name="name" :photo="photo" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight } from 'lucide-vue-next';
import type { communityFullInfo } from 'tdlib-types';
import { tdlibSend } from '../../utils/tdlib';
import { useCommunityStore } from '../../store/community';
import CommunityAvatar from './CommunityAvatar.vue';
import CommunityDetailDialog from './CommunityDetailDialog.vue';

const props = defineProps<{ communityId: number }>();

const { t } = useI18n();
const communityStore = useCommunityStore();
/** 社区详情弹窗开关 */
const dialogOpen = ref(false);

const info = ref<communityFullInfo | undefined>(undefined);
/** 社区名来自 updateCommunity 缓存；未收到前回退为「社区」 */
const name = computed(() => communityStore.names[props.communityId] || t('lng_community_title'));
const chatCount = computed(() => info.value?.chats.length ?? 0);
/** chatPhoto（sizes[]）→ chatPhotoInfo（small/big），供 Avatar 复用 */
const photo = computed(() => {
    const p = info.value?.photo;
    const sizes = p?.sizes;
    if (!p || !sizes?.length) return undefined;
    return {
        _: 'chatPhotoInfo' as const,
        small: sizes[0].photo,
        big: sizes[sizes.length - 1].photo,
        minithumbnail: p.minithumbnail,
        has_animation: !!p.animation,
        is_personal: false,
    };
});

watch(
    () => props.communityId,
    async (id) => {
        info.value = undefined;
        try {
            const full = (await tdlibSend({ _: 'getCommunityFullInfo', community_id: id })) as communityFullInfo;
            if (props.communityId === id) info.value = full;
        } catch (e) {
            console.error('Failed to load community full info', e);
        }
    },
    { immediate: true },
);
</script>
