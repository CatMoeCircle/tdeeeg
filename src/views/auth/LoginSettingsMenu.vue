<template>
    <div class="relative">
        <!-- 右上角统一设置入口 -->
        <button type="button" @click="toggle" :title="t('login.settingsTitle')"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors" :class="visible
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'">
            <SettingsIcon class="w-4 h-4" />
            <span>{{ t('login.settingsTitle') }}</span>
        </button>

        <!-- 统一设置面板：语言 / API / 代理 -->
        <Teleport to="body">
            <div v-if="visible" class="fixed inset-0 z-9998" @mousedown.self="close" @keydown.esc="close">
                <div
                    class="absolute top-10 right-4 w-[min(26rem,calc(100vw-2rem))] max-h-[min(30rem,calc(100vh-5rem))] rounded-2xl
                    bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden flex flex-col">
                    <!-- 顶部选项卡 + 关闭 -->
                    <div
                        class="flex items-center justify-between px-2 pt-2 pb-0 border-b border-gray-100 dark:border-gray-700 shrink-0">
                        <div class="flex items-center gap-0.5 min-w-0">
                            <button v-for="item in tabs" :key="item.key" type="button"
                                class="px-3 py-2 text-xs transition-colors border-b-2 -mb-px shrink-0"
                                :class="activeTab === item.key
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 font-medium'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                                @click="activeTab = item.key">
                                <span>{{ item.label }}</span>
                            </button>
                        </div>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 shrink-0 ml-2"
                            :title="t('login.settingsTitle')" @click="close">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 内容区 -->
                    <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <LoginLanguageMenu v-show="activeTab === 'language'" :embedded="true" />
                        <LoginSystemMenu v-if="activeTab === 'system'" :embedded="true" />
                        <LoginProxyMenu v-if="activeTab === 'proxy'" :embedded="true" />
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Settings as SettingsIcon, X as XIcon } from 'lucide-vue-next';
import LoginLanguageMenu from './LoginLanguageMenu.vue';
import LoginSystemMenu from './LoginSystemMenu.vue';
import LoginProxyMenu from './LoginProxyMenu.vue';

const { t } = useI18n();
const visible = ref(false);
const activeTab = ref<'language' | 'system' | 'proxy'>('language');

const tabs = computed(() => [
    { key: 'language' as const, label: t('login.tabLanguage') },
    { key: 'system' as const, label: t('login.tabSystem') },
    { key: 'proxy' as const, label: t('login.tabProxy') },
]);

function toggle() {
    visible.value = !visible.value;
}

function close() {
    visible.value = false;
}
</script>
