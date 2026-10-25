<template>
    <div class="space-y-3">
        <div class="flex items-center gap-2">
            <h3 class="flex-1 min-w-0 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {{ t('lng_filters_add_chats') }}
            </h3>
            <BaseButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
                {{ t('lng_cancel') }}
            </BaseButton>
            <BaseButton type="button" size="sm" :disabled="picked.size === 0" @click="confirm">
                {{ t('lng_box_done') }}<template v-if="picked.size"> ({{ picked.size }})</template>
            </BaseButton>
        </div>

        <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')"
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="onSearch" />

        <div
            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-[55vh] overflow-y-auto custom-scrollbar">
            <button v-for="c in chats" :key="c.id" type="button"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                :class="picked.has(c.id) ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
                @click="toggle(c.id)">
                <Avatar :photo="c.photo" :title="c.title" sizeClass="!w-9 !h-9" />
                <p class="text-sm text-gray-800 dark:text-gray-100 truncate flex-1 min-w-0">{{ c.title }}</p>
                <div v-if="picked.has(c.id)"
                    class="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                    <CheckIcon class="w-2.5 h-2.5 text-white" stroke-width="3" />
                </div>
            </button>
            <div v-if="!loading && chats.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
                {{ t('lng_filters_no_chats') }}
            </div>
            <div v-if="loading" class="px-4 py-6 text-center text-sm text-gray-400">
                {{ t('lng_context_seen_loading') }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check as CheckIcon } from 'lucide-vue-next';
import type { chatPhotoInfo } from 'tdlib-types';
import BaseButton from '../ui/button/BaseButton.vue';
import Avatar from '../chat/avatar.vue';
import { useChatStore } from '../../store/chat';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat } from '../../utils/senderInfo';

/** 候选对话：只保留渲染所需的字段 */
interface PickerChat {
    id: number;
    title: string;
    photo?: chatPhotoInfo;
}

const props = defineProps<{
    /** 已在该列表中的对话 id，不再出现在候选里 */
    excludeIds?: number[];
}>();
const emit = defineEmits<{
    select: [ids: number[]];
    cancel: [];
}>();

const { t } = useI18n();
const chatStore = useChatStore();
const query = ref('');
const chats = ref<PickerChat[]>([]);
const picked = ref<Set<number>>(new Set());
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(() => props.excludeIds, () => void reload(), { immediate: true });

function onSearch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void reload(), 250);
}

function toggle(id: number) {
    const next = new Set(picked.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    picked.value = next;
}

function confirm() {
    emit('select', [...picked.value]);
}

/** 本地已加载的对话（主列表 + 归档），按标题过滤。一个对话必在二者之一，够覆盖全部对话。 */
function localCandidates(q: string): PickerChat[] {
    const exclude = new Set(props.excludeIds ?? []);
    const ids = [
        ...(chatStore.lists['chatListMain'] ?? []),
        ...(chatStore.lists['chatListArchive'] ?? []),
    ];
    const needle = q.toLowerCase();
    const out: PickerChat[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
        if (seen.has(id) || exclude.has(id)) continue;
        seen.add(id);
        const c = chatStore.chats[id];
        if (!c || !c.title || c.title === '…') continue;
        if (needle && !c.title.toLowerCase().includes(needle)) continue;
        out.push({ id, title: c.title, photo: c.photo });
        if (out.length >= 100) break;
    }
    return out;
}

/**
 * 候选来源：
 * - 空查询 → 本地主列表 + 归档（保证永远有内容，不依赖 TDLib「最近找到」是否为空）
 * - 有关键词 → TDLib 本地搜索（覆盖标题与用户名），拿不到时退回本地标题过滤
 */
async function reload() {
    const q = query.value.trim();
    const local = localCandidates(q);
    if (!q) {
        chats.value = local;
        return;
    }
    loading.value = true;
    try {
        const exclude = new Set(props.excludeIds ?? []);
        const res = await tdlibSend({ _: 'searchChats', query: q, type_filter: null, limit: 50 } as any);
        const ids: number[] = (res?.chat_ids ?? []).filter((id: number) => !exclude.has(id));
        if (ids.length === 0) {
            chats.value = local;
            return;
        }
        await Promise.all(ids.map((id) => ensureChat(id)));
        const found: PickerChat[] = [];
        for (const id of ids) {
            const known = chatStore.chats[id];
            if (known?.title) {
                found.push({ id, title: known.title, photo: known.photo });
                continue;
            }
            const c = getReactiveChat(id);
            if (c?.title) found.push({ id, title: c.title, photo: c.photo });
        }
        // 本地命中排前面，搜索结果补在后面
        const merged = new Map<number, PickerChat>();
        for (const c of [...local, ...found]) if (!merged.has(c.id)) merged.set(c.id, c);
        chats.value = [...merged.values()].slice(0, 100);
    } catch (e) {
        console.warn('Folder chat picker search failed:', e);
        chats.value = local;
    } finally {
        loading.value = false;
    }
}
</script>
