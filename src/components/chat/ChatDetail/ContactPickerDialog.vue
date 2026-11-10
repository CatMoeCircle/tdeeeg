<template>
    <!-- 选择要作为名片发出的联系人：搜索框 + 通讯录列表，单选后立即回传 -->
    <ModalDialog :model-value="modelValue" :title="t('lng_profile_share_contact')" @update:model-value="close">
        <div class="space-y-3">
            <input v-model="query" type="search" :placeholder="t('lng_dlg_filter')" :aria-label="t('lng_dlg_filter')"
                class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <div
                class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto custom-scrollbar">
                <button v-for="u in filtered" :key="u.id" type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    @click="pick(u)">
                    <div class="w-9 h-9 shrink-0">
                        <Avatar :photo="u.profile_photo" :title="nameOf(u)" :first-name="u.first_name"
                            :last-name="u.last_name" :deletedAccount="isDeletedUser(u)" size-class="!w-9 !h-9" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ nameOf(u) }}</p>
                        <p class="text-xs text-gray-400 mt-0.5 truncate">{{ subtitleOf(u) }}</p>
                    </div>
                </button>

                <div v-if="loading" class="px-4 py-6 text-center text-sm text-gray-400">
                    {{ t('lng_contacts_loading') }}
                </div>
                <div v-else-if="filtered.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
                    {{ query.trim() ? t('lng_contacts_not_found') : t('lng_no_contacts') }}
                </div>
            </div>
        </div>
        <template #footer>
            <BaseButton type="button" variant="ghost" @click="close">{{ t('lng_cancel') }}</BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import Avatar from '../avatar.vue';
import { tdlibSend } from '../../../utils/session/tdlib';
import { ensureUser, getReactiveUser, isDeletedUser, DELETED_ACCOUNT_LABEL } from '../../../utils/profile/senderInfo';
import type { contact, user } from 'tdlib-types';

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    /** 选中的联系人（已整理成 TDLib 可直接发送的 contact） */
    (e: 'select', value: contact): void;
}>();

const { t } = useI18n();

const query = ref('');
const loading = ref(false);
/** 通讯录用户 id；渲染时经响应式缓存取最新用户对象，头像/改名会即时跟上 */
const contactIds = ref<number[]>([]);

/**
 * 通讯录排序：先按名字，再按 id 兜底，避免同名联系人顺序随机跳动。
 */
function compareByName(a: user, b: user): number {
    const an = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
    const bn = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim();
    return an.localeCompare(bn, undefined, { sensitivity: 'base' }) || a.id - b.id;
}

function nameOf(u: user): string {
    if (isDeletedUser(u)) return DELETED_ACCOUNT_LABEL.toString();
    return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || t('lng_contacts_header');
}

/** 副标题：优先用户名，其次手机号 */
function subtitleOf(u: user): string {
    const username = u.usernames?.active_usernames?.[0];
    if (username) return `@${username}`;
    return phoneText(u);
}

/** 展示用手机号：TDLib 存的是不带前导 + 的号码 */
function phoneText(u: user): string {
    const phone = (u.phone_number ?? '').trim();
    return phone ? `+${phone.replace(/^\+/, '')}` : '';
}

const filtered = computed(() => {
    const list = contactIds.value
        .map((id) => getReactiveUser(id))
        .filter((u): u is user => !!u && !isDeletedUser(u))
        .sort(compareByName);
    const q = query.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => {
        const haystack = [
            u.first_name,
            u.last_name,
            u.usernames?.active_usernames?.join(' '),
            u.phone_number,
            phoneText(u),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
    });
});

watch(
    () => props.modelValue,
    (open) => {
        if (!open) return;
        query.value = '';
        void reload();
    },
);

async function reload() {
    loading.value = true;
    try {
        const res = await tdlibSend({ _: 'getContacts' });
        const ids: number[] = (res.user_ids ?? []).filter((id: number) => id > 0);
        // 先把用户对象灌进响应式缓存，列表渲染直接读缓存（后续 update 自动生效）
        await Promise.all(ids.map((id) => ensureUser(id)));
        contactIds.value = ids;
    } catch (e) {
        console.error('ContactPicker load failed', e);
        contactIds.value = [];
    } finally {
        loading.value = false;
    }
}

function close() {
    emit('update:modelValue', false);
}

/**
 * 组装名片内容。
 * - 已知用户带上 user_id，接收方点名片就能直接进资料页 / 私聊；
 * - 姓名为空时用用户名或占位文案兜底（TDLib 要求 first_name 非空）；
 * - 手机号保持 TDLib 的裸号码格式（无前导 +）。
 */
function buildContact(u: user): contact {
    const first = (u.first_name ?? '').trim() || u.usernames?.active_usernames?.[0] || t('lng_contacts_header');
    return {
        _: 'contact',
        phone_number: (u.phone_number ?? '').replace(/^\+/, ''),
        first_name: first.slice(0, 64),
        last_name: (u.last_name ?? '').trim().slice(0, 64),
        vcard: '',
        user_id: u.id,
    };
}

function pick(u: user) {
    emit('select', buildContact(u));
    close();
}
</script>
