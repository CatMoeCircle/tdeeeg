<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">通知</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-8">

                <!-- ===== 实时预览（Unigram 风格 Toast） ===== -->
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            显示效果
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">
                        实时预览系统通知弹窗的外观，下方开关会立即反映在预览中。
                    </p>

                    <!-- 预览卡片 -->
                    <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">
                                {{ previewMode === 'private' ? '私聊' : '群组' }}
                            </span>
                        </div>

                        <!-- 模拟桌面壁纸 + Toast -->
                        <div class="relative overflow-hidden" :class="previewBackdropClass">
                            <div class="relative z-10 px-4 py-6 sm:px-8 sm:py-8 flex flex-col items-center gap-4">

                                <!-- Toast -->
                                <div
                                    class="w-full max-w-[360px] rounded-2xl shadow-xl border backdrop-blur-md"
                                    :class="toastCardClass">
                                    <!-- 顶栏：应用名 + 操作点 -->
                                    <div class="flex items-center gap-2 px-3 pt-2.5 pb-1">
                                        <img :src="appLogo" alt="tdeeeg"
                                            class="w-5 h-5 rounded-full object-cover shrink-0" />
                                        <span class="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
                                            tdeeeg
                                        </span>
                                        <MoreHorizontalIcon class="w-4 h-4 text-gray-400 shrink-0" />
                                        <XIcon class="w-4 h-4 text-gray-400 shrink-0" />
                                    </div>

                                    <!-- 主体：圆形头像 + 标题/正文（关闭发送者姓名时隐藏身份） -->
                                    <div class="flex items-start gap-3 px-3 pb-3 pt-1"
                                        :class="settings.notifications.enabled ? '' : 'opacity-40'">
                                        <div v-if="showIdentity" class="w-10 h-10 shrink-0">
                                            <Avatar :photo="previewAvatar" :title="previewAvatarName"
                                                sizeClass="!w-10 !h-10" :radius="100" />
                                        </div>
                                        <div class="min-w-0 flex-1 pt-0.5">
                                            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-snug">
                                                {{ previewTitle }}
                                            </p>
                                            <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-snug line-clamp-2">
                                                {{ previewBody }}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <!-- 预览模式切换 -->
                                <div class="flex items-center gap-2">
                                    <button type="button"
                                        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                                        :class="previewMode === 'private'
                                            ? 'bg-white/90 text-gray-800 shadow-sm'
                                            : 'bg-white/40 text-gray-600 hover:bg-white/60'"
                                        @click="previewMode = 'private'">
                                        私聊
                                    </button>
                                    <button type="button"
                                        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                                        :class="previewMode === 'group'
                                            ? 'bg-white/90 text-gray-800 shadow-sm'
                                            : 'bg-white/40 text-gray-600 hover:bg-white/60'"
                                        @click="previewMode = 'group'">
                                        群组
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 影响显示效果的开关（Unigram 风格 chips） -->
                        <div
                            class="flex flex-wrap items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-200 dark:border-gray-700"
                            :class="{ 'opacity-50 pointer-events-none': !settings.notifications.enabled }">
                            <span class="text-xs text-gray-400 mr-1">显示内容</span>
                            <button type="button"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                                :class="chipClass(settings.notifications.showSenderName)"
                                @click="settings.notifications.showSenderName = !settings.notifications.showSenderName">
                                <CheckIcon v-if="settings.notifications.showSenderName" class="w-3.5 h-3.5" />
                                <span v-else class="w-3.5 h-3.5 rounded-full border border-current opacity-40" />
                                发送者姓名
                            </button>
                            <button type="button"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                                :class="chipClass(settings.notifications.showPreview)"
                                @click="settings.notifications.showPreview = !settings.notifications.showPreview">
                                <CheckIcon v-if="settings.notifications.showPreview" class="w-3.5 h-3.5" />
                                <span v-else class="w-3.5 h-3.5 rounded-full border border-current opacity-40" />
                                消息内容
                            </button>
                        </div>
                    </div>
                </section>

                <!-- ===== 不影响显示外观的设置 ===== -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            通知行为
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">
                        控制何时弹出系统通知，不改变弹窗内容样式。
                    </p>

                    <div class="mt-5 space-y-3">
                        <div
                            class="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <div>
                                <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">启用通知</h4>
                                <p class="text-xs text-gray-500 mt-0.5">收到新消息时显示系统通知弹窗</p>
                            </div>
                            <ToggleSwitch v-model="settings.notifications.enabled" />
                        </div>

                        <div
                            class="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            :class="{ 'opacity-50 pointer-events-none': !settings.notifications.enabled }">
                            <div>
                                <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">窗口在前台时也通知</h4>
                                <p class="text-xs text-gray-500 mt-0.5">关闭后仅在窗口失焦或最小化时弹出</p>
                            </div>
                            <ToggleSwitch v-model="settings.notifications.whenAppFocused" />
                        </div>
                    </div>
                </section>

            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
    ChevronLeftIcon,
    Check as CheckIcon,
    MoreHorizontal as MoreHorizontalIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import { useUserStore } from '../../store/user';
import Avatar from '../../components/chat/avatar.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import appLogo from '../../assets/logo.png';

const router = useRouter();
const previewMode = ref<'private' | 'group'>('private');

const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);

onMounted(() => {
    if (!userStore.userProfile) {
        void userStore.fetchUser();
    }
});

function goBack() {
    router.back();
}

const myName = computed(() => {
    const u = userProfile.value;
    if (!u) return '我';
    return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || '我';
});

const previewAvatarName = computed(() =>
    previewMode.value === 'private' ? '示例联系人' : '示例用户',
);
const previewAvatar = computed(() => userProfile.value?.profile_photo);

const SAMPLE_PRIVATE_BODY = '这是一条消息预览';
const SAMPLE_GROUP_BODY = '大家好，这是一条群消息预览';

/** 关闭「发送者姓名」= 隐藏身份：不显示头像与任何个人名称 */
const showIdentity = computed(() => settings.notifications.showSenderName);

const previewTitle = computed(() => {
    if (!settings.notifications.enabled) return '通知已关闭';
    if (!showIdentity.value) return '新消息';
    if (previewMode.value === 'private') {
        return `示例联系人 → ${myName.value}`;
    }
    return '示例群组';
});

const previewBody = computed(() => {
    if (!settings.notifications.enabled) return '关闭后不会弹出系统通知';
    if (!showIdentity.value) return '你有一条新消息';
    const sample = previewMode.value === 'private' ? SAMPLE_PRIVATE_BODY : SAMPLE_GROUP_BODY;
    if (!settings.notifications.showPreview) return '你有一条新消息';
    if (previewMode.value === 'group' && settings.notifications.showSenderName) {
        return `示例用户: ${sample}`;
    }
    return sample;
});

/** Unigram 风格浅色渐变底（桌面壁纸感） */
const previewBackdropClass = 'bg-gradient-to-br from-[#c8e6c9] via-[#dcedc8] to-[#f0f4c3]';

const toastCardClass = computed(() =>
    settings.notifications.enabled
        ? 'bg-white/85 dark:bg-gray-900/85 border-white/50 dark:border-gray-700/50'
        : 'bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/30',
);

function chipClass(on: boolean): string {
    if (on) {
        return 'border-emerald-500/60 bg-emerald-500 text-white shadow-sm';
    }
    return 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
}
</script>
