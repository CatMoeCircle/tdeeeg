<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">外观设置</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">
                <!-- 聊天页面设置 -->
                <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            聊天页面</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 预览：模拟消息气泡，实时反映圆角/字体/缩放 -->
                    <div class="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">消息气泡</span>
                        </div>
                        <div class="relative bg-[#f5f5f5] dark:bg-[#1c1c1c] p-4 flex flex-col gap-3 overflow-hidden">
                            <div class="absolute inset-0" :style="messagePreviewBackgroundStyle"></div>
                            <div class="absolute inset-0 bg-white"
                                :style="{ opacity: settings.chatWallpaperOverlayOpacity / 100 }">
                            </div>
                            <div class="relative z-10 flex flex-col gap-3">
                                <!-- 他人消息：左侧完整头像 + 气泡 -->
                                <div class="flex justify-start">
                                    <div class="w-9 shrink-0 mr-2 self-end">
                                        <Avatar :photo="userPhoto" :title="userName"
                                            :radius="settings.chatList.avatarCornerRadius" sizeClass="!w-9 !h-9" />
                                    </div>
                                    <div class="max-w-[70%] bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 shadow-sm"
                                        :style="previewBubbleStyle('in', true)">
                                        <p class="font-semibold text-xs mb-0.5 text-blue-500">
                                            <GlobalEmojiText :text="userName" />
                                        </p>
                                        <p class="whitespace-pre-wrap" :style="previewTextStyle">这是他人发来的一条消息预览</p>
                                    </div>
                                </div>
                                <!-- 自己消息 -->
                                <div class="flex justify-end">
                                    <div class="max-w-[70%] bg-[#e3fee0] text-gray-900 px-3 py-2 shadow-sm"
                                        :style="previewBubbleStyle('out', false)">
                                        <p class="whitespace-pre-wrap" :style="previewTextStyle">这是你发送的一条消息预览</p>
                                    </div>
                                </div>
                                <!-- 贴纸消息预览（右下角时间胶囊 + 大小调整） -->
                                <div class="flex justify-start">
                                    <div class="w-9 shrink-0 mr-2 self-end">
                                        <Avatar :photo="userPhoto" :title="userName"
                                            :radius="settings.chatList.avatarCornerRadius" sizeClass="!w-9 !h-9" />
                                    </div>
                                    <div class="relative self-end overflow-hidden" :style="previewStickerWrapStyle">
                                        <img :src="stickerPreview" alt="" class="w-full h-full object-cover" />
                                        <span v-if="!settings.sticker.hideTimestamp"
                                            class="absolute right-1 bottom-1 translate-y-1/2 rounded-md bg-black/55 px-1.5 py-0.5 text-white text-[10px] leading-none shadow-sm my-2.5 mx-1">12:00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 消息显示选项 -->
                    <div
                        class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                        <!-- 消息圆角 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">消息圆角</span>
                                <span class="flex items-center gap-1">
                                    <EditableNumber :value="settings.message.cornerRadius" unit="px" :min="0" :max="24"
                                        @update:value="settings.message.cornerRadius = $event" />
                                    <span v-if="settings.message.cornerRadius === DEFAULT_MESSAGE.cornerRadius"
                                        class="text-xs font-normal text-gray-400">(默认)</span>
                                </span>
                            </div>
                            <input type="range" min="0" max="24" step="1" v-model.number="settings.message.cornerRadius"
                                class="w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">消息气泡圆角半径</p>
                        </div>

                        <!-- 4 角对称 -->
                        <div class="px-4 py-2">
                            <ChatTypeToggle label="4 角对称" v-model="settings.message.cornerRadiusSymmetrical" />
                            <p class="mt-1 text-xs text-gray-400">关闭时朝向头像的一侧使用小圆角,开启后四个角统一使用「消息圆角」</p>
                        </div>

                        <!-- 字体大小 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">字体大小</span>
                                <span class="flex items-center gap-1">
                                    <EditableNumber :value="settings.message.fontSize" unit="px" :min="11" :max="20"
                                        @update:value="settings.message.fontSize = $event" />
                                    <span v-if="settings.message.fontSize === DEFAULT_MESSAGE.fontSize"
                                        class="text-xs font-normal text-gray-400">(默认)</span>
                                </span>
                            </div>
                            <input type="range" min="11" max="20" step="1" v-model.number="settings.message.fontSize"
                                class="w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">控制消息内文字大小</p>
                        </div>

                        <!-- 消息整体比例缩放 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">消息整体比例缩放</span>
                                <EditableNumber :value="Math.round(settings.message.scale * 100)" unit="%" :min="80"
                                    :max="120" @update:value="settings.message.scale = $event / 100" />
                            </div>
                            <input type="range" min="80" max="120" step="1"
                                :value="Math.round(settings.message.scale * 100)" @input="onScaleInput"
                                class="w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">整体缩放消息气泡大小（含间距与文字）</p>
                        </div>

                        <!-- 贴纸大小 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">贴纸大小</span>
                                <span class="flex items-center gap-1">
                                    <EditableNumber :value="settings.sticker.size" unit="px" :min="96" :max="320"
                                        :step="4" @update:value="settings.sticker.size = $event" />
                                    <span v-if="settings.sticker.size === DEFAULT_MESSAGE.stickerSize"
                                        class="text-xs font-normal text-gray-400">(默认)</span>
                                </span>
                            </div>
                            <input type="range" min="96" max="320" step="4" v-model.number="settings.sticker.size"
                                class="w-full accent-blue-500" />
                        </div>

                        <!-- 隐藏贴纸发送时间 -->
                        <div class="px-4 py-2">
                            <ChatTypeToggle label="隐藏贴纸右下角发送时间" v-model="settings.sticker.hideTimestamp" />
                            <p class="mt-1 text-xs text-gray-400">开启后贴纸右下角的时间小胶囊不再显示</p>
                        </div>

                        <!-- 点击 bot 命令添加到输入框 -->
                        <div class="px-4 py-2">
                            <ChatTypeToggle label="点击机器人命令添加到输入框" v-model="settings.message.botCommandInsert" />
                            <p class="mt-1 text-xs text-gray-400">点击 /start 等命令时添加到输入框最前面（空格分隔），而非直接发送</p>
                        </div>

                        <!-- 对话壁纸入口 -->
                        <router-link to="/home/settings/wallpaper"
                            class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <div
                                class="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
                                <WallpaperIcon class="w-5 h-5" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">对话壁纸</p>
                                <p class="text-xs text-gray-400">纯色、图案和已安装的图片壁纸</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                        </router-link>
                    </div>

                    <!-- 翻译显示（二级分类） -->
                    <div class="mt-4">
                        <div class="flex items-center gap-3 mb-3">
                            <h4 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                翻译显示</h4>
                            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                        </div>
                        <p class="text-xs text-gray-400 mb-3">设置在消息右键菜单中点击「翻译」后，译文以何种方式显示。</p>

                        <div class="space-y-3">
                            <!-- 弹窗翻译 -->
                            <div class="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors"
                                :class="settings.translate.displayMode === 'popup'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                                @click="settings.translate.displayMode = 'popup'">
                                <div class="flex items-center">
                                    <div
                                        class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                                        <LanguageIcon class="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">弹窗显示</h4>
                                        <p class="text-xs text-gray-400 mt-0.5">译文在独立弹窗中展示，可切换目标语言</p>
                                    </div>
                                </div>
                                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                    :class="settings.translate.displayMode === 'popup' ? 'border-blue-500' : 'border-gray-300'">
                                    <div v-if="settings.translate.displayMode === 'popup'"
                                        class="w-2 h-2 rounded-full bg-blue-500"></div>
                                </div>
                            </div>

                            <!-- 内联翻译 -->
                            <div class="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors"
                                :class="settings.translate.displayMode === 'inline'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                                @click="settings.translate.displayMode = 'inline'">
                                <div class="flex items-center">
                                    <div
                                        class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-green-100 dark:bg-green-900/30 text-green-600">
                                        <MessageSquareTextIcon class="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">在原消息中显示</h4>
                                        <p class="text-xs text-gray-400 mt-0.5">译文直接显示在消息气泡内，可随时移除</p>
                                    </div>
                                </div>
                                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                    :class="settings.translate.displayMode === 'inline' ? 'border-blue-500' : 'border-gray-300'">
                                    <div v-if="settings.translate.displayMode === 'inline'"
                                        class="w-2 h-2 rounded-full bg-blue-500"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            分组文件夹样式</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

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
                                <SlidingTabBar :key="settings.folderStyle" :tabs="folders" :active-id="activeFolder"
                                    :variant="settings.folderStyle" :tab-class="folderClass"
                                    :container-class="tabContainerClass" @select="(id: string) => activeFolder = id">
                                    <!-- 全部对话默认显示对话图标；其余分组在激活时显示图标（宽度+透明度平滑过渡） -->
                                    <template #default="{ tab, active }">
                                        <span class="folder-col folder-col-right"
                                            :class="{ open: settings.showFolderIcons && (tab.id === 'all' || active) }">
                                            <span class="inline-flex items-center">
                                                <component :is="tab.icon" class="w-3.5 h-3.5 shrink-0" />
                                            </span>
                                        </span>
                                        <span>
                                            <GlobalEmojiText :text="tab.name" />
                                        </span>
                                        <!-- 未读计数器：激活分组旁显示（宽度+透明度平滑过渡） -->
                                        <span class="folder-col folder-col-left"
                                            :class="{ open: settings.showFolderUnread && active }">
                                            <span
                                                class="min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-4 text-center inline-flex items-center justify-center">
                                                {{ settings.chatList.unreadCountMode === 'messages' ? '99+' :
                                                    tab.unread }}
                                            </span>
                                        </span>
                                    </template>
                                </SlidingTabBar>
                            </Transition>
                        </div>
                    </div>

                    <!-- 分组栏显示选项（属于分组文件夹样式大类） -->
                    <div class="mt-4">
                        <div
                            class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
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
                        <p class="mt-2 text-xs text-gray-400">控制聊天列表顶部分组栏中是否显示未读计数与分组图标。</p>
                    </div>
                </div>

                <!-- 聊天列表设置 -->
                <div class="mb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            聊天列表</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

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
                        class="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                        <!-- 头像圆角 -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">头像圆角角度</span>
                                <EditableNumber :value="settings.chatList.avatarCornerRadius" :min="0" :max="100"
                                    :step="5" @update:value="settings.chatList.avatarCornerRadius = $event" />
                            </div>
                            <input type="range" min="0" max="100" step="5"
                                v-model.number="settings.chatList.avatarCornerRadius" class="w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">0 = 方形，100 = 圆形 (包括消息旁边的头像)</p>
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
                                    全部对话
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

                <!-- 加载指示器样式（排在外观设置最后） -->
                <div class="mb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            加载指示器样式</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">为聊天列表、图片/视频加载等选择你喜欢的加载进度条样式。</p>

                    <!-- 实时预览：网格展示各 loader + 点击选择 -->
                    <div class="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">{{ loaderLabel }}</span>
                        </div>
                        <div class="bg-white dark:bg-gray-900 p-4">
                            <div class="grid grid-cols-3 gap-3">
                                <button v-for="opt in loaderOptions" :key="opt.value" type="button"
                                    @click="settings.loadingStyle = opt.value"
                                    class="flex flex-col items-center gap-2 py-4 rounded-xl border transition-colors"
                                    :class="settings.loadingStyle === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                                    <LoaderIndicator :force="opt.value" :progress="0.55" size="34" color="#3b82f6" />
                                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ opt.label }}</span>
                                </button>
                            </div>
                            <p class="mt-3 text-xs text-gray-400">选中项会以 55% 进度显示；下载时进度会随 <code>updateFile</code> 实时更新。
                            </p>
                        </div>
                    </div>
                </div>

                <!-- 导航栏头像位置 -->
                <section class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            导航栏头像位置</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">选择对话中头像和名称的显示位置。</p>

                    <!-- 预览：模拟窗口内部布局 -->
                    <div class="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div
                            class="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">预览</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">{{ settings.chatHeaderAvatarPosition
                                === 'titlebar' ? '标题栏模式' : '默认模式' }}</span>
                        </div>
                        <!-- 窗口模拟（四周有间距，像真实窗口嵌在卡片内） -->
                        <div class="p-4">
                            <div
                                class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-900">
                                <!-- 标题栏 -->
                                <div
                                    class="h-7 flex items-center justify-between px-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <template v-if="settings.chatHeaderAvatarPosition !== 'titlebar'">
                                            <TitleBarEmojiStatus readonly />
                                        </template>
                                        <span
                                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate">TDEEEG</span>
                                        <!-- titlebar 模式：用户头像 + 名称 + emoji状态 -->
                                        <template v-if="settings.chatHeaderAvatarPosition === 'titlebar'">
                                            <span class="w-1.5"></span>
                                            <Avatar :photo="userPhoto" :title="userName"
                                                :radius="settings.chatList.avatarCornerRadius" sizeClass="!w-4 !h-4" />
                                            <span
                                                class="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate">{{
                                                    userName }}</span>
                                            <TitleBarEmojiStatus readonly />
                                        </template>
                                    </div>
                                    <div class="flex items-center gap-1 mr-0.5">
                                        <span class="w-2.5 h-px bg-gray-300 dark:bg-gray-600"></span>
                                        <span
                                            class="w-2.5 h-2.5 border border-gray-300 dark:border-gray-600 rounded-xs"></span>
                                        <span class="text-[9px] text-gray-300 dark:text-gray-600 leading-none">✕</span>
                                    </div>
                                </div>
                                <!-- 内容区 -->
                                <div class="flex" style="height: 130px;">
                                    <!-- 侧边栏（始终存在，仅 titlebar 模式下头像隐藏） -->
                                    <div
                                        class="w-10 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center pt-2.5 gap-2 bg-gray-50 dark:bg-gray-800/50">
                                        <Avatar v-if="settings.chatHeaderAvatarPosition !== 'titlebar'"
                                            :photo="userPhoto" :title="userName"
                                            :radius="settings.chatList.avatarCornerRadius"
                                            sizeClass="!w-8 !h-8 shrink-0" />
                                        <div class="w-6 h-6 rounded-md bg-gray-200 dark:bg-gray-600"></div>
                                        <div class="w-6 h-6 rounded-md bg-gray-200 dark:bg-gray-600"></div>
                                    </div>
                                    <!-- 聊天列表 -->
                                    <div
                                        class="w-[40%] shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                                        <div v-for="n in 4" :key="n"
                                            class="flex items-center gap-2 px-2 py-2 border-b border-gray-100 dark:border-gray-800/50"
                                            :class="n === 1 ? 'bg-gray-100 dark:bg-gray-800' : ''">
                                            <div class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0">
                                            </div>
                                            <div class="flex-1 min-w-0 space-y-1">
                                                <div class="h-2 rounded bg-gray-200 dark:bg-gray-600"
                                                    :style="{ width: n === 1 ? '55%' : '40%' }"></div>
                                                <div class="h-1.5 rounded bg-gray-100 dark:bg-gray-700 w-full"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- 聊天详情 -->
                                    <div class="flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-900">
                                        <!-- 聊天头部 -->
                                        <div
                                            class="flex items-center px-2.5 h-8 border-b border-gray-200 dark:border-gray-700 shrink-0">
                                            <div class="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0">
                                            </div>
                                            <div class="ml-1.5 space-y-1">
                                                <div class="h-2 w-16 rounded bg-gray-300 dark:bg-gray-600"></div>
                                                <div class="h-1.5 w-10 rounded bg-gray-200 dark:bg-gray-700"></div>
                                            </div>
                                            <div class="flex-1"></div>
                                            <div class="flex gap-2">
                                                <div class="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-600"></div>
                                                <div class="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-600"></div>
                                            </div>
                                        </div>
                                        <!-- 消息区域 -->
                                        <div class="flex-1 p-2.5 flex flex-col justify-end gap-2">
                                            <div class="flex items-end gap-1.5">
                                                <div class="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0">
                                                </div>
                                                <div
                                                    class="bg-gray-100 dark:bg-gray-800 rounded-lg rounded-bl-sm px-2.5 py-1.5 space-y-1 max-w-[50%]">
                                                    <div class="h-1.5 rounded bg-gray-300 dark:bg-gray-600 w-24"></div>
                                                    <div class="h-1.5 rounded bg-gray-200 dark:bg-gray-700 w-16"></div>
                                                </div>
                                            </div>
                                            <div class="flex items-end gap-1.5 justify-end">
                                                <div
                                                    class="bg-gray-200 dark:bg-gray-700 rounded-lg rounded-br-sm px-2.5 py-1.5 space-y-1 max-w-[40%]">
                                                    <div class="h-1.5 rounded bg-gray-300 dark:bg-gray-600 w-12"></div>
                                                </div>
                                            </div>
                                            <!-- 输入框占位 -->
                                            <div
                                                class="h-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 选项卡切换 -->
                    <div class="grid grid-cols-2 gap-3">
                        <button type="button" @click="settings.chatHeaderAvatarPosition = 'default'"
                            class="flex items-center gap-3 p-3 rounded-xl border transition-colors" :class="settings.chatHeaderAvatarPosition === 'default'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div
                                class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
                                <LayoutListIcon class="w-5 h-5" />
                            </div>
                            <div class="text-left min-w-0">
                                <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">导航栏</h4>
                                <p class="text-xs text-gray-400 mt-0.5 truncate">头像在侧边导航栏</p>
                            </div>
                        </button>
                        <button type="button" @click="settings.chatHeaderAvatarPosition = 'titlebar'"
                            class="flex items-center gap-3 p-3 rounded-xl border transition-colors" :class="settings.chatHeaderAvatarPosition === 'titlebar'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'">
                            <div
                                class="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center shrink-0">
                                <PanelTopIcon class="w-5 h-5" />
                            </div>
                            <div class="text-left min-w-0">
                                <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">标题栏</h4>
                                <p class="text-xs text-gray-400 mt-0.5 truncate">头像在窗口标题栏</p>
                            </div>
                        </button>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useRouter } from 'vue-router';
import {
    MessageCircleIcon, UserIcon, UsersIcon, MegaphoneIcon,
    Languages as LanguageIcon, MessageSquareText as MessageSquareTextIcon,
    ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Wallpaper as WallpaperIcon,
    LayoutList as LayoutListIcon, PanelTop as PanelTopIcon,
} from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { settings } from '../../store/settings';
import { useUserStore } from '../../store/user';
import ChatTypeToggle from '../../components/settings/ChatTypeToggle.vue';
import Avatar from '../../components/chat/avatar.vue';
import GlobalEmojiText from '../../components/common/GlobalEmojiText.vue';
import EditableNumber from '../../components/settings/EditableNumber.vue';
import LoaderIndicator from '../../components/common/LoaderIndicator';
import SlidingTabBar from '../../components/common/SlidingTabBar.vue';
import TitleBarEmojiStatus from '../../components/common/TitleBarEmojiStatus.vue';
import stickerPreview from '../../assets/sticker.jpg';

const router = useRouter();

/** 返回设置列表 */
function goBack() {
    router.push('/home/settings');
}

/** 消息显示/贴纸设置默认值（用于显示“(默认)”标记，与 settings.ts 默认值一致） */
const DEFAULT_MESSAGE = { cornerRadius: 18, fontSize: 14, stickerSize: 160 };

/** 加载指示器可选样式（与 loader tag 对应） */
const loaderOptions = [
    { value: 'ring2', label: '圆环' },
    { value: 'squircle', label: '方圆' },
    { value: 'square', label: '方框' },
    { value: 'reuleaux', label: '三角圆' },
    { value: 'infinity', label: '无限' },
    { value: 'trefoil', label: '三叶' },
] as const;

const loaderLabel = computed(() => {
    const labels: Record<string, string> = {
        ring2: '圆环 (默认)', squircle: '方圆', square: '方框',
        reuleaux: '三角圆', infinity: '无限', trefoil: '三叶',
    };
    return labels[settings.loadingStyle] || '圆环 (默认)';
});

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

/** 消息预览背景与实际默认对话壁纸保持一致 */
const messagePreviewBackgroundStyle = computed<Record<string, string>>(() => {
    const visual = settings.chatWallpaper;
    if (!visual) {
        return {};
    }

    const style: Record<string, string> = {
        backgroundColor: visual.color || '#f5f5f5',
        filter: `blur(${settings.chatWallpaperBlur}px)`,
        transform: settings.chatWallpaperBlur > 0 ? 'scale(1.05)' : 'none',
    };
    if (visual.kind === 'image' && visual.path) {
        style.backgroundImage = `url("${convertFileSrc(visual.path)}")`;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
    }
    return style;
});

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
            return 'border-b border-gray-200 dark:border-gray-700';
        case 'pills':
            return '';
        default:
            return '';
    }
});

/** 根据样式与选中态返回分组按钮类名（与 ChatList 实际渲染一致，供 SlidingTabBar 使用） */
function folderClass(_id: string, active: boolean) {
    const base = 'px-3 py-1.5 text-sm font-medium';
    switch (settings.folderStyle) {
        case 'tabs':
            return active
                ? `${base} text-blue-600`
                : `${base} text-gray-500 dark:text-gray-400`;
        case 'pills':
            return active
                ? `${base} bg-blue-500 text-white rounded-full shadow-sm shadow-blue-500/50`
                : `${base} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full`;
        default:
            return active
                ? `${base} text-blue-600 font-bold`
                : `${base} text-gray-500 dark:text-gray-400`;
    }
}

/** 预览消息气泡内联样式（圆角 + 缩放） */
function previewBubbleStyle(kind: 'in' | 'out', isFirst: boolean) {
    const r = settings.message.cornerRadius;
    const style: Record<string, string> = {
        zoom: String(settings.message.scale),
        borderRadius: `${r}px ${r}px ${r}px ${r}px`,
    };
    // 4 角对称开启：四角统一用用户半径
    if (settings.message.cornerRadiusSymmetrical) {
        return style;
    }
    if (kind === 'in') {
        // 他人消息：左下角朝向头像小圆角
        style.borderRadius = isFirst
            ? `${r}px ${r}px ${r}px 6px`
            : `6px ${r}px ${r}px 6px`;
    } else {
        // 自己消息：右上角小圆角
        style.borderRadius = `${r}px 6px ${r}px ${r}px`;
    }
    return style;
}

/** 预览消息文字样式（字体大小） */
const previewTextStyle = computed<Record<string, string>>(() => ({
    fontSize: `${settings.message.fontSize}px`,
    lineHeight: '1.4',
}));

/** 预览贴纸容器样式（大小 + 圆角跟随消息圆角设置） */
const previewStickerWrapStyle = computed<Record<string, string>>(() => ({
    width: `${settings.sticker.size}px`,
    height: `${settings.sticker.size}px`,
    borderRadius: `${settings.message.cornerRadius}px`,
    overflow: 'hidden',
}));

/** 缩放滑动条 input 事件（百分比转小数） */
function onScaleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    settings.message.scale = Number(target.value) / 100;
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
