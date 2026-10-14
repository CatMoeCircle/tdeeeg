<template>
    <!-- 联系人消息卡片：头像 + 姓名/手机号，底部「消息 / 添加」两个操作，左侧为 accent 彩条 -->
    <div class="relative w-70 max-w-full min-w-0 select-text overflow-hidden rounded-xl" :style="cardStyle">
        <!-- 左侧斜纹彩条 -->
        <span class="absolute inset-y-0 left-0 w-0.75" :style="stripeStyle"></span>

        <div class="flex items-center gap-3 py-3 pl-4 pr-3">
            <button type="button" class="h-12 w-12 shrink-0 overflow-hidden rounded-full"
                :class="canOpenProfile ? 'cursor-pointer' : 'cursor-default'" :disabled="!canOpenProfile"
                @click="openProfile">
                <Avatar :photo="user?.profile_photo" :title="displayName" :first-name="contact.first_name"
                    :last-name="contact.last_name" :accent-color-id="accentId" />
            </button>
            <div class="min-w-0 flex-1">
                <p class="truncate text-base font-medium" :style="{ color: accent.color }">{{ displayName }}</p>
                <p v-if="phoneText" class="truncate text-sm tabular-nums text-gray-900 dark:text-white">{{ phoneText }}
                </p>
            </div>
        </div>

        <template v-if="hasActions">
            <div class="mx-4 h-px" :style="{ backgroundColor: dividerColor }"></div>
            <div class="flex items-stretch">
                <button v-if="canSendMessage" type="button"
                    class="flex-1 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                    :style="{ color: accent.color }" :disabled="opening" @click="onSendMessage">
                    {{ t('lng_contact_send_message') }}
                </button>
                <button v-if="canAddContact" type="button"
                    class="flex-1 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                    :style="{ color: accent.color }" :disabled="adding" @click="onAddContact">
                    {{ t('lng_contact_add') }}
                </button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { chat, messageContact, user as TdUser } from 'tdlib-types';
import Avatar from '../../../avatar.vue';
import { tdlibSend } from '../../../../../utils/tdlib';
import { accentColorStyle } from '../../../../../store/colors';
import { useUserStore } from '../../../../../store/user';
import { toast } from '../../../../../utils/toast';

const props = defineProps<{
    content: messageContact;
}>();

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();

/** 联系人所指向的 TDLib 用户（仅在已知 user_id 时加载） */
const user = ref<TdUser | undefined>(undefined);
const adding = ref(false);
const opening = ref(false);

const contact = computed(() => props.content.contact);

/** 显示名：优先使用消息中携带的姓名 */
const displayName = computed(() => {
    const c = contact.value;
    return `${c.first_name} ${c.last_name}`.trim() || t('lng_contacts_header');
});

/** 手机号展示：TDLib 给出的号码不带前导 +，统一补齐 */
const phoneText = computed(() => {
    const phone = contact.value.phone_number.trim();
    return phone ? `+${phone.replace(/^\+/, '')}` : '';
});

const isKnownUser = computed(() => contact.value.user_id > 0);
const isSelf = computed(() => contact.value.user_id === userStore.userProfile?.id);

const canOpenProfile = computed(() => isKnownUser.value);
/** 「消息」：已知用户且不是自己 */
const canSendMessage = computed(() => isKnownUser.value && !isSelf.value);
/** 「添加」：已知用户、不是自己、且尚未在通讯录中 */
const canAddContact = computed(() => canSendMessage.value && !!user.value && !user.value.is_contact);
const hasActions = computed(() => canSendMessage.value);

/** 卡片配色：优先用对方的 accent，否则按 user_id 稳定取一个 */
const accentId = computed(() => {
    const a = user.value?.accent_color_id;
    return typeof a === 'number' && a >= 0 ? a : Math.abs(contact.value.user_id) % 7;
});
const accent = computed(() => accentColorStyle(accentId.value));

const cardStyle = computed(() => ({ backgroundColor: accent.value.soft }));
const stripeStyle = computed(() => ({
    background: `repeating-linear-gradient(-45deg, ${accent.value.color} 0 3px, transparent 3px 6px)`,
}));
const dividerColor = computed(() => `color-mix(in srgb, ${accent.value.color} 25%, transparent)`);

async function loadUser(userId: number) {
    user.value = undefined;
    if (userId <= 0) return;
    try {
        const u = await tdlibSend({ _: 'getUser', user_id: userId }) as TdUser;
        // 期间消息已切换则丢弃结果
        if (contact.value.user_id === userId) user.value = u;
    } catch (e) {
        console.error('Load contact user failed:', e);
    }
}

watch(
    () => contact.value.user_id,
    (id) => void loadUser(id),
    { immediate: true },
);

function openProfile() {
    if (!canOpenProfile.value) return;
    router.push({ name: 'user-profile', params: { id: String(contact.value.user_id) } });
}

async function onSendMessage() {
    if (!canSendMessage.value || opening.value) return;
    opening.value = true;
    try {
        const privateChat = await tdlibSend({
            _: 'createPrivateChat',
            user_id: contact.value.user_id,
            force: false,
        }) as chat;
        await router.push(`/home/chat/${privateChat.id}`);
    } catch (e: any) {
        console.error('Open private chat failed:', e);
        if (e?.message) toast.error(e.message);
    } finally {
        opening.value = false;
    }
}

async function onAddContact() {
    const u = user.value;
    if (!u || adding.value) return;
    adding.value = true;
    try {
        await tdlibSend({
            _: 'addContact',
            user_id: u.id,
            contact: {
                _: 'importedContact',
                phone_number: contact.value.phone_number,
                first_name: contact.value.first_name,
                last_name: contact.value.last_name,
                note: undefined,
            },
            share_phone_number: false,
        });
        await loadUser(u.id);
    } catch (e: any) {
        toast.error(e?.message || t('user.saveContactFailed'));
    } finally {
        adding.value = false;
    }
}
</script>
