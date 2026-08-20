<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
            <button type="button" aria-label="返回"
                class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ArrowLeftIcon class="w-5 h-5" />
            </button>
            <h2 class="text-lg font-semibold">隐私设置</h2>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="max-w-2xl mx-auto p-6 space-y-6">
                <!-- 拉黑用户列表 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">拉黑</h3>
                    <button type="button" @click="openBlockedPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <BanIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">拉黑用户列表</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ blockedCountText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 两步验证 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">两步验证</h3>
                    <button type="button" @click="openTwoStepPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <KeyRoundIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">两步验证密码</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ twoStepText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 自动删除设置 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">自动删除</h3>
                    <button type="button" @click="openAutoDeletePopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <TimerResetIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">自动删除新聊天中的消息</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ autoDeleteText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 可见性和权限 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">可见性和权限</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                        <button v-for="item in privacyItems" :key="item.key" type="button"
                            class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            @click="openPrivacyItem(item)">
                            <div class="min-w-0 flex-1">
                                <p class="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                                    {{ item.label }}
                                    <LockIcon v-if="item.premiumOnly" class="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                </p>
                                <p class="text-xs text-gray-400 mt-0.5">{{ itemSummary(item) }}</p>
                            </div>
                            <ChevronRightIcon class="w-4 h-4 text-gray-400 shrink-0" />
                        </button>
                    </div>
                </section>

                <!-- 账户删除时间设置 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">账户</h3>
                    <button type="button" @click="openAccountTtlPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <Trash2Icon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">账户删除时间设置</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ accountTtlText }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 18+ 内容 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">敏感内容</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] px-4 py-3 flex items-center gap-3"
                        :class="!canIgnoreSensitive ? 'opacity-60' : ''">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">显示 18+ 内容</p>
                            <p class="text-xs text-gray-400 mt-0.5">
                                {{ canIgnoreSensitive ? '开启后可在本客户端显示受年龄限制的内容' : '当前账号暂不支持修改该设置' }}
                            </p>
                        </div>
                        <ToggleSwitch v-model="ignoreSensitiveContent" :disabled="!canIgnoreSensitive"
                            @update:model-value="saveIgnoreSensitive" />
                    </div>
                </section>
            </div>
        </div>
        <!-- 拉黑用户列表弹窗 -->
        <ModalDialog v-model="blockedVisible" title="拉黑用户列表">
            <div class="space-y-3">
                <div class="flex items-center gap-2">
                    <input v-model="blockInput" type="text" placeholder="输入用户名或用户 ID 以拉黑" spellcheck="false"
                        class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        @keydown.enter="addBlocked" />
                    <button type="button" @click="addBlocked" :disabled="blockingAdd"
                        class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                        拉黑
                    </button>
                </div>
                <p v-if="blockingError" class="text-xs text-red-500">{{ blockingError }}</p>
                <div class="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1.5">
                    <p v-if="blockedLoading" class="text-sm text-gray-400 py-4 text-center">正在加载…</p>
                    <p v-else-if="blockedList.length === 0" class="text-sm text-gray-400 py-4 text-center">暂无拉黑的用户</p>
                    <div v-for="item in blockedList" :key="item.id"
                        class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-context-menu"
                        @contextmenu.prevent="onBlockedContextMenu($event, item)">
                        <div class="w-9 h-9 shrink-0">
                            <Avatar :photo="item.photo" :title="item.title" :accentColorId="item.accentId" sizeClass="!w-9 !h-9" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ item.title }}</p>
                            <p class="text-xs text-gray-400 truncate">{{ item.subtitle }}</p>
                        </div>
                        <span class="text-[10px] text-gray-400 shrink-0">右键移除</span>
                    </div>
                </div>
            </div>
        </ModalDialog>

        <!-- 两步验证弹窗 -->
        <ModalDialog v-model="twoStepVisible" :title="passwordState?.has_password ? '修改两步验证' : '设置两步验证'">
            <div class="space-y-4">
                <p v-if="passwordState?.has_password" class="text-xs text-gray-400">
                    密码提示：{{ passwordState.password_hint || '（无提示）' }}　
                    恢复邮箱：{{ passwordState.has_recovery_email_address ? '已设置' : '未设置' }}
                </p>
                <div v-if="passwordState?.has_password">
                    <label class="text-xs text-gray-400">当前密码</label>
                    <input v-model="twoStepCurrent" type="password" autocomplete="off"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                    <label class="text-xs text-gray-400">{{ passwordState?.has_password ? '新密码（留空则保留当前密码）' : '新密码' }}</label>
                    <input v-model="twoStepNew" type="password" autocomplete="new-password"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                    <label class="text-xs text-gray-400">密码提示（可选）</label>
                    <input v-model="twoStepHint" type="text" maxlength="64"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                    <label class="text-xs text-gray-400">恢复邮箱（可选）</label>
                    <input v-model="twoStepEmail" type="email"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div class="flex items-center justify-between pt-1">
                    <button v-if="passwordState?.has_password" type="button" @click="disableTwoStep"
                        class="px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        关闭两步验证
                    </button>
                    <button type="button" @click="saveTwoStep" :disabled="savingTwoStep"
                        class="ml-auto px-5 py-2.5 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50">
                        {{ savingTwoStep ? '保存中…' : (passwordState?.has_password ? '保存修改' : '设置密码') }}
                    </button>
                </div>
            </div>
        </ModalDialog>

        <!-- 自动删除设置弹窗 -->
        <ModalDialog v-model="autoDeleteVisible" title="自动删除新聊天中的消息">
            <div class="space-y-1.5">
                <button v-for="opt in autoDeleteOptions" :key="opt.time" type="button" @click="saveAutoDelete(opt.time)"
                    class="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm text-left transition-colors"
                    :class="autoDeleteTime === opt.time
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10 text-gray-900 dark:text-gray-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'">
                    <span>{{ opt.label }}</span>
                    <CheckIcon v-if="autoDeleteTime === opt.time" class="w-4 h-4 text-teal-500" />
                </button>
            </div>
        </ModalDialog>
        <!-- 隐私设置弹窗 -->
        <ModalDialog v-model="privacyItemVisible" :title="privacyDialogTitle">
            <div class="space-y-5">
                <!-- Premium 专属提示 -->
                <div v-if="activeItem?.premiumOnly && !isPremium"
                    class="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3.5 py-3 text-amber-600 dark:text-amber-400">
                    <LockIcon class="w-4.5 h-4.5 shrink-0 mt-0.5" />
                    <p class="text-xs leading-relaxed">此设置需要 Telegram Premium 会员才能使用。</p>
                </div>

                <!-- 手机号码 -->
                <template v-if="activeItem?.kind === 'phone'">
                    <div>
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">谁可以看到我的手机号码</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                                class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                                :class="phoneNumberPreset === opt.value
                                    ? 'bg-teal-500 text-white font-medium'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="phoneNumberPreset = opt.value">
                                {{ opt.label }}
                            </button>
                        </div>
                        <p class="text-xs text-gray-400 mt-2 leading-relaxed">已将您的手机号码保存在联系人中的用户也能看到您的手机号码。</p>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">谁可以通过手机号码找到我</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="opt in presetOptions(PRESET_FIND)" :key="opt.value" type="button"
                                class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                                :class="phoneFindPreset === opt.value
                                    ? 'bg-teal-500 text-white font-medium'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="phoneFindPreset = opt.value">
                                {{ opt.label }}
                            </button>
                        </div>
                        <p class="text-xs text-gray-400 mt-2 leading-relaxed">将您的手机号码添加到其联系人的用户，只有在他们是您的联系人时，才会在 Telegram 上看到您的手机号码。</p>

                        <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">添加例外 · 绝不允许</p>
                            <p class="text-xs text-gray-400 mb-2">您可以将用户或群组添加为例外，添加为例外将不会遵循全局设置。</p>
                            <div class="flex items-center gap-2 mb-3">
                                <input v-model="phoneFindInput" type="text" placeholder="输入用户名或用户 ID" spellcheck="false"
                                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    @keydown.enter="addException('phone_find')" />
                                <button type="button" @click="addException('phone_find')" :disabled="exceptionAdding"
                                    class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                                    添加
                                </button>
                            </div>
                            <p v-if="exceptionError" class="text-xs text-red-500 mb-2">{{ exceptionError }}</p>
                            <div v-if="phoneFindExceptions.length === 0" class="text-sm text-gray-400 py-2 text-center">暂无例外</div>
                            <div v-else class="space-y-1.5">
                                <div v-for="e in phoneFindExceptions" :key="(e.isChat ? 'c' : 'u') + e.id"
                                    class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <div class="w-8 h-8 shrink-0">
                                        <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                                    </div>
                                    <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">{{ e.title }}</span>
                                    <button type="button" @click="removeException('phone_find', e)"
                                        class="text-xs text-red-500 hover:text-red-600 shrink-0">移除</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- 上线状态 -->
                <template v-else-if="activeItem?.kind === 'status'">
                    <div>
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">谁可以看到我的在线状态</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                                class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                                :class="activePreset === opt.value
                                    ? 'bg-teal-500 text-white font-medium'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="activePreset = opt.value">
                                {{ opt.label }}
                            </button>
                        </div>
                        <p class="text-xs text-gray-400 mt-2 leading-relaxed">除非您已订阅了 Telegram Premium，否则您不会看到未与您共享在线状态的用户的在线状态。显示的是大致的上线时间（如：最近，一周内，一个月内）。</p>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">添加例外 · {{ exceptionSemanticLabel }}</p>
                        <p class="text-xs text-gray-400 mb-2">您可以将用户或群组添加为例外，添加为例外将不会遵循全局设置。</p>
                        <div class="flex items-center gap-2 mb-3">
                            <input v-model="exceptionInput" type="text" placeholder="输入用户名或用户 ID" spellcheck="false"
                                class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                @keydown.enter="addException('list')" />
                            <button type="button" @click="addException('list')" :disabled="exceptionAdding"
                                class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                                添加
                            </button>
                        </div>
                        <p v-if="exceptionError" class="text-xs text-red-500 mb-2">{{ exceptionError }}</p>
                        <div v-if="exceptionList.length === 0" class="text-sm text-gray-400 py-2 text-center">暂无例外</div>
                        <div v-else class="space-y-1.5">
                            <div v-for="e in exceptionList" :key="(e.isChat ? 'c' : 'u') + e.id"
                                class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div class="w-8 h-8 shrink-0">
                                    <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                                </div>
                                <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">{{ e.title }}</span>
                                <button type="button" @click="removeException('list', e)"
                                    class="text-xs text-red-500 hover:text-red-600 shrink-0">移除</button>
                            </div>
                        </div>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4 flex items-center gap-3">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">隐藏消息已读时间</p>
                            <p class="text-xs text-gray-400 mt-0.5 leading-relaxed">对无法看到您的上线状态的用户隐藏您的已读时间。如果您开启此功能，对方的已读时间也会对您隐藏（除非您已订阅了 Telegram Premium）。此设置不影响群聊，仅限私聊。</p>
                        </div>
                        <ToggleSwitch v-model="hideReadTime" />
                    </div>

                    <p class="text-xs text-gray-400 leading-relaxed border-t border-gray-200 dark:border-gray-700 pt-3">
                        {{ statusPremiumHint }}
                    </p>
                </template>
                <!-- 礼物 -->
                <template v-else-if="activeItem?.kind === 'gifts'">
                    <div :class="!isPremium ? 'opacity-50 pointer-events-none select-none' : ''">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{ activeItem?.whoLabel }}</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                                class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                                :class="activePreset === opt.value
                                    ? 'bg-teal-500 text-white font-medium'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="activePreset = opt.value">
                                {{ opt.label }}
                            </button>
                        </div>
                        <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">添加例外 · {{ exceptionSemanticLabel }}</p>
                            <p class="text-xs text-gray-400 mb-2">您可以将用户或群组添加为例外，添加为例外将不会遵循全局设置。</p>
                            <div class="flex items-center gap-2 mb-3">
                                <input v-model="exceptionInput" type="text" placeholder="输入用户名或用户 ID" spellcheck="false"
                                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    @keydown.enter="addException('list')" />
                                <button type="button" @click="addException('list')" :disabled="exceptionAdding"
                                    class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                                    添加
                                </button>
                            </div>
                            <p v-if="exceptionError" class="text-xs text-red-500 mb-2">{{ exceptionError }}</p>
                            <div v-if="exceptionList.length === 0" class="text-sm text-gray-400 py-2 text-center">暂无例外</div>
                            <div v-else class="space-y-1.5">
                                <div v-for="e in exceptionList" :key="(e.isChat ? 'c' : 'u') + e.id"
                                    class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <div class="w-8 h-8 shrink-0">
                                        <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                                    </div>
                                    <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">{{ e.title }}</span>
                                    <button type="button" @click="removeException('list', e)"
                                        class="text-xs text-red-500 hover:text-red-600 shrink-0">移除</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="isPremium" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">可接受礼物类型</p>
                        <p class="text-xs text-gray-400 mb-2">选择您愿意接受的礼物类型</p>
                        <div class="space-y-2">
                            <label v-for="t in giftTypeOptions" :key="t.key"
                                class="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <input type="checkbox" v-model="acceptedGiftTypes[t.key]" class="w-4 h-4 accent-teal-500 shrink-0" />
                                <span class="text-sm text-gray-800 dark:text-gray-100">{{ t.label }}</span>
                            </label>
                        </div>
                    </div>
                </template>

                <!-- 私聊消息 -->
                <template v-else-if="activeItem?.kind === 'newchat'">
                    <div>
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">谁可以给您发送私聊消息</p>
                        <div class="space-y-2">
                            <button v-for="opt in newChatOptions" :key="opt.value" type="button"
                                class="w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm text-left transition-colors"
                                :class="newChatMode === opt.value
                                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10'
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'"
                                :disabled="opt.value === 'paid' && !canEnablePaidMessages"
                                @click="selectNewChatMode(opt.value)">
                                <span class="text-gray-800 dark:text-gray-100 font-medium">{{ opt.label }}</span>
                                <CheckIcon v-if="newChatMode === opt.value" class="w-4 h-4 text-teal-500 shrink-0" />
                            </button>
                        </div>
                        <p v-if="!canEnablePaidMessages" class="text-xs text-gray-400 mt-2">您的账号暂不支持开启付费消息。</p>
                        <div v-if="newChatMode === 'paid'" class="mt-3">
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="text-xs text-gray-400">每条消息星币数</label>
                                <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ paidStarCount }} ⭐</span>
                            </div>
                            <t-slider v-model="paidStarCount" :min="1" :max="PAID_STAR_MAX" :show-tooltip="true" :input-number-props="starInputNumberProps" />
                            <p class="text-xs text-gray-400 mt-1.5 leading-relaxed">范围 1 - {{ PAID_STAR_MAX }} 星币</p>
                        </div>
                        <p v-if="newChatMode === 'paid'" class="text-xs text-gray-400 mt-1.5 leading-relaxed">非联系人需要支付 Telegram 星币才能给您发送私聊消息，您将获得其中的大部分收益。</p>
                    </div>

                    <div v-if="newChatMode === 'paid'" class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">添加例外 · 始终允许</p>
                        <p class="text-xs text-gray-400 mb-2">这些用户或群组可以免费向您发送私聊消息，不遵循全局设置。</p>
                        <div class="flex items-center gap-2 mb-3">
                            <input v-model="newChatInput" type="text" placeholder="输入用户名或用户 ID" spellcheck="false"
                                class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                @keydown.enter="addException('newchat')" />
                            <button type="button" @click="addException('newchat')" :disabled="exceptionAdding"
                                class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                                添加
                            </button>
                        </div>
                        <p v-if="exceptionError" class="text-xs text-red-500 mb-2">{{ exceptionError }}</p>
                        <div v-if="newChatExceptions.length === 0" class="text-sm text-gray-400 py-2 text-center">暂无例外</div>
                        <div v-else class="space-y-1.5">
                            <div v-for="e in newChatExceptions" :key="(e.isChat ? 'c' : 'u') + e.id"
                                class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div class="w-8 h-8 shrink-0">
                                    <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                                </div>
                                <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">{{ e.title }}</span>
                                <button type="button" @click="removeException('newchat', e)"
                                    class="text-xs text-red-500 hover:text-red-600 shrink-0">移除</button>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- 语音消息 / 标准项 -->
                <template v-else>
                    <div :class="activeItem?.premiumOnly && !isPremium ? 'opacity-50 pointer-events-none select-none' : ''">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">{{ activeItem?.whoLabel }}</p>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="opt in presetOptions(PRESET_ALL)" :key="opt.value" type="button"
                                class="px-3.5 py-2 rounded-xl text-sm transition-colors"
                                :class="activePreset === opt.value
                                    ? 'bg-teal-500 text-white font-medium'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'"
                                @click="activePreset = opt.value">
                                {{ opt.label }}
                            </button>
                        </div>
                        <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">添加例外 · {{ exceptionSemanticLabel }}</p>
                            <p class="text-xs text-gray-400 mb-2">您可以将用户或群组添加为例外，添加为例外将不会遵循全局设置。</p>
                            <div class="flex items-center gap-2 mb-3">
                                <input v-model="exceptionInput" type="text" placeholder="输入用户名或用户 ID" spellcheck="false"
                                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    @keydown.enter="addException('list')" />
                                <button type="button" @click="addException('list')" :disabled="exceptionAdding"
                                    class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                                    添加
                                </button>
                            </div>
                            <p v-if="exceptionError" class="text-xs text-red-500 mb-2">{{ exceptionError }}</p>
                            <div v-if="exceptionList.length === 0" class="text-sm text-gray-400 py-2 text-center">暂无例外</div>
                            <div v-else class="space-y-1.5">
                                <div v-for="e in exceptionList" :key="(e.isChat ? 'c' : 'u') + e.id"
                                    class="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <div class="w-8 h-8 shrink-0">
                                        <Avatar :photo="e.photo" :title="e.title" :accentColorId="e.accentId" sizeClass="!w-8 !h-8" />
                                    </div>
                                    <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">{{ e.title }}</span>
                                    <button type="button" @click="removeException('list', e)"
                                        class="text-xs text-red-500 hover:text-red-600 shrink-0">移除</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>

                <p class="text-xs text-gray-400 pt-1 text-right">关闭弹窗后自动保存设置。</p>
            </div>
        </ModalDialog>

        <!-- 账户删除时间设置弹窗 -->
        <ModalDialog v-model="accountTtlVisible" title="账户删除时间设置">
            <div class="space-y-1.5">
                <p class="text-xs text-gray-400 mb-2">在不活跃的这段时间后，您的账户将被自动删除</p>
                <button v-for="opt in accountTtlOptions" :key="opt.days" type="button" @click="saveAccountTtl(opt.days)"
                    class="w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm text-left transition-colors"
                    :class="accountTtlDays === opt.days
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10 text-gray-900 dark:text-gray-100'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'">
                    <span>{{ opt.label }}</span>
                    <CheckIcon v-if="accountTtlDays === opt.days" class="w-4 h-4 text-teal-500" />
                </button>
            </div>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowLeft as ArrowLeftIcon, Ban as BanIcon, Check as CheckIcon,
    ChevronRight as ChevronRightIcon, KeyRound as KeyRoundIcon,
    Lock as LockIcon, TimerReset as TimerResetIcon, Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import { MessagePlugin, Slider as TSlider } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import ModalDialog from '../../components/settings/ModalDialog.vue';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import { openContextMenu } from '../../store/contextMenu';
import { tdlibSend } from '../../utils/tdlib';
import {
    ensureUser, ensureChat, getReactiveUser, getReactiveChat, getChatTitle,
    getChatProfileAccentColorId,
} from '../../utils/senderInfo';
import {
    decodeUserPrivacyRules, encodeUserPrivacyRules, PRIVACY_PRESET_LABELS,
} from '../../utils/profilePrivacy';
import type { PrivacyPreset, DecodedPrivacy, PrivacyExceptionIds } from '../../utils/profilePrivacy';
import type { chat as TdChat, MessageSender } from 'tdlib-types';
import { useUserStore } from '../../store/user';
import { useUserProfileStore } from '../../store/userProfile';

const router = useRouter();
const userStore = useUserStore();
const profileStore = useUserProfileStore();

function goBack() {
    router.back();
}

// =====================================================================
// 拉黑用户列表
// =====================================================================
const blockedVisible = ref(false);
const blockedList = ref<{ id: number; title: string; subtitle: string; isChat: boolean; photo?: any; accentId?: number }[]>([]);
const blockedLoading = ref(false);
const blockedCount = ref(0);
const blockInput = ref('');
const blockingAdd = ref(false);
const blockingError = ref('');

const blockedCountText = computed(() => {
    if (blockedCount.value > 0) return `已拉黑 ${blockedCount.value} 个用户`;
    return '暂无拉黑的用户';
});

async function loadBlocked() {
    blockedLoading.value = true;
    try {
        const res = (await tdlibSend({
            _: 'getBlockedMessageSenders',
            block_list: { _: 'blockListMain' },
            offset: 0,
            limit: 100,
        } as any)) as { total_count?: number; senders?: MessageSender[] };
        blockedCount.value = res?.total_count ?? res?.senders?.length ?? 0;
        const senders = res?.senders ?? [];
        await Promise.all(
            senders.map((s) =>
                s._ === 'messageSenderUser'
                    ? ensureUser(s.user_id).catch(() => { })
                    : ensureChat(s.chat_id).catch(() => { }),
            ),
        );
        blockedList.value = senders.map((s) => {
            if (s._ === 'messageSenderUser') {
                const u = getReactiveUser(s.user_id);
                return {
                    id: s.user_id,
                    title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(s.user_id),
                    subtitle: u?.usernames?.active_usernames?.[0] ? `@${u.usernames.active_usernames[0]}` : `ID: ${s.user_id}`,
                    photo: u?.profile_photo,
                    accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
                    isChat: false,
                };
            }
            const c = getReactiveChat(s.chat_id);
            return {
                id: s.chat_id,
                title: c ? getChatTitle(c) : String(s.chat_id),
                subtitle: (c as any)?.usernames?.active_usernames?.[0] ? `@${(c as any).usernames.active_usernames[0]}` : `ID: ${s.chat_id}`,
                photo: c?.photo,
                accentId: getChatProfileAccentColorId(c),
                isChat: true,
            };
        });
    } catch (e) {
        console.error('load blocked failed:', e);
    } finally {
        blockedLoading.value = false;
    }
}

async function openBlockedPopup() {
    blockedVisible.value = true;
    blockedList.value = [];
    blockingError.value = '';
    blockInput.value = '';
    loadBlocked();
}

async function resolveSenderFromInput(input: string): Promise<{ sender: MessageSender; title: string } | null> {
    const text = input.trim().replace(/^@/, '');
    if (!text) return null;
    if (/^\d+$/.test(text)) {
        const uid = Number(text);
        await ensureUser(uid);
        const u = getReactiveUser(uid);
        return {
            sender: { _: 'messageSenderUser', user_id: uid },
            title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
        };
    }
    try {
        const chat = (await tdlibSend({ _: 'searchPublicChat', username: text } as any)) as TdChat;
        if (chat?.type?._ === 'chatTypePrivate' || chat?.type?._ === 'chatTypeSecret') {
            const uid = (chat.type as any).user_id as number;
            await ensureUser(uid);
            const u = getReactiveUser(uid);
            return {
                sender: { _: 'messageSenderUser', user_id: uid },
                title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
            };
        }
        await ensureChat(chat.id);
        return {
            sender: { _: 'messageSenderChat', chat_id: chat.id },
            title: getChatTitle(chat) || String(chat.id),
        };
    } catch (e: any) {
        throw new Error(e?.message || '未找到该用户');
    }
}

async function addBlocked() {
    const text = blockInput.value.trim();
    if (!text) return;
    blockingError.value = '';
    blockingAdd.value = true;
    try {
        const resolved = await resolveSenderFromInput(text);
        if (!resolved) return;
        await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: resolved.sender,
            block_list: { _: 'blockListMain' },
        } as any);
        MessagePlugin.success(`已拉黑 ${resolved.title}`);
        blockInput.value = '';
        loadBlocked();
    } catch (e: any) {
        blockingError.value = e?.message || '拉黑失败';
    } finally {
        blockingAdd.value = false;
    }
}

async function unblock(item: { id: number; title: string; isChat?: boolean }) {
    try {
        await tdlibSend({
            _: 'setMessageSenderBlockList',
            sender_id: item.isChat ? { _: 'messageSenderChat', chat_id: item.id } : { _: 'messageSenderUser', user_id: item.id },
            block_list: null,
        } as any);
        MessagePlugin.success(`已解除拉黑 ${item.title}`);
        loadBlocked();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

function onBlockedContextMenu(e: MouseEvent, item: { id: number; title: string }) {
    openContextMenu(e.clientX, e.clientY, [
        {
            key: 'unblock',
            label: '解除拉黑',
            icon: BanIcon,
            danger: true,
            onClick: () => unblock(item),
        },
    ], e.currentTarget as HTMLElement);
}

// =====================================================================
// 两步验证
// =====================================================================
const twoStepVisible = ref(false);
const passwordState = ref<{ has_password: boolean; password_hint: string; has_recovery_email_address: boolean } | null>(null);
const twoStepCurrent = ref('');
const twoStepNew = ref('');
const twoStepHint = ref('');
const twoStepEmail = ref('');
const savingTwoStep = ref(false);

const twoStepText = computed(() => {
    if (!passwordState.value) return '加载中…';
    return passwordState.value.has_password ? '已开启' : '未开启';
});

async function loadPasswordState() {
    try {
        const res = (await tdlibSend({ _: 'getPasswordState' })) as any;
        passwordState.value = {
            has_password: !!res?.has_password,
            password_hint: res?.password_hint ?? '',
            has_recovery_email_address: !!res?.has_recovery_email_address,
        };
    } catch (e) {
        console.error('load password state failed:', e);
    }
}

async function openTwoStepPopup() {
    twoStepVisible.value = true;
    twoStepCurrent.value = '';
    twoStepNew.value = '';
    twoStepHint.value = passwordState.value?.password_hint ?? '';
    twoStepEmail.value = '';
    loadPasswordState();
}

async function saveTwoStep() {
    const has = !!passwordState.value?.has_password;
    if (has && !twoStepCurrent.value) {
        MessagePlugin.warning('请输入当前密码');
        return;
    }
    if (!has && !twoStepNew.value) {
        MessagePlugin.warning('请输入新密码');
        return;
    }
    savingTwoStep.value = true;
    try {
        const newPw = has && !twoStepNew.value ? twoStepCurrent.value : twoStepNew.value;
        await tdlibSend({
            _: 'setPassword',
            old_password: has ? twoStepCurrent.value : '',
            new_password: newPw,
            new_hint: twoStepHint.value,
            set_recovery_email_address: !!twoStepEmail.value,
            new_recovery_email_address: twoStepEmail.value,
        } as any);
        MessagePlugin.success('两步验证已更新');
        twoStepVisible.value = false;
        loadPasswordState();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    } finally {
        savingTwoStep.value = false;
    }
}

async function disableTwoStep() {
    if (!twoStepCurrent.value) {
        MessagePlugin.warning('请输入当前密码');
        return;
    }
    savingTwoStep.value = true;
    try {
        await tdlibSend({
            _: 'setPassword',
            old_password: twoStepCurrent.value,
            new_password: '',
            new_hint: '',
            set_recovery_email_address: false,
        } as any);
        MessagePlugin.success('已关闭两步验证');
        twoStepVisible.value = false;
        loadPasswordState();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    } finally {
        savingTwoStep.value = false;
    }
}

// =====================================================================
// 自动删除设置
// =====================================================================
const autoDeleteVisible = ref(false);
const autoDeleteTime = ref(0);

const autoDeleteOptions = [
    { time: 0, label: '关闭' },
    { time: 86400, label: '1 天后' },
    { time: 7 * 86400, label: '1 周后' },
    { time: 31 * 86400, label: '1 个月后' },
    { time: 91 * 86400, label: '3 个月后' },
    { time: 365 * 86400, label: '1 年后' },
];

const autoDeleteText = computed(() => {
    const opt = autoDeleteOptions.find((o) => o.time === autoDeleteTime.value);
    return opt ? `新聊天中的消息将在${opt.label}自动删除` : '未开启自动删除';
});

async function loadAutoDelete() {
    try {
        const res = (await tdlibSend({ _: 'getDefaultMessageAutoDeleteTime' })) as any;
        autoDeleteTime.value = Number(res?.time ?? 0);
    } catch (e) {
        console.error('load auto delete failed:', e);
    }
}

async function openAutoDeletePopup() {
    autoDeleteVisible.value = true;
    loadAutoDelete();
}

async function saveAutoDelete(time: number) {
    try {
        await tdlibSend({
            _: 'setDefaultMessageAutoDeleteTime',
            message_auto_delete_time: { _: 'messageAutoDeleteTime', time },
        } as any);
        autoDeleteTime.value = time;
        MessagePlugin.success('自动删除设置已更新');
        autoDeleteVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

// =====================================================================
// 可见性和权限
// =====================================================================
interface PrivacyItemDef {
    key: string;
    label: string;
    kind: 'phone' | 'status' | 'standard' | 'gifts' | 'voice' | 'newchat';
    whoLabel?: string;
    premiumOnly?: boolean;
}

const privacyItems: PrivacyItemDef[] = [
    { key: 'phone', label: '手机号码', kind: 'phone' },
    { key: 'status', label: '上线状态', kind: 'status' },
    { key: 'photo', label: '个人头像', kind: 'standard', whoLabel: '谁可以看到我的个人头像' },
    { key: 'bio', label: '个人简介', kind: 'standard', whoLabel: '谁可以看到我的个人简介' },
    { key: 'birthdate', label: '您的生日', kind: 'standard', whoLabel: '谁可以看到我的生日' },
    { key: 'audio', label: '个人资料音乐', kind: 'standard', whoLabel: '谁可以看到我的个人资料音乐' },
    { key: 'forward', label: '转发消息', kind: 'standard', whoLabel: '谁可以在转发消息中看到我的账号' },
    { key: 'calls', label: '通话呼叫', kind: 'standard', whoLabel: '谁可以给我打电话' },
    { key: 'gifts', label: '礼物展示', kind: 'gifts', whoLabel: '谁可以看到我的礼物', premiumOnly: true },
    { key: 'voice', label: '语音消息', kind: 'voice', whoLabel: '谁可以给我发送语音消息', premiumOnly: true },
    { key: 'newchat', label: '私聊消息', kind: 'newchat' },
    { key: 'invites', label: '邀请设置', kind: 'standard', whoLabel: '谁可以将我添加到群组和频道' },
];

const PRIVACY_SETTINGS: Record<string, { _: string }> = {
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

function presetOptions(presets: PrivacyPreset[]) {
    return presets.map((p) => ({ value: p, label: PRIVACY_PRESET_LABELS[p] }));
}

const privacyRules = reactive<Record<string, DecodedPrivacy>>({});
const privacyItemVisible = ref(false);
const activeItem = ref<PrivacyItemDef | null>(null);

const privacyDialogTitle = computed(() => {
    const item = activeItem.value;
    if (!item) return '';
    return item.kind === 'phone' ? '手机号码' : item.label;
});

function countExceptions(d: DecodedPrivacy): number {
    return d.allowed.userIds.length + d.allowed.chatIds.length + d.restricted.userIds.length + d.restricted.chatIds.length;
}

function itemSummary(item: PrivacyItemDef): string {
    if (item.key === 'phone') {
        const p1 = privacyRules.phone_number ? PRIVACY_PRESET_LABELS[privacyRules.phone_number.preset] : '加载中…';
        const p2 = privacyRules.phone_find ? PRIVACY_PRESET_LABELS[privacyRules.phone_find.preset] : '加载中…';
        return `手机号码：${p1} · 可通过手机号找到我：${p2}`;
    }
    if (item.key === 'status') {
        const d = privacyRules.status;
        if (!d) return '加载中…';
        const n = countExceptions(d);
        const base = n ? `${PRIVACY_PRESET_LABELS[d.preset]}（例外 ${n} 项）` : PRIVACY_PRESET_LABELS[d.preset];
        return hideReadTime.value ? `${base} · 已隐藏已读时间` : base;
    }
    if (item.key === 'newchat') {
        const opt = newChatOptions.find((o) => o.value === newChatMode.value);
        return opt ? `允许私聊：${opt.label}` : '加载中…';
    }
    const d = privacyRules[item.key];
    if (!d) return '加载中…';
    const n = countExceptions(d);
    return n ? `${PRIVACY_PRESET_LABELS[d.preset]}（例外 ${n} 项）` : PRIVACY_PRESET_LABELS[d.preset];
}

async function loadRules(key: string): Promise<DecodedPrivacy | undefined> {
    try {
        const res = await tdlibSend({
            _: 'getUserPrivacySettingRules',
            setting: PRIVACY_SETTINGS[key],
        } as any);
        const decoded = decodeUserPrivacyRules(res);
        privacyRules[key] = decoded;
        return decoded;
    } catch (e) {
        console.error(`load privacy rules ${key} failed:`, e);
        return undefined;
    }
}

async function loadAllPrivacyRules() {
    await Promise.all(
        Object.keys(PRIVACY_SETTINGS)
            .filter((k) => k !== 'unpaid_messages')
            .map((k) => loadRules(k)),
    );
}

/** 弹窗编辑用的基础档位：custom（带例外）时按默认档位进入编辑 */
function basePresetFor(d?: DecodedPrivacy): PrivacyPreset {
    if (!d) return 'everyone';
    if (d.preset !== 'custom') return d.preset;
    if (d.allowed.userIds.length || d.allowed.chatIds.length) return 'nobody';
    return 'everyone';
}

/** 把解码后的规则转成例外列表（nobody → 允许列表，其余 → 排除列表） */
function decodedToExceptions(d?: DecodedPrivacy): ExceptionEntry[] {
    if (!d) return [];
    const src = d.preset === 'nobody' ? d.allowed : d.restricted;
    const list: ExceptionEntry[] = [];
    for (const id of src.userIds) list.push({ id, isChat: false, title: String(id) });
    for (const id of src.chatIds) list.push({ id, isChat: true, title: String(id) });
    return list;
}

function exceptionsToIds(list: ExceptionEntry[]): PrivacyExceptionIds {
    return {
        userIds: list.filter((e) => !e.isChat).map((e) => e.id),
        chatIds: list.filter((e) => e.isChat).map((e) => e.id),
    };
}

function rulesForPreset(preset: PrivacyPreset, exceptions: ExceptionEntry[]) {
    const ids = exceptionsToIds(exceptions);
    if (preset === 'nobody') {
        return encodeUserPrivacyRules(preset, ids, EMPTY_EXCEPTIONS);
    }
    return encodeUserPrivacyRules(preset, EMPTY_EXCEPTIONS, ids);
}

interface ExceptionEntry {
    id: number;
    isChat: boolean;
    title: string;
    photo?: any;
    accentId?: number;
}

const activePreset = ref<PrivacyPreset>('everyone');
const phoneNumberPreset = ref<PrivacyPreset>('everyone');
const phoneFindPreset = ref<PrivacyPreset>('everyone');
const hideReadTime = ref(false);

const exceptionInput = ref('');
const exceptionError = ref('');
const exceptionAdding = ref(false);
const exceptionList = ref<ExceptionEntry[]>([]);
const phoneFindInput = ref('');
const phoneFindExceptions = ref<ExceptionEntry[]>([]);
const newChatInput = ref('');
const newChatExceptions = ref<ExceptionEntry[]>([]);

const exceptionSemanticLabel = computed(() => (activePreset.value === 'nobody' ? '始终允许' : '绝不允许'));

async function hydrateExceptions(list: ExceptionEntry[]): Promise<ExceptionEntry[]> {
    if (list.length === 0) return [];
    await Promise.all(
        list.map((e) => (e.isChat ? ensureChat(e.id) : ensureUser(e.id)).catch(() => { })),
    );
    return list.map((e) => {
        if (e.isChat) {
            const c = getReactiveChat(e.id);
            return { ...e, title: c ? getChatTitle(c) : e.title, photo: c?.photo, accentId: getChatProfileAccentColorId(c) };
        }
        const u = getReactiveUser(e.id);
        return {
            ...e,
            title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : e.title,
            photo: u?.profile_photo,
            accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
        };
    });
}

async function resolveEntityFromInput(input: string): Promise<ExceptionEntry> {
    const text = input.trim().replace(/^@/, '');
    if (!text) throw new Error('请输入用户名或 ID');
    if (/^\d+$/.test(text)) {
        const id = Number(text);
        if (id < 0) {
            await ensureChat(id).catch(() => { });
            const c = getReactiveChat(id);
            if (!c) throw new Error('未找到该群组');
            return { id, isChat: true, title: getChatTitle(c) || String(id), photo: c.photo, accentId: getChatProfileAccentColorId(c) };
        }
        await ensureUser(id).catch(() => { });
        const u = getReactiveUser(id);
        if (!u) throw new Error('未找到该用户');
        return {
            id,
            isChat: false,
            title: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || String(id),
            photo: u.profile_photo,
            accentId: u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
        };
    }
    try {
        const chat = (await tdlibSend({ _: 'searchPublicChat', username: text } as any)) as TdChat;
        if (!chat) throw new Error('未找到该用户或群组');
        if (chat.type?._ === 'chatTypePrivate' || chat.type?._ === 'chatTypeSecret') {
            const uid = (chat.type as any).user_id as number;
            await ensureUser(uid);
            const u = getReactiveUser(uid);
            return {
                id: uid,
                isChat: false,
                title: u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : String(uid),
                photo: u?.profile_photo,
                accentId: u && u.profile_accent_color_id !== undefined && u.profile_accent_color_id !== -1 ? u.profile_accent_color_id : undefined,
            };
        }
        await ensureChat(chat.id);
        const c = getReactiveChat(chat.id);
        return {
            id: chat.id,
            isChat: true,
            title: c ? getChatTitle(c) : String(chat.id),
            photo: c?.photo,
            accentId: getChatProfileAccentColorId(c),
        };
    } catch (e: any) {
        throw new Error(e?.message || '未找到该用户或群组');
    }
}

async function addException(kind: 'list' | 'phone_find' | 'newchat') {
    const target = kind === 'phone_find' ? phoneFindExceptions : kind === 'newchat' ? newChatExceptions : exceptionList;
    const input = kind === 'phone_find' ? phoneFindInput : kind === 'newchat' ? newChatInput : exceptionInput;
    const text = input.value.trim();
    if (!text) return;
    exceptionError.value = '';
    exceptionAdding.value = true;
    try {
        const entry = await resolveEntityFromInput(text);
        if (target.value.some((e) => e.id === entry.id && e.isChat === entry.isChat)) {
            MessagePlugin.warning('该用户或群组已在列表中');
            return;
        }
        target.value.push(entry);
        input.value = '';
    } catch (e: any) {
        exceptionError.value = e?.message || '添加失败';
    } finally {
        exceptionAdding.value = false;
    }
}

function removeException(kind: 'list' | 'phone_find' | 'newchat', entry: ExceptionEntry) {
    const target = kind === 'phone_find' ? phoneFindExceptions : kind === 'newchat' ? newChatExceptions : exceptionList;
    target.value = target.value.filter((e) => !(e.id === entry.id && e.isChat === entry.isChat));
}

// 上线状态：Premium 提示
const statusPremiumHint = computed(() =>
    isPremium.value
        ? '因为您已订阅了 Telegram Premium，所以您会看到所有与您分享信息的用户的在线状态和已读时间，即使您已隐藏了自己的信息。'
        : '如果您已订阅了 Telegram Premium，您可以看到其他用户的上线状态及已读时间，即使您对其隐藏了自己的上线状态及已读时间（除非对方明确限制）。',
);

async function loadReadDateSetting() {
    try {
        const res = (await tdlibSend({ _: 'getReadDatePrivacySettings' } as any)) as any;
        hideReadTime.value = res?._ === 'readDatePrivacySettings' ? !res.show_read_date : false;
    } catch (e) {
        console.error('load read date settings failed:', e);
    }
}

// 私聊消息
type NewChatMode = 'everyone' | 'contacts_premium' | 'paid';
const newChatMode = ref<NewChatMode>('everyone');
const paidStarCount = ref(10);
const PAID_STAR_MAX = 35000;
const starInputNumberProps = { min: 1, max: PAID_STAR_MAX };
const canEnablePaidMessages = ref(true);

const newChatOptions: { value: NewChatMode; label: string }[] = [
    { value: 'everyone', label: '所有人' },
    { value: 'contacts_premium', label: '联系人和 Premium' },
    { value: 'paid', label: '付费消息' },
];

async function loadNewChatSetting() {
    try {
        const res = (await tdlibSend({ _: 'getNewChatPrivacySettings' } as any)) as any;
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
        MessagePlugin.warning('您的账号暂不支持开启付费消息');
        return;
    }
    newChatMode.value = mode;
}

async function saveNewChatSettings() {
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
    } as any);
    if (newChatMode.value === 'paid') {
        const ids = exceptionsToIds(newChatExceptions.value);
        await tdlibSend({
            _: 'setUserPrivacySettingRules',
            setting: PRIVACY_SETTINGS.unpaid_messages,
            rules: encodeUserPrivacyRules('nobody', ids, EMPTY_EXCEPTIONS),
        } as any);
    }
    await loadNewChatSetting();
}

// 礼物
const acceptedGiftTypes = reactive({
    limited_gifts: true,
    unlimited_gifts: true,
    upgraded_gifts: true,
    gifts_from_channels: true,
    premium_subscription: true,
});

const giftTypeOptions = [
    { key: 'limited_gifts', label: '限量版' },
    { key: 'unlimited_gifts', label: '不限量' },
    { key: 'upgraded_gifts', label: '独家版' },
    { key: 'gifts_from_channels', label: 'From Channels' },
    { key: 'premium_subscription', label: 'Premium' },
] as const;

async function loadAcceptedGiftTypes() {
    if (!isPremium.value) return;
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

async function loadPremiumOptions() {
    try {
        const prem = (await tdlibSend({ _: 'getOption', name: 'is_premium' } as any)) as any;
        isPremium.value = prem?._ === 'optionValueBoolean' && !!prem.value;
        const canPaid = (await tdlibSend({ _: 'getOption', name: 'can_enable_paid_messages' } as any)) as any;
        canEnablePaidMessages.value = canPaid?._ === 'optionValueBoolean' && !!canPaid.value;
    } catch (e) {
        console.error('load premium options failed:', e);
    }
}

async function openPrivacyItem(item: PrivacyItemDef) {
    activeItem.value = item;
    exceptionError.value = '';
    exceptionInput.value = '';
    if (item.kind === 'phone') {
        const p1 = privacyRules.phone_number ?? (await loadRules('phone_number'));
        phoneNumberPreset.value = basePresetFor(p1);
        const p2 = privacyRules.phone_find ?? (await loadRules('phone_find'));
        phoneFindPreset.value = basePresetFor(p2);
        phoneFindExceptions.value = await hydrateExceptions(decodedToExceptions(p2));
        phoneFindInput.value = '';
    } else if (item.kind === 'status') {
        const d = privacyRules.status ?? (await loadRules('status'));
        activePreset.value = basePresetFor(d);
        exceptionList.value = await hydrateExceptions(decodedToExceptions(d));
        await loadReadDateSetting();
    } else if (item.kind === 'newchat') {
        await loadNewChatSetting();
        newChatExceptions.value = [];
        if (newChatMode.value === 'paid') {
            const d = await loadRules('unpaid_messages');
            newChatExceptions.value = await hydrateExceptions(decodedToExceptions(d));
        }
        newChatInput.value = '';
    } else {
        const d = privacyRules[item.key] ?? (await loadRules(item.key));
        activePreset.value = basePresetFor(d);
        exceptionList.value = await hydrateExceptions(decodedToExceptions(d));
        if (item.kind === 'gifts') await loadAcceptedGiftTypes();
    }
    privacyItemVisible.value = true;
}

async function savePrivacyItem() {
    const item = activeItem.value;
    if (!item) return;
    try {
        if (item.kind === 'phone') {
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS.phone_number,
                rules: encodeUserPrivacyRules(phoneNumberPreset.value, EMPTY_EXCEPTIONS, EMPTY_EXCEPTIONS),
            } as any);
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS.phone_find,
                rules: rulesForPreset(phoneFindPreset.value, phoneFindExceptions.value),
            } as any);
            await Promise.all([loadRules('phone_number'), loadRules('phone_find')]);
        } else if (item.kind === 'status') {
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS.status,
                rules: rulesForPreset(activePreset.value, exceptionList.value),
            } as any);
            await tdlibSend({
                _: 'setReadDatePrivacySettings',
                settings: { _: 'readDatePrivacySettings', show_read_date: !hideReadTime.value },
            } as any);
            await Promise.all([loadRules('status'), loadReadDateSetting()]);
        } else if (item.kind === 'gifts') {
            if (!isPremium.value) {
                MessagePlugin.warning('需要 Telegram Premium 才能修改此设置');
                return;
            }
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS.gifts,
                rules: rulesForPreset(activePreset.value, exceptionList.value),
            } as any);
            await tdlibSend({
                _: 'setGiftSettings',
                settings: {
                    _: 'giftSettings',
                    show_gift_button: false,
                    accepted_gift_types: { _: 'acceptedGiftTypes', ...acceptedGiftTypes },
                },
            } as any);
            await loadRules('gifts');
        } else if (item.kind === 'voice') {
            if (!isPremium.value) {
                MessagePlugin.warning('需要 Telegram Premium 才能修改此设置');
                return;
            }
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS.voice,
                rules: rulesForPreset(activePreset.value, exceptionList.value),
            } as any);
            await loadRules('voice');
        } else if (item.kind === 'newchat') {
            await saveNewChatSettings();
        } else {
            await tdlibSend({
                _: 'setUserPrivacySettingRules',
                setting: PRIVACY_SETTINGS[item.key],
                rules: rulesForPreset(activePreset.value, exceptionList.value),
            } as any);
            await loadRules(item.key);
        }
        MessagePlugin.success('隐私设置已更新');
        privacyItemVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '保存失败');
    }
}

// 关闭隐私弹窗时自动保存当前修改
watch(privacyItemVisible, (visible) => {
    if (!visible && activeItem.value) savePrivacyItem();
});

// =====================================================================
// Premium 状态
// =====================================================================
const isPremium = ref(false);

// =====================================================================
// 账户删除时间设置
// =====================================================================
const accountTtlVisible = ref(false);
const accountTtlDays = ref(365);

const accountTtlOptions = [
    { days: 30, label: '1 个月' },
    { days: 90, label: '3 个月' },
    { days: 180, label: '6 个月' },
    { days: 365, label: '1 年' },
    { days: 730, label: '2 年' },
];

const accountTtlText = computed(() => {
    const opt = accountTtlOptions.find((o) => o.days === accountTtlDays.value);
    return opt ? `账户将在不活跃 ${opt.label} 后自动删除` : `账户将在不活跃 ${accountTtlDays.value} 天后自动删除`;
});

async function loadAccountTtl() {
    try {
        const res = (await tdlibSend({ _: 'getAccountTtl' })) as any;
        accountTtlDays.value = Number(res?.days ?? 365);
    } catch (e) {
        console.error('load account ttl failed:', e);
    }
}

async function openAccountTtlPopup() {
    accountTtlVisible.value = true;
    loadAccountTtl();
}

async function saveAccountTtl(days: number) {
    try {
        await tdlibSend({ _: 'setAccountTtl', ttl: { _: 'accountTtl', days } } as any);
        accountTtlDays.value = days;
        MessagePlugin.success('账户删除时间已更新');
        accountTtlVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}

// =====================================================================
// 18+ 内容显示
// =====================================================================
const canIgnoreSensitive = ref(false);
const ignoreSensitiveContent = ref(false);

async function loadSensitiveOptions() {
    try {
        const can = (await tdlibSend({ _: 'getOption', name: 'can_ignore_sensitive_content_restrictions' })) as any;
        canIgnoreSensitive.value = can?._ === 'optionValueBoolean' && !!can.value;
        const cur = (await tdlibSend({ _: 'getOption', name: 'ignore_sensitive_content_restrictions' })) as any;
        ignoreSensitiveContent.value = cur?._ === 'optionValueBoolean' && !!cur.value;
    } catch (e) {
        console.error('load sensitive options failed:', e);
    }
}

async function saveIgnoreSensitive(v: boolean) {
    try {
        await tdlibSend({
            _: 'setOption',
            name: 'ignore_sensitive_content_restrictions',
            value: { _: 'optionValueBoolean', value: v },
        } as any);
        ignoreSensitiveContent.value = v;
        MessagePlugin.success(v ? '已开启显示 18+ 内容' : '已关闭显示 18+ 内容');
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
        ignoreSensitiveContent.value = !v;
    }
}

// =====================================================================
// 初始化
// =====================================================================
onMounted(() => {
    loadPasswordState();
    loadAutoDelete();
    loadNewChatSetting();
    loadAccountTtl();
    loadSensitiveOptions();
    loadAllPrivacyRules();
    loadReadDateSetting();
    loadPremiumOptions();
});
</script>
