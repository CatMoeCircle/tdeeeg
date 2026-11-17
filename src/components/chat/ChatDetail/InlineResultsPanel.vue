<template>
    <!-- 内联机器人结果面板：绝对定位在输入框正上方（父级输入行需 position: relative）。
         键盘上下切换 / Enter 发送 / Esc 关闭由 MessageInput 通过 defineExpose 的方法驱动。 -->
    <div ref="rootEl"
        class="absolute bottom-full left-0 right-0 mb-2 z-40 rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
        <!-- 头部：机器人身份 + 结果数 + 关闭方式 -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/60">
            <Avatar v-if="bot" :photo="bot.user.profile_photo" :title="bot.user.first_name"
                :first-name="bot.user.first_name" :last-name="bot.user.last_name" size-class="!w-5 !h-5" />
            <BotIcon v-else class="w-4 h-4 shrink-0 text-gray-400" />
            <span class="truncate text-xs font-medium text-gray-700 dark:text-gray-200">@{{ botUsername }}</span>
            <span v-if="results.length" class="shrink-0 text-[11px] text-gray-400">
                {{ t('inlineBots.results', { count: results.length }) }}
            </span>
            <LoaderIcon v-if="loading || loadingMore" class="ml-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
            <span class="ml-auto shrink-0 text-[11px] text-gray-400">{{ t('inlineBots.escHint') }}</span>
            <button type="button" :aria-label="t('inlineBots.close')" @click="emit('close')"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <XIcon class="h-3.5 w-3.5" />
            </button>
        </div>

        <div ref="scrollEl" class="custom-scrollbar max-h-80 overflow-y-auto p-2" @scroll.passive="onScroll">
            <!-- 首次加载：骨架屏（保留「加载中」读屏文案） -->
            <LoadingSkeleton v-if="loading && results.length === 0" variant="tiles" :rows="6"
                :label="t('inlineBots.loading')" />

            <!-- 错误态：机器人解析失败 / 查询失败 -->
            <div v-else-if="error" class="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <AlertTriangleIcon class="h-6 w-6 text-amber-500" />
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ error }}</p>
                <button type="button" @click="retry"
                    class="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                    {{ t('inlineBots.retry') }}
                </button>
            </div>

            <!-- 空态：机器人没有返回结果 -->
            <div v-else-if="results.length === 0"
                class="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <SearchIcon class="h-6 w-6 text-gray-300 dark:text-gray-600" />
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('inlineBots.empty') }}</p>
            </div>

            <!-- 结果网格：缩略图 + 标题 + 描述；article 等无缩略图类型回退到类型图标 -->
            <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <button v-for="(result, index) in results" :key="result.id" type="button"
                    :data-inline-index="index"
                    class="w-full overflow-hidden rounded-xl border text-left transition-colors"
                    :class="index === selected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'"
                    @mousedown.prevent @click="pick(result)" @mouseenter="selected = index">
                    <div
                        class="relative flex aspect-square items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-700/60">
                        <img v-if="thumbSrc(result)" :src="thumbSrc(result)" alt="" draggable="false"
                            class="h-full w-full object-cover" @error="onThumbError(result)" />
                        <component :is="iconFor(result.kind)" v-else class="h-6 w-6 text-gray-400" />
                    </div>
                    <div class="px-1.5 py-1">
                        <p class="truncate text-[11px] leading-4 text-gray-800 dark:text-gray-100">
                            {{ result.title || t('inlineBots.untitled') }}
                        </p>
                        <p v-if="result.description" class="truncate text-[10px] leading-4 text-gray-400">
                            {{ result.description }}
                        </p>
                    </div>
                </button>
            </div>

            <!-- 分页：滚动到底自动加载；同时保留显式按钮便于鼠标操作 -->
            <button v-if="nextOffset && !loading" type="button" :disabled="loadingMore" @click="loadMore"
                class="mt-2 w-full rounded-lg py-1.5 text-center text-[11px] text-blue-500 hover:bg-blue-50 disabled:opacity-60 dark:hover:bg-blue-500/10">
                {{ loadingMore ? t('inlineBots.loadingMore') : t('inlineBots.loadMore') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    AlertTriangle as AlertTriangleIcon,
    Bot as BotIcon,
    FileText as FileTextIcon,
    Film as FilmIcon,
    Image as ImageIcon,
    Loader2 as LoaderIcon,
    MapPin as MapPinIcon,
    Mic as MicIcon,
    Music as MusicIcon,
    Search as SearchIcon,
    Smile as SmileIcon,
    Sparkles as SparklesIcon,
    User as UserIcon,
    Video as VideoIcon,
    X as XIcon,
} from 'lucide-vue-next';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { file } from 'tdlib-types';
import Avatar from '../avatar.vue';
import LoadingSkeleton from '../../common/LoadingSkeleton.vue';
import { toast } from '../../../utils/ui/toast';
import { DL_PRIORITY } from '../../../utils/media/downloadPriority';
import { ensureLocalFilePath } from '../../../utils/session/tdlib';
import {
    advanceInlineOffset,
    fetchInlineQueryPage,
    inlineBotErrorText,
    resolveInlineBot,
    type InlineResultModel,
    type InlineResultKind,
    type ResolvedInlineBot,
} from '../../../utils/chat/inlineBot';

const props = defineProps<{
    /** 查询发生的聊天 id（部分机器人按聊天裁剪结果） */
    chatId?: number;
    /** 机器人用户名（不含 @） */
    botUsername: string;
    /** 查询词（输入框里 @用户名 之后的内容，可能为空） */
    query: string;
    /** 输入框元素：点击面板以外区域时用于判定是否仍在输入 */
    anchorEl?: HTMLElement | null;
}>();

const emit = defineEmits<{
    (e: 'pick', result: InlineResultModel): void;
    (e: 'close'): void;
}>();

const { t } = useI18n();

const rootEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
/** 已解析机器人（面板头部显示头像/名称） */
const bot = ref<ResolvedInlineBot | null>(null);
const results = ref<InlineResultModel[]>([]);
const nextOffset = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
/** 当前键盘选中项 */
const selected = ref(0);
/** 缩略图 asset URL（file.id 维度，跨页复用） */
const thumbSrcs = reactive(new Map<number, string>());
/** 已发起过的缩略图下载，避免重复请求 */
const thumbTried = new Set<number>();
/** 缩略图渲染失败的结果 id：隐藏 <img>，回退到类型图标 */
const brokenResults = reactive(new Set<string>());
/** 请求序号：快速改词时丢弃过期响应 */
let seq = 0;
/** 已 toast 过的解析失败用户名，避免同一失败反复弹提示 */
const toastedFailures = new Set<string>();

/** 结果类型 → 回退图标（无缩略图时显示） */
const KIND_ICONS: Record<InlineResultKind, unknown> = {
    article: FileTextIcon,
    contact: UserIcon,
    location: MapPinIcon,
    venue: MapPinIcon,
    game: SparklesIcon,
    animation: FilmIcon,
    audio: MusicIcon,
    document: FileTextIcon,
    photo: ImageIcon,
    sticker: SmileIcon,
    video: VideoIcon,
    voiceNote: MicIcon,
};

function iconFor(kind: InlineResultKind) {
    return KIND_ICONS[kind] ?? FileTextIcon;
}

/** 当前应展示的缩略图：已下载的清晰图优先，其次 minithumbnail 预览 */
function thumbSrc(result: InlineResultModel): string | undefined {
    if (brokenResults.has(result.id)) return undefined;
    const downloaded = result.thumb ? thumbSrcs.get(result.thumb.id) : undefined;
    if (downloaded) return downloaded;
    return result.preview;
}

function onThumbError(result: InlineResultModel) {
    brokenResults.add(result.id);
}

/** 按需下载一页结果的缩略图（失败保持预览/图标，不阻塞面板） */
function requestThumbs(list: InlineResultModel[]) {
    for (const result of list) void ensureThumb(result.thumb);
}

async function ensureThumb(f: file | undefined) {
    if (!f?.id) return;
    if (thumbSrcs.has(f.id) || thumbTried.has(f.id)) return;
    thumbTried.add(f.id);
    try {
        const path = await ensureLocalFilePath(f, { priority: DL_PRIORITY.THUMBNAIL });
        if (path) thumbSrcs.set(f.id, convertFileSrc(path));
    } catch {
        // 缩略图下载失败：保留预览图/类型图标
    } finally {
        thumbTried.delete(f.id);
    }
}

/** 首次/改词/换聊天：重新解析机器人并拉第一页 */
async function search() {
    const token = ++seq;
    error.value = '';
    results.value = [];
    nextOffset.value = '';
    selected.value = 0;
    loadingMore.value = false;
    // 结果 id 会在不同查询/聊天之间复用（常见 "0"、"1"…）：清空缩略图缓存与失败记录，
    // 否则上一查询的失败状态会让新查询里同 id 的结果永久不显示图。
    thumbSrcs.clear();
    thumbTried.clear();
    brokenResults.clear();

    const chatId = props.chatId;
    if (chatId === undefined) {
        error.value = t('inlineBots.loadFailed');
        loading.value = false;
        return;
    }

    loading.value = true;
    try {
        const resolved = await resolveInlineBot(props.botUsername);
        if (token !== seq) return;
        if (!resolved.bot) {
            bot.value = null;
            const key = props.botUsername.toLowerCase();
            error.value = resolved.failure === 'notInlineBot'
                ? t('inlineBots.notInlineBot', { username: props.botUsername })
                : t('inlineBots.botNotFound', { username: props.botUsername });
            if (!toastedFailures.has(key)) {
                toastedFailures.add(key);
                toast.error({ content: error.value });
            }
            return;
        }
        bot.value = resolved.bot;
        const page = await fetchInlineQueryPage({
            bot: resolved.bot,
            chatId,
            query: props.query,
            offset: '',
        });
        if (token !== seq) return;
        results.value = page.results;
        nextOffset.value = page.nextOffset;
        selected.value = 0;
        requestThumbs(page.results);
    } catch (e) {
        if (token !== seq) return;
        error.value = inlineBotErrorText(e) || t('inlineBots.loadFailed');
    } finally {
        if (token === seq) loading.value = false;
    }
}

/** 加载下一页（next_offset 分页） */
async function loadMore() {
    const currentBot = bot.value;
    const offset = nextOffset.value;
    const chatId = props.chatId;
    if (!currentBot || !offset || chatId === undefined || loadingMore.value || loading.value) return;
    loadingMore.value = true;
    // 快照查询代次 / 查询词 / 聊天：期间切聊天或重新查询时，旧页一律丢弃
    const token = seq;
    const queryAtStart = props.query;
    try {
        const page = await fetchInlineQueryPage({
            bot: currentBot,
            chatId,
            query: queryAtStart,
            offset,
        });
        if (token !== seq || queryAtStart !== props.query || bot.value !== currentBot || chatId !== props.chatId) return;
        const seen = new Set(results.value.map((r) => r.id));
        const appended = page.results.filter((r) => !seen.has(r.id));
        results.value = [...results.value, ...appended];
        // next_offset 没有前进（或返回空）说明没有更多了：置空，避免对同一页无限请求
        nextOffset.value = advanceInlineOffset(offset, page.nextOffset);
        requestThumbs(appended);
    } catch (e) {
        if (token !== seq) return;
        toast.error({ content: inlineBotErrorText(e) || t('inlineBots.loadFailed') });
    } finally {
        if (token === seq) loadingMore.value = false;
    }
}

function onScroll() {
    const el = scrollEl.value;
    if (!el || !nextOffset.value || loading.value || loadingMore.value) return;
    // 接近底部时后台翻页（留 120px 提前量）
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) void loadMore();
}

function retry() {
    void search();
}

function pick(result: InlineResultModel) {
    emit('pick', result);
}

/* ---------------- 供 MessageInput 键盘导航调用 ---------------- */

function hasResults(): boolean {
    return results.value.length > 0;
}

/** 上下键移动选中项（循环） */
function moveSelection(delta: number) {
    const count = results.value.length;
    if (count === 0) return;
    selected.value = ((selected.value + delta) % count + count) % count;
    void scrollSelectedIntoView();
}

/** 当前选中项；无结果时返回 null（输入框据此回退到普通发送） */
function selectCurrent(): InlineResultModel | null {
    return results.value[selected.value] ?? null;
}

async function scrollSelectedIntoView() {
    await nextTick();
    const selector = '[data-inline-index="' + String(selected.value) + '"]';
    const el = scrollEl.value?.querySelector<HTMLElement>(selector);
    el?.scrollIntoView({ block: 'nearest' });
}

defineExpose({ hasResults, moveSelection, selectCurrent });

/* ---------------- 点击面板外关闭 ---------------- */

function onDocumentPointerDown(e: PointerEvent) {
    const target = e.target as Node | null;
    if (!target) return;
    if (rootEl.value?.contains(target)) return;
    if (props.anchorEl?.contains(target)) return;
    emit('close');
}

onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    void search();
});

onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    // 使在途请求失效
    seq++;
});

// 改词 / 换机器人 / 换聊天：重新查询（查询词由 MessageInput 防抖后传入）
watch(
    () => [props.botUsername, props.query, props.chatId] as const,
    () => { void search(); },
);
</script>
