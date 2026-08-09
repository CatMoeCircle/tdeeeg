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
            <p v-if="content.text.text" class="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                “{{ content.text.text }}”
            </p>
            <button type="button"
                class="mt-4 rounded-full bg-white/50 backdrop-blur-sm px-6 py-1.5 text-sm font-medium text-gray-900 hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-black/20 dark:bg-white/15 dark:text-white dark:hover:bg-white/25 dark:focus:ring-white/20"
                @click="openDetails">
                查看
            </button>
        </div>
    </div>

    <Teleport to="body">
        <Transition name="gift-dialog">
            <div v-if="detailsOpen"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                role="dialog" aria-modal="true" aria-labelledby="gift-dialog-title" @mousedown.self="closeDetails">
                <div
                    class="w-120 max-w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800">
                    <div class="relative px-6 pb-5 pt-5 text-center">
                        <button type="button" aria-label="关闭"
                            class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            @click="closeDetails">
                            <XIcon class="h-5 w-5" />
                        </button>

                        <div class="mx-auto flex h-36 items-center justify-center">
                            <MessageStickerContent :content="stickerContent" :size="144" />
                        </div>
                        <h2 id="gift-dialog-title" class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                            <GlobalEmojiText :text="dialogTitle" />
                        </h2>
                        <p class="mx-auto mt-1 max-w-sm text-sm text-gray-600 dark:text-gray-300">
                            <GlobalEmojiText :text="dialogDescription" />
                        </p>

                        <div
                            class="mt-5 overflow-hidden rounded-lg border border-gray-200 text-left text-sm dark:border-gray-600">
                            <div class="flex min-h-12 border-b border-gray-200 dark:border-gray-600">
                                <div
                                    class="flex w-20 shrink-0 items-center bg-gray-50 px-3 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    {{ partyLabel }}
                                </div>
                                <div
                                    class="flex min-w-0 flex-1 items-center gap-2 px-3 text-[#168acd] dark:text-sky-400">
                                    <div class="flex h-7 w-7 shrink-0 overflow-hidden rounded-full">
                                        <Avatar :photo="party?.photo" :title="partyName"
                                            :accent-color-id="party?.accentColorId" />
                                    </div>
                                    <span class="truncate font-medium"><GlobalEmojiText :text="partyName" /></span>
                                </div>
                            </div>
                            <div class="flex min-h-12 border-b border-gray-200 dark:border-gray-600">
                                <div
                                    class="flex w-20 shrink-0 items-center bg-gray-50 px-3 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    时间</div>
                                <div class="flex flex-1 items-center px-3 text-gray-800 dark:text-gray-100">{{
                                    formattedDate }}</div>
                            </div>
                            <div class="flex min-h-12">
                                <div
                                    class="flex w-20 shrink-0 items-center bg-gray-50 px-3 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">
                                    价值</div>
                                <div class="flex flex-1 items-center gap-2 px-3 text-gray-800 dark:text-gray-100">
                                    <span class="text-xl leading-none">⭐</span>
                                    <span>{{ content.gift.star_count }}</span>
                                </div>
                            </div>
                        </div>

                        <p v-if="content.text.text"
                            class="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                            “{{ content.text.text }}”
                        </p>
                        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">{{ visibilityText }}</p>
                    </div>
                    <div class="border-t border-gray-200 bg-gray-50 px-7 py-5 dark:border-gray-700 dark:bg-gray-900/40">
                        <button type="button"
                            class="w-full rounded-lg bg-[#2e9cd3] py-2.5 text-base font-medium text-white hover:bg-[#278cc0] focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                            @click="closeDetails">
                            确定
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { XIcon } from 'lucide-vue-next';
import type { chat, chatPhotoInfo, messageGift, messageSticker, profilePhoto, user, MessageSender } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';
import { useUserStore } from '../../../../../store/user';
import Avatar from '../../../avatar.vue';
import MessageStickerContent from './MessageStickerContent.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';

type GiftParty = {
    name: string;
    photo?: chatPhotoInfo | profilePhoto;
    accentColorId?: number;
};

const props = defineProps<{
    content: messageGift;
    date?: number;
}>();

const userStore = useUserStore();
const detailsOpen = ref(false);
const sender = ref<GiftParty>();
const receiver = ref<GiftParty>();

const stickerContent = computed<messageSticker>(() => ({
    _: 'messageSticker',
    sticker: props.content.gift.sticker,
    is_premium: false,
}));

const currentUserId = computed(() => userStore.userProfile?.id);
const isIncoming = computed(() =>
    props.content.receiver_id._ === 'messageSenderUser'
    && props.content.receiver_id.user_id === currentUserId.value,
);
const isOutgoing = computed(() =>
    props.content.sender_id?._ === 'messageSenderUser'
    && props.content.sender_id.user_id === currentUserId.value,
);

const senderName = computed(() => sender.value?.name || '匿名用户');
const receiverName = computed(() => receiver.value?.name || '收礼人');
const party = computed(() => isOutgoing.value ? receiver.value : sender.value);
const partyName = computed(() => isOutgoing.value ? receiverName.value : senderName.value);
const partyLabel = computed(() => isOutgoing.value ? '送给' : '来自');

const notificationText = computed(() => {
    const value = `${props.content.gift.star_count} 星币`;
    if (isOutgoing.value) return `您赠送给 ${receiverName.value} 一份 ${value}的礼品`;
    if (isIncoming.value) return `${senderName.value} 赠送了您一份 ${value}的礼品`;
    return `${senderName.value} 赠送给 ${receiverName.value} 一份 ${value}的礼品`;
});

const cardTitle = computed(() => isOutgoing.value
    ? `礼物送给 ${receiverName.value}`
    : `礼物来自 ${senderName.value}`,
);
const profileText = computed(() => {
    if (!isIncoming.value) return `价值 ${props.content.gift.star_count} 星币`;
    return props.content.is_saved ? '这份礼物已在您的个人资料上显示' : '这份礼物未在您的个人资料上显示';
});
const dialogTitle = computed(() => isOutgoing.value ? '已送出礼物' : isIncoming.value ? '收到礼物' : '频道礼物');
const dialogDescription = computed(() => {
    if (isIncoming.value) return `您收到了一份价值 ${props.content.gift.star_count} 星币的礼物。`;
    if (isOutgoing.value) return `您送出了一份价值 ${props.content.gift.star_count} 星币的礼物。`;
    return `${receiverName.value} 收到了一份价值 ${props.content.gift.star_count} 星币的礼物。`;
});
const visibilityText = computed(() => {
    if (!isIncoming.value) return props.content.is_private ? '这是一份私密礼物。' : '这份礼物对其他人可见。';
    return props.content.is_saved ? '这份礼物已在您的个人资料上显示。' : '这份礼物未在您的个人资料上显示。';
});
const formattedDate = computed(() => {
    if (!props.date) return '未知';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(props.date * 1000));
});

function displayUserName(value: user): string {
    return `${value.first_name} ${value.last_name}`.trim() || '已删除账号';
}

async function resolveParty(id?: MessageSender): Promise<GiftParty | undefined> {
    if (!id) return undefined;
    try {
        if (id._ === 'messageSenderUser') {
            const value = await tdlibSend({ _: 'getUser', user_id: id.user_id }) as user;
            return { name: displayUserName(value), photo: value.profile_photo, accentColorId: value.accent_color_id };
        }
        const value = await tdlibSend({ _: 'getChat', chat_id: id.chat_id }) as chat;
        return { name: value.title, photo: value.photo, accentColorId: value.accent_color_id };
    } catch {
        return undefined;
    }
}

async function loadParties() {
    if (!userStore.userProfile) await userStore.fetchUser();
    [sender.value, receiver.value] = await Promise.all([
        resolveParty(props.content.sender_id),
        resolveParty(props.content.receiver_id),
    ]);
}

function openDetails() {
    detailsOpen.value = true;
}

function closeDetails() {
    detailsOpen.value = false;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && detailsOpen.value) closeDetails();
}

watch(() => props.content, loadParties, { immediate: true });
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.gift-dialog-enter-active,
.gift-dialog-leave-active {
    transition: opacity 0.16s ease;
}

.gift-dialog-enter-from,
.gift-dialog-leave-to {
    opacity: 0;
}
</style>
