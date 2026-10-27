<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <button type="button"
                class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold flex-1 truncate">
                {{ isNew ? t('lng_filters_new') : t('lng_filters_context_edit') }}
            </h2>
            <BaseButton type="button" :disabled="saving || loading" @click="save">
                {{ t('lng_settings_save') }}
            </BaseButton>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <LoadingSkeleton v-if="loading" variant="form" class="max-w-2xl" :rows="4"
                :label="t('lng_context_seen_loading')" />

            <!-- 选对话：页内面板，不弹窗 -->
            <div v-else-if="pickerTarget" class="max-w-2xl">
                <FolderChatPickerPanel :exclude-ids="pickerExcludeIds" @select="onPicked"
                    @cancel="pickerTarget = null" />
            </div>

            <div v-else class="max-w-2xl space-y-6">
                <!-- 名称：左边是分组图标（点击悬浮选择器），右边是单独的 emoji 选择器（插入到名称文本） -->
                <section>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        {{ t('lng_filters_new_name') }}
                    </label>
                    <div
                        class="flex items-center gap-1 pl-1.5 pr-1.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500">
                        <button ref="iconBtnEl" type="button"
                            class="w-7 h-7 shrink-0 rounded-md flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                            :class="iconPopupOpen ? 'bg-blue-50 dark:bg-blue-500/15' : ''"
                            :title="t('lng_filters_icon_header')" @click="iconPopupOpen = !iconPopupOpen">
                            <component :is="folderIconFor(displayIconName)" class="w-5 h-5" :stroke-width="1.5" />
                        </button>
                        <!-- 名称输入框：与聊天输入框同一套「透明 input + 富文本预览层」，
                             输入的自定义 emoji 在这里直接显示为动态 emoji -->
                        <div class="relative flex-1 min-w-0">
                            <div v-show="namePreviewHTML" aria-hidden="true"
                                class="absolute inset-0 pointer-events-none select-none overflow-hidden">
                                <div ref="namePreviewEl" class="folder-name-preview" v-html="namePreviewHTML"></div>
                            </div>
                            <input ref="nameInputEl" :value="draft.name" type="text" maxlength="12"
                                :placeholder="t('lng_filters_new_name')"
                                class="folder-name-input relative w-full bg-transparent outline-none text-sm px-1"
                                @input="onNameInput" @scroll="syncNamePreviewScroll" />
                        </div>
                        <button ref="nameEmojiBtnEl" type="button"
                            class="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                            :title="t('lng_article_insert_emoji')" @click="openNameEmojiPicker">
                            <SmileIcon class="w-4 h-4" />
                        </button>
                    </div>
                    <p class="mt-1 text-xs text-gray-400">{{ draft.name.length }}/12</p>
                </section>

                <!-- 包含 -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_filters_include_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mb-3">{{ t('lng_filters_include_about') }}</p>

                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800">
                        <div class="px-3 py-1">
                            <ChatTypeToggle :label="t('lng_filters_include_contacts')" v-model="draft.includeContacts" />
                            <ChatTypeToggle :label="t('lng_filters_include_non_contacts')" v-model="draft.includeNonContacts" />
                            <ChatTypeToggle :label="t('lng_filters_type_bots')" v-model="draft.includeBots" />
                            <ChatTypeToggle :label="t('lng_filters_include_groups')" v-model="draft.includeGroups" />
                            <ChatTypeToggle :label="t('lng_filters_type_channels')" v-model="draft.includeChannels" />
                        </div>
                        <div class="px-3 py-1.5">
                            <div v-for="id in draft.includeIds" :key="id"
                                class="flex items-center gap-2.5 py-1.5">
                                <Avatar :photo="chatOf(id)?.photo" :title="chatTitle(id)" sizeClass="!w-8 !h-8" />
                                <p class="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100 truncate">
                                    {{ chatTitle(id) }}
                                </p>
                                <button type="button"
                                    class="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    @click="removeIncluded(id)">
                                    <XIcon class="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <p v-if="draft.includeIds.length === 0" class="text-xs text-gray-400 py-1.5">
                                {{ t('lng_filters_no_chats') }}
                            </p>
                            <button type="button"
                                class="w-full flex items-center justify-center gap-1.5 mt-1 py-2 rounded-lg text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                @click="pickerTarget = 'include'">
                                <PlusIcon class="w-4 h-4" /> {{ t('lng_filters_add_chats') }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 排除 -->
                <section class="pb-6">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_filters_exclude_title') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mb-3">{{ t('lng_filters_exclude_about') }}</p>

                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800">
                        <div class="px-3 py-1">
                            <ChatTypeToggle :label="t('lng_filters_exclude_muted')" v-model="draft.excludeMuted" />
                            <ChatTypeToggle :label="t('lng_filters_exclude_read')" v-model="draft.excludeRead" />
                            <ChatTypeToggle :label="t('lng_filters_exclude_archived')" v-model="draft.excludeArchived" />
                        </div>
                        <div class="px-3 py-1.5">
                            <div v-for="id in draft.excludeIds" :key="id" class="flex items-center gap-2.5 py-1.5">
                                <Avatar :photo="chatOf(id)?.photo" :title="chatTitle(id)" sizeClass="!w-8 !h-8" />
                                <p class="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100 truncate">
                                    {{ chatTitle(id) }}
                                </p>
                                <button type="button"
                                    class="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    @click="removeExcluded(id)">
                                    <XIcon class="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <p v-if="draft.excludeIds.length === 0" class="text-xs text-gray-400 py-1.5">
                                {{ t('lng_filters_no_chats') }}
                            </p>
                            <button type="button"
                                class="w-full flex items-center justify-center gap-1.5 mt-1 py-2 rounded-lg text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                @click="pickerTarget = 'exclude'">
                                <PlusIcon class="w-4 h-4" /> {{ t('lng_filters_add_chats') }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- 分组标签颜色（会员在对话卡片底部显示分组标签用） -->
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_filters_tag_color_subtitle') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mb-3">{{ t('lng_filters_tag_color_about') }}</p>

                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-3 py-3">
                        <!-- 标签颜色是会员功能：非会员固定「无色」 -->
                        <template v-if="isPremium">
                            <div class="flex items-center gap-2 flex-wrap">
                                <button type="button"
                                    class="w-7 h-7 rounded-full border flex items-center justify-center transition-transform hover:scale-105"
                                    :class="draft.colorId === -1 ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-300 dark:border-gray-600'"
                                    :title="t('lng_filters_tag_color_no')" @click="draft.colorId = -1">
                                    <XIcon class="w-3.5 h-3.5 text-gray-400" />
                                </button>
                                <button v-for="(color, idx) in FOLDER_TAG_COLORS" :key="color" type="button"
                                    class="w-7 h-7 rounded-full border transition-transform hover:scale-105"
                                    :class="draft.colorId === idx ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-transparent'"
                                    :style="{ backgroundColor: color }" :title="`${idx + 1}`"
                                    @click="draft.colorId = idx" />
                            </div>
                        </template>
                        <template v-else>
                            <p class="text-xs text-amber-600 dark:text-amber-400">
                                {{ t('lng_sr_folder_locked', { text: t('lng_filters_tag_color_subtitle') }) }}
                            </p>
                        </template>
                    </div>
                </section>

                <!-- 分享分组（邀请链接，仅已保存的分组） -->
                <section v-if="!isNew" class="pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('lng_filters_link') }}
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mb-3">{{ t('lng_filters_link_about') }}</p>

                    <div
                        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md divide-y divide-gray-100 dark:divide-gray-800">
                        <div v-for="link in inviteLinks" :key="link.invite_link" class="flex items-center gap-2 px-3 py-2.5">
                            <LinkIcon class="w-4 h-4 text-gray-400 shrink-0" />
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ link.invite_link }}</p>
                                <p class="text-xs text-gray-400 mt-0.5">
                                    {{ tdPlural('lng_filters_chats_count', link.chat_ids?.length ?? 0) }}
                                </p>
                            </div>
                            <button type="button"
                                class="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                :title="t('lng_context_copy_link')" @click="copyLink(link.invite_link)">
                                <CopyIcon class="w-4 h-4" />
                            </button>
                            <button type="button"
                                class="p-1.5 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                                :title="t('lng_selected_delete')" @click="removeLink(link.invite_link)">
                                <Trash2Icon class="w-4 h-4" />
                            </button>
                        </div>
                        <div class="px-3 py-2">
                            <button type="button" :disabled="sharing"
                                class="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                                @click="createLink">
                                <PlusIcon class="w-4 h-4" /> {{ t('lng_filters_link_create') }}
                            </button>
                            <p class="mt-1 text-xs text-gray-400">{{ t('lng_filters_link_cant') }}</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <!-- 分组图标选择器：悬浮弹窗，只有 TDLib 图标网格 -->
        <FloatingPanel v-model="iconPopupOpen" :anchor="iconBtnEl" :width="300" :height="220">
            <FolderIconPicker :icon-name="draft.iconName" @pick-icon="pickIcon" />
        </FloatingPanel>

        <!-- 名称 emoji 选择器：单独的悬浮弹窗，选中的 emoji 插入名称文本 -->
        <FloatingPanel v-model="nameEmojiOpen" :anchor="nameEmojiBtnEl" :width="320" :height="360">
            <EmojiDrawer :is-premium="isPremium" class="h-full" @pick-emoji="insertNameEmoji"
                @pick-custom-emoji="insertNameCustomEmoji" />
        </FloatingPanel>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, onActivated } from 'vue';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
    ChevronLeftIcon, X as XIcon, Plus as PlusIcon, Smile as SmileIcon,
    Link as LinkIcon, Copy as CopyIcon, Trash2 as Trash2Icon,
} from 'lucide-vue-next';
import type { chat, chatFolder, chatFolderInviteLink, chatPhotoInfo } from 'tdlib-types';
import BaseButton from '../../components/ui/button/BaseButton.vue';
import ChatTypeToggle from '../../components/ui/toggle/ChatTypeToggle.vue';
import FloatingPanel from '../../components/ui/FloatingPanel.vue';
import Avatar from '../../components/chat/avatar.vue';
import EmojiDrawer from '../../components/chat/ChatDetail/stickerPanel/EmojiDrawer.vue';
import FolderChatPickerPanel from '../../components/settings/FolderChatPickerPanel.vue';
import FolderIconPicker from '../../components/settings/FolderIconPicker.vue';
import { folderIconFor } from '../../utils/folderIcons';
import {
    FOLDER_TAG_COLORS,
    buildNameEntities,
    collectNameCustomEmoji,
    folderChatIdsAll,
    splitFolderChatIds,
} from '../../utils/chatFolders';
import { renderEntitiesHTML } from '../../utils/textFormatters';
import { resolveCustomEmojiSrc } from '../../utils/customEmojiPreview';
import { useChatStore } from '../../store/chat';
import { useUserStore } from '../../store/user';
import { tdlibSend } from '../../utils/tdlib';
import { toast } from '../../utils/toast';
import { tdPlural } from '../../utils/tdLang';
import { ensureChat, getReactiveChat } from '../../utils/senderInfo';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();

const folderId = computed(() => {
    const raw = route.params.folderId;
    const id = typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
});
const isNew = computed(() => folderId.value === null);

interface FolderDraft {
    name: string;
    iconName: string;
    colorId: number;
    isShareable: boolean;
    /** 置顶对话：仍属于「包含」，保存时单独回填 */
    pinnedIds: number[];
    includeContacts: boolean;
    includeNonContacts: boolean;
    includeBots: boolean;
    includeGroups: boolean;
    includeChannels: boolean;
    excludeMuted: boolean;
    excludeRead: boolean;
    excludeArchived: boolean;
    /** 包含 / 排除的对话 id（状态以 id 为准：对话详情加载失败也不会丢成员） */
    includeIds: number[];
    excludeIds: number[];
}

function emptyDraft(): FolderDraft {
    return {
        name: '',
        iconName: '',
        colorId: -1,
        isShareable: false,
        pinnedIds: [],
        includeContacts: false,
        includeNonContacts: false,
        includeBots: false,
        includeGroups: false,
        includeChannels: false,
        excludeMuted: false,
        excludeRead: false,
        excludeArchived: false,
        includeIds: [],
        excludeIds: [],
    };
}

const draft = reactive<FolderDraft>(emptyDraft());
/**
 * 自动图标（未手动选择）时 chatFolder.icon 为 null，TDLib 不下发名字，
 * 需要用 getChatFolderDefaultIconName 算出分组栏实际显示的默认图标名。
 */
const defaultIconName = ref('');
/** 顶部按钮显示：手动选的优先，否则用 TDLib 算出的默认图标（与分组栏一致） */
const displayIconName = computed(() => draft.iconName || defaultIconName.value);
/** 兜底展示：store 里没有的对话（如深翻页后未加载）通过 getChat 补一次 */
const extraChats = reactive<Record<number, chat>>({});
const loading = ref(false);
const saving = ref(false);
const inviteLinks = ref<chatFolderInviteLink[]>([]);
const sharing = ref(false);

const userStore = useUserStore();
const isPremium = computed(() => !!userStore.userProfile?.is_premium);

// ---- 悬浮选择器 ----
const iconPopupOpen = ref(false);
const nameEmojiOpen = ref(false);
const iconBtnEl = ref<HTMLElement | null>(null);
const nameEmojiBtnEl = ref<HTMLElement | null>(null);
const nameInputEl = ref<HTMLInputElement | null>(null);

// ---- 名称里的自定义 emoji（会员动态 emoji）：文本保留 fallback 字符，实体在保存时重建 ----
const nameCustom = ref<{ alt: string; id: string }[]>([]);

/**
 * 名称预览层 HTML：与聊天输入框同一套实现——input 文字透明，由预览层绘制，
 * 自定义 emoji 渲染成 <img>/<video>（下载完成自动升级），普通 emoji 走系统字体。
 */
const namePreviewHTML = computed(() =>
    renderEntitiesHTML(draft.name, [], {
        customEmojis: nameCustom.value,
        customEmojiSrc: (id) => resolveCustomEmojiSrc(id),
    }));
const namePreviewEl = ref<HTMLElement | null>(null);

/**
 * 手动同步文本（不用 v-model）：输入法组合期间 v-model 不更新，而预览层是唯一可见文字，
 * 必须像聊天输入框那样直接读 DOM 值，否则拼音会「看不见」。
 */
function onNameInput(e: Event) {
    draft.name = (e.target as HTMLInputElement).value;
}

/** 名称过长横向滚动时同步预览层偏移，避免装饰错位 */
function syncNamePreviewScroll() {
    const el = nameInputEl.value;
    const inner = namePreviewEl.value;
    if (el && inner) inner.scrollLeft = el.scrollLeft;
}

/** 名称下方的图标说明：普通 emoji / TDLib 图标名 / 自动 */
// ---- 对话选择面板（页内，不弹窗） ----
const pickerTarget = ref<'include' | 'exclude' | null>(null);
const pickerExcludeIds = computed(() =>
    pickerTarget.value === 'include' ? draft.includeIds : draft.excludeIds,
);

/** 页面被 KeepAlive 缓存：每次进入都重新拉一遍分组，避免显示上一次的旧 draft */
onActivated(() => {
    reset();
    void load();
});

function reset() {
    Object.assign(draft, emptyDraft());
    for (const key of Object.keys(extraChats)) delete extraChats[Number(key)];
    pickerTarget.value = null;
    iconPopupOpen.value = false;
    nameEmojiOpen.value = false;
    nameCustom.value = [];
    inviteLinks.value = [];
    defaultIconName.value = '';
}

/** 自动图标实际显示名（chatFolder.icon 为 null 时 TDLib 不下发，要按分组内容算一次） */
async function resolveDefaultIconName(folder: unknown): Promise<string> {
    try {
        const res = await tdlibSend({ _: 'getChatFolderDefaultIconName', folder } as any) as any;
        return res?.name ?? '';
    } catch {
        return '';
    }
}

async function load() {
    if (folderId.value === null) {
        // 新建：没有已存分组，按当前草稿算一次自动图标
        defaultIconName.value = await resolveDefaultIconName(buildFolder());
        return;
    }
    loading.value = true;
    try {
        const folder = await tdlibSend({ _: 'getChatFolder', chat_folder_id: folderId.value } as any) as any as chatFolder;
        const ids = folderChatIdsAll(folder);
        const folderName = folder.name?.text;
        draft.name = folderName?.text ?? '';
        draft.iconName = folder.icon?.name ?? '';
        // 未手动选过图标的分组 icon 为 null：不补默认名的话，所有自动分组都会显示成同一个兜底图标
        defaultIconName.value = draft.iconName ? '' : await resolveDefaultIconName(folder);
        // 标签颜色是会员功能：非会员一律按「无色」处理，保存时也写 -1
        draft.colorId = isPremium.value ? folder.color_id : -1;
        draft.isShareable = folder.is_shareable;
        draft.pinnedIds = ids.pinned;
        draft.includeContacts = folder.include_contacts;
        draft.includeNonContacts = folder.include_non_contacts;
        draft.includeBots = folder.include_bots;
        draft.includeGroups = folder.include_groups;
        draft.includeChannels = folder.include_channels;
        draft.excludeMuted = folder.exclude_muted;
        draft.excludeRead = folder.exclude_read;
        draft.excludeArchived = folder.exclude_archived;
        draft.includeIds = ids.includeAll;
        draft.excludeIds = ids.excluded;
        nameCustom.value = isPremium.value
            ? collectNameCustomEmoji(draft.name, (folderName?.entities ?? []) as any)
            : [];
        await Promise.all([resolveChats([...ids.includeAll, ...ids.excluded]), loadInviteLinks()]);
    } catch (e: any) {
        toast.error(e?.message || t('context.actionFailed'));
    } finally {
        loading.value = false;
    }
}

// ---- 图标（悬浮弹窗选择） ----
function pickIcon(name: string) {
    draft.iconName = name;
    iconPopupOpen.value = false;
}

// ---- 名称 emoji（右端独立选择器，插入到名称文本） ----
/** 打开时记录光标位置，插入后就插在这里 */
let nameInsertPos = 0;

function openNameEmojiPicker() {
    nameInsertPos = nameInputEl.value?.selectionStart ?? draft.name.length;
    nameEmojiOpen.value = true;
}

/** 把文本插到光标处（受 12 字符上限约束），并回填光标 */
function insertNameText(text: string) {
    const pos = Math.min(nameInsertPos, draft.name.length);
    const next = `${draft.name.slice(0, pos)}${text}${draft.name.slice(pos)}`;
    if (next.length > 12) {
        toast.error(t('folderSettings.nameInvalid'));
        return;
    }
    draft.name = next;
    nameInsertPos = pos + text.length;
    void nextTick(() => {
        nameInputEl.value?.focus();
        nameInputEl.value?.setSelectionRange(nameInsertPos, nameInsertPos);
    });
}

function insertNameEmoji(emoji: string) {
    insertNameText(emoji);
    nameEmojiOpen.value = false;
}

/** 会员动态 emoji：取它的 fallback emoji 作为文本，实体指向动态 emoji id */
async function insertNameCustomEmoji(id: string) {
    if (!isPremium.value) {
        toast.error(t('emojiPanel.needsPremium'));
        return;
    }
    let alt = '\uFFFC';
    try {
        const res = await tdlibSend({ _: 'getCustomEmojiStickers', custom_emoji_ids: [id] } as any) as any;
        const sticker = res?.stickers?.[0];
        if (sticker?.emoji) alt = sticker.emoji;
    } catch {
        // 取不到 fallback 时用占位符，实体仍能把动态 emoji 渲染出来
    }
    insertNameText(alt);
    nameCustom.value = [...nameCustom.value, { alt, id }];
    nameEmojiOpen.value = false;
}

// ---- 分享分组（邀请链接） ----
async function loadInviteLinks() {
    if (folderId.value === null) return;
    try {
        const res = await tdlibSend({ _: 'getChatFolderInviteLinks', chat_folder_id: folderId.value } as any) as any;
        inviteLinks.value = res?.invite_links ?? [];
    } catch (e) {
        console.warn('Failed to load folder invite links:', e);
        inviteLinks.value = [];
    }
}

/**
 * 新建分享链接：聊天列表用 getChatsForChatFolderInviteLink 给出的可分享对话。
 * TDLib 只允许「只含指定对话」的分组创建链接，含排除项或类型规则时会报错，直接提示错误信息。
 */
async function createLink() {
    if (folderId.value === null || sharing.value) return;
    sharing.value = true;
    try {
        const suitable = await tdlibSend({ _: 'getChatsForChatFolderInviteLink', chat_folder_id: folderId.value } as any) as any;
        const chatIds: number[] = suitable?.chat_ids ?? [];
        if (chatIds.length === 0) {
            toast.error(t('lng_filters_link_no_about'));
            return;
        }
        await tdlibSend({
            _: 'createChatFolderInviteLink',
            chat_folder_id: folderId.value,
            name: '',
            chat_ids: chatIds,
        } as any);
        draft.isShareable = true;
        await loadInviteLinks();
    } catch (e: any) {
        toast.error(e?.message || t('context.actionFailed'));
    } finally {
        sharing.value = false;
    }
}

async function removeLink(inviteLink: string) {
    if (folderId.value === null) return;
    if (!window.confirm(t('lng_filters_link_delete_sure'))) return;
    try {
        await tdlibSend({
            _: 'deleteChatFolderInviteLink',
            chat_folder_id: folderId.value,
            invite_link: inviteLink,
        } as any);
        await loadInviteLinks();
    } catch (e: any) {
        toast.error(e?.message || t('context.actionFailed'));
    }
}

async function copyLink(inviteLink: string) {
    try {
        await navigator.clipboard.writeText(inviteLink);
        toast.success(t('context.copied'));
    } catch {
        toast.error(t('context.copyFailed'));
    }
}

/** 补齐 store 里没有的对话数据，只用于渲染（成员 id 已单独保存） */
async function resolveChats(ids: number[]) {
    const missing = ids.filter((id) => !chatStore.chats[id] && !extraChats[id]);
    await Promise.all(missing.map((id) => ensureChat(id)));
    for (const id of missing) {
        const c = getReactiveChat(id);
        if (c && c.title) extraChats[id] = c;
    }
}

function chatOf(id: number): { photo?: chatPhotoInfo } | undefined {
    return chatStore.chats[id] ?? extraChats[id];
}

function chatTitle(id: number): string {
    return chatStore.chats[id]?.title || extraChats[id]?.title || `#${id}`;
}

/** 同一个对话不能同时出现在包含与排除里：加到一侧就从另一侧移除 */
function onPicked(ids: number[]) {
    const target = pickerTarget.value;
    pickerTarget.value = null;
    if (!target) return;
    if (target === 'include') {
        draft.excludeIds = draft.excludeIds.filter((id) => !ids.includes(id));
        draft.includeIds = [...new Set([...draft.includeIds, ...ids])];
    } else {
        draft.includeIds = draft.includeIds.filter((id) => !ids.includes(id));
        draft.excludeIds = [...new Set([...draft.excludeIds, ...ids])];
    }
    void resolveChats(ids);
}

function removeIncluded(id: number) {
    draft.includeIds = draft.includeIds.filter((x) => x !== id);
    draft.pinnedIds = draft.pinnedIds.filter((x) => x !== id);
}

function removeExcluded(id: number) {
    draft.excludeIds = draft.excludeIds.filter((x) => x !== id);
}

/** 组装 chatFolder；name 走 formattedText（TDLib 要求 1-12 字符，实体只含自定义 emoji） */
function buildFolder() {
    const ids = splitFolderChatIds(draft.pinnedIds, draft.includeIds, draft.excludeIds);
    const text = draft.name.trim();
    // 名称里的自定义 emoji 实体按 trim 后的文本重算，避免首尾空格让 offset 偏移；
    // 非会员不允许自定义 emoji，实体一律清空
    const entities = isPremium.value
        ? buildNameEntities(text, nameCustom.value).map((e) => ({
            _: 'textEntity',
            offset: e.offset,
            length: e.length,
            type: { _: 'textEntityTypeCustomEmoji', custom_emoji_id: e.customEmojiId },
        }))
        : [];
    return {
        _: 'chatFolder',
        name: {
            _: 'chatFolderName',
            text: { _: 'formattedText', text, entities },
            animate_custom_emoji: true,
        },
        icon: draft.iconName ? { _: 'chatFolderIcon', name: draft.iconName } : null,
        // 标签颜色是会员功能：非会员固定 -1（无色）
        color_id: isPremium.value ? draft.colorId : -1,
        is_shareable: draft.isShareable,
        pinned_chat_ids: ids.pinned,
        included_chat_ids: ids.included,
        excluded_chat_ids: ids.excluded,
        include_contacts: draft.includeContacts,
        include_non_contacts: draft.includeNonContacts,
        include_bots: draft.includeBots,
        include_groups: draft.includeGroups,
        include_channels: draft.includeChannels,
        exclude_muted: draft.excludeMuted,
        exclude_read: draft.excludeRead,
        exclude_archived: draft.excludeArchived,
    };
}

const hasIncludeRule = computed(() =>
    draft.includeIds.length > 0 || draft.includeContacts || draft.includeNonContacts ||
    draft.includeBots || draft.includeGroups || draft.includeChannels,
);

async function save() {
    if (saving.value) return;
    const name = draft.name.trim();
    if (name.length === 0 || name.length > 12) {
        toast.error(t('folderSettings.nameInvalid'));
        return;
    }
    if (!hasIncludeRule.value) {
        toast.error(t('lng_filters_empty'));
        return;
    }
    saving.value = true;
    try {
        const folder = buildFolder();
        if (folderId.value !== null) {
            await tdlibSend({ _: 'editChatFolder', chat_folder_id: folderId.value, folder } as any);
            toast.success(t('lng_filters_updated_title', { folder: name }));
        } else {
            await tdlibSend({ _: 'createChatFolder', folder } as any);
            toast.success(t('lng_filters_added_title', { folder: name }));
        }
        router.replace('/home/settings/folders');
    } catch (e: any) {
        toast.error(e?.message || t('context.actionFailed'));
    } finally {
        saving.value = false;
    }
}

function goBack() {
    router.back();
}
</script>

<style scoped>
/* ---- 名称输入框：与聊天输入框同一套「文字透明 + 预览层绘制」 ---- */
/* input 文字透明，只保留光标与选区；真实文字（含自定义 emoji 动图）由预览层绘制 */
.folder-name-input {
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: #1f2937;
}

.folder-name-input::placeholder {
    color: rgba(128, 128, 128, 0.6);
    -webkit-text-fill-color: rgba(128, 128, 128, 0.6);
}

:global(html.dark .folder-name-input) {
    caret-color: #e5e7eb;
}

.folder-name-preview {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 0.25rem;
    /* = px-1 */
    font-size: 0.875rem;
    /* text-sm */
    line-height: 1.25rem;
    color: #1f2937;
    white-space: pre;
    overflow: hidden;
}

:global(html.dark .folder-name-preview) {
    color: #e5e7eb;
}

/* v-html 注入的节点不带 scoped 属性，必须 :deep() */
.folder-name-preview :deep(.mi-emoji) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    vertical-align: -0.1em;
    object-fit: contain;
    pointer-events: none;
}

.folder-name-preview :deep(video.mi-emoji) {
    background: transparent;
    border: none;
}

/* 自定义 emoji 媒体未就绪时的占位：与 emoji 同宽，避免光标跳动 */
.folder-name-preview :deep(.mi-ce-loading) {
    display: inline-block;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
    border-radius: 0.25rem;
    background: rgba(128, 128, 128, 0.25);
    animation: folder-ce-pulse 1.2s ease-in-out infinite;
    pointer-events: none;
}

@keyframes folder-ce-pulse {

    0%,
    100% {
        opacity: 0.5;
    }

    50% {
        opacity: 1;
    }
}
</style>
