<template>
    <!-- Gram 转账（messageTonWalletTransfer） -->
    <div class="mx-auto mt-1 flex w-fit max-w-full flex-col items-center gap-1 select-text">
        <!-- 与 MessageServiceContent -->
        <p v-if="actionText"
            class="msg-notice-surface max-w-full rounded-full px-3 py-1 text-center text-xs text-gray-500 dark:text-gray-400">
            {{ actionText }}
        </p>

        <div class="msg-notice-surface flex flex-col items-center rounded-2xl"
            :style="{ width: `${TON_CARD_WIDTH + TON_CARD_INSET * 2}px`, padding: `${TON_CARD_INSET}px` }">
            <TonTransferCard :amount="content.amount" :address="content.peer_address" :name="peerName" :status="status"
                :label="ribbonLabel" :outgoing="isOutgoing" @details="openDetails" />

            <!-- 备注里的 \n 要真换行：正文按 pre-wrap 渲染，纯文本才不会被折成一行 -->
            <p v-if="hasComment"
                class="px-1 pt-1 pb-0.5 text-center text-xs leading-snug whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                <SpoilerSpan v-if="content.is_comment_encrypted">{{ t('lng_action_gram_transfer_encrypted_comment') }}</SpoilerSpan>
                <template v-else>{{ content.comment }}</template>
            </p>
        </div>
    </div>

    <!-- 交易详情：点蓝色卡面打开（钻石、金额、备注、对方 / 地址 / 费用 / 日期） -->
    <TonTransferDetailDialog :open="detailsOpen" :content="content" :date="message?.date" :outgoing="isOutgoing"
        :party="party" @close="closeDetails" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { message, messageTonWalletTransfer } from 'tdlib-types';
import TonTransferCard from './TonTransferCard.vue';
import TonTransferDetailDialog from '../../../../common/TonTransferDetailDialog.vue';
import SpoilerSpan from '../spoiler/SpoilerSpan.vue';
import {
    ensureChat,
    ensureUser,
    getChatTitle,
    getReactiveChat,
    getUserDisplayName,
} from '../../../../../utils/profile/senderInfo';
import {
    formatGramAmount,
    GRAM_SCALE,
    TON_CARD_INSET,
    TON_CARD_WIDTH,
    tonTransferStatus,
} from '../../../../../utils/message/tonTransfer';
import { resolveGiftParty, type GiftDetailParty } from '../../../../../utils/message/giftDetail';

const { t } = useI18n();

const props = defineProps<{
    content: messageTonWalletTransfer;
    /** 完整消息：取发送状态判断「失败」缎带 */
    message?: message;
    isSelf?: boolean;
    chatId?: number;
}>();

/** 出账：自己发出，或金额为负（TDLib 对出账金额取负） */
const isOutgoing = computed(() => props.isSelf === true
    || props.message?.is_outgoing === true
    || props.content.amount < 0);

/** 发送失败（只有出账才可能失败） */
const failed = computed(() => props.message?.sending_state?._ === 'messageSendingStateFailed');

const status = computed(() => tonTransferStatus(props.content.amount, isOutgoing.value, failed.value));

/** 缎带文案走官方语言包的 tag 词条 */
const ribbonLabel = computed(() => {
    switch (status.value) {
        case 'failed':
            return t('lng_action_gram_transfer_failed_tag');
        case 'sent':
            return t('lng_action_gram_transfer_sent_tag');
        default:
            return t('lng_action_gram_transfer_received_tag');
    }
});

/** 金额换算成 Gram（绝对值），用于官方词条的复数选择 */
const gramValue = computed(() => Math.abs(props.content.amount) / GRAM_SCALE);

/** 纯数字文案，例如 0.15 */
const amountNumber = computed(() => {
    const amount = formatGramAmount(props.content.amount);
    return `${amount.whole}${amount.fraction}`;
});

/** 「0.15 Gram」——官方复数词条（中文包不分单复数） */
const amountWithUnit = computed(() =>
    t('lng_action_gram_transfer_amount', { amount: amountNumber.value }, gramValue.value));

const senderName = ref('');

/** 对方原始名字：入账取发送者，出账取私聊对话标题（TDLib 不提供收款人姓名）；未知时为空串 */
const peerRawName = computed(() => {
    if (isOutgoing.value) {
        const chat = props.chatId != null ? getReactiveChat(props.chatId) : undefined;
        const isPrivate = chat?.type?._ === 'chatTypePrivate' || chat?.type?._ === 'chatTypeSecret';
        return (isPrivate ? getChatTitle(chat) : '') || '';
    }
    return senderName.value;
});

/** 卡片里的名字：未知时回落到官方词条「Unknown User」（credits 领取记录场景，官方包内唯一的独立叫法） */
const peerName = computed(() => peerRawName.value || t('lng_credits_box_history_entry_anonymous'));

/** 动作文案：有名字走带 {user} 的官方词条，没名字走 *_unknown */
const actionText = computed(() => {
    const amount = amountWithUnit.value;
    if (isOutgoing.value) {
        return peerRawName.value
            ? t('lng_action_gram_transfer_sent', { user: peerRawName.value, amount })
            : t('lng_action_gram_transfer_sent_unknown', { amount });
    }
    return peerRawName.value
        ? t('lng_action_gram_transfer_received', { user: peerRawName.value, amount })
        : t('lng_action_gram_transfer_received_unknown', { amount });
});

/** 是否有备注：空备注不占位；加密备注只给遮罩 */
const hasComment = computed(() => props.content.is_comment_encrypted || !!props.content.comment?.trim());

/** 交易详情弹窗（点蓝色卡面打开） */
const detailsOpen = ref(false);

function openDetails() {
    detailsOpen.value = true;
}

function closeDetails() {
    detailsOpen.value = false;
}

/** 弹窗里的「对方」：与礼物详情的所有者同一套数据（头像 + 名字 + 主题色） */
const party = ref<GiftDetailParty | undefined>();

async function resolveParty() {
    const senderId = props.content.sender_user_id;
    if (!isOutgoing.value) {
        party.value = senderId > 0
            ? await resolveGiftParty({ _: 'messageSenderUser', user_id: senderId })
            : undefined;
        return;
    }
    // 出账时 TDLib 不给收款人：私聊里用对话标题/头像当对方，群聊里留空只显示地址
    if (props.chatId == null) {
        party.value = undefined;
        return;
    }
    const chat = getReactiveChat(props.chatId);
    const isPrivate = chat?.type?._ === 'chatTypePrivate' || chat?.type?._ === 'chatTypeSecret';
    party.value = isPrivate
        ? await resolveGiftParty({ _: 'messageSenderChat', chat_id: props.chatId })
        : undefined;
}

async function resolveNames() {
    const senderId = props.content.sender_user_id;
    if (senderId > 0 && !isOutgoing.value) {
        await ensureUser(senderId);
        senderName.value = getUserDisplayName(senderId);
    }
    if (isOutgoing.value && props.chatId != null) {
        await ensureChat(props.chatId);
    }
    await resolveParty();
}

watch(() => props.content, () => { void resolveNames(); }, { immediate: true });
</script>
