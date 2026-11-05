<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            @mousedown.self="close">
            <div
                class="w-100 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <Cake class="w-4 h-4 text-blue-500" />
                        {{ t('lng_dialogs_suggestions_birthday_title') }}
                    </h3>
                    <button type="button" :aria-label="t('lng_close')"
                        class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                        @click="close">
                        <X class="w-4 h-4" />
                    </button>
                </div>

                <div class="px-4 py-4 space-y-3">
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('lng_dialogs_suggestions_birthday_about') }}</p>

                    <label class="block">
                        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('lng_settings_birthday_label') }}</span>
                        <input v-model="dateValue" type="date" :max="todayIso"
                            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>

                    <label class="flex items-center gap-2 cursor-pointer select-none" @click.prevent="toggleHideYear">
                        <button type="button" role="switch" :aria-checked="hideYear"
                            class="relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0"
                            :class="hideYear ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'">
                            <span
                                class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                                :class="hideYear ? 'translate-x-4' : 'translate-x-0'" />
                        </button>
                        <span class="text-sm text-gray-600 dark:text-gray-300">{{ t('topTips.birthdayHideYear') }}</span>
                    </label>

                    <button v-if="visibilityLabel" type="button"
                        class="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                        @click="openPrivacy">
                        {{ t('topTips.birthdayVisibility', { value: visibilityLabel }) }}
                        <ChevronRight class="w-3 h-3" />
                    </button>
                </div>

                <div class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                    <BaseButton type="button" variant="ghost" size="sm" @click="close">
                        {{ t('lng_cancel') }}
                    </BaseButton>
                    <BaseButton type="button" size="sm" :disabled="!canSave || saving" @click="save">
                        {{ t('lng_settings_save') }}
                    </BaseButton>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Cake, ChevronRight, X } from 'lucide-vue-next';
import type { UserPrivacySettingRule } from 'tdlib-types';
import BaseButton from '../ui/button/BaseButton.vue';
import { toast } from '../../utils/ui/toast';
import { useTopTipsStore } from '../../store/chat/topTips';

const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n();
const router = useRouter();
const store = useTopTipsStore();

const dateValue = ref('');
const hideYear = ref(false);
const saving = ref(false);
const visibility = ref<UserPrivacySettingRule | null>(null);

/** 生日只能是过去的日期 */
const todayIso = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

const canSave = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(dateValue.value));

const visibilityLabel = computed(() => {
    const rule = visibility.value;
    if (!rule) return '';
    switch (rule._) {
        case 'userPrivacySettingRuleAllowAll':
            return t('topTips.visibilityAll');
        case 'userPrivacySettingRuleAllowContacts':
            return t('topTips.visibilityContacts');
        case 'userPrivacySettingRuleAllowPremiumUsers':
            return t('topTips.visibilityPremium');
        case 'userPrivacySettingRuleRestrictAll':
            return t('topTips.visibilityNobody');
        default:
            return t('topTips.visibilityCustom');
    }
});

function toggleHideYear() {
    hideYear.value = !hideYear.value;
}

function close() {
    emit('close');
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
}

async function save() {
    if (!canSave.value || saving.value) return;
    const [year, month, day] = dateValue.value.split('-').map(Number);
    saving.value = true;
    try {
        await store.setBirthdate(day, month, hideYear.value ? 0 : year);
        toast.success(t('lng_settings_birthday_saved'));
        close();
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    } finally {
        saving.value = false;
    }
}

function openPrivacy() {
    close();
    void router.push({ name: 'settings-privacy' });
}

onMounted(async () => {
    window.addEventListener('keydown', onKeydown);
    try {
        visibility.value = await store.fetchBirthdateVisibility();
    } catch {
        // 隐私规则只用于展示，取不到就不显示这一行
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
});
</script>
