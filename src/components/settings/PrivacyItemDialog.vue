<template>
    <ModalDialog v-model="visible" :title="dialogTitle">
        <div class="space-y-5">
            <!-- Premium 专属提示 -->
            <div v-if="activeItem?.premiumOnly && !isPremium"
                class="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3.5 py-3 text-amber-600 dark:text-amber-400">
                <span class="tgico tgico-lock shrink-0 mt-0.5" style="font-size:18px" />
                <p class="text-xs leading-relaxed">{{ t('privacy.premiumRequired') }}</p>
            </div>

            <!-- 手机号码 -->
            <template v-if="activeItem?.kind === 'phone'">
                <div>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_phone_number_header') }}</p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                            class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                            :class="phoneNumberPreset === opt.value
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                            @click="phoneNumberPreset = opt.value">
                            {{ opt.label }}
                        </button>
                    </div>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">{{
                        phoneNumberPreset === 'nobody'
                            ? t('lng_edit_privacy_phone_number_contacts')
                            : t('lng_edit_privacy_phone_number_warning')
                    }}</p>
                    <p v-if="phoneNumberPreset !== 'nobody' && myPhoneLink"
                        class="text-xs text-gray-400 mt-1.5 leading-relaxed">
                        {{ t('lng_username_link') }}
                        <a :href="myPhoneLink" target="_blank" rel="noopener noreferrer"
                            class="text-blue-500 hover:underline break-all">{{ myPhoneLink }}</a>
                    </p>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_phone_number_find') }}</p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="opt in presetOptions(PRESET_FIND)" :key="opt.value" type="button"
                            class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                            :class="phoneFindPreset === opt.value
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                            @click="phoneFindPreset = opt.value">
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_exceptions') }}</p>
                    <p class="text-xs text-gray-400 mb-2">{{ t('lng_edit_privacy_phone_number_exceptions') }}</p>
                    <PrivacyExceptionBlock v-if="phoneNumberPreset !== 'everyone' || alwaysExceptions.length > 0"
                        :title="t('lng_edit_privacy_phone_number_always_title')"
                        :empty-text="t('lng_edit_privacy_phone_number_always_empty')" v-model="alwaysInput"
                        :list="alwaysExceptions" :error="alwaysError" :adding="exceptionAdding"
                        @add="addException('always')" @remove="(e) => removeException('always', e)" />
                    <PrivacyExceptionBlock v-if="phoneNumberPreset !== 'nobody' || neverExceptions.length > 0"
                        :title="t('lng_edit_privacy_phone_number_never_title')"
                        :empty-text="t('lng_edit_privacy_phone_number_never_empty')" v-model="neverInput"
                        :list="neverExceptions" :error="neverError" :adding="exceptionAdding"
                        @add="addException('never')" @remove="(e) => removeException('never', e)" />
                </div>
            </template>

            <!-- 上线状态 -->
            <template v-else-if="activeItem?.kind === 'status'">
                <div>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_lastseen_description') }}</p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                            class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                            :class="activePreset === opt.value
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'" @click="activePreset = opt.value">
                            {{ opt.label }}
                        </button>
                    </div>
                    <p class="text-xs text-gray-400 mt-2 leading-relaxed">{{ t('lng_edit_privacy_lastseen_warning') }}
                    </p>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 flex items-center gap-3">
                    <div class="min-w-0 flex-1">
                        <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('lng_edit_lastseen_hide_read_time') }}
                        </p>
                        <p class="text-xs text-gray-400 mt-0.5 leading-relaxed">
                            {{ t('lng_edit_lastseen_hide_read_time_about') }}
                        </p>
                    </div>
                    <ToggleSwitch v-model="hideReadTime" />
                </div>

                <p class="text-xs text-gray-400 leading-relaxed border-t border-gray-200 dark:border-gray-700 pt-3">
                    {{ statusPremiumHint }}
                </p>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_exceptions') }}</p>
                    <p class="text-xs text-gray-400 mb-2">{{ t('lng_edit_privacy_lastseen_exceptions') }}</p>
                    <PrivacyExceptionBlock v-if="activePreset !== 'everyone' || alwaysExceptions.length > 0"
                        :title="alwaysShareTitle" :empty-text="t('lng_edit_privacy_lastseen_always_empty')"
                        v-model="alwaysInput" :list="alwaysExceptions" :error="alwaysError" :adding="exceptionAdding"
                        @add="addException('always')" @remove="(e) => removeException('always', e)" />
                    <PrivacyExceptionBlock v-if="activePreset !== 'nobody' || neverExceptions.length > 0"
                        :title="neverShareTitle" :empty-text="t('lng_edit_privacy_lastseen_never_empty')"
                        v-model="neverInput" :list="neverExceptions" :error="neverError" :adding="exceptionAdding"
                        @add="addException('never')" @remove="(e) => removeException('never', e)" />
                </div>
            </template>

            <!-- 礼物 -->
            <template v-else-if="activeItem?.kind === 'gifts'">
                <div>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{ activeItem?.whoLabel }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                            class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                            :class="activePreset === opt.value
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'" @click="activePreset = opt.value">
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <div v-if="isPremium" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">{{
                        t('lng_edit_privacy_gifts_types') }}</p>
                    <div class="space-y-2">
                        <div v-for="gt in giftTypeOptions" :key="gt.key"
                            class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                            <span class="text-sm text-gray-800 dark:text-gray-100 min-w-0">{{ gt.label }}</span>
                            <ToggleSwitch v-model="acceptedGiftTypes[gt.key]" />
                        </div>
                    </div>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_exceptions') }}</p>
                    <p class="text-xs text-gray-400 mb-2">{{ t('lng_edit_privacy_phone_number_exceptions') }}</p>
                    <PrivacyExceptionBlock v-if="activePreset !== 'everyone' || alwaysExceptions.length > 0"
                        :title="alwaysShareTitle" :empty-text="t('lng_edit_privacy_phone_number_always_title')"
                        v-model="alwaysInput" :list="alwaysExceptions" :error="alwaysError" :adding="exceptionAdding"
                        @add="addException('always')" @remove="(e) => removeException('always', e)" />
                    <PrivacyExceptionBlock v-if="activePreset !== 'nobody' || neverExceptions.length > 0"
                        :title="neverShareTitle" :empty-text="t('lng_edit_privacy_phone_number_never_title')"
                        v-model="neverInput" :list="neverExceptions" :error="neverError" :adding="exceptionAdding"
                        @add="addException('never')" @remove="(e) => removeException('never', e)" />
                </div>
            </template>

            <!-- 私聊消息 -->
            <template v-else-if="activeItem?.kind === 'newchat'">
                <div :class="activeItem?.premiumOnly && !isPremium ? 'opacity-50 pointer-events-none select-none' : ''">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_messages_privacy_subtitle') }}</p>
                    <div class="space-y-2">
                        <button v-for="opt in newChatOptions" :key="opt.value" type="button"
                            class="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm text-left transition-colors"
                            :class="newChatMode === opt.value
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                            :disabled="opt.value === 'paid' && !canEnablePaidMessages"
                            @click="selectNewChatMode(opt.value)">
                            <span class="text-gray-800 dark:text-gray-100 font-medium">{{ opt.label }}</span>
                            <CheckIcon v-if="newChatMode === opt.value" class="w-4 h-4 text-blue-500 shrink-0" />
                        </button>
                    </div>
                    <p v-if="!canEnablePaidMessages" class="text-xs text-gray-400 mt-2">{{
                        t('privacy.paidMessagesUnsupported') }}</p>
                    <div v-if="newChatMode === 'paid'" class="mt-3">
                        <div class="flex items-center justify-between mb-1.5">
                            <label class="text-xs text-gray-400">{{ t('lng_messages_privacy_price') }}</label>
                            <span
                                class="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-1">{{
                                    paidStarCount }}
                                <img :src="starsSvg" alt="" class="w-4 h-4" /></span>
                        </div>
                        <t-slider v-model="paidStarCount" :min="1" :max="PAID_STAR_MAX" :show-tooltip="true"
                            :input-number-props="starInputNumberProps" />
                        <p class="text-xs text-gray-400 mt-1.5 leading-relaxed">1 - {{
                            t('lng_action_gift_for_stars', { count: PAID_STAR_MAX }) }}</p>
                    </div>
                    <p v-if="newChatMode === 'paid'" class="text-xs text-gray-400 mt-1.5 leading-relaxed">{{
                        t('lng_messages_privacy_charge_about') }}</p>
                </div>

                <div v-if="newChatMode === 'paid'" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_messages_privacy_exceptions') }}</p>
                    <p class="text-xs text-gray-400 mb-2">{{ t('lng_messages_privacy_remove_about') }}</p>
                    <PrivacyExceptionBlock :title="t('lng_messages_privacy_remove_fee')"
                        :empty-text="t('lng_messages_privacy_remove_fee')" v-model="newChatInput"
                        :list="newChatExceptions" :error="exceptionError" :adding="exceptionAdding"
                        @add="addException('newchat')" @remove="(e) => removeException('newchat', e)" />
                </div>
            </template>

            <!-- 通用 / 标准项 -->
            <template v-else>
                <div :class="activeItem?.premiumOnly && !isPremium ? 'opacity-50 pointer-events-none select-none' : ''">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{ activeItem?.whoLabel }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                            class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                            :class="activePreset === opt.value
                                ? 'bg-blue-500 text-white font-medium'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'" @click="activePreset = opt.value">
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{
                        t('lng_edit_privacy_exceptions') }}</p>
                    <p class="text-xs text-gray-400 mb-2">{{ t('lng_edit_privacy_phone_number_exceptions') }}</p>
                    <PrivacyExceptionBlock v-if="activePreset !== 'everyone' || alwaysExceptions.length > 0"
                        :title="alwaysShareTitle" :empty-text="t('lng_edit_privacy_phone_number_always_title')"
                        v-model="alwaysInput" :list="alwaysExceptions" :error="alwaysError" :adding="exceptionAdding"
                        @add="addException('always')" @remove="(e) => removeException('always', e)" />
                    <PrivacyExceptionBlock v-if="activePreset !== 'nobody' || neverExceptions.length > 0"
                        :title="neverShareTitle" :empty-text="t('lng_edit_privacy_phone_number_never_title')"
                        v-model="neverInput" :list="neverExceptions" :error="neverError" :adding="exceptionAdding"
                        @add="addException('never')" @remove="(e) => removeException('never', e)" />
                </div>
            </template>
        </div>
        <template #footer>
            <button type="button"
                class="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="visible = false">
                {{ t('lng_cancel') }}
            </button>
            <button type="button" :disabled="!privacyReady || saving"
                class="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                @click="handleSave">
                {{ saving ? t('lng_contacts_loading') : t('lng_settings_save') }}
            </button>
        </template>
    </ModalDialog>
</template>

<script lang="ts">
export interface PrivacyItemDef {
    key: string;
    label: string;
    kind: 'phone' | 'status' | 'standard' | 'gifts' | 'voice' | 'newchat';
    whoLabel?: string;
    premiumOnly?: boolean;
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Check as CheckIcon } from 'lucide-vue-next';
import { MessagePlugin, Slider as TSlider } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import starsSvg from '../../assets/stars.svg';
import ModalDialog from './ModalDialog.vue';
import ToggleSwitch from './ToggleSwitch.vue';
import PrivacyExceptionBlock, { type ExceptionEntry } from './PrivacyExceptionBlock.vue';
import { tdlibSend } from '../../utils/tdlib';
import {
    ensureUser, ensureChat, getReactiveUser, getReactiveChat, getChatTitle,
    getChatProfileAccentColorId, ensureBasicGroup, ensureSupergroup,
    getReactiveBasicGroup, getReactiveSupergroup,
} from '../../utils/senderInfo';
import formatStatus from '../../utils/status';
import {
    decodeUserPrivacyRules, encodeUserPrivacyRules, PRIVACY_PRESET_KEYS, privacyKeyForSettingType,
} from '../../utils/profilePrivacy';
import type { PrivacyPreset, DecodedPrivacy, PrivacyExceptionIds } from '../../utils/profilePrivacy';
import type { chat as TdChat, UserPrivacySetting$Input, userPrivacySettingRules } from 'tdlib-types';
import { useUserStore } from '../../store/user';
import { useUserProfileStore } from '../../store/userProfile';

const props = defineProps<{
    modelValue: boolean;
    item: PrivacyItemDef | null;
    isPremium: boolean;
}>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed'): void;
}>();

const { t } = useI18n();
const userStore = useUserStore();
const profileStore = useUserProfileStore();

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

const activeItem = ref<PrivacyItemDef | null>(null);

const dialogTitle = computed(() => {
    const item = activeItem.value;
    if (!item) return '';
    return item.kind === 'phone' ? t('lng_contact_phone') : item.label;
});

const PRIVACY_SETTINGS: Record<string, UserPrivacySetting$Input> = {
    phone_number: { _: 'userPrivacySettingShowPhoneNumber' },
    phone_find: { _: 'userPrivacySettingAllowFindingByPhoneNumber' },
    status: { _: 'userPrivacySettingShowStatus' },
    photo: { _: 'userPrivacySettingShowProfilePhoto' },
    bio: { _: 'userPrivacySettingShowBio' },
    birthdate: { _: 'userPrivacySettingShowBirthdate' },
    audio: { _: 'userPrivacySettingShowProfileAudio' },
    forward: { _: 'userPrivacySettingShowLinkInForwardedMessages' },
    calls: { _: 'userPrivacySettingAllowCalls' },
    gifts: { _: 'userPrivacySettingAutosaveGifts' },
    voice: { _: 'userPrivacySettingAllowPrivateVoiceAndVideoNoteMessages' },
    invites: { _: 'userPrivacySettingAllowChatInvites' },
    unpaid_messages: { _: 'userPrivacySettingAllowUnpaidMessages' },
};

const PRESET_ALL: PrivacyPreset[] = ['everyone', 'contacts', 'nobody'];
const PRESET_FIND: PrivacyPreset[] = ['everyone', 'contacts'];
const EMPTY_EXCEPTIONS: PrivacyExceptionIds = { userIds: [], chatIds: [] };

const alwaysShareTitle = computed(() => t('lng_edit_privacy_phone_number_always_title'));
const neverShareTitle = computed(() => t('lng_edit_privacy_phone_number_never_title'));

function presetOptions(presets: PrivacyPreset[]) {
    return presets.map((p) => ({ value: p, label: t(PRIVACY_PRESET_KEYS[p]) }));
}

async function loadRules(key: string): Promise<DecodedPrivacy | undefined> {
    try {
        const res = await tdlibSend({
            _: 'getUserPrivacySettingRules',
            setting: PRIVACY_SETTINGS[key],
        });
        return decodeUserPrivacyRules(res);
    } catch (e) {
        console.error(`load privacy rules ${key} failed:`, e);
        return undefined;
    }
}

function basePresetFor(d?: DecodedPrivacy): PrivacyPreset {
    if (!d) return 'everyone';
    return d.preset === 'custom' ? 'everyone' : d.preset;
}

function decodedToList(d: DecodedPrivacy | undefined, which: 'allowed' | 'restricted'): ExceptionEntry[] {
    if (!d) return [];
    const src = d[which];
    const list: ExceptionEntry[] = [];
    for (const raw of src?.userIds ?? []) {
        const id = Number(raw);
        if (Number.isFinite(id)) list.push({ id, isChat: false, title: String(id) });
    }
    for (const raw of src?.chatIds ?? []) {
        const id = Number(raw);
        if (Number.isFinite(id)) list.push({ id, isChat: true, title: String(id) });
    }
    return list;
}

function exceptionsToIds(list: ExceptionEntry[]): PrivacyExceptionIds {
    return {
        userIds: list.filter((e) => !e.isChat).map((e) => e.id),
        chatIds: list.filter((e) => e.isChat).map((e) => e.id),
    };
}

function encodeFromLists(preset: PrivacyPreset, always: ExceptionEntry[], never: ExceptionEntry[]) {
    return encodeUserPrivacyRules(preset, exceptionsToIds(always), exceptionsToIds(never));
}

const activePreset = ref<PrivacyPreset>('everyone');
const phoneNumberPreset = ref<PrivacyPreset>('everyone');
const phoneFindPreset = ref<PrivacyPreset>('everyone');
const hideReadTime = ref(false);

const alwaysInput = ref('');
const alwaysError = ref('');
const alwaysExceptions = ref<ExceptionEntry[]>([]);
const neverInput = ref('');
const neverError = ref('');
const neverExceptions = ref<ExceptionEntry[]>([]);
const exceptionError = ref('');
const exceptionAdding = ref(false);
const phoneFindExceptions = ref<ExceptionEntry[]>([]);
const newChatInput = ref('');
const newChatExceptions = ref<ExceptionEntry[]>([]);

/** 当前用户手机号的 t.me 链接（隐私非 nobody 时展示） */
const myPhoneLink = computed(() => {
    const phone = userStore.userProfile?.phone_number;
    if (!phone) return '';
    const digits = phone.replace(/[^\d]/g, '');
    return digits ? `https://t.me/+${digits}` : '';
});

const memberCountFormatter = new Intl.NumberFormat('zh-CN');

function chatSubtitle(c: ReturnType<typeof getReactiveChat>): string {
    if (!c?.type) return '';
    if (c.type._ === 'chatTypeBasicGroup') {
        const g = getReactiveBasicGroup(c.type.basic_group_id);
        if (!g || g.member_count <= 0) return t('privacy.group');
        return t('privacy.membersCount', { count: memberCountFormatter.format(g.member_count) });
    }
    if (c.type._ === 'chatTypeSupergroup') {
        const g = getReactiveSupergroup(c.type.supergroup_id);
        const count = g?.member_count || 0;
        if (count <= 0) return c.type.is_channel ? t('privacy.channel') : t('privacy.megagroup');
        return c.type.is_channel
            ? t('privacy.subscribersCount', { count: memberCountFormatter.format(count) })
            : t('privacy.membersCount', { count: memberCountFormatter.format(count) });
    }
    return '';
}

async function hydrateExceptions(list: ExceptionEntry[]): Promise<ExceptionEntry[]> {
    if (list.length === 0) return [];
    await Promise.all(
        list.map(async (e) => {
            if (e.isChat) {
                await ensureChat(e.id).catch(() => { });
                const c = getReactiveChat(e.id);
                const t = c?.type;
                if (t?._ === 'chatTypeBasicGroup') {
                    await ensureBasicGroup(t.basic_group_id).catch(() => { });
                } else if (t?._ === 'chatTypeSupergroup') {
                    await ensureSupergroup(t.supergroup_id).catch(() => { });
                }
            } else {
                await ensureUser(e.id).catch(() => { });
            }
        }),
    );
    return list.map((e) => {
        if (e.isChat) {
            const c = getReactiveChat(e.id);
            return {
                ...e,
                title: c ? getChatTitle(c) : e.title,
                subtitle: chatSubtitle(c),
                photo: c?.photo,
                accentId: getChatProfileAccentColorId(c),
            };
        }
        const u = getReactiveUser(e.id);
        return {
            ...e,
            title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || String(e.id) : e.title,
            subtitle: u ? formatStatus(u.status) : '',
            photo: u?.profile_photo,
            accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
        };
    });
}

async function resolveEntityFromInput(input: string): Promise<ExceptionEntry> {
    const text = input.trim().replace(/^@/, '');
    if (!text) throw new Error(t('privacy.enterUsername'));
    if (/^\d+$/.test(text)) {
        const id = Number(text);
        if (id < 0) {
            await ensureChat(id).catch(() => { });
            const c = getReactiveChat(id);
            if (!c) throw new Error(t('privacy.groupNotFound'));
            if (c.type?._ === 'chatTypeBasicGroup') await ensureBasicGroup(c.type.basic_group_id).catch(() => { });
            if (c.type?._ === 'chatTypeSupergroup') await ensureSupergroup(c.type.supergroup_id).catch(() => { });
            return {
                id,
                isChat: true,
                title: getChatTitle(c) || String(id),
                subtitle: chatSubtitle(c),
                photo: c.photo,
                accentId: getChatProfileAccentColorId(c),
            };
        }
        await ensureUser(id).catch(() => { });
        const u = getReactiveUser(id);
        if (!u) throw new Error(t('privacy.userNotFound'));
        return {
            id,
            isChat: false,
            title: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || String(id),
            subtitle: formatStatus(u.status),
            photo: u.profile_photo,
            accentId: u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
        };
    }
    try {
        const chat = (await tdlibSend({ _: 'searchPublicChat', username: text })) as TdChat;
        if (!chat) throw new Error(t('privacy.userOrChatNotFound'));
        if (chat.type?._ === 'chatTypePrivate' || chat.type?._ === 'chatTypeSecret') {
            const uid = (chat.type).user_id as number;
            await ensureUser(uid);
            const u = getReactiveUser(uid);
            return {
                id: uid,
                isChat: false,
                title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
                subtitle: u ? formatStatus(u.status) : '',
                photo: u?.profile_photo,
                accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
            };
        }
        await ensureChat(chat.id);
        if (chat.type?._ === 'chatTypeBasicGroup') await ensureBasicGroup(chat.type.basic_group_id).catch(() => { });
        if (chat.type?._ === 'chatTypeSupergroup') await ensureSupergroup(chat.type.supergroup_id).catch(() => { });
        const c = getReactiveChat(chat.id);
        return {
            id: chat.id,
            isChat: true,
            title: c ? getChatTitle(c) : String(chat.id),
            subtitle: chatSubtitle(c),
            photo: c?.photo,
            accentId: getChatProfileAccentColorId(c),
        };
    } catch (e: any) {
        throw new Error(e?.message || t('privacy.userOrChatNotFound'));
    }
}

type ExceptionKind = 'always' | 'never' | 'newchat';

function exceptionTarget(kind: ExceptionKind) {
    switch (kind) {
        case 'always': return alwaysExceptions;
        case 'never': return neverExceptions;
        default: return newChatExceptions;
    }
}

function exceptionInputOf(kind: ExceptionKind) {
    switch (kind) {
        case 'always': return alwaysInput;
        case 'never': return neverInput;
        default: return newChatInput;
    }
}

function exceptionErrorOf(kind: ExceptionKind) {
    switch (kind) {
        case 'always': return alwaysError;
        case 'never': return neverError;
        default: return exceptionError;
    }
}

async function addException(kind: ExceptionKind) {
    const target = exceptionTarget(kind);
    const input = exceptionInputOf(kind);
    const errRef = exceptionErrorOf(kind);
    const text = input.value.trim();
    if (!text) return;
    errRef.value = '';
    exceptionAdding.value = true;
    try {
        const entry = await resolveEntityFromInput(text);
        if (target.value.some((e) => e.id === entry.id && e.isChat === entry.isChat)) {
            MessagePlugin.warning(t('privacy.alreadyInList'));
            return;
        }
        target.value.push(entry);
        input.value = '';
    } catch (e: any) {
        errRef.value = e?.message || t('privacy.addFailed');
    } finally {
        exceptionAdding.value = false;
    }
}

function removeException(kind: ExceptionKind, entry: ExceptionEntry) {
    const target = exceptionTarget(kind);
    target.value = target.value.filter((e) => !(e.id === entry.id && e.isChat === entry.isChat));
}

async function loadDualExceptions(d?: DecodedPrivacy) {
    // 先立刻用 id 展示列表，再异步补全名称/头像，避免加载卡住导致界面一直空
    const alwaysRaw = decodedToList(d, 'allowed');
    const neverRaw = decodedToList(d, 'restricted');
    alwaysExceptions.value = alwaysRaw;
    neverExceptions.value = neverRaw;
    alwaysInput.value = '';
    neverInput.value = '';
    alwaysError.value = '';
    neverError.value = '';
    if (alwaysRaw.length) {
        void hydrateExceptions(alwaysRaw).then((list) => {
            alwaysExceptions.value = list;
        });
    }
    if (neverRaw.length) {
        void hydrateExceptions(neverRaw).then((list) => {
            neverExceptions.value = list;
        });
    }
}

const statusPremiumHint = computed(() =>
    props.isPremium
        ? t('privacy.premiumLastSeenNote')
        : t('lng_edit_lastseen_subscribe_about'),
);

async function loadReadDateSetting() {
    try {
        const res = (await tdlibSend({ _: 'getReadDatePrivacySettings' }));
        hideReadTime.value = res?._ === 'readDatePrivacySettings' ? !res.show_read_date : false;
    } catch (e) {
        console.error('load read date settings failed:', e);
    }
}

type NewChatMode = 'everyone' | 'contacts_premium' | 'paid';
const newChatMode = ref<NewChatMode>('everyone');
const paidStarCount = ref(10);
const PAID_STAR_MAX = 35000;
const starInputNumberProps = { min: 1, max: PAID_STAR_MAX };
const canEnablePaidMessages = ref(true);

const newChatOptions = computed<{ value: NewChatMode; label: string }[]>(() => [
    { value: 'everyone', label: t('lng_edit_privacy_everyone') },
    { value: 'contacts_premium', label: t('lng_edit_privacy_contacts_and_premium') },
    { value: 'paid', label: t('lng_messages_privacy_charge') },
]);

async function loadNewChatSetting() {
    try {
        const res = (await tdlibSend({ _: 'getNewChatPrivacySettings' }));
        const allow = !!res?.allow_new_chats_from_unknown_users;
        const star = Number(res?.incoming_paid_message_star_count ?? 0);
        if (star > 0) paidStarCount.value = star;
        newChatMode.value = star > 0 ? 'paid' : allow ? 'everyone' : 'contacts_premium';
    } catch (e) {
        console.error('load new chat setting failed:', e);
    }
}

function selectNewChatMode(mode: NewChatMode) {
    if (mode === 'paid' && !canEnablePaidMessages.value) {
        MessagePlugin.warning(t('privacy.paidMessagesUnsupported'));
        return;
    }
    newChatMode.value = mode;
}

async function loadCanEnablePaidMessages() {
    try {
        const canPaid = (await tdlibSend({ _: 'getOption', name: 'can_enable_paid_messages' }));
        canEnablePaidMessages.value = canPaid?._ === 'optionValueBoolean' && !!canPaid.value;
    } catch (e) {
        console.error('load can_enable_paid_messages failed:', e);
    }
}

const acceptedGiftTypes = reactive({
    limited_gifts: true,
    unlimited_gifts: true,
    upgraded_gifts: true,
    gifts_from_channels: true,
    premium_subscription: true,
});

const giftTypeOptions = [
    { key: 'limited_gifts', label: t('lng_edit_privacy_gifts_limited') },
    { key: 'unlimited_gifts', label: t('lng_edit_privacy_gifts_unlimited') },
    { key: 'upgraded_gifts', label: t('lng_edit_privacy_gifts_unique') },
    { key: 'gifts_from_channels', label: t('lng_edit_privacy_gifts_channels') },
    { key: 'premium_subscription', label: t('lng_edit_privacy_gifts_premium') },
] as const;

async function loadAcceptedGiftTypes() {
    if (!props.isPremium) return;
    try {
        const myId = userStore.userProfile?.id;
        if (!myId) return;
        let info = profileStore.fullInfos.get(myId);
        if (!info?.gift_settings) info = await profileStore.fetchFullInfo(myId);
        const types = info?.gift_settings?.accepted_gift_types;
        if (types) {
            acceptedGiftTypes.limited_gifts = !!types.limited_gifts;
            acceptedGiftTypes.unlimited_gifts = !!types.unlimited_gifts;
            acceptedGiftTypes.upgraded_gifts = !!types.upgraded_gifts;
            acceptedGiftTypes.gifts_from_channels = !!types.gifts_from_channels;
            acceptedGiftTypes.premium_subscription = !!types.premium_subscription;
        }
    } catch (e) {
        console.error('load accepted gift types failed:', e);
    }
}

interface PrivacySnapshot {
    kind: PrivacyItemDef['kind'];
    phoneNumberPreset?: PrivacyPreset;
    phoneFindPreset?: PrivacyPreset;
    phoneFindExceptionKeys?: string[];
    activePreset?: PrivacyPreset;
    alwaysExceptionKeys?: string[];
    neverExceptionKeys?: string[];
    hideReadTime?: boolean;
    acceptedGiftTypes?: Record<string, boolean>;
    newChatMode?: NewChatMode;
    paidStarCount?: number;
    newChatExceptionKeys?: string[];
}

const privacySnapshot = ref<PrivacySnapshot | null>(null);
/** 云端规则加载完成前禁止保存，避免用空列表覆盖服务器上的例外 */
const privacyReady = ref(false);
const saving = ref(false);

function exceptionKeys(list: ExceptionEntry[]): string[] {
    return list.map((e) => (e.isChat ? 'c' : 'u') + e.id).sort();
}

function sameKeyList(a: string[] | undefined, b: string[]): boolean {
    const left = a ?? [];
    return left.length === b.length && left.every((v, i) => v === b[i]);
}

function sameGiftTypes(a: Record<string, boolean> | undefined): boolean {
    if (!a) return false;
    return giftTypeOptions.every((t) => !!a[t.key] === !!acceptedGiftTypes[t.key]);
}

function dualRulesChanged(snap: PrivacySnapshot | null): boolean {
    return !snap
        || !sameKeyList(snap.alwaysExceptionKeys, exceptionKeys(alwaysExceptions.value))
        || !sameKeyList(snap.neverExceptionKeys, exceptionKeys(neverExceptions.value));
}

function takePrivacySnapshot() {
    const item = activeItem.value;
    if (!item) {
        privacySnapshot.value = null;
        return;
    }
    const snap: PrivacySnapshot = { kind: item.kind };
    if (item.kind === 'phone') {
        snap.phoneNumberPreset = phoneNumberPreset.value;
        snap.alwaysExceptionKeys = exceptionKeys(alwaysExceptions.value);
        snap.neverExceptionKeys = exceptionKeys(neverExceptions.value);
        snap.phoneFindPreset = phoneFindPreset.value;
        snap.phoneFindExceptionKeys = exceptionKeys(phoneFindExceptions.value);
    } else if (item.kind === 'status') {
        snap.activePreset = activePreset.value;
        snap.alwaysExceptionKeys = exceptionKeys(alwaysExceptions.value);
        snap.neverExceptionKeys = exceptionKeys(neverExceptions.value);
        snap.hideReadTime = hideReadTime.value;
    } else if (item.kind === 'gifts') {
        snap.activePreset = activePreset.value;
        snap.alwaysExceptionKeys = exceptionKeys(alwaysExceptions.value);
        snap.neverExceptionKeys = exceptionKeys(neverExceptions.value);
        snap.acceptedGiftTypes = { ...acceptedGiftTypes };
    } else if (item.kind === 'newchat') {
        snap.newChatMode = newChatMode.value;
        snap.paidStarCount = paidStarCount.value;
        snap.newChatExceptionKeys = exceptionKeys(newChatExceptions.value);
    } else {
        snap.activePreset = activePreset.value;
        snap.alwaysExceptionKeys = exceptionKeys(alwaysExceptions.value);
        snap.neverExceptionKeys = exceptionKeys(neverExceptions.value);
    }
    privacySnapshot.value = snap;
}

function resetEditState() {
    activePreset.value = 'everyone';
    phoneNumberPreset.value = 'everyone';
    phoneFindPreset.value = 'everyone';
    hideReadTime.value = false;
    alwaysInput.value = '';
    alwaysError.value = '';
    alwaysExceptions.value = [];
    neverInput.value = '';
    neverError.value = '';
    neverExceptions.value = [];
    exceptionError.value = '';
    exceptionAdding.value = false;
    phoneFindExceptions.value = [];
    newChatInput.value = '';
    newChatExceptions.value = [];
    newChatMode.value = 'everyone';
    paidStarCount.value = 10;
    privacySnapshot.value = null;
    privacyReady.value = false;
}

async function hydratePrivacyItem(item: PrivacyItemDef) {
    if (item.kind === 'phone') {
        const p1 = await loadRules('phone_number');
        phoneNumberPreset.value = basePresetFor(p1);
        await loadDualExceptions(p1);
        const p2 = await loadRules('phone_find');
        phoneFindPreset.value = basePresetFor(p2);
        phoneFindExceptions.value = await hydrateExceptions(decodedToList(p2, 'restricted'));
    } else if (item.kind === 'status') {
        const d = await loadRules('status');
        activePreset.value = basePresetFor(d);
        await loadDualExceptions(d);
        await loadReadDateSetting();
    } else if (item.kind === 'newchat') {
        await loadNewChatSetting();
        newChatExceptions.value = [];
        if (newChatMode.value === 'paid') {
            const d = await loadRules('unpaid_messages');
            newChatExceptions.value = await hydrateExceptions(decodedToList(d, 'allowed'));
        }
        newChatInput.value = '';
    } else {
        const d = await loadRules(item.key);
        activePreset.value = basePresetFor(d);
        await loadDualExceptions(d);
        if (item.kind === 'gifts') await loadAcceptedGiftTypes();
    }
    takePrivacySnapshot();
}

async function savePrivacyItem(): Promise<boolean> {
    const item = activeItem.value;
    if (!item) return false;
    const snap = privacySnapshot.value;
    let changed = false;
    try {
        if (item.kind === 'phone') {
            const phoneRulesChanged = !snap
                || snap.phoneNumberPreset !== phoneNumberPreset.value
                || dualRulesChanged(snap);
            const findChanged = !snap
                || snap.phoneFindPreset !== phoneFindPreset.value
                || !sameKeyList(snap.phoneFindExceptionKeys, exceptionKeys(phoneFindExceptions.value));
            if (phoneRulesChanged) {
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS.phone_number,
                    rules: encodeFromLists(phoneNumberPreset.value, alwaysExceptions.value, neverExceptions.value),
                });
                changed = true;
            }
            if (findChanged) {
                // 找到我：仅「从不」例外（restricted）
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS.phone_find,
                    rules: encodeFromLists(phoneFindPreset.value, [], phoneFindExceptions.value),
                });
                changed = true;
            }
        } else if (item.kind === 'status') {
            const rulesChanged = !snap
                || snap.activePreset !== activePreset.value
                || dualRulesChanged(snap);
            const readDateChanged = !snap || snap.hideReadTime !== hideReadTime.value;
            if (rulesChanged) {
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS.status,
                    rules: encodeFromLists(activePreset.value, alwaysExceptions.value, neverExceptions.value),
                });
                changed = true;
            }
            if (readDateChanged) {
                await tdlibSend({
                    _: 'setReadDatePrivacySettings',
                    settings: { _: 'readDatePrivacySettings', show_read_date: !hideReadTime.value },
                });
                changed = true;
            }
        } else if (item.kind === 'gifts') {
            const rulesChanged = !snap
                || snap.activePreset !== activePreset.value
                || dualRulesChanged(snap);
            const giftTypesChanged = props.isPremium && !sameGiftTypes(snap?.acceptedGiftTypes);
            if (rulesChanged) {
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS.gifts,
                    rules: encodeFromLists(activePreset.value, alwaysExceptions.value, neverExceptions.value),
                });
                changed = true;
            }
            if (giftTypesChanged) {
                await tdlibSend({
                    _: 'setGiftSettings',
                    settings: {
                        _: 'giftSettings',
                        show_gift_button: false,
                        accepted_gift_types: { _: 'acceptedGiftTypes', ...acceptedGiftTypes },
                    },
                });
                changed = true;
            }
        } else if (item.kind === 'voice') {
            const rulesChanged = !snap
                || snap.activePreset !== activePreset.value
                || dualRulesChanged(snap);
            if (rulesChanged) {
                if (!props.isPremium) {
                    MessagePlugin.warning(t('privacy.premiumRequiredToast'));
                    return false;
                }
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS.voice,
                    rules: encodeFromLists(activePreset.value, alwaysExceptions.value, neverExceptions.value),
                });
                changed = true;
            }
        } else if (item.kind === 'newchat') {
            const modeChanged = !snap || snap.newChatMode !== newChatMode.value;
            const starChanged = newChatMode.value === 'paid'
                && (!snap || (snap.paidStarCount ?? paidStarCount.value) !== paidStarCount.value);
            const excChanged = newChatMode.value === 'paid'
                && (!snap || !sameKeyList(snap.newChatExceptionKeys, exceptionKeys(newChatExceptions.value)));
            if (modeChanged || starChanged || excChanged) {
                if (!props.isPremium) {
                    MessagePlugin.warning(t('privacy.premiumRequiredToast'));
                    return false;
                }
                if (modeChanged || starChanged) {
                    let allow = true;
                    let star = 0;
                    if (newChatMode.value === 'contacts_premium') {
                        allow = false;
                    } else if (newChatMode.value === 'paid') {
                        allow = true;
                        star = Math.max(1, Math.min(PAID_STAR_MAX, Math.round(paidStarCount.value) || 10));
                    }
                    await tdlibSend({
                        _: 'setNewChatPrivacySettings',
                        settings: {
                            _: 'newChatPrivacySettings',
                            allow_new_chats_from_unknown_users: allow,
                            incoming_paid_message_star_count: star,
                        },
                    });
                    changed = true;
                }
                if (newChatMode.value === 'paid' && (modeChanged || excChanged)) {
                    const ids = exceptionsToIds(newChatExceptions.value);
                    await tdlibSend({
                        _: 'setUserPrivacySettingRules',
                        setting: PRIVACY_SETTINGS.unpaid_messages,
                        rules: encodeUserPrivacyRules('nobody', ids, EMPTY_EXCEPTIONS),
                    });
                    changed = true;
                }
            }
        } else {
            const rulesChanged = !snap
                || snap.activePreset !== activePreset.value
                || dualRulesChanged(snap);
            if (rulesChanged) {
                await tdlibSend({
                    _: 'setUserPrivacySettingRules',
                    setting: PRIVACY_SETTINGS[item.key],
                    rules: encodeFromLists(activePreset.value, alwaysExceptions.value, neverExceptions.value),
                });
                changed = true;
            }
        }
        if (changed) {
            MessagePlugin.success(t('privacy.settingsUpdated'));
            emit('changed');
        }
        return true;
    } catch (e: any) {
        MessagePlugin.error(e?.message || t('privacy.saveFailed'));
        return false;
    }
}

async function handleSave() {
    if (saving.value || !privacyReady.value) return;
    saving.value = true;
    try {
        const ok = await savePrivacyItem();
        if (ok) visible.value = false;
    } finally {
        saving.value = false;
    }
}

watch(() => props.modelValue, (vis) => {
    if (vis) {
        const item = props.item;
        activeItem.value = item;
        if (!item) return;
        resetEditState();
        privacyReady.value = false;
        saving.value = false;
        void (async () => {
            if (item.kind === 'newchat') await loadCanEnablePaidMessages();
            await hydratePrivacyItem(item);
            privacyReady.value = true;
        })();
    }
    // 关闭（取消 / 右上角 X / 点击遮罩）均不写回，仅点「保存」才提交
});

/** 其他客户端修改隐私规则时，同步当前打开的弹窗（与 Unigram 的 UpdateUserPrivacySettingRules 处理一致） */
async function applyRemotePrivacyUpdate(settingType: string, rules: userPrivacySettingRules) {
    if (!props.modelValue || !activeItem.value) return;
    const item = activeItem.value;
    const decoded = decodeUserPrivacyRules(rules);
    const key = privacyKeyForSettingType(settingType);
    if (!key) return;

    if (item.kind === 'phone') {
        if (key === 'phone_number') {
            phoneNumberPreset.value = basePresetFor(decoded);
            await loadDualExceptions(decoded);
        } else if (key === 'phone_find') {
            phoneFindPreset.value = basePresetFor(decoded);
            phoneFindExceptions.value = await hydrateExceptions(decodedToList(decoded, 'restricted'));
        } else {
            return;
        }
    } else if (item.kind === 'newchat') {
        if (key === 'unpaid_messages') {
            newChatExceptions.value = await hydrateExceptions(decodedToList(decoded, 'allowed'));
            newChatInput.value = '';
        } else {
            return;
        }
    } else {
        if (key !== item.key) return;
        activePreset.value = basePresetFor(decoded);
        await loadDualExceptions(decoded);
    }

    // 以远端为最新状态刷新快照，关闭时不要用旧本地态覆盖
    takePrivacySnapshot();
}

let unlistenPrivacy: UnlistenFn | null = null;

onMounted(async () => {
    unlistenPrivacy = await listen<Record<string, any>>('tdlib-update', (event) => {
        const payload = event.payload;
        if (payload?._ !== 'updateUserPrivacySettingRules') return;
        void applyRemotePrivacyUpdate(payload.setting?._, payload.rules);
    });
});

onUnmounted(() => {
    unlistenPrivacy?.();
    unlistenPrivacy = null;
});
</script>
