<template>
    <div>
        <TransitionGroup name="top-tip" tag="div" class="relative">
            <!-- 账号冻结 -->
            <section v-if="store.topTip === 'frozen'" key="frozen"
                class="flex flex-col gap-2 rounded-xl border border-red-200/70 dark:border-red-500/30 bg-red-50/80 dark:bg-red-500/10 backdrop-blur-md px-3 py-2.5 mb-1.5">
                <div class="flex items-start gap-2.5">
                    <div class="w-8 h-8 shrink-0 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
                        <ShieldAlert class="w-4.5 h-4.5" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {{ t('topTips.frozenTitle') }}
                        </p>
                        <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{{ frozenBody }}</p>
                    </div>
                </div>
                <div class="flex items-center justify-end gap-2">
                    <BaseButton type="button" variant="ghost" size="sm" @click="store.dismissFrozen()">
                        {{ t('topTips.frozenDismiss') }}
                    </BaseButton>
                    <button v-if="store.freeze?.appeal_link" type="button" @click="appeal"
                        class="px-4 py-1.5 rounded-lg text-sm bg-red-500 text-white font-medium hover:bg-red-600 transition-colors">
                        {{ t('topTips.frozenAppeal') }}
                    </button>
                </div>
            </section>

            <!-- 生日 -->
            <section v-else-if="store.topTip === 'birthday'" key="birthday" role="button" tabindex="0"
                class="relative flex items-center gap-2.5 rounded-xl border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-3 py-2.5 mb-1.5 cursor-pointer transition-colors hover:bg-white/90 dark:hover:bg-gray-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                @click="birthdayOpen = true" @keydown.enter.prevent="birthdayOpen = true"
                @keydown.space.prevent="birthdayOpen = true">
                <div class="w-8 h-8 shrink-0 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Cake class="w-4.5 h-4.5" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                        {{ t('lng_dialogs_suggestions_birthday_title') }}
                    </p>
                    <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {{ t('lng_dialogs_suggestions_birthday_about') }}
                    </p>
                </div>
                <button type="button" :aria-label="t('lng_close')"
                    class="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
                    @click.stop="dismissBirthday">
                    <X class="w-4 h-4" />
                </button>
            </section>
        </TransitionGroup>

        <BirthdayPopup v-if="birthdayOpen" @close="birthdayOpen = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Cake, ShieldAlert, X } from 'lucide-vue-next';
import BaseButton from '../ui/button/BaseButton.vue';
import BirthdayPopup from './BirthdayPopup.vue';
import { toast } from '../../utils/ui/toast';
import { confirmAndOpenExternalLink } from '../../utils/link/openExternalLink';
import { useTopTipsStore } from '../../store/chat/topTips';

const { t } = useI18n();
const store = useTopTipsStore();

const birthdayOpen = ref(false);

const frozenBody = computed(() => {
    const state = store.freeze;
    if (state?.deletion_date) {
        return t('topTips.frozenBody', {
            date: new Date(state.deletion_date * 1000).toLocaleDateString(),
        });
    }
    return t('topTips.frozenBodyNoDate');
});

async function dismissBirthday() {
    try {
        // 不本地删除：等 TDLib 回 updateSuggestedActions 再把卡片撤掉
        await store.hideBirthday();
    } catch (e: any) {
        toast.error(e?.message || t('topTips.actionFailed'));
    }
}

function appeal() {
    const url = store.freeze?.appeal_link;
    if (!url) return;
    confirmAndOpenExternalLink(url).catch(() => {
        // 用户取消或打开失败：保持卡片不动
    });
}
</script>

<style scoped>
.top-tip-enter-active,
.top-tip-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.top-tip-enter-from,
.top-tip-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}

.top-tip-leave-active {
    position: absolute;
    left: 0;
    right: 0;
}

.top-tip-move {
    transition: transform 0.18s ease;
}
</style>
