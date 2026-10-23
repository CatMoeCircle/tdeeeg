<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('storage.title') }}</h2>
            <button type="button" class="ml-auto p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                :disabled="loading" :title="t('storage.refresh')" @click="load">
                <RefreshCwIcon class="w-4 h-4 text-gray-500" :class="{ 'animate-spin': loading }" />
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">
                <div v-if="error" class="text-xs text-red-500 mb-4">{{ t('storage.loadFailed', { error }) }}</div>

                <p v-if="!stats" class="text-xs text-gray-400">
                    {{ loading ? t('storage.loading') : '' }}
                    <span class="block mt-1 text-gray-300 dark:text-gray-600">{{ t('storage.loadingHint') }}</span>
                </p>

                <template v-else>
                    <p v-if="!stats.count" class="text-xs text-gray-400 text-center">{{ t('storage.empty') }}</p>

                    <section v-else
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-5">
                        <!-- 顶部饼图：每个文件类型一段颜色（含折叠进「其他」的类型）；图例只单列前 4 项 -->
                        <div class="flex justify-center">
                            <div class="relative w-40 h-40 rounded-full shrink-0" :style="pieStyle">
                                <div
                                    class="absolute inset-[18%] rounded-full bg-white dark:bg-gray-800 flex flex-col items-center justify-center">
                                    <span class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ formatSize(stats.size)
                                        }}</span>
                                    <span class="text-[11px] text-gray-400 mt-0.5">{{ t('storage.fileCount', { count:
                                        stats.count }) }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="mt-5">
                            <!-- 勾选分类后清理 -->
                            <div v-for="row in typeTop" :key="row.type"
                                class="flex items-center gap-2 py-1.5 text-sm cursor-pointer select-none"
                                @click="toggleType(row.type)">
                                <BaseCheckbox :model-value="selectedTypes.includes(row.type)"
                                    @update:model-value="toggleType(row.type)" />
                                <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: colorOf(row.type) }"></span>
                                <span class="flex-1 truncate text-gray-700 dark:text-gray-200">{{ typeLabel(row.type) }}</span>
                                <span class="text-xs text-gray-500">{{ formatSize(row.size) }}</span>
                                <span class="w-9 text-right text-xs text-gray-400">{{ pct(row.size) }}</span>
                            </div>

                            <!-- 其余类型折叠进「其他」；勾选框一次选中里面的全部，点文本展开/收起 -->
                            <div v-if="typeRest.length" class="flex items-center gap-2 py-1.5 text-sm">
                                <BaseCheckbox :model-value="restAllSelected" @update:model-value="toggleRestSelected" />
                                <div class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none"
                                    @click="typeExpanded = !typeExpanded">
                                    <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: '#9ca3af' }"></span>
                                    <span class="flex-1 text-gray-700 dark:text-gray-200">{{ t('storage.other') }}</span>
                                    <span class="text-xs text-gray-500">{{ formatSize(typeRestSize) }}</span>
                                    <span class="w-9 text-right text-xs text-gray-400">{{ pct(typeRestSize) }}</span>
                                    <ChevronDownIcon class="w-3.5 h-3.5 text-gray-300 shrink-0 transition-transform"
                                        :class="{ 'rotate-180': typeExpanded }" />
                                </div>
                            </div>
                            <template v-if="typeExpanded">
                                <div v-for="row in typeRest" :key="'rest-' + row.type"
                                    class="flex items-center gap-2 py-1 pl-5 text-xs cursor-pointer select-none"
                                    @click="toggleType(row.type)">
                                    <BaseCheckbox :model-value="selectedTypes.includes(row.type)"
                                        @update:model-value="toggleType(row.type)" />
                                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: colorOf(row.type) }"></span>
                                    <span class="flex-1 truncate text-gray-500">{{ typeLabel(row.type) }}</span>
                                    <span class="text-gray-400">{{ formatSize(row.size) }}</span>
                                    <span class="w-9 text-right text-gray-400">{{ pct(row.size) }}</span>
                                </div>
                            </template>

                            <!-- 清理操作条 -->
                            <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-3">
                                <button type="button" class="text-xs text-gray-500 hover:text-blue-500 transition-colors"
                                    @click="toggleAllTypes">
                                    {{ allSelected ? t('storage.clearSelection') : t('storage.selectAll') }}
                                </button>
                                <button type="button"
                                    class="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    :disabled="!selectedTypes.length" @click="askCleanSelected">
                                    {{ t('storage.cleanSelected') }}
                                    <template v-if="selectedTypes.length"> · {{ formatSize(selectedSize) }}</template>
                                </button>
                            </div>
                        </div>
                    </section>

                    <!-- 按会话：全部列出（TDLib 按 chat_limit 汇总，其余归入 chat_id == 0） -->
                    <section v-if="chats.length" class="mt-8">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                            {{ t('storage.byChat') }}
                        </h3>
                        <p class="text-xs text-gray-400 mb-3">{{ t('storage.chatLimitHint', { count: CHAT_LIMIT }) }}</p>

                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md overflow-hidden">
                            <div v-for="row in chats" :key="row.chat_id" v-context-menu="() => chatMenu(row)"
                                class="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                                :class="row.chat_id ? 'cursor-pointer' : ''" @click="openChatDialog(row)">
                                <div class="w-9 h-9 rounded-full overflow-hidden shrink-0 mt-0.5">
                                    <Avatar v-if="row.chat_id" v-bind="avatarOf(row.chat_id)" />
                                    <div v-else class="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400">
                                        <UsersIcon class="w-4 h-4" />
                                    </div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm text-gray-700 dark:text-gray-200 truncate">{{ titleOf(row.chat_id) }}</p>
                                    <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                                        <span v-for="f in breakdownOf(row)" :key="f.type"
                                            class="inline-flex items-center gap-1">
                                            <span class="w-1.5 h-1.5 rounded-full shrink-0"
                                                :style="{ background: colorOf(f.type) }"></span>
                                            {{ typeLabel(f.type) }} {{ formatSize(f.size) }}
                                        </span>
                                    </p>
                                </div>
                                <span class="text-xs text-gray-500 shrink-0 mt-0.5">{{ formatSize(row.size) }} · {{ row.count }}</span>
                            </div>
                        </div>
                    </section>
                </template>
            </div>
        </div>

        <!-- 单个会话的分类清理 -->
        <ModalDialog v-model="chatDialogOpen" :title="t('storage.chatCleanupTitle', { title: chatDialog?.title ?? '' })">
            <p class="text-xs text-gray-400 mb-3">{{ t('storage.chatCleanupDesc') }}</p>
            <div>
                <div v-for="r in chatDialog?.rows ?? []" :key="r.type"
                    class="flex items-center gap-2 py-1.5 text-sm cursor-pointer select-none"
                    @click="toggleChatType(r.type)">
                    <BaseCheckbox :model-value="chatDialog?.selected.includes(r.type) ?? false"
                        @update:model-value="toggleChatType(r.type)" />
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: colorOf(r.type) }"></span>
                    <span class="flex-1 truncate text-gray-700 dark:text-gray-200">{{ typeLabel(r.type) }}</span>
                    <span class="text-xs text-gray-500">{{ formatSize(r.size) }}</span>
                </div>
            </div>
            <template #footer>
                <BaseButton variant="ghost" size="sm" @click="chatDialogOpen = false">{{ t('lng_cancel') }}</BaseButton>
                <button type="button"
                    class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="!chatDialog?.selected.length" @click="askCleanChatSelection">
                    {{ t('storage.cleanConfirm') }}
                    <template v-if="chatDialog?.selected.length"> · {{ formatSize(chatDialogSize) }}</template>
                </button>
            </template>
        </ModalDialog>

        <!-- 清理确认：点了清理按钮后必须再确认一次才真正执行 -->
        <ModalDialog v-model="confirmOpen" :title="t('storage.cleanConfirmTitle')">
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ t('storage.cleanConfirmDesc') }}</p>
            <div class="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div v-for="(r, i) in confirmState?.rows ?? []" :key="i"
                    class="flex items-center justify-between px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                    <span class="text-gray-700 dark:text-gray-200 truncate">{{ r.label }}</span>
                    <span class="text-xs text-gray-500 shrink-0 ml-3">{{ formatSize(r.size) }}</span>
                </div>
            </div>
            <p class="mt-3 text-xs text-amber-500 dark:text-amber-400">{{ t('storage.cleanWarning') }}</p>
            <template #footer>
                <BaseButton variant="ghost" size="sm" :disabled="cleaning" @click="confirmOpen = false">{{ t('lng_cancel') }}</BaseButton>
                <button type="button"
                    class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="cleaning" @click="runCleanup">
                    {{ cleaning ? t('storage.cleaning') : t('storage.cleanConfirm') }}
                </button>
            </template>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { chat, chatPhotoInfo, FileType$Input, profilePhoto, storageStatistics } from 'tdlib-types';
import {
    ChevronDown as ChevronDownIcon, ChevronLeft as ChevronLeftIcon,
    MessageCircle as MessageCircleIcon, RefreshCw as RefreshCwIcon,
    Trash2 as Trash2Icon, Users as UsersIcon,
} from 'lucide-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import { formatSize } from '../../utils/format';
import { toast } from '../../utils/toast';
import { useChatStore } from '../../store/chat';
import Avatar from '../../components/chat/avatar.vue';
import ModalDialog from '../../components/ui/modal/ModalDialog.vue';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import BaseCheckbox from '../../components/ui/checkbox/BaseCheckbox.vue';
import type { ContextMenuItem } from '../../components/contextMenu/types';
import { getReactiveChat, getReactiveUser } from '../../utils/senderInfo';

const router = useRouter();
const chatStore = useChatStore();

/** 精确统计只保留占用最大的若干会话，其余归入 chat_id == 0 */
const CHAT_LIMIT = 50;
/** 图例只单列的项数，其余折叠进「其他」 */
const MAX_ITEMS = 4;
/** 每种文件类型固定一种颜色（按占用降序分配，用尽即循环） */
const PALETTE = [
    '#3b82f6', '#14b8a6', '#f59e0b', '#a855f7', '#ef4444',
    '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#8b5cf6',
    '#eab308', '#22c55e', '#0ea5e9', '#d946ef', '#64748b',
];

const stats = ref<storageStatistics | null>(null);
const loading = ref(true);
const error = ref('');
/** chat_id → chat（标题 / 头像 / 首字母），来自 chat store 或 getChat */
const chatCache = ref<Record<number, chat>>({});
const typeExpanded = ref(false);

// ===== 清理 =====
/** 页面上勾选的分类（归类 key） */
const selectedTypes = ref<string[]>([]);
/** 正在执行清理：期间不允许关闭确认弹窗 */
const cleaning = ref(false);

interface UsageRow {
    type: string;
    size: number;
    count: number;
}

/** 单会话清理弹窗状态 */
const chatDialog = ref<{ chatId: number; title: string; rows: UsageRow[]; selected: string[] } | null>(null);
/** 最终确认弹窗状态（点击清理按钮后弹出） */
const confirmState = ref<{ rows: Array<{ label: string; size: number }>; size: number; keys: string[]; chatId: number } | null>(null);

const chatDialogOpen = computed({
    get: () => !!chatDialog.value,
    set: (open: boolean) => { if (!open) chatDialog.value = null; },
});
const confirmOpen = computed({
    get: () => !!confirmState.value,
    set: (open: boolean) => { if (!open && !cleaning.value) confirmState.value = null; },
});

function goBack() {
    router.push('/home/settings/download');
}

function pct(size: number): string {
    const total = stats.value?.size || 0;
    if (!total || !size) return '0%';
    return `${Math.max(1, Math.round((size / total) * 100))}%`;
}

/**
 * TDLib fileType → 归类 key。
 * 多个相近类型归到同一类（视频故事/实况视频等同属「视频」），否则界面上会出现
 * 两行同名的「视频」。
 */
const TYPE_KEYS: Record<string, string> = {
    fileTypePhoto: 'photo',
    fileTypeVideo: 'video',
    fileTypeDocument: 'document',
    fileTypeAudio: 'audio',
    fileTypeVoiceNote: 'voice',
    fileTypeVideoNote: 'videoNote',
    fileTypeAnimation: 'animation',
    fileTypeSticker: 'sticker',
    fileTypeProfilePhoto: 'profilePhoto',
    fileTypeThumbnail: 'thumbnail',
    fileTypeWallpaper: 'wallpaper',
    fileTypeSecret: 'secret',
    fileTypeSecretThumbnail: 'secret',
    fileTypeSecure: 'secure',
    fileTypeUnknown: 'unknown',
    fileTypeNone: 'unknown',
    fileTypeNotificationSound: 'audio',
    fileTypePhotoStory: 'video',
    fileTypeVideoStory: 'video',
    fileTypeLivePhotoVideo: 'video',
};

/** 归类 key（未列出的类型用自己的类型名） */
function typeKey(raw: string): string {
    return TYPE_KEYS[raw] ?? raw.replace(/^fileType/, '');
}

/** 归类 key 集合（storage.types.* 里存在的 label） */
const TYPE_I18N_KEYS = new Set(Object.values(TYPE_KEYS));

function typeLabel(key: string): string {
    return TYPE_I18N_KEYS.has(key) ? t(`storage.types.${key}`) : key;
}

/** 归类 key → optimizeStorage 需要的原始 fileType 列表（一个分类可能对应多个原始类型） */
function fileTypesOf(key: string): FileType$Input[] {
    const raws = Object.keys(TYPE_KEYS).filter(raw => TYPE_KEYS[raw] === key);
    return (raws.length ? raws : [`fileType${key}`]).map(raw => ({ _: raw }) as FileType$Input);
}

/** 把一组按类型的统计按归类 key 合并（同类的视频故事/视频合并成一行），体积降序 */
function mergeByCategory(rows: ReadonlyArray<{ file_type?: { _?: string } | null; size: number; count: number }>): UsageRow[] {
    const map = new Map<string, UsageRow>();
    for (const f of rows) {
        const type = typeKey(f.file_type?._ ?? 'fileTypeUnknown');
        const row = map.get(type) ?? { type, size: 0, count: 0 };
        row.size += f.size;
        row.count += f.count;
        map.set(type, row);
    }
    return [...map.values()].filter(row => row.size > 0).sort((a, b) => b.size - a.size);
}

/** 所有会话的类型占用合并 */
const byType = computed(() =>
    mergeByCategory((stats.value?.by_chat ?? []).flatMap(chat => chat.by_file_type)),
);

/** TDLib 的两个「未分类」桶：fileTypeUnknown（类型未识别）/ fileTypeNone（不是文件） */
function uncategorized(type: string): boolean {
    return type === 'unknown';
}

const typeTop = computed(() => byType.value.filter(row => !uncategorized(row.type)).slice(0, MAX_ITEMS));
const typeRest = computed(() => [
    ...byType.value.filter(row => !uncategorized(row.type)).slice(MAX_ITEMS),
    ...byType.value.filter(row => uncategorized(row.type)),
]);
const typeRestSize = computed(() => typeRest.value.reduce((sum, row) => sum + row.size, 0));

/** 类型 → 颜色；折叠在「其他」里的类型也各自保留颜色 */
const colorByType = computed(() => {
    const map = new Map<string, string>();
    byType.value.forEach((row, i) => map.set(row.type, PALETTE[i % PALETTE.length]));
    return map;
});

function colorOf(type: string): string {
    return colorByType.value.get(type) ?? '#9ca3af';
}

/** 纯 CSS 饼图（conic-gradient）：每个类型一段颜色，最后一段收口到 100% 避免缝隙 */
const pieStyle = computed(() => {
    const total = stats.value?.size || 0;
    const slices = byType.value.map(row => ({ size: row.size, color: colorOf(row.type) }));
    if (!total || !slices.length) return { background: '#e5e7eb' };

    let acc = 0;
    const stops = slices.map((slice, i) => {
        const from = acc;
        acc += slice.size;
        const to = i === slices.length - 1 ? total : acc;
        return `${slice.color} ${(from / total) * 100}% ${(to / total) * 100}%`;
    });
    return { background: `conic-gradient(${stops.join(', ')})` };
});

const chats = computed(() => [...(stats.value?.by_chat ?? [])].sort((a, b) => b.size - a.size));

// ---- 分类勾选 ----
const selectableTypes = computed(() => byType.value.filter(row => !uncategorized(row.type)).map(row => row.type));
const allSelected = computed(() =>
    selectableTypes.value.length > 0 && selectableTypes.value.every(key => selectedTypes.value.includes(key)),
);
/** 「其他」里的类型（折叠项 + 未分类）是否全被选中 */
const restAllSelected = computed(() =>
    typeRest.value.length > 0 && typeRest.value.every(row => selectedTypes.value.includes(row.type)),
);
const selectedSize = computed(() =>
    byType.value.filter(row => selectedTypes.value.includes(row.type)).reduce((sum, row) => sum + row.size, 0),
);

function toggleType(key: string) {
    selectedTypes.value = selectedTypes.value.includes(key)
        ? selectedTypes.value.filter(k => k !== key)
        : [...selectedTypes.value, key];
}

/** 「其他」的勾选框：一次选中/取消里面折叠的全部类型 */
function toggleRestSelected() {
    const keys = typeRest.value.map(row => row.type);
    if (restAllSelected.value) {
        selectedTypes.value = selectedTypes.value.filter(k => !keys.includes(k));
        return;
    }
    selectedTypes.value = [...new Set([...selectedTypes.value, ...keys])];
    // 选中了就把列表展开，能看见具体勾了哪些
    typeExpanded.value = true;
}

function toggleAllTypes() {
    selectedTypes.value = allSelected.value ? [] : [...selectableTypes.value];
}

// ---- 会话 ----
/** 单个会话内按类型拆分（同类合并），占用降序 —— 副标题逐项显示 */
function breakdownOf(row: storageStatistics['by_chat'][number]) {
    return mergeByCategory(row.by_file_type);
}

function titleOf(chatId: number): string {
    if (!chatId) return t('storage.otherChats');
    return chatCache.value[chatId]?.title || `#${chatId}`;
}

/** 头像 / 首字母数据：私聊优先用用户资料图，其次聊天图 */
function avatarOf(chatId: number): {
    photo?: chatPhotoInfo | profilePhoto;
    title: string;
    firstName: string;
    lastName: string;
    accentColorId?: number;
} {
    const c = chatCache.value[chatId];
    const userId = c?.type?._ === 'chatTypePrivate' ? c.type.user_id : 0;
    const user = userId ? getReactiveUser(userId) : undefined;
    return {
        photo: user?.profile_photo ?? c?.photo ?? undefined,
        title: c?.title ?? '',
        firstName: user?.first_name ?? '',
        lastName: user?.last_name ?? '',
        accentColorId: user?.accent_color_id,
    };
}

/** 会话对象：优先 chat store / 用户缓存，缺失再向 TDLib 查询（chat_limit 上限内） */
async function loadChats() {
    // chat_id == 0 是 TDLib 的「其余会话」聚合桶，没有真实会话；群组/频道是负数，不能按 >0 过滤
    const ids = (stats.value?.by_chat ?? [])
        .map(c => c.chat_id)
        .filter(id => id !== 0 && !chatCache.value[id]);
    await Promise.all(ids.map(async id => {
        const cached = chatStore.chats[id] ?? getReactiveChat(id);
        if (cached) {
            chatCache.value = { ...chatCache.value, [id]: cached as chat };
            return;
        }
        try {
            const c = await tdlibSend({ _: 'getChat', chat_id: id });
            chatCache.value = { ...chatCache.value, [id]: c };
        } catch {
            /* 取不到就显示 #chat_id */
        }
    }));
}

// ---- 清理流程 ----
/** 右键菜单：全部清理 / 查看频道（聚合桶 chat_id == 0 没有这两项） */
function chatMenu(row: storageStatistics['by_chat'][number]): ContextMenuItem[] {
    if (!row.chat_id) return [];
    return [
        {
            key: 'open',
            label: t('storage.viewChat'),
            icon: MessageCircleIcon,
            onClick: () => router.push(`/home/chat/${row.chat_id}`),
        },
        {
            key: 'clean',
            label: t('storage.clearAll'),
            icon: Trash2Icon,
            danger: true,
            onClick: () => askCleanChatAll(row),
        },
    ];
}

/** 点击会话：弹出该会话的分类清理 */
function openChatDialog(row: storageStatistics['by_chat'][number]) {
    if (!row.chat_id) return;
    const rows = breakdownOf(row);
    if (!rows.length) return;
    chatDialog.value = {
        chatId: row.chat_id,
        title: titleOf(row.chat_id),
        rows,
        selected: rows.map(r => r.type),
    };
}

const chatDialogSize = computed(() => {
    const d = chatDialog.value;
    return d ? d.rows.filter(r => d.selected.includes(r.type)).reduce((sum, r) => sum + r.size, 0) : 0;
});

function toggleChatType(key: string) {
    const d = chatDialog.value;
    if (!d) return;
    d.selected = d.selected.includes(key) ? d.selected.filter(k => k !== key) : [...d.selected, key];
}

function askCleanChatSelection() {
    const d = chatDialog.value;
    if (!d) return;
    const rows = d.rows.filter(r => d.selected.includes(r.type));
    if (!rows.length) return;
    const size = chatDialogSize.value;
    chatDialog.value = null;
    confirmState.value = {
        rows: rows.map(r => ({ label: typeLabel(r.type), size: r.size })),
        size,
        keys: rows.map(r => r.type),
        chatId: d.chatId,
    };
}

function askCleanChatAll(row: storageStatistics['by_chat'][number]) {
    if (!row.chat_id) return;
    const rows = breakdownOf(row);
    if (!rows.length) return;
    confirmState.value = {
        rows: rows.map(r => ({ label: typeLabel(r.type), size: r.size })),
        size: row.size,
        keys: rows.map(r => r.type),
        chatId: row.chat_id,
    };
}

function askCleanSelected() {
    if (!selectedTypes.value.length) return;
    const rows = byType.value.filter(r => selectedTypes.value.includes(r.type));
    if (!rows.length) return;
    confirmState.value = {
        rows: rows.map(r => ({ label: typeLabel(r.type), size: r.size })),
        size: selectedSize.value,
        keys: [...selectedTypes.value],
        chatId: 0,
    };
}

/**
 * 执行清理：size/ttl/count 全 0 = 删到 0，只保留 file_types + chat_ids 命中的文件；
 * immunity_delay 0 关掉「新建文件保护」。返回的新统计直接替换本地数据，省一次扫描。
 */
async function runCleanup() {
    const c = confirmState.value;
    if (!c || !c.keys.length || cleaning.value) return;
    cleaning.value = true;
    try {
        stats.value = await tdlibSend({
            _: 'optimizeStorage',
            size: 0,
            ttl: 0,
            count: 0,
            immunity_delay: 0,
            file_types: c.keys.flatMap(fileTypesOf),
            chat_ids: c.chatId ? [c.chatId] : [],
            exclude_chat_ids: [],
            return_deleted_file_statistics: false,
            chat_limit: CHAT_LIMIT,
        });
        confirmState.value = null;
        chatDialog.value = null;
        selectedTypes.value = [];
        await loadChats();
        toast.success({ content: t('storage.cleaned', { size: formatSize(c.size) }), placement: 'top-right' });
    } catch (e: any) {
        toast.error({
            content: t('storage.cleanFailed', { error: String(e?.message ?? e) }),
            placement: 'top-right',
        });
    } finally {
        cleaning.value = false;
    }
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        stats.value = await tdlibSend({ _: 'getStorageStatistics', chat_limit: CHAT_LIMIT });
        await loadChats();
    } catch (e: any) {
        error.value = String(e?.message ?? e);
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<style scoped></style>
