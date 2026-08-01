<template>
    <div class="h-full flex flex-col bg-white ">
        <div class="p-4 border-b border-gray-200 ">
            <h2 class="text-lg font-semibold">外观设置</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div class="max-w-2xl">
                <div class="mb-8">
                    <h3 class="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">分组文件夹样式</h3>

                    <!-- 实时预览：分组栏即样式 -->
                    <div class="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">{{ styleLabel }}</span>
                        </div>
                        <div class="bg-white dark:bg-gray-900 p-4">
                            <!-- 样式选择（集成在预览内） -->
                            <div class="mb-4 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
                                <button v-for="s in styleOptions" :key="s.value" type="button"
                                    @click="settings.folderStyle = s.value"
                                    class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                                    :class="settings.folderStyle === s.value ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'">
                                    {{ s.label }}
                                </button>
                            </div>

                            <!-- 分组栏（点击分组切换选中，切换样式时带动画过渡） -->
                            <Transition mode="out-in" name="fade-slide">
                                <div :key="settings.folderStyle" class="overflow-x-auto no-scrollbar"
                                    :class="tabContainerClass">
                                    <button v-for="folder in folders" :key="folder.id" type="button"
                                        @click="activeFolder = folder.id"
                                        class="px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors inline-flex items-center"
                                        :class="folderClass(folder.id)">
                                        <!-- 全部对话默认显示对话图标；其余分组在激活时显示图标（宽度+透明度平滑过渡） -->
                                        <span class="folder-col folder-col-right"
                                            :class="{ open: settings.showFolderIcons && (folder.id === 'all' || folder.id === activeFolder) }">
                                            <span class="inline-flex items-center">
                                                <component :is="folder.icon" class="w-3.5 h-3.5 shrink-0" />
                                            </span>
                                        </span>
                                        <span>{{ folder.name }}</span>
                                        <!-- 未读计数器：激活分组旁显示（宽度+透明度平滑过渡） -->
                                        <span class="folder-col folder-col-left"
                                            :class="{ open: settings.showFolderUnread && folder.id === activeFolder }">
                                            <span
                                                class="min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-4 text-center inline-flex items-center justify-center">
                                                {{ settings.chatList.unreadCountMode === 'messages' ? '99+' :
                                                folder.unread }}
                                            </span>
                                        </span>
                                    </button>
                                </div>
                            </Transition>
                        </div>
                    </div>

                    <!-- 分组栏显示选项（属于分组文件夹样式大类） -->
                    <div class="mt-4">
                        <div
                            class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                            <div class="px-4 py-2">
                                <ChatTypeToggle label="显示未读消息计数器" v-model="settings.showFolderUnread" />
                            </div>
                            <!-- 未读计数方式（仅在显示未读计数器时可用）：开启=消息数量，关闭=对话数量 -->
                            <div v-if="settings.showFolderUnread" class="px-4 py-2">
                                <ChatTypeToggle label="显示未读消息数量"
                                    :modelValue="settings.chatList.unreadCountMode === 'messages'"
                                    @update:modelValue="(v: boolean) => settings.chatList.unreadCountMode = v ? 'messages' : 'chats'" />
                            </div>
                            <div class="px-4 py-2">
                                <ChatTypeToggle label="显示分组图标" v-model="settings.showFolderIcons" />
                            </div>
                        </div>
                        <p class="mt-2 text-sm text-gray-500">控制聊天列表顶部分组栏中是否显示未读计数与分组图标。</p>
                    </div>
                </div>

                <!-- 聊天列表设置 -->
                <div class="mb-8">
                    <h3 class="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">聊天列表</h3>

                    <!-- 预览：模拟聊天列表项 -->
                    <div class="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">聊天列表</span>
                        </div>
                        <div class="bg-white dark:bg-gray-900 p-4">
                            <div class="flex items-center p-2 rounded-lg">
                                <Avatar :photo="userPhoto" :title="userName"
                                    :radius="settings.chatList.avatarCornerRadius"
                                    sizeClass="!w-11 !h-11 mr-3 shrink-0" />
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-baseline mb-0.5">
                                        <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{
                                            userName }}</span>
                                        <span class="text-xs text-gray-400 ml-1 shrink-0">09:47</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <div class="flex-1 min-w-0 flex items-center gap-1.5">
                                            <span v-if="showPreviewLeftBadge"
                                                class="shrink-0 text-xs font-semibold leading-5 text-blue-500">[3]</span>
                                            <template v-if="settings.chatList.showSenderMiniAvatar">
                                                <Avatar :photo="userPhoto" :title="userName"
                                                    :radius="settings.chatList.avatarCornerRadius"
                                                    sizeClass="!w-4 !h-4 shrink-0" />
                                            </template>
                                            <span v-if="settings.chatList.showSenderMiniAvatar"
                                                class="shrink-0 text-xs text-gray-400 dark:text-gray-500">{{
                                                    userName }}：</span>
                                            <span class="min-w-0 truncate text-xs text-gray-500">消息预览</span>
                                        </div>
                                        <span v-if="!showPreviewLeftBadge"
                                            class="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-[11px] font-semibold leading-5 text-center">3</span>
                                    </div>
                                </div>
                            </div>
                            <p class="mt-2 text-xs text-gray-400">头像圆角与发送者迷你头像效果预览。</p>
                        </div>
                    </div>

                    <!-- 聊天列表选项 -->
                    <div
                        class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                        <!-- 头像圆角 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">头像圆角角度</span>
                                <span class="text-sm font-medium text-blue-600">{{ settings.chatList.avatarCornerRadius
                                }}</span>
                            </div>
                            <input type="range" min="0" max="100" step="5"
                                v-model.number="settings.chatList.avatarCornerRadius" class="w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">0 = 方形，100 = 圆形</p>
                        </div>

                        <!-- 话题模式头像跟随圆角 -->
                        <div class="px-4 py-2">
                            <div class="flex items-center gap-3">
                                <span
                                    class="w-7 h-7 shrink-0 bg-purple-400 text-white flex items-center justify-center text-xs font-semibold"
                                    :style="{ borderRadius: (settings.chatList.forumAvatarFollowsRadius ? settings.chatList.avatarCornerRadius : 25) * 0.5 + '%' }">
                                    T
                                </span>
                                <ChatTypeToggle label="话题模式头像跟随圆角" v-model="settings.chatList.forumAvatarFollowsRadius"
                                    class="flex-1" />
                            </div>
                            <p class="mt-1 text-xs text-gray-400">开启后话题模式群组头像使用上方圆角角度；关闭则按正方形小圆角显示</p>
                        </div>

                        <!-- 发送者迷你头像 -->
                        <div class="px-4 py-2">
                            <ChatTypeToggle label="最后消息前显示发送者迷你头像" v-model="settings.chatList.showSenderMiniAvatar" />
                        </div>

                        <!-- 未读角标显示位置 -->
                        <div class="px-4 py-2">
                            <ChatTypeToggle label="未读消息图标显示在左边" v-model="settings.chatList.badgeOnLeft" />
                            <!-- 子选项：随主开关展开/收起，仅对静音消息生效 -->
                            <div v-if="settings.chatList.badgeOnLeft"
                                class="mt-2 ml-7 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                <ChatTypeToggle label="只对静音消息生效" v-model="settings.chatList.badgeOnLeftMutedOnly" />
                            </div>
                        </div>

                        <!-- 归档位置 -->
                        <div class="px-4 py-3">
                            <span class="text-sm text-gray-600 dark:text-gray-400 block mb-2">归档位置</span>
                            <div class="grid grid-cols-3 gap-2">
                                <button type="button" @click="settings.chatList.archivePosition = 'top'"
                                    class="px-2 py-1.5 text-xs rounded-md border transition-colors"
                                    :class="settings.chatList.archivePosition === 'top' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'">
                                    全部顶部
                                </button>
                                <button type="button" @click="settings.chatList.archivePosition = 'sidebar'"
                                    class="px-2 py-1.5 text-xs rounded-md border transition-colors"
                                    :class="settings.chatList.archivePosition === 'sidebar' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'">
                                    侧边栏导航
                                </button>
                                <button type="button" @click="settings.chatList.archivePosition = 'hidden'"
                                    class="px-2 py-1.5 text-xs rounded-md border transition-colors"
                                    :class="settings.chatList.archivePosition === 'hidden' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'">
                                    隐藏
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue';
import {
    MessageCircleIcon, UserIcon, UsersIcon, MegaphoneIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import { useUserStore } from '../../store/user';
import ChatTypeToggle from './ChatTypeToggle.vue';
import Avatar from '../chat/avatar.vue';

/** 预览分组数据（全部对话默认使用对话图标） */
const folders: { id: string; name: string; unread: number; icon: Component }[] = [
    { id: 'all', name: '全部', unread: 5, icon: MessageCircleIcon },
    { id: 'private', name: '个人', unread: 2, icon: UserIcon },
    { id: 'groups', name: '群组', unread: 8, icon: UsersIcon },
    { id: 'channels', name: '频道', unread: 3, icon: MegaphoneIcon },
];

/** 预览中当前选中的分组 */
const activeFolder = ref('all');

/** 当前用户信息（用于预览时使用自己的头像与名称） */
const userStore = useUserStore();
const { userProfile } = storeToRefs(userStore);

onMounted(() => {
    if (!userProfile.value) {
        userStore.fetchUser();
    }
});

/** 预览使用的当前用户名称 */
const userName = computed(() => {
    const u = userProfile.value;
    if (!u) return '我';
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return full || '我';
});

/** 预览使用的当前用户头像 */
const userPhoto = computed(() => userProfile.value?.profile_photo);

/** 预览中是否显示左侧未读角标（开启且未限定仅静音；预览对话视为非静音） */
const showPreviewLeftBadge = computed(
    () => settings.chatList.badgeOnLeft && !settings.chatList.badgeOnLeftMutedOnly
);

/** 样式选择选项（集成在预览内） */
const styleOptions = [
    { value: 'tabs', label: '标签' },
    { value: 'pills', label: '胶囊' },
    { value: 'text', label: '文本' },
] as const;

const styleLabel = computed(() => {
    const labels = { tabs: '标签样式', pills: '胶囊样式', text: '文本样式' } as const;
    return labels[settings.folderStyle];
});

const tabContainerClass = computed(() => {
    switch (settings.folderStyle) {
        case 'tabs':
            return 'flex gap-2 border-b border-gray-200 dark:border-gray-700';
        case 'pills':
            return 'flex gap-2';
        default:
            return 'flex gap-3';
    }
});

/** 根据样式与选中态返回分组按钮类名（与 ChatList 实际渲染一致） */
function folderClass(id: string) {
    const active = id === activeFolder.value;
    switch (settings.folderStyle) {
        case 'tabs':
            return active
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'border-b-2 border-transparent text-gray-500 dark:text-gray-400';
        case 'pills':
            return active
                ? 'bg-blue-500 text-white rounded-full shadow-sm shadow-blue-500/50'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full';
        default:
            return active
                ? 'text-blue-600 font-bold'
                : 'text-gray-500 dark:text-gray-400';
    }
}
</script>

<style scoped>
/* 分组样式切换过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateY(-6px);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

/* 图标 / 未读角标：平滑展开与收起（宽度 + 透明度过渡）
   grid-template-columns 0fr -> 1fr 轨道动画实现可靠的宽度过渡 */
.folder-col {
    display: inline-grid;
    grid-template-columns: minmax(0, 0fr);
    overflow: hidden;
    opacity: 0;
    transition: grid-template-columns 0.18s ease, opacity 0.18s ease,
        margin-right 0.18s ease, margin-left 0.18s ease;
}

.folder-col>* {
    min-width: 0;
}

.folder-col.open {
    grid-template-columns: minmax(0, 1fr);
    opacity: 1;
}

.folder-col-right {
    margin-right: 0;
}

.folder-col-right.open {
    margin-right: 0.375rem;
    /* 6px：图标与名称间距 */
}

.folder-col-left {
    margin-left: 0;
}

.folder-col-left.open {
    margin-left: 0.375rem;
    /* 6px：名称与角标间距 */
}
</style>
