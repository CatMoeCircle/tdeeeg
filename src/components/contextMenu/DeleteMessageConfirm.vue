<template>
    <Teleport to="body">
        <Transition name="dmc-fade">
            <div v-if="visible" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-100 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <TrashIcon class="w-4 h-4 text-red-500" />
                            {{ t('deleteConfirm.deleteTitle') }}
                            <span v-if="senderTotalCount > 0" class="font-normal text-xs text-gray-400 dark:text-gray-500">
                                {{ t('deleteConfirm.totalCount', { count: senderTotalCount }) }}
                            </span>
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文 -->
                    <div class="px-4 py-4 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            {{ askText }}
                        </p>
                        <p v-if="senders.length > 1" class="text-xs text-gray-400 dark:text-gray-500">
                            {{ t('deleteConfirm.peopleCount', { count: senders.length }) }}
                        </p>

                        <!-- 没有可管理的发送者：普通确认 + 「同时为所有人删除」 -->
                        <div v-if="senders.length === 0" class="pt-1">
                            <label v-if="showDeleteForAll"
                                class="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                                :class="optRevoke ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'">
                                <input v-model="optRevoke" type="checkbox"
                                    class="w-4 h-4 accent-red-500 shrink-0" />
                                <div class="min-w-0 flex-1">
                                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        {{ t('deleteConfirm.deleteForAll') }}
                                    </p>
                                    <p class="text-xs text-gray-400 dark:text-gray-500">
                                        {{ t('deleteConfirm.deleteForAllHint') }}
                                    </p>
                                </div>
                            </label>
                        </div>

                        <!-- 更多选项：每项可展开到逐人勾选 -->
                        <div v-else-if="hasAnyOption" class="pt-2 space-y-1">
                            <p class="text-xs font-semibold text-blue-500 px-1 pb-1">
                                {{ t('deleteConfirm.moreOptions') }}
                            </p>

                            <div v-for="row in optionRows" :key="row.key" v-show="row.show">
                                <!-- 动作主行 -->
                                <div class="flex items-center gap-3 px-1 py-2.5 select-none"
                                    :class="row.eligible.length === 0
                                        ? 'opacity-40 cursor-not-allowed'
                                        : 'cursor-pointer'"
                                    @click="row.eligible.length > 0 && row.toggleAll()">
                                    <span class="w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center"
                                        :class="row.checkedAll ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600'">
                                        <CheckIcon v-if="row.checkedAll" class="w-3 h-3" />
                                    </span>
                                    <span class="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                                        {{ row.label }}
                                    </span>
                                    <button v-if="senders.length > 1" type="button"
                                        class="shrink-0 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                                        :aria-label="t('deleteConfirm.moreOptions')"
                                        @click.stop="row.toggleExpand()">
                                        <UsersIcon class="w-4 h-4" />
                                        <span>{{ senders.length }}</span>
                                        <ChevronUpIcon v-if="row.expanded" class="w-4 h-4" />
                                        <ChevronDownIcon v-else class="w-4 h-4" />
                                    </button>
                                </div>

                                <!-- 逐人列表：不可执行该项的成员置灰、不可勾选 -->
                                <div v-if="row.expanded && senders.length > 1" class="pl-9 space-y-0.5">
                                    <div v-for="(s, i) in senders" :key="s.key"
                                        class="flex items-center gap-3 px-1 py-2 rounded-lg select-none"
                                        :class="row.canApply(s)
                                            ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'
                                            : 'opacity-40 cursor-not-allowed'"
                                        @click="row.canApply(s) && row.toggleAt(i)">
                                        <span class="w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center"
                                            :class="row.checkedAt(i) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600'">
                                            <CheckIcon v-if="row.checkedAt(i)" class="w-3 h-3" />
                                        </span>
                                        <div class="w-6 h-6 shrink-0 rounded-full overflow-hidden">
                                            <Avatar :photo="s.photo" :title="s.name" :first-name="s.firstName"
                                                :last-name="s.lastName" :accentColorId="s.accentColorId"
                                                :deletedAccount="s.isDeleted" />
                                        </div>
                                        <span class="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                                            {{ s.name }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="cancel"
                            class="px-4 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            {{ t('lng_cancel') }}
                        </button>
                        <button type="button" @click="confirm"
                            class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            :disabled="!canConfirm">
                            {{ t('lng_box_delete') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { XIcon, TrashIcon, CheckIcon, UsersIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import {
    visible, request, confirmDelete, cancelDelete,
} from "../../store/deleteMessage";
import type { DeleteMessageResult, DeleteSenderInfo } from "../../store/deleteMessage";
import { searchSenderMessageCount } from "./messageActions";
import Avatar from "../chat/avatar.vue";

const { t, locale } = useI18n();

const req = computed(() => request.value);
const senders = computed(() => req.value?.senders ?? []);
const msgCount = computed(() => req.value?.msgs.length ?? 0);

const showDeleteForAll = computed(() =>
    req.value?.showDeleteForAll === true && req.value?.canDeleteForAll === true
);
const canReportSpam = computed(() => req.value?.canReportSpam === true);
const supportsBan = computed(() => req.value?.supportsBan === true);

/** 发送者标签：单个用「“名字”」，多个列出前三位并用「等 N 人」收尾 */
const joiner = locale.value.toLowerCase().startsWith('zh') ? '、' : ', ';
const senderLabel = computed(() => {
    const names = senders.value.map(s => s.name).filter(Boolean);
    if (names.length === 0) return t("deleteConfirm.thisUser");
    if (names.length <= 3) return `“${names.join(joiner)}”`;
    return t("deleteConfirm.namesMore", {
        names: `“${names.slice(0, 3).join(joiner)}”`,
        count: names.length,
    });
});

/** 正文提问 */
const askText = computed(() => {
    if (senders.value.length === 0) {
        return msgCount.value === 1
            ? t("deleteConfirm.deleteAskSelf")
            : t("deleteConfirm.deleteAskSelfMulti", { count: msgCount.value });
    }
    return msgCount.value === 1
        ? t("deleteConfirm.deleteAsk", { sender: senderLabel.value })
        : t("deleteConfirm.deleteAskMulti", { sender: senderLabel.value, count: msgCount.value });
});

/** 单个发送者时，查其在本对话中的消息总数用于标题计数 */
const senderTotalCount = ref(0);

const optRevoke = ref(false);

// 逐人勾选集合（值为 senders 下标）
const reportSet = ref<Set<number>>(new Set());
const deleteAllSet = ref<Set<number>>(new Set());
const reactionsSet = ref<Set<number>>(new Set());
const banSet = ref<Set<number>>(new Set());

const expandReport = ref(false);
const expandDeleteAll = ref(false);
const expandReactions = ref(false);
const expandBan = ref(false);

/** 可执行某项动作的发送者下标 */
function eligibleFor(pred: (s: DeleteSenderInfo) => boolean): number[] {
    return senders.value.map((s, i) => (pred(s) ? i : -1)).filter(i => i >= 0);
}

const reportEligible = computed(() =>
    canReportSpam.value ? senders.value.map((_, i) => i) : []
);
const deleteAllEligible = computed(() => eligibleFor(s => s.canDeleteAll));
const reactionsEligible = computed(() => eligibleFor(s => s.canDeleteReactions));
const banEligible = computed(() => eligibleFor(s => s.canBan));

function allChecked(set: Set<number>, eligible: number[]): boolean {
    return eligible.length > 0 && eligible.every(i => set.has(i));
}

function toggleSet(setRef: { value: Set<number> }, i: number) {
    const next = new Set(setRef.value);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setRef.value = next;
}

/** 主行点击：全选可执行项，或全部取消 */
function toggleAllSet(setRef: { value: Set<number> }, eligible: number[]) {
    setRef.value = allChecked(setRef.value, eligible) ? new Set() : new Set(eligible);
}

interface OptionRow {
    key: string;
    show: boolean;
    label: string;
    eligible: number[];
    checkedAll: boolean;
    expanded: boolean;
    checkedAt: (i: number) => boolean;
    canApply: (s: DeleteSenderInfo) => boolean;
    toggleAt: (i: number) => void;
    toggleAll: () => void;
    toggleExpand: () => void;
}

/** 四个动作行：举报 / 删除全部消息 / 删除全部回应 / 封禁 */
const optionRows = computed<OptionRow[]>(() => [
    {
        key: 'report',
        show: canReportSpam.value,
        label: t('deleteConfirm.reportSpam'),
        eligible: reportEligible.value,
        checkedAll: allChecked(reportSet.value, reportEligible.value),
        expanded: expandReport.value,
        checkedAt: i => reportSet.value.has(i),
        canApply: () => true,
        toggleAt: i => toggleSet(reportSet, i),
        toggleAll: () => toggleAllSet(reportSet, reportEligible.value),
        toggleExpand: () => { expandReport.value = !expandReport.value; },
    },
    {
        key: 'deleteAll',
        show: deleteAllEligible.value.length > 0,
        label: senders.value.length === 1
            ? t('deleteConfirm.deleteAllFromSender', { sender: senderLabel.value })
            : t('deleteConfirm.deleteAllFromSenders'),
        eligible: deleteAllEligible.value,
        checkedAll: allChecked(deleteAllSet.value, deleteAllEligible.value),
        expanded: expandDeleteAll.value,
        checkedAt: i => deleteAllSet.value.has(i),
        canApply: s => s.canDeleteAll,
        toggleAt: i => toggleSet(deleteAllSet, i),
        toggleAll: () => toggleAllSet(deleteAllSet, deleteAllEligible.value),
        toggleExpand: () => { expandDeleteAll.value = !expandDeleteAll.value; },
    },
    {
        key: 'reactions',
        show: reactionsEligible.value.length > 0,
        label: senders.value.length === 1
            ? t('deleteConfirm.deleteAllReactionsFromSender', { sender: senderLabel.value })
            : t('deleteConfirm.deleteAllReactionsFromSenders'),
        eligible: reactionsEligible.value,
        checkedAll: allChecked(reactionsSet.value, reactionsEligible.value),
        expanded: expandReactions.value,
        checkedAt: i => reactionsSet.value.has(i),
        canApply: s => s.canDeleteReactions,
        toggleAt: i => toggleSet(reactionsSet, i),
        toggleAll: () => toggleAllSet(reactionsSet, reactionsEligible.value),
        toggleExpand: () => { expandReactions.value = !expandReactions.value; },
    },
    {
        key: 'ban',
        show: supportsBan.value,
        label: senders.value.length === 1
            ? t('deleteConfirm.banSender', { sender: senderLabel.value })
            : t('deleteConfirm.banSenders'),
        eligible: banEligible.value,
        checkedAll: allChecked(banSet.value, banEligible.value),
        expanded: expandBan.value,
        checkedAt: i => banSet.value.has(i),
        canApply: s => s.canBan,
        toggleAt: i => toggleSet(banSet, i),
        toggleAll: () => toggleAllSet(banSet, banEligible.value),
        toggleExpand: () => { expandBan.value = !expandBan.value; },
    },
]);

const hasAnyOption = computed(() => optionRows.value.some(r => r.show));

// 打开弹窗时重置选项（默认全选可执行项），并查询消息总数
watch(visible, async (v) => {
    if (!v) return;
    optRevoke.value = true;
    reportSet.value = new Set(reportEligible.value);
    deleteAllSet.value = new Set(deleteAllEligible.value);
    reactionsSet.value = new Set(reactionsEligible.value);
    banSet.value = new Set(banEligible.value);
    expandReport.value = false;
    expandDeleteAll.value = false;
    expandReactions.value = false;
    expandBan.value = false;
    senderTotalCount.value = 0;
    const r = req.value;
    if (r && r.senders.length === 1 && r.senders[0].canDeleteAll) {
        senderTotalCount.value = await searchSenderMessageCount(r.chatId, r.senders[0].sender);
    }
});

const canConfirm = computed(() => msgCount.value > 0);

/** Set<下标> → 发送者 key 列表（可按 canApply 再过滤） */
function keysOf(set: Set<number>, canApply?: (s: DeleteSenderInfo) => boolean): string[] {
    return [...set]
        .map(i => senders.value[i])
        .filter((s): s is DeleteSenderInfo => !!s && (!canApply || canApply(s)))
        .map(s => s.key);
}

function confirm() {
    const result: DeleteMessageResult = {
        deleteMessages: true,
        reportSenderKeys: keysOf(reportSet.value),
        // 私聊 / 基础群用复选框；超级群 / 频道按消息权限决定是否对所有人
        revoke: showDeleteForAll.value
            ? optRevoke.value
            : req.value?.canDeleteForAll === true,
        deleteAllSenderKeys: keysOf(deleteAllSet.value, s => s.canDeleteAll),
        deleteReactionsSenderKeys: keysOf(reactionsSet.value, s => s.canDeleteReactions),
        banSenderKeys: keysOf(banSet.value, s => s.canBan),
    };
    confirmDelete(result);
}

function cancel() {
    cancelDelete();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible.value) {
        cancel();
    }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.dmc-fade-enter-active,
.dmc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.dmc-fade-enter-from,
.dmc-fade-leave-to {
    opacity: 0;
}
</style>
