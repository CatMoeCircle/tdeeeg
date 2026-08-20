<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
        <!-- 顶部导航 -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
            <button type="button" aria-label="返回"
                class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="goBack">
                <ArrowLeftIcon class="w-5 h-5" />
            </button>
            <h2 class="text-lg font-semibold flex-1">编辑个人资料</h2>
            <button type="button" @click="saveProfile" :disabled="savingProfile"
                class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                {{ savingProfile ? '保存中…' : '保存' }}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar" v-smooth-wheel>
            <div class="max-w-2xl mx-auto p-6 space-y-6">
                <!-- 头像 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">头像</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-4">
                        <div class="w-20 h-20 shrink-0">
                            <Avatar :photo="user?.profile_photo" :title="fullName" :accentColorId="user?.profile_accent_color_id"
                                sizeClass="!w-20 !h-20" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <button type="button" @click="avatarEditorVisible = true"
                                class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors">
                                更换头像
                            </button>
                            <p class="text-xs text-gray-400 mt-2">支持从历史头像中选择，或上传新照片并裁剪</p>
                        </div>
                    </div>
                </section>

                <!-- 姓名 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">姓名</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 space-y-3">
                        <div>
                            <label class="text-xs text-gray-400">名字</label>
                            <input v-model="firstName" type="text" maxlength="64"
                                class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                        <div>
                            <label class="text-xs text-gray-400">姓氏</label>
                            <input v-model="lastName" type="text" maxlength="64"
                                class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>

                    </div>
                </section>

                <!-- 个人简介 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">个人简介</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 space-y-2">
                        <textarea v-model="bio" rows="3" :maxlength="bioMax"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"></textarea>
                        <div class="flex items-center justify-between">
                            <span class="text-xs text-gray-400">{{ bio.length }} / {{ bioMax }}</span>
                            <span class="text-xs text-gray-400">姓名与简介请在右上角统一保存</span>
                        </div>
                    </div>
                </section>

                <!-- 手机号码 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">手机号码</h3>
                    <button type="button" @click="phoneVisible = true"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <PhoneIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100 select-all">{{ formattedPhone || '未设置' }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">更改手机号仅支持在官方客户端进行</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 用户名 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">用户名</h3>
                    <button type="button" @click="openUsernamePopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <AtSignIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100">@{{ primaryUsername || '未设置' }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">{{ usernameSummary }}</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 生日 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">生日</h3>
                    <div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 space-y-3">
                        <div class="flex items-center gap-3">
                            <CalendarIcon class="w-5 h-5 text-gray-400 shrink-0" />
                            <p v-if="birthdateText" class="text-sm text-gray-800 dark:text-gray-100">{{ birthdateText }}</p>
                            <p v-else class="text-sm text-gray-400">未设置生日</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-3">
                            <TDatePicker v-model="birthdatePickerValue" mode="date" format="YYYY-MM-DD" clearable
                                :style="{ width: '180px' }" @change="(v) => saveBirthdate(v as string)" />
                            <label class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 select-none cursor-pointer">
                                <input type="checkbox" v-model="hideYear" class="w-4 h-4 accent-teal-500" />
                                不显示年份
                            </label>
                            <button type="button" v-if="birthdateInfo" @click="deleteBirthdate" :disabled="savingBirthdate"
                                class="px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50">
                                删除生日
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 个人主页频道 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">个人主页频道</h3>
                    <button type="button" @click="openPersonalChatPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div class="w-10 h-10 shrink-0" v-if="personalChat">
                            <Avatar :photo="personalChat.photo" :title="personalChat.title"
                                :accentColorId="personalChatAccent" sizeClass="!w-10 !h-10" />
                        </div>
                        <div v-else class="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <MegaphoneIcon class="w-5 h-5 text-gray-400" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ personalChat?.title || '未设置' }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">显示在您个人主页顶部的频道</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 营业时间 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">营业时间</h3>
                    <button type="button" @click="openBusinessHoursPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <ClockIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p v-if="businessHoursLines.length" class="text-sm text-gray-800 dark:text-gray-100">{{ businessHoursLines[0] }}</p>
                            <p v-else class="text-sm text-gray-400">未设置营业时间</p>
                            <p class="text-xs text-gray-400 mt-0.5" v-if="businessHoursLines.length > 1">另有 {{ businessHoursLines.length - 1 }} 个时段</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 位置 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">位置</h3>
                    <button type="button" @click="locationVisible = true"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <MapPinIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ businessLocation?.address || '未设置位置' }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">位置修改暂未适配，请前往官方客户端</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>

                <!-- 聊天机器人 -->
                <section>
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">聊天机器人</h3>
                    <button type="button" @click="openChatbotPopup"
                        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1c] p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <BotIcon class="w-5 h-5 text-gray-400 shrink-0" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ chatbotText || '未设置' }}</p>
                            <p class="text-xs text-gray-400 mt-0.5">聊天机器人设置暂未适配，请前往官方客户端</p>
                        </div>
                        <ChevronRightIcon class="w-4 h-4 text-gray-400" />
                    </button>
                </section>
            </div>
        </div>

        <!-- 头像编辑器 -->
        <AvatarEditorDialog v-model="avatarEditorVisible" :photos="photos" :current-photo-id="user?.profile_photo?.id"
            @changed="onProfileChanged" />

        <!-- 手机号码弹窗 -->
        <ModalDialog v-model="phoneVisible" title="更改手机号码">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <PhoneIcon class="w-7 h-7" />
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    更改手机号码仅支持在官方客户端中进行。<br />出于安全考虑，第三方客户端无法修改手机号码，请前往 Telegram 官方客户端修改。
                </p>
                <button type="button" @click="goOfficialClient"
                    class="mt-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    前往官方客户端
                </button>
            </div>
        </ModalDialog>

        <!-- 用户名弹窗 -->
        <ModalDialog v-model="usernameVisible" title="用户名">
            <div class="space-y-5">
                <!-- 顶部：编辑当前用户名 -->
                <div>
                    <label class="text-xs text-gray-400">更改用户名</label>
                    <div class="mt-1 flex items-center gap-2">
                        <span class="text-gray-500 dark:text-gray-400 text-sm">@</span>
                        <input v-model="usernameInput" type="text" spellcheck="false"
                            class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            @input="checkUsernameDebounced" @keydown.enter="saveUsername" />
                        <button type="button" @click="saveUsername" :disabled="savingUsername"
                            class="px-4 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 shrink-0">
                            {{ savingUsername ? '保存中…' : '设置' }}
                        </button>
                    </div>
                    <p class="text-xs mt-1.5" :class="usernameCheckClass">{{ usernameCheckText }}</p>
                    <button v-if="editableUsername" type="button" @click="removeEditableUsername"
                        class="mt-2 text-xs text-red-500 hover:text-red-600">
                        移除当前用户名
                    </button>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p class="text-xs text-gray-400 mb-2">用户名排序（适用于多个用户名）</p>
                    <div v-if="activeUsernames.length === 0" class="text-sm text-gray-400 py-3 text-center">暂无活跃用户名</div>
                    <div v-else class="space-y-2">
                        <div v-for="(u, i) in activeUsernames" :key="u"
                            class="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                            <span class="text-sm text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">@{{ u }}</span>
                            <span v-if="i === 0" class="text-xs text-teal-500 shrink-0">主要</span>
                            <button type="button" :disabled="i === 0"
                                class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="上移" @click="moveUsername(i, -1)">
                                <ArrowUpIcon class="w-4 h-4" />
                            </button>
                            <button type="button" :disabled="i === activeUsernames.length - 1"
                                class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                title="下移" @click="moveUsername(i, 1)">
                                <ArrowDownIcon class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-3 mb-2">已停用的用户名</p>
                    <div v-if="disabledUsernames.length === 0" class="text-sm text-gray-400 py-1">暂无停用的用户名</div>
                    <div v-else class="space-y-1.5">
                        <div v-for="u in disabledUsernames" :key="u"
                            class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <span class="text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-0 truncate line-through">@{{ u }}</span>
                            <button type="button" @click="toggleUsername(u, true)"
                                class="text-xs text-teal-600 hover:text-teal-700 shrink-0">启用</button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalDialog>

        <!-- 个人主页频道弹窗 -->
        <ModalDialog v-model="personalChatVisible" title="个人主页频道">
            <div class="space-y-2">
                <p class="text-xs text-gray-400 mb-2">选择要在个人主页顶部展示的频道</p>
                <button type="button" @click="removePersonalChat"
                    class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <BanIcon class="w-4.5 h-4.5 text-gray-400" />
                    </div>
                    <span class="text-sm text-gray-700 dark:text-gray-200">移除个人主页频道</span>
                </button>
                <p v-if="suitableChatsLoading" class="text-sm text-gray-400 py-4 text-center">正在加载可选频道…</p>
                <p v-else-if="suitableChats.length === 0" class="text-sm text-gray-400 py-4 text-center">暂无可用的频道</p>
                <template v-else>
                    <button v-for="c in suitableChats" :key="c.chat_id" type="button" @click="setPersonalChat(c.chat_id)"
                        class="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        :class="c.chat_id === personalChatId ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10' : ''">
                        <div class="w-9 h-9 shrink-0">
                            <Avatar :photo="c.photo" :title="c.title" :accentColorId="c.accentId" sizeClass="!w-9 !h-9" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ c.title }}</p>

                        </div>
                        <CheckIcon v-if="c.chat_id === personalChatId" class="w-4 h-4 text-teal-500 shrink-0" />
                    </button>
                </template>
            </div>
        </ModalDialog>

        <!-- 营业时间弹窗 -->
        <ModalDialog v-model="businessHoursVisible" title="营业时间">
            <div class="space-y-4">
                <div>
                    <label class="text-xs text-gray-400">时区</label>
                    <input v-model="timeZoneInput" type="text"
                        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    <p class="text-xs text-gray-400 mt-1">需为有效的 IANA 时区标识，例如 Asia/Shanghai</p>
                </div>
                <div class="space-y-2">
                    <div v-for="(d, i) in days" :key="i"
                        class="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
                        <input type="checkbox" v-model="d.enabled"
                            class="w-4 h-4 accent-teal-500 shrink-0" :id="'bh-day-' + i" />
                        <label :for="'bh-day-' + i" class="text-sm text-gray-800 dark:text-gray-100 w-10 shrink-0">{{ d.name }}</label>
                        <TTimePicker v-if="d.enabled" v-model="d.start" format="HH:mm" placeholder="开始"
                            class="flex-1 min-w-0" />
                        <span v-if="d.enabled" class="text-gray-400 text-xs">至</span>
                        <TTimePicker v-if="d.enabled" v-model="d.end" format="HH:mm" placeholder="结束"
                            class="flex-1 min-w-0" />
                    </div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" @click="clearBusinessHours"
                        class="px-4 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        清除营业时间
                    </button>
                    <button type="button" @click="saveBusinessHours" :disabled="savingHours"
                        class="px-5 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50">
                        {{ savingHours ? '保存中…' : '保存' }}
                    </button>
                </div>
                <p v-if="hoursError" class="text-xs text-red-500">{{ hoursError }}</p>
            </div>
        </ModalDialog>

        <!-- 位置弹窗 -->
        <ModalDialog v-model="locationVisible" title="位置">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <MapPinIcon class="w-7 h-7" />
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    位置修改功能暂未适配。<br />请前往 Telegram 官方客户端修改您的商业位置信息。
                </p>
                <button type="button" @click="goOfficialClient"
                    class="mt-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    前往官方客户端
                </button>
            </div>
        </ModalDialog>

        <!-- 聊天机器人弹窗 -->
        <ModalDialog v-model="chatbotVisible" title="聊天机器人">
            <div class="flex flex-col items-center text-center py-6 gap-3">
                <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center">
                    <BotIcon class="w-7 h-7" />
                </div>
                <p v-if="chatbotText" class="text-sm text-gray-700 dark:text-gray-300">
                    当前已连接：{{ chatbotText }}
                </p>
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    聊天机器人的添加与修改暂未适配。<br />请前往 Telegram 官方客户端修改。
                </p>
                <button type="button" @click="goOfficialClient"
                    class="mt-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                    前往官方客户端
                </button>
            </div>
        </ModalDialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
    ArrowLeft as ArrowLeftIcon, ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon,
    AtSign as AtSignIcon, Bot as BotIcon, Ban as BanIcon, Calendar as CalendarIcon,
    ChevronRight as ChevronRightIcon, Check as CheckIcon, Clock as ClockIcon,
    MapPin as MapPinIcon, Megaphone as MegaphoneIcon, Phone as PhoneIcon,
} from 'lucide-vue-next';
import { DatePicker as TDatePicker, TimePicker as TTimePicker, MessagePlugin } from 'tdesign-vue-next';
import Avatar from '../../components/chat/avatar.vue';
import AvatarEditorDialog from '../../components/settings/AvatarEditorDialog.vue';
import ModalDialog from '../../components/settings/ModalDialog.vue';
import { useUserStore } from '../../store/user';
import { useUserProfileStore } from '../../store/userProfile';
import { tdlibSend } from '../../utils/tdlib';
import { ensureChat, getReactiveChat, getReactiveUser, ensureUser } from '../../utils/senderInfo';
import { formatBusinessHours } from '../../utils/businessHours';
import { confirmAndOpenExternalLink } from '../../utils/openExternalLink';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { user as TdUser, userFullInfo, chatPhoto, chat, businessOpeningHoursInterval, birthdate } from 'tdlib-types';

const router = useRouter();
const userStore = useUserStore();
const profileStore = useUserProfileStore();

const avatarEditorVisible = ref(false);
const phoneVisible = ref(false);

const user = computed<TdUser | undefined>(() => userStore.userProfile);
const myId = computed(() => user.value?.id ?? 0);
const formattedPhone = computed(() => {
    const raw = user.value?.phone_number;
    if (!raw) return '';
    try {
        const parsed = parsePhoneNumberFromString(raw);
        return parsed ? parsed.formatInternational() : raw;
    } catch {
        return raw;
    }
});
const fullInfo = computed<userFullInfo | undefined>(() => (myId.value ? profileStore.fullInfos.get(myId.value) : undefined));
const photos = computed<chatPhoto[]>(() => (myId.value ? profileStore.photos.get(myId.value) ?? [] : []));

const fullName = computed(() => [user.value?.first_name, user.value?.last_name].filter(Boolean).join(' ').trim() || '我');
// =====================================================================
// 数据加载
// =====================================================================
async function loadAll() {
    if (!user.value) await userStore.fetchUser();
    if (myId.value > 0) {
        await Promise.all([
            profileStore.fetchFullInfo(myId.value),
            profileStore.fetchPhotos(myId.value),
        ]);
    }
    initEditors();
}

async function initEditors() {
    firstName.value = user.value?.first_name ?? '';
    lastName.value = user.value?.last_name ?? '';
    bio.value = fullInfo.value?.bio?.text ?? '';
    usernameInput.value = user.value?.usernames?.editable_username ?? '';
    birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
    hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
}

onMounted(() => {
    loadAll();
    loadBioMax();
});

async function onProfileChanged() {
    await Promise.all([userStore.fetchUser(), profileStore.refreshProfile(myId.value)]);
    initEditors();
}

function goBack() {
    router.back();
}

// =====================================================================
// 姓名
// =====================================================================
const firstName = ref('');
const lastName = ref('');
const savingProfile = ref(false);

async function saveProfile() {
    const name = firstName.value.trim();
    if (!name) {
        MessagePlugin.warning('名字不能为空');
        return;
    }
    savingProfile.value = true;
    try {
        await tdlibSend({ _: 'setName', first_name: name, last_name: lastName.value.trim() });
        await tdlibSend({ _: 'setBio', bio: bio.value });
        MessagePlugin.success('个人资料已保存');
        await Promise.all([userStore.fetchUser(), profileStore.refreshProfile(myId.value)]);
        initEditors();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '保存失败');
    } finally {
        savingProfile.value = false;
    }
}

// =====================================================================
// 个人简介
// =====================================================================
const bio = ref('');
const bioMax = ref(70);

async function loadBioMax() {
    try {
        const res = (await tdlibSend({ _: 'getOption', name: 'bio_length_max' })) as { _: string; value?: number | string };
        if (res._ === 'optionValueInteger') bioMax.value = Number(res.value);
    } catch {
        bioMax.value = 70;
    }
}


// =====================================================================
// 用户名
// =====================================================================
const usernameVisible = ref(false);
const usernameInput = ref('');
const usernameCheck = ref<'' | 'checking' | 'ok' | 'occupied' | 'invalid' | 'error'>('');
const savingUsername = ref(false);
const editableUsername = computed(() => user.value?.usernames?.editable_username ?? '');
const activeUsernames = computed<string[]>(() => user.value?.usernames?.active_usernames ?? []);
const disabledUsernames = computed<string[]>(() => user.value?.usernames?.disabled_usernames ?? []);
const primaryUsername = computed(() => activeUsernames.value[0] ?? '');
const usernameSummary = computed(() => {
    const parts: string[] = [];
    if (activeUsernames.value.length) parts.push(`${activeUsernames.value.length} 个活跃`);
    if (disabledUsernames.value.length) parts.push(`${disabledUsernames.value.length} 个停用`);
    return parts.join('，') || '点击管理用户名';
});

const usernameCheckText = computed(() => {
    switch (usernameCheck.value) {
        case 'checking': return '正在检查可用性…';
        case 'ok': return '该用户名可用';
        case 'occupied': return '该用户名已被占用';
        case 'invalid': return '用户名无效';
        case 'error': return '暂时无法检查可用性';
        default: return '';
    }
});
const usernameCheckClass = computed(() => ({
    'text-teal-500': usernameCheck.value === 'ok',
    'text-red-500': usernameCheck.value === 'occupied' || usernameCheck.value === 'invalid' || usernameCheck.value === 'error',
    'text-gray-400': usernameCheck.value === 'checking',
}));

let checkTimer: ReturnType<typeof setTimeout> | null = null;

function openUsernamePopup() {
    usernameInput.value = editableUsername.value;
    usernameCheck.value = '';
    usernameVisible.value = true;
}

function checkUsernameDebounced() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(checkUsername, 500);
}

async function checkUsername() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameCheck.value = '';
        return;
    }
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(name)) {
        usernameCheck.value = 'invalid';
        return;
    }
    if (!myId.value) return;
    usernameCheck.value = 'checking';
    try {
        const res = (await tdlibSend({
            _: 'checkChatUsername',
            chat_id: myId.value,
            username: name,
        } as any)) as { _: string };
        if (res._ === 'checkChatUsernameResultOk') usernameCheck.value = 'ok';
        else if (res._ === 'checkChatUsernameResultUsernameOccupied') usernameCheck.value = 'occupied';
        else if (res._ === 'checkChatUsernameResultUsernamePurchasable') usernameCheck.value = 'ok';
        else usernameCheck.value = 'invalid';
    } catch (e: any) {
        const msg = String(e?.message ?? '');
        if (msg.includes('USERNAME_OCCUPIED') || msg.includes('OCCUPIED')) usernameCheck.value = 'occupied';
        else usernameCheck.value = 'error';
    }
}

async function saveUsername() {
    const name = usernameInput.value.trim();
    savingUsername.value = true;
    try {
        await tdlibSend({ _: 'setUsername', username: name } as any);
        MessagePlugin.success('用户名已更新');
        usernameCheck.value = '';
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '设置用户名失败');
    } finally {
        savingUsername.value = false;
    }
}

async function removeEditableUsername() {
    try {
        await tdlibSend({ _: 'setUsername', username: '' } as any);
        MessagePlugin.success('已移除用户名');
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '移除失败');
    }
}

async function moveUsername(index: number, dir: -1 | 1) {
    const list = [...activeUsernames.value];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    try {
        await tdlibSend({ _: 'reorderActiveUsernames', usernames: list } as any);
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '排序失败');
    }
}

async function toggleUsername(name: string, isActive: boolean) {
    try {
        await tdlibSend({ _: 'toggleUsernameIsActive', username: name, is_active: isActive } as any);
        await userStore.fetchUser();
    } catch (e: any) {
        MessagePlugin.error(e?.message || '操作失败');
    }
}
// =====================================================================
// 生日
// =====================================================================
const birthdateInfo = computed<birthdate | undefined>(() => fullInfo.value?.birthdate);
const birthdatePickerValue = ref('');
const hideYear = ref(false);
const savingBirthdate = ref(false);

const birthdateText = computed(() => {
    const b = birthdateInfo.value;
    if (!b) return '';
    if (b.year > 0) return `${b.year}年${b.month}月${b.day}日`;
    return `${b.month}月${b.day}日`;
});

function birthdateToPicker(b?: birthdate): string {
    if (!b) return '';
    const year = b.year > 0 ? b.year : 2000;
    return `${year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}

async function saveBirthdate(value?: string) {
    const v = value ?? birthdatePickerValue.value;
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    if (!m || !d) return;
    savingBirthdate.value = true;
    try {
        await tdlibSend({
            _: 'setBirthdate',
            birthdate: { _: 'birthdate', day: d, month: m, year: hideYear.value ? 0 : y || 0 },
        } as any);
        MessagePlugin.success('生日已保存');
        await profileStore.refreshProfile(myId.value);
    } catch (e: any) {
        MessagePlugin.error(e?.message || '保存失败');
    } finally {
        savingBirthdate.value = false;
    }
}

async function deleteBirthdate() {
    savingBirthdate.value = true;
    try {
        await tdlibSend({ _: 'setBirthdate', birthdate: null } as any);
        birthdatePickerValue.value = '';
        MessagePlugin.success('已删除生日');
        await profileStore.refreshProfile(myId.value);
    } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败');
    } finally {
        savingBirthdate.value = false;
    }
}

// =====================================================================
// 个人主页频道
// =====================================================================
const personalChatVisible = ref(false);
const personalChatId = computed(() => fullInfo.value?.personal_chat_id ?? 0);
const personalChat = computed<chat | undefined>(() => {
    const id = personalChatId.value;
    if (!id) return undefined;
    ensureChat(id).catch(() => { });
    return getReactiveChat(id);
});
const personalChatAccent = computed<number | undefined>(() => {
    const c = personalChat.value as any;
    return c?.profile_accent_color_id ?? c?.accent_color_id ?? undefined;
});

const suitableChats = ref<{ chat_id: number; title: string; username: string; photo?: any; accentId?: number }[]>([]);
const suitableChatsLoading = ref(false);

async function openPersonalChatPopup() {
    personalChatVisible.value = true;
    suitableChatsLoading.value = true;
    suitableChats.value = [];
    try {
        const res = (await tdlibSend({ _: 'getSuitablePersonalChats' })) as { chat_ids: number[] };
        const ids = res.chat_ids ?? [];
        await Promise.all(ids.map((id) => ensureChat(id).catch(() => { })));
        suitableChats.value = ids
            .map((id) => {
                const c = getReactiveChat(id) as any;
                return {
                    chat_id: id,
                    title: c?.title || String(id),
                    username: c?.usernames?.active_usernames?.[0] ?? '',
                    photo: c?.photo,
                    accentId: c?.profile_accent_color_id ?? c?.accent_color_id ?? undefined,
                };
            })
            .filter((c) => c.title);
    } catch (e) {
        console.error('load suitable personal chats failed:', e);
        MessagePlugin.error('加载可选频道失败');
    } finally {
        suitableChatsLoading.value = false;
    }
}

async function setPersonalChat(chatId: number) {
    try {
        await tdlibSend({ _: 'setPersonalChat', chat_id: chatId } as any);
        MessagePlugin.success('个人主页频道已更新');
        await profileStore.refreshProfile(myId.value);
        personalChatVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '设置失败');
    }
}

async function removePersonalChat() {
    try {
        await tdlibSend({ _: 'setPersonalChat', chat_id: 0 } as any);
        MessagePlugin.success('已移除个人主页频道');
        await profileStore.refreshProfile(myId.value);
        personalChatVisible.value = false;
    } catch (e: any) {
        MessagePlugin.error(e?.message || '移除失败');
    }
}
// =====================================================================
// 营业时间
// =====================================================================
const businessHoursVisible = ref(false);
const timeZoneInput = ref('');
const savingHours = ref(false);
const hoursError = ref('');
const days = ref<{ name: string; enabled: boolean; start: string; end: string }[]>([]);

const businessHoursLines = computed(() => formatBusinessHours(fullInfo.value?.business_info?.opening_hours));

function openBusinessHoursPopup() {
    const hours = fullInfo.value?.business_info?.opening_hours;
    timeZoneInput.value = hours?.time_zone_id || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const list = hours?.opening_hours ?? [];
    const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    days.value = names.map((name, i) => {
        const interval = list.find((iv) => Math.floor(iv.start_minute / (24 * 60)) % 7 === i);
        return {
            name,
            enabled: !!interval,
            start: interval ? minutesToHM(interval.start_minute) : '09:00',
            end: interval ? minutesToHM(interval.end_minute) : '17:00',
        };
    });
    hoursError.value = '';
    businessHoursVisible.value = true;
}

function minutesToHM(minute: number): string {
    const total = minute % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildIntervals(): businessOpeningHoursInterval[] {
    const intervals: businessOpeningHoursInterval[] = [];
    for (let i = 0; i < days.value.length; i++) {
        const d = days.value[i];
        if (!d.enabled) continue;
        const [sh, sm] = d.start.split(':').map(Number);
        const [eh, em] = d.end.split(':').map(Number);
        let start = i * 1440 + sh * 60 + sm;
        let end = i * 1440 + eh * 60 + em;
        if (end <= start) end += 1440; // 跨天
        intervals.push({ _: 'businessOpeningHoursInterval', start_minute: start, end_minute: end });
    }
    return intervals;
}

async function saveBusinessHours() {
    hoursError.value = '';
    const tz = timeZoneInput.value.trim();
    if (!tz) {
        hoursError.value = '请填写时区';
        return;
    }
    const intervals = buildIntervals();
    savingHours.value = true;
    try {
        await tdlibSend({
            _: 'setBusinessOpeningHours',
            opening_hours: {
                _: 'businessOpeningHours',
                time_zone_id: tz,
                opening_hours: intervals,
            },
        } as any);
        MessagePlugin.success('营业时间已保存');
        await profileStore.refreshProfile(myId.value);
        businessHoursVisible.value = false;
    } catch (e: any) {
        hoursError.value = e?.message || '保存失败';
    } finally {
        savingHours.value = false;
    }
}

async function clearBusinessHours() {
    savingHours.value = true;
    try {
        await tdlibSend({
            _: 'setBusinessOpeningHours',
            opening_hours: { _: 'businessOpeningHours', time_zone_id: timeZoneInput.value.trim() || 'UTC', opening_hours: [] },
        } as any);
        MessagePlugin.success('已清除营业时间');
        await profileStore.refreshProfile(myId.value);
        businessHoursVisible.value = false;
    } catch (e: any) {
        hoursError.value = e?.message || '清除失败';
    } finally {
        savingHours.value = false;
    }
}
// =====================================================================
// 位置 / 聊天机器人（未适配提示）
// =====================================================================
const locationVisible = ref(false);
const chatbotVisible = ref(false);
const chatbotText = ref('');

const businessLocation = computed(() => fullInfo.value?.business_info?.location);

async function openChatbotPopup() {
    chatbotVisible.value = true;
    chatbotText.value = '';
    try {
        const info = (await tdlibSend({ _: 'getBusinessConnectedBot' })) as { bot?: { bot_user_id?: number } };
        const botId = info?.bot?.bot_user_id;
        if (botId) {
            await ensureUser(botId);
            const u = getReactiveUser(botId);
            chatbotText.value = u ? `@${u.usernames?.active_usernames?.[0] ?? (u.first_name + ' ' + u.last_name).trim()}` : String(botId);
        }
    } catch {
        chatbotText.value = '';
    }
}



async function goOfficialClient() {
    try {
        await confirmAndOpenExternalLink('https://telegram.org');
    } catch {
        // 用户取消
    }
}

// 同步 user 变化到编辑器
watch(user, () => initEditors());
watch(fullInfo, () => {
    bio.value = fullInfo.value?.bio?.text ?? '';
    birthdatePickerValue.value = birthdateToPicker(birthdateInfo.value);
    hideYear.value = !!(birthdateInfo.value && birthdateInfo.value.year <= 0);
});
</script>
