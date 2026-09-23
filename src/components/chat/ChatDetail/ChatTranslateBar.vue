<template>
    <!-- attached：并入顶部统一卡片（置顶/播放器）时去掉自身圆角与底色，贴合为同一分区 -->
    <div v-if="visible"
        class="h-9 px-2 flex items-center gap-1 shrink-0"
        :class="attached
            ? ''
            : 'rounded-xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-md shadow-lg border border-gray-200/50 dark:border-gray-700/50'">
        <!-- 主按钮：翻译为 X / 显示原文 -->
        <button type="button"
            class="flex-1 h-full flex items-center justify-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors rounded"
            :title="isTranslating ? t('lng_translate_show_original') : t('lng_translate_bar_to', { name: targetLangLabel })"
            @click="onToggleTranslate">
            <LanguagesIcon class="w-4 h-4 shrink-0" />
            <span class="truncate">{{ mainLabel }}</span>
        </button>

        <!-- 更多菜单 -->
        <button ref="menuBtnRef" type="button"
            class="w-9 h-full flex items-center justify-center rounded text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            :aria-label="t('lng_translate_settings')" @click.stop="menuOpen = !menuOpen">
            <MoreHorizontalIcon class="w-4 h-4" />
        </button>

        <!-- 隐藏翻译栏 -->
        <button type="button"
            class="w-9 h-full flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            :title="t('lng_translate_menu_hide')" @click="onHideBar">
            <XIcon class="w-4 h-4" />
        </button>
    </div>

    <!-- 菜单：目标语言 / 不翻译该语言 / 隐藏 -->
    <Teleport to="body">
        <div v-if="menuOpen" class="fixed inset-0 z-997" @mousedown="menuOpen = false"></div>
        <div v-if="menuOpen"
            class="fixed z-998 min-w-48 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl py-1 overflow-hidden"
            :style="menuStyle">
            <button type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between gap-3"
                @click="openLanguagePicker">
                <span class="text-gray-800 dark:text-gray-100">{{ t('lng_translate_menu_to') }}</span>
                <span class="text-xs text-gray-400 shrink-0">{{ targetLangLabel }}</span>
            </button>
            <button type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-800 dark:text-gray-100 flex items-center justify-between gap-3"
                @click="onDoNotTranslate">
                <span>{{ dontTranslateLabel }}</span>
                <span class="text-xs text-gray-400 shrink-0 max-w-28 truncate">{{ doNotLabel }}</span>
            </button>
            <div class="my-1 border-t border-gray-100 dark:border-gray-700"></div>
            <button type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-800 dark:text-gray-100"
                @click="onHideBar">
                {{ t('lng_translate_menu_hide') }}
            </button>
        </div>

        <!-- 目标语言选择 -->
        <div v-if="langPickerOpen" class="fixed inset-0 z-998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            @mousedown.self="langPickerOpen = false">
            <div
                class="w-80 max-w-[90vw] max-h-[70vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ t('lng_translate_menu_to') }}</h3>
                    <button type="button" class="w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500"
                        @click="langPickerOpen = false">
                        <XIcon class="w-4 h-4" />
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar py-1">
                    <button v-for="opt in languageOptions" :key="opt.code" type="button"
                        class="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center justify-between"
                        :class="opt.code === targetLang ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100'"
                        @click="selectLanguage(opt.code)">
                        <span>{{ opt.label }}</span>
                        <span class="text-xs text-gray-400 font-mono">{{ opt.code }}</span>
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 聊天「全部翻译」栏（参考 Unigram ChatTranslateBar）。
 * - 主按钮在「翻译为 X」与「显示原文」之间切换
 * - 菜单：目标语言、不翻译检测到的源语言、隐藏翻译栏
 * - 全部翻译开启后由 ChatDetail **仅翻译视口内**消息
 * - attached：与上方置顶/播放器贴合为同一圆角卡片
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Languages as LanguagesIcon, MoreHorizontal as MoreHorizontalIcon, X as XIcon } from 'lucide-vue-next';
import type { chat } from 'tdlib-types';
import { settings } from '../../../store/settings';
import {
    isChatTranslating,
    setChatTranslating,
    clearViewportTranslations,
    clearShouldTranslateCache,
    getTranslateTargetLang,
    canShowChatTranslateBar,
} from '../../../store/translate';
import {
    TRANSLATE_TARGET_LANGUAGES,
    getTranslateLanguageLabel,
} from '../../../utils/translateLanguages';
import { detectLanguage } from '../../../utils/languageDetect';

const props = defineProps<{
    chat: chat | undefined;
    /** 当前用户是否 Premium（与 is_translatable 组合可解锁官方全部翻译栏） */
    isPremium?: boolean;
    /** 超级群/频道是否开启自动翻译（无 Premium 时的替代门槛） */
    hasAutomaticTranslation?: boolean;
    /** 并入顶部统一卡片（置顶/播放器）时贴合显示 */
    attached?: boolean;
    /** 用于语言检测的样本文本（当前会话最近的非自己消息） */
    sampleText?: string;
}>();

const emit = defineEmits<{
    /** 全部翻译状态变化（ChatDetail 据此触发/停止视口翻译） */
    translatingChange: [on: boolean];
    /** 隐藏翻译栏（本会话） */
    hide: [];
}>();

const { t } = useI18n();

const menuOpen = ref(false);
const langPickerOpen = ref(false);
const menuBtnRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
/** 样本文本识别出的源语言（用于「不翻译 xx」） */
const detectedSourceLang = ref('');

const chatId = computed(() => props.chat?.id);
const isTranslating = computed(() => isChatTranslating(chatId.value));

/** 目标语言：用户未设置时跟随当前语言包 */
const targetLang = computed(() => getTranslateTargetLang());
const targetLangLabel = computed(() => getTranslateLanguageLabel(targetLang.value));

/**
 * 是否应显示翻译栏。
 * 官方提供方：Premium + is_translatable，或会话已开 has_automatic_translation。
 * 非官方提供方：上述不满足也显示。
 */
const visible = computed(() =>
    canShowChatTranslateBar({
        chat: props.chat,
        isPremium: !!props.isPremium,
        hasAutomaticTranslation: !!props.hasAutomaticTranslation,
    }),
);

const mainLabel = computed(() =>
    isTranslating.value
        ? t('lng_translate_show_original')
        : t('lng_translate_bar_to', { name: targetLangLabel.value }),
);

/** 「不翻译 xx」：识别到源语言时点名，否则退回通用文案 */
const dontTranslateLabel = computed(() => {
    if (detectedSourceLang.value) {
        const name = getTranslateLanguageLabel(detectedSourceLang.value);
        return t('lng_translate_menu_dont', { name });
    }
    return t('lng_translate_settings_choose');
});

const doNotLabel = computed(() => {
    const list = settings.translate.doNotTranslate || [];
    if (!list.length) return '—';
    return list.map((c) => getTranslateLanguageLabel(c)).join('、');
});

const languageOptions = TRANSLATE_TARGET_LANGUAGES;

function positionMenu() {
    const el = menuBtnRef.value;
    if (!el) {
        menuStyle.value = { top: '80px', right: '24px' };
        return;
    }
    const r = el.getBoundingClientRect();
    menuStyle.value = {
        top: `${r.bottom + 6}px`,
        right: `${Math.max(8, window.innerWidth - r.right)}px`,
    };
}

/** 用 Rust 本地语言识别样本文本的源语言 */
async function refreshDetectedSourceLang() {
    const sample = (props.sampleText || '').trim();
    if (!sample) {
        detectedSourceLang.value = '';
        return;
    }
    try {
        const { language } = await detectLanguage(sample.slice(0, 400));
        detectedSourceLang.value = language || '';
    } catch {
        detectedSourceLang.value = '';
    }
}

function onToggleTranslate() {
    const cid = chatId.value;
    if (cid == null) return;
    const next = !isTranslating.value;
    setChatTranslating(cid, next);
    if (!next) {
        // 关闭时清掉视口来源译文，保留手动翻译
        clearViewportTranslations(cid);
    }
    emit('translatingChange', next);
}

function openLanguagePicker() {
    menuOpen.value = false;
    positionMenu();
    langPickerOpen.value = true;
}

function selectLanguage(code: string) {
    // 用户显式选择：写入设置（之后不再自动跟随语言包）
    settings.translate.to = code;
    clearShouldTranslateCache();
    langPickerOpen.value = false;
    // 若正在全部翻译，切换语言后重新翻译视口
    if (isTranslating.value && chatId.value != null) {
        clearViewportTranslations(chatId.value);
        emit('translatingChange', true);
    }
}

/** 不翻译检测到的源语言：写入排除列表，之后该语种消息自动跳过 */
async function onDoNotTranslate() {
    menuOpen.value = false;
    await refreshDetectedSourceLang();

    const list = new Set(settings.translate.doNotTranslate || []);
    // 排除「und」：无法识别的消息不批量翻译
    list.add('und');
    const src = detectedSourceLang.value.trim();
    if (src) list.add(src);
    settings.translate.doNotTranslate = [...list];
    clearShouldTranslateCache();

    // 正在全部翻译时：清掉视口译文并重扫（命中新排除语种的不会再译）
    if (isTranslating.value && chatId.value != null) {
        clearViewportTranslations(chatId.value);
        emit('translatingChange', true);
    }
}

function onHideBar() {
    menuOpen.value = false;
    const cid = chatId.value;
    if (cid != null && isTranslating.value) {
        setChatTranslating(cid, false);
        clearViewportTranslations(cid);
        emit('translatingChange', false);
    }
    emit('hide');
}

function onDocClick(e: MouseEvent) {
    if (!menuOpen.value) return;
    const target = e.target as HTMLElement | null;
    if (target && menuBtnRef.value && menuBtnRef.value.contains(target)) return;
    menuOpen.value = false;
}

watch(menuOpen, (open) => {
    if (open) {
        positionMenu();
        void refreshDetectedSourceLang();
    }
});

watch(() => props.sampleText, () => {
    if (menuOpen.value) void refreshDetectedSourceLang();
});

onMounted(() => {
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('resize', positionMenu);
    void refreshDetectedSourceLang();
});
onUnmounted(() => {
    document.removeEventListener('mousedown', onDocClick);
    window.removeEventListener('resize', positionMenu);
});
</script>
