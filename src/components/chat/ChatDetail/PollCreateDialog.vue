<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_polls_create_title')" @update:model-value="close">
        <div class="space-y-4">
            <!-- 问题 -->
            <div>
                <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('lng_polls_create_question') }}
                </label>
                <PollRichInput ref="questionRef" v-model="question.text" v-model:custom-emojis="question.emojis"
                    :maxlength="QUESTION_MAX" :placeholder="t('lng_polls_create_question_placeholder')" trailing
                    @update:model-value="markInteracted">
                    <template #trailing>
                        <button type="button" :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                            @mousedown.prevent @click="openEmojiPicker({ kind: 'question' }, $event)">
                            <SmileIcon class="h-4 w-4" />
                        </button>
                    </template>
                </PollRichInput>
                <div class="mt-0.5 flex justify-end">
                    <span class="text-[11px] leading-none tabular-nums text-gray-400">{{ question.text.length }}/{{ QUESTION_MAX }}</span>
                </div>
                <p v-if="questionError" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ questionError }}</p>
            </div>

            <!-- 简介 -->
            <div>
                <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('lng_polls_create_description_placeholder') }}
                </label>
                <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                        <PollRichInput ref="descriptionRef" v-model="description.text"
                            v-model:custom-emojis="description.emojis" :maxlength="descriptionMax" multiline :rows="2"
                            :placeholder="t('lng_polls_create_description_placeholder')" trailing
                            @update:model-value="markInteracted">
                            <template #trailing>
                                <button type="button" :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                                    class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                    @mousedown.prevent @click="openEmojiPicker({ kind: 'description' }, $event)">
                                    <SmileIcon class="h-4 w-4" />
                                </button>
                            </template>
                        </PollRichInput>
                        <div class="mt-0.5 flex justify-end">
                            <span class="text-[11px] leading-none tabular-nums text-gray-400">{{ description.text.length }}/{{ descriptionMax }}</span>
                        </div>
                    </div>
                    <button type="button" :aria-label="t('lng_article_insert_media')" :title="t('lng_article_insert_media')"
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        @mousedown.prevent @click="openMediaMenu({ kind: 'description' }, $event)">
                        <PaperclipIcon class="h-4 w-4" />
                    </button>
                </div>

                <!-- 简介媒体：图片 / 视频 / 音乐 / 位置 -->
                <div v-if="descriptionMedia"
                    class="mt-1.5 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800/60">
                    <div class="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
                        <img v-if="isImageMedia(descriptionMedia)" :src="mediaPreview(descriptionMedia)" alt=""
                            class="h-full w-full object-cover" />
                        <video v-else-if="isVideoMedia(descriptionMedia)" :src="mediaPreview(descriptionMedia)"
                            muted playsinline preload="metadata" class="h-full w-full object-cover" />
                        <div v-else-if="descriptionMedia.kind === 'location'"
                            class="pointer-events-none h-full w-full">
                            <PollLocationThumb :location="descriptionMedia.location" :chat-id="chat?.id"
                                :size="36" />
                        </div>
                        <div v-else class="flex h-full w-full items-center justify-center">
                            <MusicIcon class="h-4 w-4 text-gray-400" />
                        </div>
                    </div>
                    <span class="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                        {{ descriptionMedia.name }}
                    </span>
                    <button type="button" :aria-label="t('lng_box_remove')" :title="t('lng_box_remove')"
                        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-red-500 dark:hover:bg-gray-700"
                        @click="descriptionMedia = null">
                        <XIcon class="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <!-- 选项：拖动排序 + 行内媒体，贴合 Android 投票的列表样式 -->
            <div>
                <p class="mb-1 text-sm font-medium text-blue-500">
                    {{ t('lng_polls_create_options') }}
                </p>

                <VueDraggable v-model="options" :animation="150" handle=".poll-option-handle"
                    class="divide-y divide-gray-200 dark:divide-gray-700">
                    <div v-for="option in options" :key="option.id"
                        class="flex items-center gap-2 py-2" @focusin="activeOptionId = option.id"
                        @click="activeOptionId = option.id">
                        <!-- 拖动排序手柄 -->
                        <button type="button" :aria-label="t('poll.reorder')" :title="t('poll.reorder')"
                            class="poll-option-handle flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 active:cursor-grabbing">
                            <MenuIcon class="h-4 w-4" />
                        </button>

                        <!-- 测验：正确项选择；多选时方框，否则圆圈 -->
                        <button v-if="quiz" type="button" role="checkbox" :aria-checked="isCorrect(option)"
                            :aria-label="t('lng_polls_create_set_correct_answer')"
                            class="flex h-6 w-6 shrink-0 items-center justify-center border transition-colors"
                            :class="[
                                multiple ? 'rounded-[5px]' : 'rounded-full',
                                isCorrect(option)
                                    ? 'border-blue-500 bg-blue-500 text-white'
                                    : 'border-gray-300 text-transparent hover:border-blue-400 dark:border-gray-600',
                            ]"
                            @click.stop="toggleCorrect(option.id)">
                            <CheckIcon class="h-3.5 w-3.5" :stroke-width="3" />
                        </button>

                        <PollRichInput :ref="(el) => setOptionRef(option.id, el)" v-model="option.text"
                            v-model:custom-emojis="option.emojis" :maxlength="OPTION_MAX" plain
                            :trailing="activeOptionId === option.id" :placeholder="t('lng_polls_add_option_placeholder')"
                            @update:model-value="markInteracted" @keydown.enter.prevent="onOptionEnter(option)">
                            <!-- emoji 按钮内嵌在当前行输入框右侧，避免每行右侧过挤 -->
                            <template #trailing>
                                <button v-if="activeOptionId === option.id" type="button"
                                    :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                                    class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                    @mousedown.prevent
                                    @click.stop="openEmojiPicker({ kind: 'option', optionId: option.id }, $event)">
                                    <SmileIcon class="h-4 w-4" />
                                </button>
                            </template>
                        </PollRichInput>

                        <!-- 媒体方块：图片 / 贴纸 / 位置 / 链接；无媒体且当前行时显示回形针入口 -->
                        <button v-if="option.media" type="button" :aria-label="t('lng_article_insert_media')"
                            :title="t('lng_article_insert_media')"
                            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                            @mousedown.prevent @click.stop="openMediaMenu({ kind: 'option', optionId: option.id }, $event)">
                            <img v-if="isImageMedia(option.media)" :src="mediaPreview(option.media)" alt=""
                                class="h-full w-full object-cover" />
                            <video v-else-if="isVideoMedia(option.media)" :src="mediaPreview(option.media)"
                                muted playsinline preload="metadata"
                                class="h-full w-full object-cover" />
                            <div v-else-if="option.media.kind === 'sticker'"
                                class="pointer-events-none flex h-full w-full items-center justify-center p-1">
                                <StickerMediaItem :item="option.media.sticker" kind="sticker" :size="40" />
                            </div>
                            <PollLocationThumb v-else-if="option.media.kind === 'location'"
                                :location="option.media.location" :chat-id="chat?.id" :size="48" />
                            <Link2Icon v-else class="h-5 w-5 text-gray-500" />
                        </button>
                        <button v-else-if="activeOptionId === option.id" type="button"
                            :aria-label="t('lng_article_insert_media')" :title="t('lng_article_insert_media')"
                            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-gray-600"
                            @mousedown.prevent @click.stop="openMediaMenu({ kind: 'option', optionId: option.id }, $event)">
                            <PaperclipIcon class="h-4 w-4" />
                        </button>
                    </div>
                </VueDraggable>

                <p v-if="optionsError" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ optionsError }}</p>

                <button type="button" :disabled="options.length >= maxAnswers" @click="addOption"
                    class="flex w-full items-center gap-2 py-2 text-left text-blue-500 transition-opacity disabled:cursor-not-allowed disabled:opacity-50">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                        <PlusIcon class="h-3.5 w-3.5" />
                    </span>
                    <span class="text-[13px] font-medium">{{ t('lng_polls_create_option_add') }}</span>
                </button>

                <template v-if="quiz">
                    <p class="mt-1.5 text-xs text-gray-400">{{ t('lng_polls_create_hint') }}</p>
                    <p v-if="correctError" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ correctError }}</p>
                </template>
            </div>

            <!-- 设置 -->
            <div>
                <p class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('lng_polls_create_settings') }}
                </p>
                <div
                    class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-700/60 dark:border-gray-700">
                    <!-- 频道里匿名是强制的，Android 直接隐藏这一行 -->
                    <PollToggleRow v-if="!isChannel" v-model="anonymous" :label="t('lng_polls_create_anonymous')"
                        @update:model-value="markInteracted" />

                    <PollToggleRow v-model="multiple" :label="t('lng_polls_create_allow_multiple_answers')"
                        @update:model-value="markInteracted" />

                    <PollToggleRow v-if="!isChannel" v-model="allowAdding"
                        :label="t('lng_polls_create_allow_adding_options')" :disabled="quiz || anonymous"
                        @update:model-value="markInteracted" />

                    <PollToggleRow v-if="!quiz" v-model="revoting" :label="t('lng_polls_create_allow_revoting')"
                        @update:model-value="markInteracted" />

                    <PollToggleRow v-model="shuffle" :label="t('lng_polls_create_shuffle_options')"
                        @update:model-value="markInteracted" />

                    <PollToggleRow v-model="quiz" :label="t('lng_polls_create_quiz_mode')"
                        @update:model-value="markInteracted" />

                    <template v-if="isChannel">
                        <PollToggleRow v-model="membersOnly"
                            :label="t('lng_polls_create_restrict_to_subscribers')"
                            @update:model-value="markInteracted" />
                        <PollToggleRow v-model="limitCountry" :label="t('lng_polls_create_limit_by_country')"
                            @update:model-value="markInteracted" />
                        <button v-if="limitCountry" type="button"
                            class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                            @click="countryOpen = true">
                            <span class="text-sm text-gray-800 dark:text-gray-100">
                                {{ t('lng_polls_create_allowed_countries') }}
                            </span>
                            <span class="min-w-0 truncate text-xs text-gray-400">
                                {{ countries.length ? tdPlural('lng_polls_create_countries_count', countries.length) : t('lng_polls_create_choose_country') }}
                            </span>
                        </button>
                    </template>

                    <div class="flex items-center justify-between gap-3 px-3 py-2.5">
                        <p class="text-sm text-gray-800 dark:text-gray-100">
                            {{ t('lng_polls_create_limit_duration') }}
                        </p>
                        <SelectMenu v-model="duration" :options="durationOptions" size="sm" class="w-36 shrink-0" />
                    </div>

                    <PollToggleRow v-if="duration !== '0'" v-model="hideResults"
                        :label="t('lng_polls_create_hide_results')"
                        @update:model-value="markInteracted" />
                </div>
                <p v-if="countriesError" class="mt-1 text-xs text-red-500 dark:text-red-400">{{ countriesError }}</p>
            </div>

            <!-- 测验解析 -->
            <div v-if="quiz">
                <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('lng_polls_solution_title') }}
                </label>
                <PollRichInput ref="solutionRef" v-model="solution.text"
                    v-model:custom-emojis="solution.emojis" :maxlength="SOLUTION_MAX" :max-lines="3" multiline
                    :rows="2" :placeholder="t('lng_polls_solution_placeholder')" trailing
                    @update:model-value="markInteracted">
                    <template #trailing>
                        <button type="button" :aria-label="t('lng_article_insert_emoji')" :title="t('lng_article_insert_emoji')"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                            @mousedown.prevent @click="openEmojiPicker({ kind: 'solution' }, $event)">
                            <SmileIcon class="h-4 w-4" />
                        </button>
                    </template>
                </PollRichInput>
                <div class="mt-0.5 flex justify-end">
                    <span class="text-[11px] leading-none tabular-nums text-gray-400">{{ solution.text.length }}/{{ SOLUTION_MAX }}</span>
                </div>
            </div>
        </div>

        <template #footer>
            <BaseButton type="button" variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton type="button" size="sm" :disabled="!isValid" @click="submit">
                {{ t('lng_polls_create_button') }}
            </BaseButton>
        </template>

        <CountrySelectDialog v-model="countryOpen" :selected="countries" :max="maxCountries"
            @submit="onCountriesSelected" />

        <!-- 选项媒体菜单：只给图片 / 贴纸 / 位置 / 链接 -->
        <Teleport to="body">
            <div v-if="mediaMenu" ref="mediaMenuRef"
                class="fixed z-[10040] w-44 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-gray-900"
                :style="mediaMenu.style" @pointerdown.stop>
                <button type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="chooseMedia('gallery')">
                    <ImageIcon class="h-4 w-4 text-gray-400" />
                    {{ t('chat.photosAndVideos') }}
                </button>
                <button v-if="mediaMenu?.target.kind === 'option'" type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="chooseMedia('sticker')">
                    <StickerIcon class="h-4 w-4 text-gray-400" />
                    {{ t('lng_in_dlg_sticker') }}
                </button>
                <button v-if="mediaMenu?.target.kind === 'description'" type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="chooseMedia('audio')">
                    <MusicIcon class="h-4 w-4 text-gray-400" />
                    {{ t('lng_all_music') }}
                </button>
                <button type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="chooseMedia('location')">
                    <MapPinIcon class="h-4 w-4 text-gray-400" />
                    {{ t('lng_maps_point') }}
                </button>
                <button v-if="mediaMenu?.target.kind === 'option'" type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    @click="chooseMedia('link')">
                    <Link2Icon class="h-4 w-4 text-gray-400" />
                    {{ t('lng_polls_create_option_link') }}
                </button>
                <button v-if="mediaMenuHasMedia()" type="button"
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    @click="chooseMedia('remove')">
                    <XIcon class="h-4 w-4" />
                    {{ t('lng_box_remove') }}
                </button>
            </div>
        </Teleport>

        <!-- 选项贴纸选择器 -->
        <Teleport to="body">
            <div v-if="stickerOpen" ref="stickerPanelRef"
                class="fixed z-[10050] flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900"
                :style="stickerStyle" @pointerdown.stop>
                <StickerDrawer @pick-sticker="onPickSticker" />
            </div>
        </Teleport>

        <!-- 选项位置 / 链接；简介位置 -->
        <LocationPickerDialog v-model="optionLocationOpen" :chat-id="chat?.id" @submit="onOptionLocation" />
        <LocationPickerDialog v-model="descriptionLocationOpen" :chat-id="chat?.id"
            @submit="onDescriptionLocation" />
        <LinkInputDialog v-model="optionLinkOpen" @submit="onOptionLink" />

        <!-- 自定义 emoji 选择器：Teleport 到 body，避免被弹窗滚动区裁切 -->
        <Teleport to="body">
            <div v-if="emojiOpen" ref="emojiPanelRef"
                class="fixed z-[10050] flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900"
                :style="emojiStyle" @pointerdown.stop>
                <EmojiDrawer :is-premium="isPremium" @pick-emoji="onPickEmoji"
                    @pick-custom-emoji="onPickCustomEmoji" />
            </div>
        </Teleport>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    Check as CheckIcon, Image as ImageIcon, Link2 as Link2Icon, MapPin as MapPinIcon,
    Menu as MenuIcon, Music as MusicIcon, Paperclip as PaperclipIcon, Plus as PlusIcon, Smile as SmileIcon,
    Sticker as StickerIcon, X as XIcon,
} from 'lucide-vue-next';
import { VueDraggable } from 'vue-draggable-plus';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
    chat, supergroup, basicGroup, ChatMemberStatus, inputMessagePoll, formattedText, InputPollMedia,
    location, sticker,
} from 'tdlib-types';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import SelectMenu from '../../ui/dropdown/SelectMenu.vue';
import PollRichInput from './PollRichInput.vue';
import PollToggleRow from './PollToggleRow.vue';
import CountrySelectDialog from './CountrySelectDialog.vue';
import EmojiDrawer from './stickerPanel/EmojiDrawer.vue';
import StickerDrawer from './stickerPanel/StickerDrawer.vue';
import StickerMediaItem from './stickerPanel/StickerMediaItem.vue';
import PollLocationThumb from './PollLocationThumb.vue';
import { stickerPanelState } from './stickerPanel/types';
import LocationPickerDialog from './LocationPickerDialog.vue';
import LinkInputDialog from './LinkInputDialog.vue';
import { tdlibSend } from '../../../utils/session/tdlib';
import { tdPlural } from '../../../utils/i18n/tdLang';
import { getFileSize } from '../../../store/media/attachment';
import { classifyAttachment } from '../../../utils/media/attachmentSend';
import { buildPollFormattedText, buildPollOptionMedia, type PollEmoji, type PollOptionMedia } from '../../../utils/chat/pollFormatting';
import { toast } from '../../../utils/ui/toast';

const props = defineProps<{
    modelValue: boolean;
    chat?: chat;
    supergroups?: Record<number, supergroup>;
    basicGroups?: Record<number, basicGroup>;
    memberStatus?: ChatMemberStatus;
    isPremium?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'submit', poll: inputMessagePoll): void;
}>();

const { t } = useI18n();

const QUESTION_MAX = 255;
const OPTION_MAX = 100;
const SOLUTION_MAX = 200;
const DEFAULT_MAX_ANSWERS = 10;
const DEFAULT_MAX_COUNTRIES = 50;
const DEFAULT_DESCRIPTION_MAX = 1024;

/** TDLib 文档要求这些字段 pass null，但生成的 d.ts 标成非空；只在 payload 边界收口 */
const NULL_FORMATTED_TEXT = null as unknown as formattedText;
const NULL_POLL_MEDIA = null as unknown as InputPollMedia;

interface RichValue {
    text: string;
    emojis: PollEmoji[];
}

interface PollOptionRow {
    /** 稳定 UI key；发送时用索引，不复用这个值 */
    id: number;
    text: string;
    emojis: PollEmoji[];
    media: PollOptionMedia | null;
}

interface DurationOption {
    value: string;
    label: string;
}

type EmojiTargetKind = 'question' | 'description' | 'solution' | 'option';
interface EmojiTarget {
    kind: EmojiTargetKind;
    optionId?: number;
}

/** 选项 / 简介媒体菜单的目标 */
type MediaTarget = { kind: 'option'; optionId: number } | { kind: 'description' };

/** PollRichInput 暴露的 API（模板 ref 用） */
interface RichFieldApi {
    insertEmoji(emoji: string): void;
    insertCustomEmoji(id: string, alt: string): void;
    focus(): void;
}

const question = reactive<RichValue>({ text: '', emojis: [] });
const description = reactive<RichValue>({ text: '', emojis: [] });
const descriptionMedia = ref<PollOptionMedia | null>(null);
const solution = reactive<RichValue>({ text: '', emojis: [] });
let optionSeq = 0;
const options = ref<PollOptionRow[]>([createOption(), createOption()]);
const correctIds = ref<number[]>([]);

const quiz = ref(false);
const anonymous = ref(false);
const multiple = ref(true);
const allowAdding = ref(true);
const revoting = ref(true);
const shuffle = ref(true);
const hideResults = ref(false);
const membersOnly = ref(false);
const limitCountry = ref(false);
const countries = ref<string[]>([]);
const duration = ref('0');

const maxAnswers = ref(DEFAULT_MAX_ANSWERS);
const maxCountries = ref(DEFAULT_MAX_COUNTRIES);
const descriptionMax = ref(DEFAULT_DESCRIPTION_MAX);
const showValidation = ref(false);

const questionRef = ref<RichFieldApi | null>(null);
const descriptionRef = ref<RichFieldApi | null>(null);
const solutionRef = ref<RichFieldApi | null>(null);
const optionRefs = new Map<number, RichFieldApi>();

const countryOpen = ref(false);
const emojiOpen = ref(false);
const emojiTarget = ref<EmojiTarget | null>(null);
const emojiStyle = ref<Record<string, string>>({});
const emojiPanelRef = ref<HTMLElement | null>(null);

/** 选项媒体菜单（图片和视频 / 贴纸 / 音乐 / 位置 / 链接） */
const mediaMenu = ref<{ target: MediaTarget; style: Record<string, string>; anchor: DOMRect } | null>(null);
const mediaMenuRef = ref<HTMLElement | null>(null);
/** 当前聚焦的选项行：只在这一行显示 emoji 按钮，贴合 Android */
const activeOptionId = ref<number | null>(null);

/** 贴纸选择器 */
const stickerOpen = ref(false);
const stickerTargetId = ref<number | null>(null);
const stickerStyle = ref<Record<string, string>>({});
const stickerPanelRef = ref<HTMLElement | null>(null);

/** 位置 / 链接的临时目标 */
const optionLocationOpen = ref(false);
const optionLocationTargetId = ref<number | null>(null);
const descriptionLocationOpen = ref(false);
const optionLinkOpen = ref(false);
const optionLinkTargetId = ref<number | null>(null);

const isChannel = computed(() => {
    const type = props.chat?.type;
    return !!type && type._ === 'chatTypeSupergroup' && type.is_channel;
});

const durationOptions = computed<DurationOption[]>(() => [
    { value: '0', label: t('lng_group_invite_expire_never') },
    { value: '3600', label: tdPlural('lng_hours', 1) },
    { value: '10800', label: tdPlural('lng_hours', 3) },
    { value: '28800', label: tdPlural('lng_hours', 8) },
    { value: '86400', label: tdPlural('lng_days', 1) },
    { value: '259200', label: tdPlural('lng_days', 3) },
]);

const questionError = computed(() => {
    if (!showValidation.value) return '';
    return question.text.trim() ? '' : t('lng_polls_choose_question');
});

const optionsError = computed(() => {
    if (!showValidation.value) return '';
    if (options.value.length < 2 || options.value.length > maxAnswers.value) {
        return t('lng_polls_choose_answers');
    }
    return options.value.some((option) => !option.text.trim()) ? t('lng_polls_choose_answers') : '';
});

const correctError = computed(() => {
    if (!showValidation.value || !quiz.value) return '';
    return correctIds.value.length > 0 ? '' : t('lng_polls_choose_correct');
});

const countriesError = computed(() => {
    if (!showValidation.value || !isChannel.value || !limitCountry.value) return '';
    return countries.value.length > 0 ? '' : t('lng_polls_create_choose_country');
});

const isValid = computed(() => {
    if (!question.text.trim() || question.text.length > QUESTION_MAX) return false;
    if (description.text.length > descriptionMax.value) return false;
    if (options.value.length < 2 || options.value.length > maxAnswers.value) return false;
    if (options.value.some((option) => !option.text.trim() || option.text.length > OPTION_MAX)) return false;
    if (quiz.value && correctIds.value.length === 0) return false;
    if (isChannel.value && limitCountry.value && countries.value.length === 0) return false;
    return true;
});

function createOption(): PollOptionRow {
    optionSeq += 1;
    return { id: optionSeq, text: '', emojis: [], media: null };
}

function markInteracted() {
    showValidation.value = true;
}

function setOptionRef(id: number, el: unknown) {
    if (el) optionRefs.set(id, el as RichFieldApi);
    else optionRefs.delete(id);
}

async function readIntOption(name: string, fallback: number): Promise<number> {
    try {
        const res = await tdlibSend({ _: 'getOption', name });
        if (res._ === 'optionValueInteger') {
            const n = Number(res.value);
            if (Number.isFinite(n) && n > 0) return n;
        }
    } catch {
        // 读取失败静默用默认值
    }
    return fallback;
}

async function loadLimits() {
    const [answers, countryMax, captionMax] = await Promise.all([
        readIntOption('poll_answer_count_max', DEFAULT_MAX_ANSWERS),
        readIntOption('poll_country_count_max', DEFAULT_MAX_COUNTRIES),
        readIntOption('message_caption_length_max', DEFAULT_DESCRIPTION_MAX),
    ]);
    maxAnswers.value = answers;
    maxCountries.value = countryMax;
    descriptionMax.value = captionMax;
}

function resetForm() {
    question.text = '';
    question.emojis = [];
    description.text = '';
    description.emojis = [];
    descriptionMedia.value = null;
    solution.text = '';
    solution.emojis = [];
    options.value = [createOption(), createOption()];
    correctIds.value = [];
    quiz.value = false;
    anonymous.value = isChannel.value;
    multiple.value = true;
    allowAdding.value = !isChannel.value;
    revoting.value = true;
    shuffle.value = true;
    hideResults.value = false;
    membersOnly.value = false;
    limitCountry.value = false;
    countries.value = [];
    duration.value = '0';
    showValidation.value = false;
    closeEmojiPicker();
    closeMediaMenu();
    closeStickerPicker();
    optionLocationOpen.value = false;
    descriptionLocationOpen.value = false;
    optionLinkOpen.value = false;
    void loadLimits();
    void nextTick(() => questionRef.value?.focus());
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) resetForm();
    },
    { immediate: true },
);

watch(isChannel, (channel, wasChannel) => {
    if (channel) {
        anonymous.value = true;
        allowAdding.value = false;
    } else if (wasChannel) {
        anonymous.value = false;
        membersOnly.value = false;
        limitCountry.value = false;
        countries.value = [];
    }
});

watch(quiz, (value) => {
    if (value) {
        revoting.value = false;
        allowAdding.value = false;
    } else {
        correctIds.value = [];
    }
});

watch(multiple, (value) => {
    if (!value && correctIds.value.length > 1) {
        correctIds.value = [correctIds.value[0]];
    }
});

watch(anonymous, (value) => {
    if (value) allowAdding.value = false;
});

watch(duration, (value) => {
    if (value === '0') hideResults.value = false;
});

function addOption() {
    if (options.value.length >= maxAnswers.value) return;
    options.value.push(createOption());
}

function isCorrect(option: PollOptionRow): boolean {
    return correctIds.value.includes(option.id);
}

function removeOption(id: number) {
    if (options.value.length <= 1) return;
    const index = options.value.findIndex((option) => option.id === id);
    if (index < 0) return;
    options.value.splice(index, 1);
    correctIds.value = correctIds.value.filter((value) => value !== id);
}

function toggleCorrect(optionId: number) {
    if (!quiz.value) return;
    if (multiple.value) {
        const at = correctIds.value.indexOf(optionId);
        if (at >= 0) correctIds.value.splice(at, 1);
        else correctIds.value.push(optionId);
    } else {
        correctIds.value = [optionId];
    }
    markInteracted();
}

/** 空选项按 Enter：删掉这一项（至少保留一个），并把焦点挪到相邻选项 */
function onOptionEnter(option: PollOptionRow) {
    if (option.text.trim() || options.value.length <= 1) return;
    const index = options.value.findIndex((item) => item.id === option.id);
    if (index < 0) return;
    removeOption(option.id);
    void nextTick(() => {
        const next = options.value[Math.min(index, options.value.length - 1)];
        if (next) optionRefs.get(next.id)?.focus();
    });
}

function baseName(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function targetMedia(target: MediaTarget): PollOptionMedia | null {
    if (target.kind === 'description') return descriptionMedia.value;
    return options.value.find((item) => item.id === target.optionId)?.media ?? null;
}

function setTargetMedia(target: MediaTarget, media: PollOptionMedia | null) {
    if (target.kind === 'description') {
        descriptionMedia.value = media;
        return;
    }
    const option = options.value.find((item) => item.id === target.optionId);
    if (option) option.media = media;
}

/** 媒体菜单：选项支持图片和视频 / 贴纸 / 位置 / 链接；简介支持图片和视频 / 音乐 / 位置 */
function openMediaMenu(target: MediaTarget, event: MouseEvent) {
    const button = event.currentTarget as HTMLElement | null;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 176;
    const height = 208;
    let left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    mediaMenu.value = {
        target,
        style: { left: `${left}px`, top: `${top}px` },
        anchor: rect,
    };
    void nextTick(() => window.addEventListener('pointerdown', onMediaMenuOutside, true));
}

function closeMediaMenu() {
    mediaMenu.value = null;
    window.removeEventListener('pointerdown', onMediaMenuOutside, true);
}

function onMediaMenuOutside(event: PointerEvent) {
    if (mediaMenuRef.value?.contains(event.target as Node)) return;
    closeMediaMenu();
}

function mediaMenuHasMedia(): boolean {
    return mediaMenu.value ? !!targetMedia(mediaMenu.value.target) : false;
}

function chooseMedia(kind: 'gallery' | 'sticker' | 'audio' | 'location' | 'link' | 'remove') {
    const menu = mediaMenu.value;
    if (!menu) return;
    const target = menu.target;
    const anchor = menu.anchor;
    closeMediaMenu();
    if (kind === 'remove') {
        setTargetMedia(target, null);
        return;
    }
    if (kind === 'gallery') {
        void pickGalleryMedia(target);
    } else if (kind === 'audio') {
        void pickAudioMedia(target);
    } else if (kind === 'sticker') {
        if (target.kind === 'option') openStickerPicker(target.optionId, anchor);
    } else if (kind === 'location') {
        if (target.kind === 'option') {
            optionLocationTargetId.value = target.optionId;
            optionLocationOpen.value = true;
        } else {
            descriptionLocationOpen.value = true;
        }
    } else if (target.kind === 'option') {
        optionLinkTargetId.value = target.optionId;
        optionLinkOpen.value = true;
    }
}

async function pickGalleryMedia(target: MediaTarget) {
    try {
        const selected = await open({
            multiple: false,
            title: t('chat.photosAndVideos'),
            filters: [{
                name: t('chat.photosAndVideos'),
                extensions: [
                    'png', 'jpg', 'jpeg', 'webp', 'bmp', 'heic', 'heif',
                    'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v',
                ],
            }],
        });
        if (!selected) return;
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) return;
        const name = baseName(path);
        const size = await getFileSize(path);
        const result = await classifyAttachment({
            path,
            name,
            size,
            album: false,
            isPremium: props.isPremium ?? false,
        });
        if (result.status === 'rejected') {
            toast.warning(result.reason);
            return;
        }
        if (result.kind === 'photo') {
            setTargetMedia(target, {
                kind: 'photo',
                path,
                name,
                size,
                width: result.width ?? 0,
                height: result.height ?? 0,
            });
        } else if (result.kind === 'video') {
            setTargetMedia(target, {
                kind: 'video',
                path,
                name,
                size,
                width: result.width ?? 0,
                height: result.height ?? 0,
                duration: result.duration ?? 0,
            });
        } else {
            toast.warning(t('poll.optionGalleryOnly'));
        }
    } catch (e) {
        console.error('Pick poll gallery media failed:', e);
        toast.error(t('chat.pickMediaFailed', { type: t('chat.photosAndVideos') }));
    }
}

async function pickAudioMedia(target: MediaTarget) {
    try {
        const selected = await open({
            multiple: false,
            title: t('lng_all_music'),
            filters: [{
                name: t('lng_all_music'),
                extensions: ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav'],
            }],
        });
        if (!selected) return;
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) return;
        const name = baseName(path);
        const size = await getFileSize(path);
        const result = await classifyAttachment({
            path,
            name,
            size,
            album: false,
            isPremium: props.isPremium ?? false,
        });
        if (result.status === 'rejected') {
            toast.warning(result.reason);
            return;
        }
        if (result.kind !== 'audio') {
            toast.warning(t('poll.optionAudioOnly'));
            return;
        }
        setTargetMedia(target, {
            kind: 'audio',
            path,
            name,
            size,
            duration: result.duration ?? 0,
        });
    } catch (e) {
        console.error('Pick poll audio media failed:', e);
        toast.error(t('chat.pickMediaFailed', { type: t('lng_all_music') }));
    }
}

function openStickerPicker(optionId: number, anchor: DOMRect) {
    stickerTargetId.value = optionId;
    stickerPanelState.value.isPremium = !!props.isPremium;
    const width = 360;
    const height = 420;
    const left = Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8);
    let top = anchor.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, anchor.top - height - 4);
    stickerStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
    stickerOpen.value = true;
    void nextTick(() => window.addEventListener('pointerdown', onStickerOutside, true));
}

function closeStickerPicker() {
    stickerOpen.value = false;
    stickerTargetId.value = null;
    window.removeEventListener('pointerdown', onStickerOutside, true);
}

function onStickerOutside(event: PointerEvent) {
    if (stickerPanelRef.value?.contains(event.target as Node)) return;
    closeStickerPicker();
}

function onPickSticker(_id: string, picked: sticker) {
    const option = options.value.find((item) => item.id === stickerTargetId.value);
    if (option && picked) {
        option.media = {
            kind: 'sticker',
            fileId: picked.sticker?.id ?? 0,
            name: picked.emoji || t('lng_in_dlg_sticker'),
            width: picked.width,
            height: picked.height,
            sticker: picked,
        };
    }
    closeStickerPicker();
}

function onOptionLocation(locationValue: location) {
    const option = options.value.find((item) => item.id === optionLocationTargetId.value);
    if (option) {
        option.media = {
            kind: 'location',
            location: locationValue,
            name: `${locationValue.latitude.toFixed(5)}, ${locationValue.longitude.toFixed(5)}`,
        };
    }
    optionLocationOpen.value = false;
    optionLocationTargetId.value = null;
}

function onDescriptionLocation(locationValue: location) {
    descriptionMedia.value = {
        kind: 'location',
        location: locationValue,
        name: `${locationValue.latitude.toFixed(5)}, ${locationValue.longitude.toFixed(5)}`,
    };
    descriptionLocationOpen.value = false;
}

function onOptionLink(url: string) {
    const option = options.value.find((item) => item.id === optionLinkTargetId.value);
    if (option) {
        option.media = { kind: 'link', url, name: url };
    }
    optionLinkOpen.value = false;
    optionLinkTargetId.value = null;
}

function isImageMedia(media: PollOptionMedia): boolean {
    return media.kind === 'photo';
}

function isVideoMedia(media: PollOptionMedia): boolean {
    return media.kind === 'video';
}

function mediaPreview(media: PollOptionMedia): string {
    return media.kind === 'photo' || media.kind === 'video' ? convertFileSrc(media.path) : '';
}

function getField(target: EmojiTarget): RichFieldApi | null {
    switch (target.kind) {
        case 'question': return questionRef.value;
        case 'description': return descriptionRef.value;
        case 'solution': return solutionRef.value;
        case 'option': return target.optionId ? optionRefs.get(target.optionId) ?? null : null;
        default: return null;
    }
}

function openEmojiPicker(target: EmojiTarget, event: MouseEvent) {
    const button = event.currentTarget as HTMLElement | null;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 320;
    const height = 384;
    let left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - height - 6);
    }
    emojiStyle.value = { left: `${left}px`, top: `${top}px` };
    emojiTarget.value = target;
    emojiOpen.value = true;
    void nextTick(() => window.addEventListener('pointerdown', onEmojiOutside, true));
}

function closeEmojiPicker() {
    emojiOpen.value = false;
    emojiTarget.value = null;
    window.removeEventListener('pointerdown', onEmojiOutside, true);
}

function onEmojiOutside(event: PointerEvent) {
    if (emojiPanelRef.value?.contains(event.target as Node)) return;
    closeEmojiPicker();
}

function onPickEmoji(emoji: string) {
    const target = emojiTarget.value;
    if (target) getField(target)?.insertEmoji(emoji);
    closeEmojiPicker();
}

function onPickCustomEmoji(id: string, alt: string) {
    const target = emojiTarget.value;
    if (target) getField(target)?.insertCustomEmoji(id, alt);
    closeEmojiPicker();
}

onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onEmojiOutside, true);
    window.removeEventListener('pointerdown', onMediaMenuOutside, true);
    window.removeEventListener('pointerdown', onStickerOutside, true);
});

function onCountriesSelected(codes: string[]) {
    countries.value = codes;
}

function close() {
    closeEmojiPicker();
    closeMediaMenu();
    closeStickerPicker();
    optionLocationOpen.value = false;
    descriptionLocationOpen.value = false;
    optionLinkOpen.value = false;
    emit('update:modelValue', false);
}

function submit() {
    if (!isValid.value) {
        showValidation.value = true;
        return;
    }

    const poll: inputMessagePoll = {
        _: 'inputMessagePoll',
        question: buildPollFormattedText(question.text.trim(), question.emojis),
        options: options.value.map((option) => ({
            _: 'inputPollOption',
            text: buildPollFormattedText(option.text.trim(), option.emojis),
            media: option.media ? (buildPollOptionMedia(option.media) ?? NULL_POLL_MEDIA) : NULL_POLL_MEDIA,
        })),
        description: description.text.trim()
            ? buildPollFormattedText(description.text.trim(), description.emojis)
            : NULL_FORMATTED_TEXT,
        media: descriptionMedia.value
            ? buildPollOptionMedia(descriptionMedia.value)
            : NULL_POLL_MEDIA,
        is_anonymous: isChannel.value || anonymous.value,
        allows_multiple_answers: multiple.value,
        allows_revoting: quiz.value ? false : revoting.value,
        members_only: isChannel.value ? membersOnly.value : false,
        country_codes: isChannel.value && limitCountry.value ? [...countries.value] : [],
        shuffle_options: shuffle.value,
        hide_results_until_closes: hideResults.value,
        type: quiz.value
            ? {
                _: 'inputPollTypeQuiz',
                correct_option_ids: correctIds.value
                    .map((id) => options.value.findIndex((option) => option.id === id))
                    .filter((index) => index >= 0)
                    .sort((a, b) => a - b),
                explanation: buildPollFormattedText(solution.text.trim(), solution.emojis),
                explanation_media: NULL_POLL_MEDIA,
            }
            : {
                _: 'inputPollTypeRegular',
                allow_adding_options: !isChannel.value && !anonymous.value && allowAdding.value,
            },
        open_period: Number(duration.value) || 0,
        close_date: 0,
        is_closed: false,
    };

    emit('submit', poll);
    close();
}
</script>
