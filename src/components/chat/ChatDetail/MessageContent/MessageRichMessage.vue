<template>
    <div class="rich-message" :style="{ fontSize: 'var(--msg-font-size, 14px)', lineHeight: '1.4' }"
        :dir="isRtl ? 'rtl' : 'ltr'">
        <template v-for="(block, bi) in blocks" :key="bi">
            <!-- 标题 / 副标题 / 页头 / 段头 / 章节标题 / kicker -->
            <h1 v-if="block._ === 'pageBlockTitle'" class="text-xl font-bold mb-2">
                <RichText :text="block.title" />
            </h1>
            <h2 v-else-if="block._ === 'pageBlockSubtitle'"
                class="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                <RichText :text="block.subtitle" />
            </h2>
            <h3 v-else-if="block._ === 'pageBlockHeader'" class="text-lg font-bold mb-1.5">
                <RichText :text="block.header" />
            </h3>
            <h4 v-else-if="block._ === 'pageBlockSubheader'" class="text-base font-bold mb-1">
                <RichText :text="block.subheader" />
            </h4>
            <div v-else-if="block._ === 'pageBlockSectionHeading'" class="font-bold mb-1 mt-1"
                :class="headingSizeClass(block.size)">
                <RichText :text="block.text" />
            </div>
            <div v-else-if="block._ === 'pageBlockKicker'"
                class="uppercase tracking-wide text-xs font-semibold text-blue-500 dark:text-blue-400 mb-1">
                <RichText :text="block.kicker" />
            </div>

            <!-- 段落 -->
            <p v-else-if="block._ === 'pageBlockParagraph'" class="whitespace-pre-wrap">
                <RichText :text="block.text" />
            </p>

            <!-- 预格式化代码 -->
            <pre v-else-if="block._ === 'pageBlockPreformatted'"
                class="my-1.5 overflow-x-auto rounded-lg bg-black/5 border border-black/10 dark:bg-white/10 dark:border-white/10 p-2.5 font-mono text-sm leading-5 whitespace-pre-wrap">
                <code><RichText :text="block.text" /></code>
            </pre>

            <!-- 页脚 -->
            <p v-else-if="block._ === 'pageBlockFooter'" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <RichText :text="block.footer" />
            </p>

            <!-- 作者与日期 -->
            <div v-else-if="block._ === 'pageBlockAuthorDate'"
                class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span class="font-medium">
                    <RichText :text="block.author" />
                </span>
                <span v-if="block.publish_date">· {{ formatDate(block.publish_date) }}</span>
            </div>

            <!-- 分隔线 -->
            <hr v-else-if="block._ === 'pageBlockDivider'" class="my-2 border-gray-200 dark:border-gray-700" />

            <!-- 数学表达式 -->
            <LatexFormula v-else-if="block._ === 'pageBlockMathematicalExpression'" :expression="block.expression"
                display-mode class="my-1" />

            <!-- 列表 -->
            <ul v-else-if="block._ === 'pageBlockList'" class="my-1 space-y-0.5">
                <li v-for="(item, li) in block.items" :key="li" class="flex gap-1.5 pl-0.5">
                    <span class="shrink-0 select-none" :class="item.has_checkbox ? '' : 'text-gray-400'">
                        <template v-if="item.has_checkbox">
                            <svg v-if="item.is_checked" class="w-4 h-4 text-blue-500 mt-0.5" viewBox="0 0 16 16"
                                fill="currentColor">
                                <path
                                    d="M12.7 4.3a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 0 1 1.4-1.4L7 8.6l4.3-4.3a1 1 0 0 1 1.4 0z" />
                            </svg>
                            <svg v-else class="w-4 h-4 mt-0.5 text-gray-400" viewBox="0 0 16 16" fill="none"
                                stroke="currentColor" stroke-width="1.5">
                                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
                            </svg>
                        </template>
                        <span v-else>{{ listMarker(item) }}</span>
                    </span>
                    <span class="min-w-0">
                        <MessageRichMessage :blocks="item.blocks" :is-rtl="isRtl" />
                    </span>
                </li>
            </ul>

            <!-- 引用 -->
            <blockquote v-else-if="block._ === 'pageBlockBlockQuote'"
                class="my-1.5 border-l-2 border-gray-300 dark:border-gray-600 pl-2 text-gray-700 dark:text-gray-300">
                <MessageRichMessage :blocks="block.blocks" :is-rtl="isRtl" />
                <footer v-if="block.credit" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <RichText :text="block.credit" />
                </footer>
            </blockquote>
            <blockquote v-else-if="block._ === 'pageBlockPullQuote'"
                class="my-1.5 border-l-2 border-gray-300 dark:border-gray-600 pl-2 text-gray-700 dark:text-gray-300">
                <RichText :text="block.text" />
                <footer v-if="block.credit" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <RichText :text="block.credit" />
                </footer>
            </blockquote>

            <!-- 图片 -->
            <figure v-else-if="block._ === 'pageBlockPhoto'" class="my-1.5">
                <div class="overflow-hidden rounded-lg" :style="spoilerStyle(block.has_spoiler)">
                    <RichImage v-if="photoFile(block.photo)?.photo" :file="photoFile(block.photo)!.photo" :alt="''"
                        square />
                    <div v-else
                        class="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">
                        图片不可用</div>
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 视频 -->
            <figure v-else-if="block._ === 'pageBlockVideo'" class="my-1.5">
                <div class="overflow-hidden rounded-lg bg-black/5 dark:bg-white/10 relative">
                    <RichImage v-if="block.video?.thumbnail?.file" :file="block.video?.thumbnail?.file"
                        :format="block.video?.thumbnail?.format" :alt="''" square />
                    <div v-else class="h-32 flex items-center justify-center text-gray-400">视频不可用</div>
                    <span class="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <PlayIcon class="w-8 h-8 text-white drop-shadow" />
                    </span>
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 动画 -->
            <figure v-else-if="block._ === 'pageBlockAnimation'" class="my-1.5">
                <div class="overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
                    <RichImage v-if="block.animation?.thumbnail?.file" :file="block.animation?.thumbnail?.file"
                        :format="block.animation?.thumbnail?.format" :alt="''" square />
                    <div v-else class="h-32 flex items-center justify-center text-gray-400">动画不可用</div>
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 音频 -->
            <figure v-else-if="block._ === 'pageBlockAudio'" class="my-1.5">
                <div class="rounded-lg bg-black/5 dark:bg-white/10 p-2.5 flex items-center gap-2">
                    <MusicIcon class="w-4 h-4 text-gray-500 shrink-0" />
                    <div class="min-w-0">
                        <p class="truncate font-medium">{{ audioTitle(block.audio) }}</p>
                        <p v-if="block.audio" class="truncate text-xs text-gray-500">{{
                            formatDuration(block.audio.duration) }}</p>
                    </div>
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 语音 -->
            <figure v-else-if="block._ === 'pageBlockVoiceNote'" class="my-1.5">
                <div class="rounded-lg bg-black/5 dark:bg-white/10 p-2.5 flex items-center gap-2">
                    <MicIcon class="w-4 h-4 text-gray-500 shrink-0" />
                    <span v-if="block.voice_note" class="text-xs text-gray-500">{{
                        formatDuration(block.voice_note.duration)
                        }}</span>
                    <span v-else class="text-xs text-gray-400">语音不可用</span>
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 封面 -->
            <div v-else-if="block._ === 'pageBlockCover'" class="my-1.5">
                <MessageRichMessage :blocks="[block.cover]" :is-rtl="isRtl" />
            </div>

            <!-- 表格 -->
            <figure v-else-if="block._ === 'pageBlockTable'" class="my-1.5">
                <figcaption v-if="block.caption" class="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    <RichText :text="block.caption" />
                </figcaption>
                <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table class="w-full border-collapse text-sm">
                        <tbody>
                            <tr v-for="(row, ri) in block.cells" :key="ri">
                                <td v-for="(cell, ci) in row" :key="ci" :colspan="cell.colspan" :rowspan="cell.rowspan"
                                    :class="[
                                        'px-2 py-1.5 align-top whitespace-pre-wrap border-gray-200 dark:border-gray-700',
                                        block.is_bordered ? 'border' : '',
                                        block.is_striped && ri % 2 === 1 ? 'bg-black/5 dark:bg-white/5' : '',
                                        cell.is_header ? 'bg-gray-100 dark:bg-gray-700' : '',
                                    ]" :style="cellAlign(cell)">
                                    <template v-if="cell.text">
                                        <RichText :text="cell.text" />
                                    </template>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </figure>

            <!-- 可折叠 -->
            <details v-else-if="block._ === 'pageBlockDetails'" class="my-1.5" :open="block.is_open">
                <summary class="cursor-pointer font-medium select-none hover:opacity-80 transition-opacity">
                    <RichText :text="block.header" />
                </summary>
                <div class="mt-1 pl-1">
                    <MessageRichMessage :blocks="block.blocks" :is-rtl="isRtl" />
                </div>
            </details>

            <!-- 嵌入式页面 / 帖子 -->
            <div v-else-if="block._ === 'pageBlockEmbedded'"
                class="my-1.5 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 overflow-hidden">
                <p v-if="block.url" class="break-all text-xs text-blue-500 hover:underline truncate">{{ block.url }}</p>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </div>
            <div v-else-if="block._ === 'pageBlockEmbeddedPost'"
                class="my-1.5 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                <p class="font-medium">{{ block.author }}</p>
                <p v-if="block.date" class="text-xs text-gray-500">{{ formatDate(block.date) }}</p>
                <div class="mt-1 pl-1">
                    <MessageRichMessage :blocks="block.blocks" :is-rtl="isRtl" />
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </div>

            <!-- 拼贴 / 轮播 -->
            <div v-else-if="block._ === 'pageBlockCollage'" class="my-1.5 space-y-1">
                <MessageRichMessage :blocks="block.blocks" :is-rtl="isRtl" />
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </div>
            <figure v-else-if="block._ === 'pageBlockSlideshow'" class="my-1.5">
                <div class="space-y-1">
                    <MessageRichMessage :blocks="block.blocks" :is-rtl="isRtl" />
                </div>
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </figure>

            <!-- 聊天链接 -->
            <div v-else-if="block._ === 'pageBlockChatLink'"
                class="my-1.5 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                @click="openChatLink(block.username)">
                <span class="w-9 h-9 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <Avatar v-if="block.photo" :photo="block.photo" :title="block.title" sizeClass="!w-9 !h-9" />
                    <div v-else class="w-9 h-9 flex items-center justify-center">
                        <span class="font-semibold" :style="{ color: accentColor(block.accent_color_id) }">{{
                            block.title.slice(0,
                                1) }}</span>
                    </div>
                </span>
                <span class="font-medium">{{ block.title }}</span>
            </div>

            <!-- 相关文章 -->
            <div v-else-if="block._ === 'pageBlockRelatedArticles'" class="my-1.5">
                <p class="font-medium mb-1">
                    <RichText :text="block.header" />
                </p>
                <div class="space-y-1">
                    <a v-for="(article, ai) in block.articles" :key="ai" :href="article.url"
                        class="block rounded-lg border border-gray-200 dark:border-gray-700 p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        @click.prevent.stop="openExternal(article.url)">
                        <p class="font-medium">{{ article.title }}</p>
                        <p v-if="article.description" class="text-xs text-gray-500 line-clamp-2">{{ article.description
                            }}</p>
                    </a>
                </div>
            </div>

            <!-- 地图 -->
            <div v-else-if="block._ === 'pageBlockMap'"
                class="my-1.5 rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-xs text-gray-500">
                🗺️ {{ block.location.latitude.toFixed(4) }}, {{ block.location.longitude.toFixed(4) }}
                <RichCaption v-if="block.caption" :caption="block.caption" />
            </div>

            <!-- Thinking placeholder -->
            <p v-else-if="block._ === 'pageBlockThinking'" class="my-1 text-gray-400 italic">
                <RichText :text="block.text" />
            </p>

            <!-- 未知 block：尝试递归其内部 blocks（若存在） -->
            <div v-else-if="(block as any).blocks?.length" class="my-1">
                <MessageRichMessage :blocks="(block as any).blocks" :is-rtl="isRtl" />
            </div>
            <div v-else class="my-0.5 opacity-60">[不支持的内容]</div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { PageBlock, photoSize, audio, pageBlockTableCell, PageBlockHorizontalAlignment, PageBlockVerticalAlignment } from 'tdlib-types';
import RichText from './RichText.vue';
import RichImage from './RichImage.vue';
import RichCaption from './RichCaption.vue';
import LatexFormula from './LatexFormula.vue';
import Avatar from '../../avatar.vue';
import { MusicIcon, MicIcon, PlayIcon } from 'lucide-vue-next';
import { tdlibSend } from '../../../../utils/tdlib';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useRouter } from 'vue-router';
import { confirmAndOpenExternalLink } from '../../../../utils/openExternalLink';

defineProps<{
    blocks: PageBlock[];
    isRtl?: boolean;
}>();

const router = useRouter();

/** 取 photo 的最大可用尺寸作为展示文件 */
function photoFile(photo?: { sizes?: photoSize[] } | null): photoSize | undefined {
    if (!photo?.sizes?.length) return undefined;
    return photo.sizes[photo.sizes.length - 1];
}

function listMarker(item: { type: string; value: number; has_checkbox: boolean }): string {
    if (item.has_checkbox) return '';
    const type = item.type || '';
    const v = item.value;
    if (type === 'a') return `${String.fromCharCode(96 + ((v - 1) % 26) + 1)}.`;
    if (type === 'A') return `${String.fromCharCode(64 + ((v - 1) % 26) + 1)}.`;
    if (type === 'i') return roman(v).toLowerCase() + '.';
    if (type === 'I') return roman(v) + '.';
    return `${v}.`;
}

function roman(n: number): string {
    const map: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let result = '';
    for (const [val, sym] of map) {
        while (n >= val) { result += sym; n -= val; }
    }
    return result;
}

function headingSizeClass(size: number): string {
    const map: Record<number, string> = {
        1: 'text-xl',
        2: 'text-lg',
        3: 'text-base',
        4: 'text-sm',
        5: 'text-sm',
        6: 'text-xs',
    };
    return map[size] ?? 'text-base';
}

function formatDate(unix: number): string {
    if (!unix) return '';
    const d = new Date(unix * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(sec: number): string {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function audioTitle(a?: audio | null): string {
    if (!a) return '音频';
    const parts = [a.performer, a.title].filter(Boolean);
    if (parts.length) return parts.join(' - ');
    return a.file_name || '音频';
}

function accentColor(id: number): string {
    const palette = ['#168acd', '#e17076', '#faa774', '#a695e7', '#7bc862', '#e7a9a7', '#6d63f4', '#3eb1c9'];
    return palette[id % palette.length] ?? '#168acd';
}

function spoilerStyle(hasSpoiler: boolean) {
    return hasSpoiler ? { filter: 'blur(8px)' } : undefined;
}

function cellAlign(cell: pageBlockTableCell): Record<string, string> {
    return {
        textAlign: alignValue(cell.align),
        verticalAlign: valignValue(cell.valign),
    };
}

function alignValue(a: PageBlockHorizontalAlignment | undefined): string {
    if (!a) return 'left';
    switch (a._) { case 'pageBlockHorizontalAlignmentCenter': return 'center'; case 'pageBlockHorizontalAlignmentRight': return 'right'; default: return 'left'; }
}

function valignValue(v: PageBlockVerticalAlignment | undefined): string {
    if (!v) return 'top';
    switch (v._) { case 'pageBlockVerticalAlignmentMiddle': return 'middle'; case 'pageBlockVerticalAlignmentBottom': return 'bottom'; default: return 'top'; }
}

async function openChatLink(username: string) {
    try {
        const chat = await tdlibSend({ _: 'searchPublicChat', username });
        if (chat?.id) {
            await router.push(`/home/chat/${chat.id}`);
        }
    } catch (e) {
        console.warn('Failed to open chat link:', e);
        openUrl(`https://t.me/${username}`);
    }
}

function openExternal(url: string) {
    if (url) {
        // 外部链接：先询问用户是否跳转外部
        confirmAndOpenExternalLink(url).catch(() => { /* 用户取消 */ });
    }
}
</script>

<style scoped>
.rich-message :deep(p) {
    margin: 0.25rem 0;
}

.rich-message :deep(p:first-child) {
    margin-top: 0;
}

.rich-message :deep(p:last-child) {
    margin-bottom: 0;
}
</style>
