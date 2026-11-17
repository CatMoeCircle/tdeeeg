<template>
    <!-- 邀请链接创建 / 编辑弹窗：名称、过期时间、人数上限、需管理员批准 -->
    <ModalDialog :model-value="modelValue"
        :title="isEdit ? t('inviteLinkEdit.editTitle') : t('inviteLinkEdit.createTitle')"
        @update:model-value="close">
        <div class="space-y-4">
            <!-- 名称：TDLib 限制 0-32 字符，超长直接截断 -->
            <div class="space-y-1.5">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('inviteLinkEdit.nameLabel') }}
                </label>
                <BaseInput v-model="name" :maxlength="NAME_MAX" type="text" :placeholder="t('inviteLinkEdit.namePlaceholder')"
                    autocomplete="off" spellcheck="false" />
                <p class="text-[11px] text-gray-400 dark:text-gray-500">
                    {{ name.length }}/{{ NAME_MAX }} · {{ t('inviteLinkEdit.nameHint') }}
                </p>
            </div>

            <!-- 订阅链接只允许改名称，其余参数由订阅方案决定 -->
            <p v-if="isSubscription"
                class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {{ t('inviteLinkEdit.subscriptionLocked') }}
            </p>
            <!-- 已过期链接不允许编辑（列表不提供入口，这里是兜底提示） -->
            <p v-else-if="isExpiredLink"
                class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {{ t('inviteLinkEdit.expiredNoEdit') }}
            </p>

            <template v-else>
                <!-- 过期时间 -->
                <div class="space-y-1.5">
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {{ t('inviteLinkEdit.expirationLabel') }}
                    </p>
                    <div
                        class="overflow-hidden rounded-xl border border-gray-200 bg-white/70 divide-y divide-gray-100 dark:border-gray-700 dark:bg-gray-800/70 dark:divide-gray-800">
                        <button v-for="opt in expirationOptions" :key="opt.value" type="button"
                            class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            @click="expireMode = opt.value">
                            <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                                :class="expireMode === opt.value ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                                <span v-if="expireMode === opt.value" class="h-2 w-2 rounded-full bg-blue-500"></span>
                            </span>
                            <span class="text-sm text-gray-800 dark:text-gray-100">{{ opt.label }}</span>
                        </button>
                    </div>
                    <input v-if="expireMode === 'custom'" v-model="customDate" type="date" :min="todayIso"
                        :aria-label="t('inviteLinkEdit.expirationCustom')"
                        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]" />
                </div>

                <!-- 人数上限：需批准加入时 TDLib 要求 member_limit 必须为 0 -->
                <div class="space-y-1.5">
                    <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {{ t('inviteLinkEdit.memberLimitLabel') }}
                    </p>
                    <div
                        class="overflow-hidden rounded-xl border border-gray-200 bg-white/70 divide-y divide-gray-100 dark:border-gray-700 dark:bg-gray-800/70 dark:divide-gray-800"
                        :class="createsJoinRequest ? 'opacity-60' : ''">
                        <button v-for="opt in memberLimitOptions" :key="opt.value" type="button"
                            :disabled="createsJoinRequest"
                            class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 disabled:cursor-not-allowed dark:hover:bg-white/5"
                            @click="selectMemberLimitMode(opt.value)">
                            <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                                :class="limitMode === opt.value ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'">
                                <span v-if="limitMode === opt.value" class="h-2 w-2 rounded-full bg-blue-500"></span>
                            </span>
                            <span class="text-sm text-gray-800 dark:text-gray-100">{{ opt.label }}</span>
                        </button>
                    </div>
                    <input v-if="limitMode === 'custom' && !createsJoinRequest" v-model="customLimit" type="number"
                        min="1" max="99999" inputmode="numeric" :aria-label="t('inviteLinkEdit.memberLimitCustom')"
                        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
                    <p v-if="createsJoinRequest" class="text-[11px] text-amber-600 dark:text-amber-400">
                        {{ t('inviteLinkEdit.approvalDisablesLimit') }}
                    </p>
                    <p v-else class="text-[11px] text-gray-400 dark:text-gray-500">
                        {{ t('inviteLinkEdit.memberLimitHint') }}
                    </p>
                </div>

                <!-- 需管理员批准加入 -->
                <div
                    class="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/70">
                    <div class="min-w-0">
                        <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('inviteLinkEdit.approvalLabel') }}</p>
                        <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{{ t('inviteLinkEdit.approvalHint') }}</p>
                    </div>
                    <ToggleSwitch v-model="createsJoinRequest" class="mt-0.5 shrink-0" />
                </div>
            </template>
        </div>

        <template #footer>
            <BaseButton variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton type="button" size="sm" :disabled="saving || isExpiredLink" @click="save">
                {{ saving ? t('lng_context_seen_loading') : (isEdit ? t('inviteLinkEdit.saveAction') : t('inviteLinkEdit.createAction')) }}
            </BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { chatInviteLink, createChatInviteLink, editChatInviteLink } from 'tdlib-types';
import ModalDialog from '../ui/modal/ModalDialog.vue';
import BaseButton from '../ui/button/BaseButton.vue';
import BaseInput from '../ui/input/BaseInput.vue';
import ToggleSwitch from '../ui/toggle/ToggleSwitch.vue';
import { toast } from '../../utils/ui/toast';
import { tdlibSend } from '../../utils/session/tdlib';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    chatId: number;
    /** 编辑目标；null / 未传表示新建 */
    link?: chatInviteLink | null;
}>(), {
    link: null,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    /** 创建 / 编辑成功，父组件负责刷新列表 */
    (e: 'saved'): void;
}>();

const { t } = useI18n();

/** TDLib：invite link name 0-32 characters */
const NAME_MAX = 32;
/** TDLib：member_limit 0-99999，0 表示不限制 */
const MEMBER_LIMIT_MAX = 99999;
const DAY_SECONDS = 86400;

type ExpireMode = 'never' | '1d' | '7d' | '30d' | 'custom';
type LimitMode = 'unlimited' | 'custom';

const name = ref('');
const expireMode = ref<ExpireMode>('never');
const customDate = ref('');
const limitMode = ref<LimitMode>('unlimited');
const customLimit = ref('100');
const createsJoinRequest = ref(false);
const saving = ref(false);

const isEdit = computed(() => !!props.link);
/** 订阅链接（starSubscriptionPricing）只允许改名称：过期 / 上限 / 批准参数都不能传 */
const isSubscription = computed(() => !!props.link?.subscription_pricing);
/** 已过期链接不允许编辑：列表已隐藏入口，这里再兜一层，避免把过期链接改期复活 */
const isExpiredLink = computed(() => {
    const link = props.link;
    return !!link && link.expiration_date > 0 && link.expiration_date * 1000 <= Date.now();
});

const expirationOptions = computed<{ value: ExpireMode; label: string }[]>(() => [
    { value: 'never', label: t('inviteLinkEdit.expirationNever') },
    { value: '1d', label: t('inviteLinkEdit.expiration1d') },
    { value: '7d', label: t('inviteLinkEdit.expiration7d') },
    { value: '30d', label: t('inviteLinkEdit.expiration30d') },
    { value: 'custom', label: t('inviteLinkEdit.expirationCustom') },
]);

const memberLimitOptions = computed<{ value: LimitMode; label: string }[]>(() => [
    { value: 'unlimited', label: t('inviteLinkEdit.memberLimitUnlimited') },
    { value: 'custom', label: t('inviteLinkEdit.memberLimitCustom') },
]);

const todayIso = computed(() => toDateInputValue(Math.floor(Date.now() / 1000)));

/** 本地日期 → yyyy-mm-dd（<input type="date"> 需要本机时区的日期字符串） */
function toDateInputValue(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** yyyy-mm-dd → 当天本地 23:59:59 的 Unix 时间戳（选今天也不会立刻过期） */
function parseDateInputEndOfDay(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor(d.getTime() / 1000);
}

/** 每次打开都按当前编辑对象重置表单 */
function resetForm() {
    const link = props.link;
    name.value = link?.name ?? '';
    createsJoinRequest.value = !!link?.creates_join_request;
    if (link && link.expiration_date > 0) {
        // 保留原过期时间：绝不在用户只改名字时把已过期链接静默改期复活
        expireMode.value = 'custom';
        customDate.value = toDateInputValue(link.expiration_date);
    } else {
        expireMode.value = 'never';
        customDate.value = toDateInputValue(Math.floor(Date.now() / 1000) + 7 * DAY_SECONDS);
    }
    if (link && link.member_limit > 0) {
        limitMode.value = 'custom';
        customLimit.value = String(link.member_limit);
    } else {
        limitMode.value = 'unlimited';
        customLimit.value = '100';
    }
    saving.value = false;
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) resetForm();
    },
    { immediate: true },
);

/** 需批准加入时 member_limit 必须为 0，切到自定义没有意义 */
watch(createsJoinRequest, (enabled) => {
    if (enabled) limitMode.value = 'unlimited';
});

function selectMemberLimitMode(mode: LimitMode) {
    if (createsJoinRequest.value) return;
    limitMode.value = mode;
}

/** 过期时间 → Unix 时间戳；自定义日期必须晚于当前时间（TDLib 会拒绝过期时间） */
function resolveExpirationDate(): { ok: true; value: number } | { ok: false } {
    const now = Math.floor(Date.now() / 1000);
    switch (expireMode.value) {
        case 'never':
            return { ok: true, value: 0 };
        case '1d':
            return { ok: true, value: now + DAY_SECONDS };
        case '7d':
            return { ok: true, value: now + 7 * DAY_SECONDS };
        case '30d':
            return { ok: true, value: now + 30 * DAY_SECONDS };
        case 'custom': {
            const parsed = parseDateInputEndOfDay(customDate.value);
            if (parsed === null || parsed <= now) return { ok: false };
            return { ok: true, value: parsed };
        }
    }
}

/** 人数上限 → 0 表示不限制；非法输入返回 null */
function resolveMemberLimit(): number | null {
    if (createsJoinRequest.value || limitMode.value === 'unlimited') return 0;
    const parsed = Math.floor(Number(customLimit.value));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MEMBER_LIMIT_MAX) return null;
    return parsed;
}

function close() {
    if (saving.value) return;
    emit('update:modelValue', false);
}

async function save() {
    if (saving.value) return;
    if (isExpiredLink.value) {
        toast.warning(t('inviteLinkEdit.expiredNoEdit'));
        return;
    }
    const trimmedName = name.value.trim();
    if (trimmedName.length > NAME_MAX) {
        toast.warning(t('inviteLinkEdit.nameHint'));
        return;
    }

    // 订阅链接只传名称；其余类型才带过期 / 上限 / 批准参数
    let expirationDate = 0;
    let memberLimit = 0;
    if (!isSubscription.value) {
        const expiration = resolveExpirationDate();
        if (!expiration.ok) {
            toast.warning(t('inviteLinkEdit.expirationPastError'));
            return;
        }
        expirationDate = expiration.value;
        const resolvedLimit = resolveMemberLimit();
        if (resolvedLimit === null) {
            toast.warning(t('inviteLinkEdit.memberLimitInvalid'));
            return;
        }
        memberLimit = resolvedLimit;
    }

    saving.value = true;
    try {
        if (props.link) {
            const request: editChatInviteLink = isSubscription.value
                ? {
                    _: 'editChatInviteLink',
                    chat_id: props.chatId,
                    invite_link: props.link.invite_link,
                    name: trimmedName,
                }
                : {
                    _: 'editChatInviteLink',
                    chat_id: props.chatId,
                    invite_link: props.link.invite_link,
                    name: trimmedName,
                    expiration_date: expirationDate,
                    member_limit: memberLimit,
                    creates_join_request: createsJoinRequest.value,
                };
            await tdlibSend(request);
            toast.success(t('inviteLinkEdit.toastSaved'));
        } else {
            const request: createChatInviteLink = {
                _: 'createChatInviteLink',
                chat_id: props.chatId,
                name: trimmedName,
                expiration_date: expirationDate,
                member_limit: memberLimit,
                creates_join_request: createsJoinRequest.value,
            };
            await tdlibSend(request);
            toast.success(t('inviteLinkEdit.toastCreated'));
        }
        emit('saved');
        saving.value = false;
        emit('update:modelValue', false);
    } catch (e: any) {
        toast.error(e?.message || t('inviteLinkEdit.actionFailed'));
    } finally {
        saving.value = false;
    }
}
</script>
