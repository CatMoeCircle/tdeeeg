<template>
    <ModalDialog :model-value="modelValue" :title="t('reactionList.title')" @update:model-value="close">
        <!-- 按回应类型筛选（≥2 种回应时显示） -->
        <div v-if="typeTabs.length > 1" class="flex flex-wrap gap-1.5 mb-3">
            <button v-for="tab in typeTabs" :key="tab.key" type="button"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors"
                :class="activeKey === tab.key
                    ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                @click="activeKey = tab.key">
                <span v-if="tab.emoji">{{ tab.emoji }}</span>
                <span v-else>{{ t('reactionList.all') }}</span>
                <span class="tabular-nums">{{ tab.count }}</span>
            </button>
        </div>

        <div
            class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto custom-scrollbar">
            <button v-for="item in visibleItems" :key="item.key" type="button"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                @click="openProfile(item)">
                <div class="w-9 h-9 shrink-0">
                    <Avatar :photo="item.photo" :title="item.name" :accentColorId="item.accentId"
                        :deletedAccount="item.deleted" sizeClass="!w-9 !h-9" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm text-gray-800 dark:text-gray-100 truncate">
                        {{ item.name }}
                        <span v-if="item.isOutgoing" class="text-xs text-blue-500 ml-1">{{ t('reactionList.you') }}</span>
                    </p>
                    <p class="text-xs text-gray-400 mt-0.5">{{ item.subtitle }}</p>
                </div>
                <!-- 该用户使用的回应（筛选为「全部」时展示） -->
                <span v-if="showPerItemReaction && item.reactionLabel" class="text-lg leading-none shrink-0">
                    {{ item.reactionLabel }}
                </span>
            </button>

            <div v-if="loading && items.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
                {{ t('lng_context_seen_loading') }}
            </div>
            <div v-else-if="!loading && visibleItems.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
                {{ t('reactionList.empty') }}
            </div>
        </div>

        <div v-if="hasMore" class="mt-3 text-center">
            <button type="button" class="px-4 py-1.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                :disabled="loading" @click="loadMore">
                {{ loading ? t('lng_context_seen_loading') : t('reactionList.loadMore') }}
            </button>
        </div>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ModalDialog from '../../settings/ModalDialog.vue';
import Avatar from '../avatar.vue';
import { tdlibSend } from '../../../utils/tdlib';
import {
    ensureSenderLoaded,
    getSenderName,
    getSenderPhoto,
    getSenderProfileAccentColorId,
    isDeletedSender,
    DELETED_ACCOUNT_LABEL,
} from '../../../utils/senderInfo';
import {
    getMessageReactions,
    isReactionEmoji,
    isReactionCustomEmoji,
    isReactionPaid,
    toReactionTypeInput,
    getReactionText,
} from '../../../utils/reactionHelpers';
import type { message, MessageSender, ReactionType, addedReaction } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
    /** 所属消息（取 chat_id / id / interaction_info.reactions） */
    msg: message;
    /** 打开时默认筛选的回应类型；不传则默认「全部」 */
    initialType?: ReactionType;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const items = ref<addedReaction[]>([]);
const nextOffset = ref('');
const totalCount = ref(0);
const activeKey = ref<string>('all');

const PAGE_SIZE = 50;

interface ListTab {
    key: string;
    emoji?: string;
    count: number;
    type?: ReactionType;
}

function reactionKey(type: ReactionType): string {
    if (isReactionEmoji(type)) return `emoji-${type.emoji}`;
    if (isReactionCustomEmoji(type)) return `custom-${type.custom_emoji_id}`;
    if (isReactionPaid(type)) return 'paid';
    return 'unknown';
}

/** 消息上已有的回应类型（用于筛选页签） */
const msgReactions = computed(() => getMessageReactions(props.msg)?.reactions ?? []);

const typeTabs = computed<ListTab[]>(() => {
    const tabs: ListTab[] = [{ key: 'all', count: totalCount.value }];
    for (const r of msgReactions.value) {
        if (isReactionPaid(r.type)) continue;
        tabs.push({
            key: reactionKey(r.type),
            emoji: isReactionEmoji(r.type) ? r.type.emoji : '✨',
            count: r.total_count,
            type: r.type,
        });
    }
    return tabs;
});

const activeTab = computed(() => typeTabs.value.find((tb) => tb.key === activeKey.value) ?? typeTabs.value[0]);

/** 「全部」页签下每行展示该用户使用的回应 */
const showPerItemReaction = computed(() => activeKey.value === 'all' && typeTabs.value.length > 1);

const hasMore = computed(() => nextOffset.value !== '' && items.value.length < totalCount.value);

interface RowItem {
    key: string;
    name: string;
    subtitle: string;
    photo?: ReturnType<typeof getSenderPhoto>;
    accentId?: number;
    deleted: boolean;
    isOutgoing: boolean;
    reactionLabel?: string;
    senderId?: MessageSender;
}

function senderKey(s: MessageSender): string {
    return s._ === 'messageSenderUser' ? `u${s.user_id}` : `c${s.chat_id}`;
}

function formatDate(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function reactionDisplayLabel(type: ReactionType): string {
    if (isReactionEmoji(type)) return type.emoji;
    if (isReactionCustomEmoji(type)) return '✨';
    return getReactionText(type);
}

const visibleItems = computed<RowItem[]>(() =>
    items.value.map((a, idx) => {
        const sid = a.sender_id;
        const name = sid ? getSenderName(sid) : '';
        return {
            key: sid ? senderKey(sid) : `i${idx}`,
            name: name || DELETED_ACCOUNT_LABEL,
            subtitle: formatDate(a.date),
            photo: sid ? getSenderPhoto(sid) : undefined,
            accentId: sid ? getSenderProfileAccentColorId(sid) : undefined,
            deleted: sid ? isDeletedSender(sid) : true,
            isOutgoing: a.is_outgoing,
            reactionLabel: showPerItemReaction.value ? reactionDisplayLabel(a.type) : undefined,
            senderId: sid,
        };
    }),
);

/** 预加载列表中出现的发送者头像/名称 */
watch(
    () => items.value.map((a) => a.sender_id).filter(Boolean) as MessageSender[],
    (senders) => {
        for (const s of senders) void ensureSenderLoaded(s);
    },
    { immediate: true, deep: true },
);

async function fetchPage(offset: string, append: boolean) {
    const cid = props.msg.chat_id;
    const mid = props.msg.id;
    if (!cid || !mid) return;
    loading.value = true;
    try {
        const reactionType = activeTab.value?.type;
        const result = await tdlibSend({
            _: 'getMessageAddedReactions',
            chat_id: cid,
            message_id: mid,
            reaction_type: reactionType ? toReactionTypeInput(reactionType) : undefined,
            offset,
            limit: PAGE_SIZE,
        });
        if (result._ !== 'addedReactions') return;
        totalCount.value = result.total_count;
        nextOffset.value = result.next_offset ?? '';
        items.value = append ? [...items.value, ...result.reactions] : result.reactions;
        for (const a of items.value) {
            if (a.sender_id) void ensureSenderLoaded(a.sender_id);
        }
    } catch (e) {
        console.error('getMessageAddedReactions failed:', e);
        if (!append) {
            items.value = [];
            nextOffset.value = '';
            totalCount.value = 0;
        }
    } finally {
        loading.value = false;
    }
}

function loadMore() {
    if (loading.value || !hasMore.value) return;
    void fetchPage(nextOffset.value, true);
}

function resetAndLoad() {
    items.value = [];
    nextOffset.value = '';
    totalCount.value = 0;
    void fetchPage('', false);
}

watch(
    () => props.modelValue,
    (open) => {
        if (!open) return;
        const init = props.initialType;
        activeKey.value = init ? reactionKey(init) : 'all';
        resetAndLoad();
    },
);

watch(activeKey, () => {
    if (!props.modelValue) return;
    resetAndLoad();
});

function openProfile(item: RowItem) {
    const sid = item.senderId;
    if (!sid) return;
    if (sid._ === 'messageSenderUser') {
        close();
        router.push({ name: 'user-profile', params: { id: String(sid.user_id) } });
    } else if (sid._ === 'messageSenderChat') {
        close();
        router.push({ name: 'user-profile', params: { id: String(sid.chat_id) } });
    }
}

function close() {
    emit('update:modelValue', false);
}
</script>
