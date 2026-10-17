<template>
    <!-- 联系人消息卡片：头像 + 姓名/手机号，底部「消息 / 添加」两个操作。
         背景 = 联系人 accent 多色循环渐变；左侧彩条 = 同一套颜色循环的斜条纹 -->
    <div class="flex min-w-0 max-w-full flex-col">
        <div class="contact-color-card relative w-70 max-w-full min-w-0 select-text overflow-hidden rounded-xl"
            :style="cardStyle">
            <span class="absolute inset-y-0 left-0 w-0.75" :style="stripeStyle"></span>

            <div class="flex items-center gap-3 py-3 pl-4 pr-3">
                <button type="button" class="h-12 w-12 shrink-0 overflow-hidden rounded-full"
                    :class="canOpenProfile ? 'cursor-pointer' : 'cursor-default'" :disabled="!canOpenProfile"
                    @click="openProfile">
                    <Avatar :photo="user?.profile_photo" :title="displayName" :first-name="contact.first_name"
                        :last-name="contact.last_name" :accent-color-id="avatarAccentId" />
                </button>
                <div class="min-w-0 flex-1">
                    <p class="truncate text-base font-medium" :style="{ color: accent.color }">{{ displayName }}</p>
                    <p v-if="phoneText" class="truncate text-sm tabular-nums text-gray-900 dark:text-white">{{
                        phoneText }}
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

        <!-- 回应（由 MessageContent 默认插槽传入）：放在联系人卡片下方 -->
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { chat, messageContact, user as TdUser } from 'tdlib-types';
import Avatar from '../../../avatar.vue';
import { tdlibSend } from '../../../../../utils/tdlib';
import { accentColorStyle, rgbToCss } from '../../../../../store/colors';
import { useUserStore } from '../../../../../store/user';
import { toast } from '../../../../../utils/toast';
import { getReactiveUser } from '../../../../../utils/senderInfo';

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

/** 联系人用户的颜色设置（响应式缓存优先，保证用户更新颜色后卡片同步） */
const contactUser = computed(() => getReactiveUser(contact.value.user_id) ?? user.value);

/**
 * 卡片文字色 / 背景色 / 左彩条用的 accent 色：TDLib 的 accent_color_id（消息色空间，
 * 与发送者名称、回复栏一致）；用户只设置了资料页颜色（accent_color_id 为 -1）时，
 * 退回资料页色 id —— TDLib 两套色板的 id 槽位一致，accentColors 里通常有同一槽位的色值，
 * 否则会丢成「按 user_id 随机内置色」，看起来就像用户颜色没显示。
 * 两者都没有时按 user_id 稳定取一个内置色，避免变成统一蓝色。
 */
const profileAccentId = computed(() => {
    const profile = contactUser.value?.profile_accent_color_id;
    return typeof profile === 'number' && profile >= 0 ? profile : undefined;
});
const accentId = computed(() => {
    const accent = contactUser.value?.accent_color_id;
    if (typeof accent === 'number' && accent >= 0) return accent;
    if (profileAccentId.value !== undefined) return profileAccentId.value;
    return Math.abs(contact.value.user_id) % 7;
});
/** 头像渐变色：profile_accent_color_id（资料页色空间，与 accent_color_id 是两套 id）；
 *  未设置时回退 accent_color_id，Avatar 自行处理缺省。 */
const avatarAccentId = computed(() => {
    if (profileAccentId.value !== undefined) return profileAccentId.value;
    const accent = contactUser.value?.accent_color_id;
    return typeof accent === 'number' && accent >= 0 ? accent : undefined;
});
const accent = computed(() => accentColorStyle(accentId.value));

/** 卡片背景：联系人多色色板（TDLib 1~3 色）按首色闭环做渐变，再由 CSS 动画缓慢循环流动。
 *  单色（未自定义）时退化为纯色底。 */
const cardStyle = computed(() => {
    const stops = accent.value.allColors.map((c) => rgbToCss(c, 0.18));
    if (stops.length <= 1) return { backgroundColor: stops[0] ?? accent.value.soft };
    return { backgroundImage: `linear-gradient(120deg, ${[...stops, stops[0]].join(', ')})` };
});

/** 左侧彩条：单色=纯色条；多色=对角斜条纹循环排列（与回复栏/链接预览同一画法） */
const stripeStyle = computed(() => {
    const colors = accent.value.allColors;
    if (colors.length <= 1) return { backgroundColor: accent.value.color };
    const SEG = 4;
    const cycle = (colors.length + 1) * SEG;
    let stops = '';
    let pos = 0;
    for (let ci = colors.length - 1; ci >= 0; ci--) {
        const c = rgbToCss(colors[ci]);
        stops += `, ${c} ${pos}px, ${c} ${pos + SEG}px`;
        pos += SEG;
    }
    stops += `, transparent ${pos}px, transparent ${cycle}px`;
    return { background: `repeating-linear-gradient(-45deg${stops})` };
});
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

<style scoped>
/* 多色渐变背景缓慢循环流动（单色纯色底不受影响）；尊重系统「减少动态效果」 */
.contact-color-card {
    background-size: 240% 240%;
    animation: contact-color-cycle 16s ease-in-out infinite;
}

@keyframes contact-color-cycle {
    0%,
    100% {
        background-position: 0% 50%;
    }

    50% {
        background-position: 100% 50%;
    }
}

@media (prefers-reduced-motion: reduce) {
    .contact-color-card {
        animation: none;
    }
}
</style>
