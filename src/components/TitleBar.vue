<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-vue-next';
import { useConnectionStore } from '../store/connectionState';
import { useI18n } from 'vue-i18n';
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import TitleBarEmojiStatus from './common/TitleBarEmojiStatus.vue';
import Avatar from './chat/avatar.vue';
import AccountMenu from './AccountMenu.vue';
import { settings } from '../store/settings';
import { useUserStore } from '../store/user';

const appWindow = getCurrentWindow();
const connectionStore = useConnectionStore();
const { t } = useI18n();

const isTitlebarMode = computed(() => settings.chatHeaderAvatarPosition === 'titlebar');

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);
const accountMenuOpen = ref(false);

const userDisplayName = computed(() => {
    const u = userProfile.value;
    if (!u) return '';
    return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || '';
});

const titleText = computed(() => {
    if (connectionStore.isConnecting && connectionStore.connectionLabel) {
        return t(connectionStore.connectionLabel);
    }
    return 'TDEEEG';
});

/** 是否显示连接状态 */
const showConnectionStatus = computed(() =>
    connectionStore.isConnecting && !!connectionStore.connectionLabel
);

const minimize = () => appWindow.minimize();
const maximize = () => appWindow.toggleMaximize();
const close = () => appWindow.close();
</script>

<template>
    <div data-tauri-drag-region class="h-8 flex justify-between items-center select-none w-full shrink-0 bg-white/40">
        <div class="pl-2 flex items-center gap-1 text-sm font-medium text-gray-700 min-w-0">
            <template v-if="!isTitlebarMode">
                <TitleBarEmojiStatus />
            </template>
            <p class="truncate shrink min-w-0">
                <template v-if="showConnectionStatus">
                    {{ titleText }}<span class="animated-dots"><span class="dot-1">.</span><span
                            class="dot-2">.</span><span class="dot-3">.</span></span>
                </template>
                <template v-else>{{ titleText }}</template>
            </p>
            <!-- titlebar 模式：TDEEEG 右侧显示用户头像 + 名称 + emoji状态 -->
            <template v-if="isTitlebarMode">
                <span class="w-2"></span>
                <button type="button"
                    class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
                    data-tauri-drag-region-exclude @click="accountMenuOpen = true">
                    <Avatar v-if="userProfile" :photo="userProfile.profile_photo" :title="userDisplayName"
                        :accentColorId="userProfile.profile_accent_color_id" sizeClass="!w-5 !h-5" />
                    <span v-if="userDisplayName" class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                        {{ userDisplayName }}
                    </span>
                </button>
                <TitleBarEmojiStatus />
            </template>
        </div>
        <AccountMenu v-model:visible="accountMenuOpen" />
        <Teleport to="body">
            <div class="fixed top-0 right-0 flex h-8 z-9999">
                <button @click="minimize"
                    class="w-12 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors focus:outline-none">
                    <Minus :size="18" />
                </button>
                <button @click="maximize"
                    class="w-12 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors focus:outline-none">
                    <Square :size="14" />
                </button>
                <button @click="close"
                    class="w-12 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-500 transition-colors focus:outline-none">
                    <X :size="18" />
                </button>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
[data-tauri-drag-region] {
    -webkit-app-region: drag;
}

[data-tauri-drag-region-exclude] {
    -webkit-app-region: no-drag;
}
</style>