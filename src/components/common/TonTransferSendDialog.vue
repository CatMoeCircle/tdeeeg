<template>
    <!-- 转账弹窗：先填表，再二次确认，确认后才真正调用 TDLib -->
    <ModalDialog :model-value="open" :title="step === 'form' ? t('walletPage.send.title') : t('walletPage.send.confirmTitle')"
        @update:model-value="onModelUpdate">
        <!-- 第一步：填写收款人 / 金额 / 备注 -->
        <div v-if="step === 'form'" class="space-y-3.5">
            <!-- 收款人类型 -->
            <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    {{ t('walletPage.send.recipient') }}
                </label>
                <div class="flex gap-2">
                    <button v-for="item in modes" :key="item.value" type="button"
                        class="px-3 py-1.5 rounded-lg text-sm transition-colors"
                        :class="mode === item.value
                            ? 'bg-[var(--app-brand)] text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
                        @click="switchMode(item.value)">
                        {{ t(item.labelKey) }}
                    </button>
                </div>
            </div>

            <!-- 用户名 -->
            <div v-if="mode === 'user'">
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    {{ t('walletPage.send.usernameLabel') }}
                </label>
                <input type="text" v-model.trim="username" :placeholder="t('walletPage.send.usernamePlaceholder')"
                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
                    @keydown.enter.prevent="next" />
                <p v-if="resolvedLabel" class="mt-1 text-xs text-[var(--app-brand)]">{{ resolvedLabel }}</p>
                <p v-else class="mt-1 text-xs text-gray-400">{{ t('walletPage.send.usernameHint') }}</p>
            </div>

            <!-- TON 地址 -->
            <div v-else>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    {{ t('walletPage.send.addressLabel') }}
                </label>
                <input type="text" v-model.trim="address" :placeholder="t('walletPage.send.addressPlaceholder')"
                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 font-mono text-[13px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]"
                    @keydown.enter.prevent="next" />
                <p class="mt-1 text-xs text-gray-400">{{ t('walletPage.send.addressHint') }}</p>
            </div>

            <!-- 金额 -->
            <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    {{ t('walletPage.send.amountLabel') }}
                </label>
                <div class="relative">
                    <input type="text" inputmode="decimal" v-model.trim="amount" placeholder="0.00"
                        class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 pr-16 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]" />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                        {{ t('walletPage.ticker') }}
                    </span>
                </div>
                <div class="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span class="text-gray-400">
                        {{ t('walletPage.send.available', { balance: balanceText }) }}
                    </span>
                    <span v-if="minAmountText" class="text-gray-400">
                        {{ t('walletPage.send.minAmount', { amount: minAmountText }) }}
                    </span>
                </div>
            </div>

            <!-- 备注 -->
            <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    {{ t('walletPage.send.commentLabel') }}
                </label>
                <input type="text" v-model="comment" maxlength="120"
                    :placeholder="t('walletPage.send.commentPlaceholder')"
                    class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]" />
            </div>

            <!-- 免手续费提示（有剩余笔数才显示） -->
            <p v-if="gaslessLeft !== null && gaslessLeft > 0"
                class="rounded-lg bg-[var(--app-brand-soft)] px-3 py-2 text-xs leading-snug text-[var(--app-brand)]">
                {{ t('walletPage.send.gaslessHint', { count: gaslessLeft }) }}
            </p>

            <p v-if="errorText" class="text-xs text-red-500 break-words">{{ errorText }}</p>
        </div>

        <!-- 第二步：二次确认 -->
        <div v-else class="space-y-3">
            <div class="overflow-hidden rounded-xl border border-gray-200 text-[13px] dark:border-gray-700">
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-20 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.send.recipient') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 break-all text-gray-800 dark:text-gray-100">
                        {{ confirmRecipient }}
                    </div>
                </div>
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <div class="flex w-20 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.send.amountLabel') }}
                    </div>
                    <div class="flex min-w-0 flex-1 items-center gap-1 px-2.5 py-2 text-gray-800 dark:text-gray-100">
                        <TgGramColoredIcon :size="16" />
                        <span>{{ confirmAmount }}</span>
                        <span class="text-xs text-gray-400">{{ t('walletPage.ticker') }}</span>
                    </div>
                </div>
                <div v-if="comment.trim()" class="flex">
                    <div class="flex w-20 shrink-0 items-center bg-gray-50 px-2.5 py-2 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                        {{ t('walletPage.send.commentLabel') }}
                    </div>
                    <div class="min-w-0 flex-1 px-2.5 py-2 break-words text-gray-800 dark:text-gray-100">
                        {{ comment.trim() }}
                    </div>
                </div>
            </div>

            <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {{ t('walletPage.send.confirmWarning') }}
            </p>

            <p v-if="errorText" class="text-xs text-red-500 break-words">{{ errorText }}</p>
        </div>

        <template #footer>
            <template v-if="step === 'form'">
                <BaseButton variant="ghost" size="sm" type="button" @click="onModelUpdate(false)">
                    {{ t('walletPage.common.cancel') }}
                </BaseButton>
                <BaseButton size="sm" type="button" :disabled="resolving" @click="next">
                    {{ resolving ? t('walletPage.send.resolving') : t('walletPage.send.next') }}
                </BaseButton>
            </template>
            <template v-else>
                <BaseButton variant="ghost" size="sm" type="button" :disabled="sending" @click="step = 'form'">
                    {{ t('walletPage.send.back') }}
                </BaseButton>
                <BaseButton size="sm" type="button" :disabled="sending" @click="submit">
                    {{ sending ? t('walletPage.send.sending') : t('walletPage.send.submit') }}
                </BaseButton>
            </template>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { sendTonWalletTransfer } from 'tdlib-types';
import BaseButton from '../ui/button/BaseButton.vue';
import ModalDialog from '../ui/modal/ModalDialog.vue';
import { TgGramColoredIcon } from './telegramIconComponents';
import { tdlibSend } from '../../utils/session/tdlib';
import { toast } from '../../utils/ui/toast';
import {
    compareGramUnits,
    formatWalletBalance,
    isPositiveGramUnits,
    parseGramInputToUnits,
    shortTonAddress,
} from '../../utils/wallet/tonWallet';

const props = withDefaults(defineProps<{
    open: boolean;
    /** 本钱包余额（最小单位字符串） */
    balanceUnits?: string;
    /** 最小转账金额（最小单位字符串）；未知传 null */
    minAmountUnits?: string | null;
    /** 今日剩余免手续费笔数；未知传 null */
    gaslessLeft?: number | null;
}>(), {
    balanceUnits: '0',
    minAmountUnits: null,
    gaslessLeft: null,
});

const emit = defineEmits<{ close: []; sent: [] }>();

const { t } = useI18n();

type Mode = 'user' | 'address';
type Step = 'form' | 'confirm';

const modes: Array<{ value: Mode; labelKey: string }> = [
    { value: 'user', labelKey: 'walletPage.send.modeUser' },
    { value: 'address', labelKey: 'walletPage.send.modeAddress' },
];

const mode = ref<Mode>('user');
const step = ref<Step>('form');
const username = ref('');
const address = ref('');
const amount = ref('');
const comment = ref('');
const resolving = ref(false);
const sending = ref(false);
const errorText = ref('');

/** 解析出来的收款人（用户名模式）：用户 id 与钱包地址 */
const recipientUserId = ref(0);
const recipientAddress = ref('');
const resolvedLabel = ref('');

const balanceText = computed(() => {
    const formatted = formatWalletBalance(props.balanceUnits);
    return formatted.whole + formatted.fraction;
});

const minAmountText = computed(() => {
    if (!props.minAmountUnits) return '';
    const formatted = formatWalletBalance(props.minAmountUnits);
    return formatted.whole + formatted.fraction;
});

/** 表单里输入的金额 → 最小单位；非法返回 null */
const amountUnits = computed(() => parseGramInputToUnits(amount.value));

/** 确认页展示用：按输入小数原样展示，避免二次格式化改写用户输入 */
const confirmAmount = computed(() => amount.value.trim());

const confirmRecipient = computed(() => {
    if (mode.value === 'user') {
        const name = resolvedLabel.value || ('@' + username.value.replace(/^@/, ''));
        return recipientAddress.value
            ? name + ' (' + shortTonAddress(recipientAddress.value) + ')'
            : name;
    }
    return address.value.trim();
});

/** 把 TDLib error（不是 Error 实例）转成可读文案 */
function tdlibErrorMessage(error: unknown): string {
    const message = (error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (error instanceof Error && error.message) return error.message;
    return t('walletPage.common.unknownError');
}

function switchMode(next: Mode) {
    if (mode.value === next) return;
    mode.value = next;
    errorText.value = '';
    resolvedLabel.value = '';
    recipientUserId.value = 0;
    recipientAddress.value = '';
}

function onModelUpdate(open: boolean) {
    if (!open) emit('close');
}

/** 打开时重置全部状态，避免上一次的输入残留 */
watch(() => props.open, (open) => {
    if (!open) return;
    step.value = 'form';
    mode.value = 'user';
    username.value = '';
    address.value = '';
    amount.value = '';
    comment.value = '';
    errorText.value = '';
    resolving.value = false;
    sending.value = false;
    recipientUserId.value = 0;
    recipientAddress.value = '';
    resolvedLabel.value = '';
});

/** 校验金额：格式、最小额、余额 */
function validateAmount(): string | null {
    const units = amountUnits.value;
    if (units === null) return t('walletPage.send.invalidAmount');
    if (!isPositiveGramUnits(units)) return t('walletPage.send.invalidAmount');
    if (props.minAmountUnits && compareGramUnits(units, props.minAmountUnits) < 0) {
        return t('walletPage.send.belowMin', { amount: minAmountText.value });
    }
    if (compareGramUnits(units, props.balanceUnits || '0') > 0) {
        return t('walletPage.send.insufficient');
    }
    return null;
}

/** 用户名 → 用户 id（searchPublicChat）→ 钱包地址（getUserTonWalletAddresses） */
async function resolveUsername(): Promise<string | null> {
    const name = username.value.replace(/^@/, '').trim();
    if (!name) return t('walletPage.send.usernameRequired');
    resolving.value = true;
    try {
        const chat = await tdlibSend({ _: 'searchPublicChat', username: name });
        if (chat.type._ !== 'chatTypePrivate') {
            return t('walletPage.send.notPrivateUser');
        }
        // 提前取出 user_id：类型收窄在回调里不保留，先落到局部常量再复用
        const peerUserId = chat.type.user_id;
        recipientUserId.value = peerUserId;
        resolvedLabel.value = chat.title || ('@' + name);
        // 能拿到对方钱包地址时按地址发送：地址是链上唯一标识，比用户 id 更直接
        try {
            const addresses = await tdlibSend({
                _: 'getUserTonWalletAddresses',
                user_ids: [peerUserId],
            });
            const found = addresses.addresses.find((item) => item.user_id === peerUserId);
            recipientAddress.value = found?.wallet_address ?? '';
        } catch {
            // 地址查询失败不影响按用户 id 发送
            recipientAddress.value = '';
        }
        return null;
    } catch (error) {
        return tdlibErrorMessage(error);
    } finally {
        resolving.value = false;
    }
}

/** 进入确认页：先做输入校验与收款人解析 */
async function next() {
    // 解析中重复点击会并发解析 / 并发切步骤，直接忽略
    if (resolving.value) return;
    errorText.value = '';
    const amountError = validateAmount();
    if (amountError) {
        errorText.value = amountError;
        return;
    }
    if (mode.value === 'user') {
        const resolveError = await resolveUsername();
        if (resolveError) {
            errorText.value = resolveError;
            return;
        }
        if (!recipientUserId.value && !recipientAddress.value) {
            errorText.value = t('walletPage.send.recipientMissing');
            return;
        }
    } else {
        const value = address.value.trim();
        if (!value) {
            errorText.value = t('walletPage.send.addressRequired');
            return;
        }
        // 先用 getAddressTonWallet 让 TDLib 校验地址格式，避免把错误地址带到确认页
        resolving.value = true;
        try {
            const info = await tdlibSend({ _: 'getAddressTonWallet', address: value });
            if (!info.wallet_address) {
                errorText.value = t('walletPage.send.invalidAddress');
                return;
            }
            recipientAddress.value = info.wallet_address;
            recipientUserId.value = 0;
        } catch (error) {
            errorText.value = tdlibErrorMessage(error);
            return;
        } finally {
            resolving.value = false;
        }
    }
    step.value = 'confirm';
}

/** 确认后真正发起转账 */
async function submit() {
    const units = amountUnits.value;
    if (units === null) {
        errorText.value = t('walletPage.send.invalidAmount');
        step.value = 'form';
        return;
    }
    errorText.value = '';
    sending.value = true;
    try {
        const text = comment.value.trim();
        // TDLib 的 C++ 层对未标 optional 的字段做必填校验，缺字段会报 "Can't find field"。
        // 因此两种模式都写全：user_id / address 各用一个哨兵值（0 / 空串），
        // 序列化数据字段传空串（gasless_transfer_data 空串即强制普通转账）。
        const byAddress = !(mode.value === 'user' && !recipientAddress.value);
        const request: sendTonWalletTransfer = {
            _: 'sendTonWalletTransfer',
            user_id: byAddress ? 0 : recipientUserId.value,
            address: byAddress ? recipientAddress.value : '',
            amount: units,
            comment: text,
            is_comment_encrypted: false,
            sending_id: 0,
            regular_transfer_data: '',
            gasless_transfer_data: '',
        };
        const result = await tdlibSend(request);
        toast.success(result.is_gasless
            ? t('walletPage.send.sentGasless')
            : t('walletPage.send.sent'));
        emit('sent');
        emit('close');
    } catch (error) {
        // TDLib 的失败原因（如余额不足 / 地址无效）原样展示，便于用户自己修正
        errorText.value = tdlibErrorMessage(error);
        step.value = 'form';
    } finally {
        sending.value = false;
    }
}
</script>
