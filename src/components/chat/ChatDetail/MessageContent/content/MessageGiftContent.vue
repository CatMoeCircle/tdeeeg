<template>
    <div class="w-80 max-w-[calc(100vw-2rem)] text-center">
        <div class="mb-1.5 inline-flex max-w-full rounded-full bg-white/30  px-3 py-1 text-xs font-medium shadow-sm">
            <span class="truncate">
                <GlobalEmojiText :text="notificationText" />
            </span>
        </div>

        <div
            class="mx-auto w-fit max-w-full rounded-lg bg-white/40 backdrop-blur-md px-5 pb-4 pt-3 overflow-hidden dark:bg-black/20">
            <div class="mx-auto h-44 w-44 flex items-center justify-center overflow-hidden">
                <MessageStickerContent :content="stickerContent" :size="176" />
            </div>
            <h3 class="mt-1 text-xl font-semibold leading-tight text-gray-900 dark:text-white">
                <GlobalEmojiText :text="cardTitle" />
            </h3>
            <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
                <GlobalEmojiText :text="profileText" />
            </p>
            <!-- 礼物说明：支持自定义 emoji -->
            <p v-if="giftText?.text" class="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                <FormattedTextInline :formattedText="giftText" :size="18" />
            </p>
            <button type="button"
                class="mt-4 rounded-full bg-white/50 backdrop-blur-sm px-6 py-1.5 text-sm font-medium text-gray-900 hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-black/20 dark:bg-white/15 dark:text-white dark:hover:bg-white/25 dark:focus:ring-white/20"
                @click="openDetails">
                {{ t('lng_action_suggested_birtday_button') }}
            </button>
        </div>
    </div>

    <GiftDetailDialog :open="detailsOpen" :data="detailData" @close="closeDetails" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
    formattedText,
    gift,
    messageGift,
    messageSticker,
    messageUpgradedGift,
    sticker,
} from 'tdlib-types';
import { useUserStore } from '../../../../../store/user';
import MessageStickerContent from './MessageStickerContent.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';
import FormattedTextInline from '../../../FormattedTextInline.vue';
import GiftDetailDialog from '../../../../common/GiftDetailDialog.vue';
import { buildGiftDetailData, resolveGiftParty, type GiftDetailData, type GiftDetailParty } from '../../../../../utils/giftDetail';

type GiftMessageContent = messageGift | messageUpgradedGift;

const props = defineProps<{
    content: GiftMessageContent;
    date?: number;
    isSelf?: boolean;
}>();

const userStore = useUserStore();
const detailsOpen = ref(false);
const detailData = ref<GiftDetailData | null>(null);
const sender = ref<GiftDetailParty>();
const receiver = ref<GiftDetailParty>();

const isUpgradedMsg = computed(() => props.content._ === 'messageUpgradedGift');

const regularGift = computed<gift | null>(() => {
    if (isUpgradedMsg.value) return null;
    return (props.content as messageGift).gift ?? null;
});

const upgradedGiftData = computed(() => {
    if (!isUpgradedMsg.value) return null;
    return (props.content as messageUpgradedGift).gift ?? null;
});

const mainSticker = computed<sticker | null>(() => {
    if (isUpgradedMsg.value) return upgradedGiftData.value?.model?.sticker ?? null;
    return regularGift.value?.sticker ?? null;
});

const stickerContent = computed<messageSticker>(() => ({
    _: 'messageSticker',
    sticker: mainSticker.value!,
    is_premium: false,
}));

const giftText = computed<formattedText | null>(() => {
    if (isUpgradedMsg.value) {
        return (props.content as messageUpgradedGift).gift?.original_details?.text ?? null;
    }
    return (props.content as messageGift).text ?? null;
});

const currentUserId = computed(() => userStore.userProfile?.id);

function senderIdOf(c: GiftMessageContent) {
    return c.sender_id;
}
function receiverIdOf(c: GiftMessageContent) {
    return c.receiver_id;
}

const isIncoming = computed(() => {
    const rid = receiverIdOf(props.content);
    return rid?._ === 'messageSenderUser' && rid.user_id === currentUserId.value;
});
const isOutgoing = computed(() => {
    const sid = senderIdOf(props.content);
    return sid?._ === 'messageSenderUser' && sid.user_id === currentUserId.value;
});

const senderName = computed(() => sender.value?.name || '匿名用户');
const receiverName = computed(() => receiver.value?.name || '收礼人');
const partyName = computed(() => isOutgoing.value ? receiverName.value : senderName.value);

const starCount = computed(() => regularGift.value?.star_count ?? 0);
const starCost = computed(() => t('lng_action_gift_for_stars', { count: starCount.value }));

const notificationText = computed(() => {
    if (isUpgradedMsg.value) {
        const ug = upgradedGiftData.value;
        const collectible = t('lng_gift_unique_number', { index: ug?.number ?? 0 });
        if (isOutgoing.value) return t('lng_action_gift_unique_sent');
        return t('lng_action_gift_unique_received', { user: senderName.value }) || collectible;
    }
    if (isOutgoing.value) return t('lng_action_gift_received_me', { user: receiverName.value, cost: starCost.value });
    if (isIncoming.value) {
        const sid = senderIdOf(props.content);
        if (!sid || sid._ !== 'messageSenderUser') {
            return t('lng_action_gift_received_anonymous', { cost: starCost.value });
        }
        return t('lng_action_gift_received', { user: senderName.value, cost: starCost.value });
    }
    return t('lng_action_gift_sent_channel', { user: senderName.value, name: receiverName.value, cost: starCost.value });
});

const cardTitle = computed(() => {
    if (isUpgradedMsg.value) {
        return upgradedGiftData.value?.title || t('lng_sr_message_column_gift');
    }
    return isOutgoing.value
        ? t('lng_action_gift_sent_subtitle', { user: receiverName.value })
        : t('lng_action_gift_got_subtitle', { user: senderName.value });
});

const profileText = computed(() => {
    if (isUpgradedMsg.value) {
        return t('lng_gift_unique_number', { index: upgradedGiftData.value?.number ?? 0 });
    }
    if (!isIncoming.value) return starCost.value;
    return (props.content as messageGift).is_saved
        ? t('lng_action_gift_displayed_self', { name: partyName.value })
        : starCost.value;
});

async function loadParties() {
    if (!userStore.userProfile) await userStore.fetchUser();
    const [s, r] = await Promise.all([
        resolveGiftParty(senderIdOf(props.content)),
        resolveGiftParty(receiverIdOf(props.content)),
    ]);
    sender.value = s;
    receiver.value = r;
}

async function openDetails() {
    detailsOpen.value = true;
    detailData.value = await buildGiftDetailData(
        isUpgradedMsg.value
            ? { type: 'messageUpgradedGift', value: props.content as messageUpgradedGift, date: props.date }
            : { type: 'messageGift', value: props.content as messageGift, date: props.date },
        (key: string, params?: Record<string, unknown>) => t(key, params as Record<string, unknown>),
        { isSelf: isOutgoing.value || !!props.isSelf },
    );
}

function closeDetails() {
    detailsOpen.value = false;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && detailsOpen.value) closeDetails();
}

watch(() => props.content, async () => {
    await loadParties();
    if (detailsOpen.value) await openDetails();
}, { immediate: true });
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>
