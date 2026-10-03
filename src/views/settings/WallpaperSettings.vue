<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack"
                :aria-label="t('lng_menu_back')">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('wallpaper.title') }}</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('wallpaper.defaultSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">{{ t('wallpaper.defaultDesc') }}</p>
                    <PreviewCard class="mt-5" :show-header="false" body-class="h-32 relative overflow-hidden">
                        <ChatBackgroundLayers :render="previewRender"
                            :overlay-opacity="settings.chatWallpaperOverlayOpacity"
                            :blur-px="settings.chatWallpaperBlur" />
                        <div class="absolute inset-0 bg-black/5"></div>
                        <div
                            class="absolute left-4 bottom-4 z-10 rounded-2xl rounded-bl-md bg-white/90 dark:bg-gray-800/90 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 shadow-sm">
                            {{ t('wallpaper.previewIncoming') }}</div>
                        <div
                            class="absolute right-4 bottom-4 z-10 rounded-2xl rounded-br-md bg-blue-500/90 px-3 py-2 text-xs text-white shadow-sm">
                            {{ t('wallpaper.previewOutgoing') }}</div>
                        <template #footer>
                            <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3">
                                <span class="text-xs text-gray-500 dark:text-gray-400">{{ selectedLabel }}</span><button
                                    type="button"
                                    class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                                    :disabled="saving || !hasCustomDefault" @click="resetDefault">{{
                                        t('wallpaper.resetDefault') }}</button>
                            </div>
                        </template>
                    </PreviewCard>
                    <div
                        class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4 space-y-4">
                        <div>
                            <ChatTypeToggle :label="t('wallpaper.fullScreen')"
                                v-model="settings.chatWallpaperFullScreen" />
                            <p class="mt-1 text-xs text-gray-400">{{ t('wallpaper.fullScreenDesc') }}</p>
                        </div>
                        <div>
                            <div class="flex items-center justify-between"><span
                                    class="text-sm text-gray-600 dark:text-gray-300">{{ t('wallpaper.overlay') }}</span><span
                                    class="text-xs text-gray-400">{{ settings.chatWallpaperOverlayOpacity }}%</span>
                            </div>
                            <input v-model.number="settings.chatWallpaperOverlayOpacity" type="range" min="0" max="100"
                                step="1" class="mt-2 w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">{{ t('wallpaper.overlayDesc') }}</p>
                        </div>
                        <div>
                            <div class="flex items-center justify-between"><span
                                    class="text-sm text-gray-600 dark:text-gray-300">{{ t('wallpaper.blur') }}</span><span
                                    class="text-xs text-gray-400">{{ settings.chatWallpaperBlur }}px</span></div>
                            <input v-model.number="settings.chatWallpaperBlur" type="range" min="0" max="24" step="1"
                                class="mt-2 w-full accent-blue-500" />
                        </div>
                    </div>
                </section>
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('wallpaper.addSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">{{ t('wallpaper.addDesc') }}</p>
                    <button type="button" :disabled="saving" @click="pickLocalWallpaper"
                        class="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors disabled:opacity-50">
                        {{ t('wallpaper.pickFile') }}</button>
                </section>
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{{
                            t('wallpaper.solidSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div class="mt-5 grid grid-cols-4 sm:grid-cols-6 gap-3"><button v-for="color in colors"
                            :key="color.value" type="button"
                            class="aspect-square rounded-xl border-2 transition-transform hover:scale-105"
                            :class="selectedKey === color.key ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-transparent'"
                            :style="{ backgroundColor: color.css }" :aria-label="color.label"
                            @click="setSolid(color)"></button></div>
                </section>
                <section>
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {{ t('wallpaper.savedSection') }}</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div v-if="loading" class="mt-5 py-8 text-center text-sm text-gray-400">{{ t('wallpaper.loading')
                    }}</div>
                    <div v-else-if="backgrounds.length === 0"
                        class="mt-5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 py-8 text-center text-sm text-gray-400">
                        {{ t('wallpaper.emptySaved') }}</div>
                    <div v-else class="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3"><button
                            v-for="background in backgrounds" :key="background.id" type="button"
                            v-context-menu="() => buildBackgroundMenu(background)"
                            class="relative aspect-4/3 overflow-hidden rounded-xl border bg-gray-100 dark:bg-gray-800 transition-colors"
                            :class="selectedKey === `remote:${background.id}` ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'"
                            @click="setRemote(background)">
                            <ChatBackgroundLayers :render="itemRenders[background.id] ?? null" :overlay-opacity="0" />
                            <div class="absolute inset-0 bg-linear-to-t from-black/25 to-transparent"></div>
                        </button></div>
                    <p v-if="error" class="mt-3 text-xs text-red-500">{{ error }}</p>
                </section>
                <label
                    class="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4 cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                    <div>
                        <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('wallpaper.darkMode') }}</p>
                        <p class="mt-0.5 text-xs text-gray-400">{{ t('wallpaper.darkModeDesc') }}</p>
                    </div><input v-model="forDarkTheme" type="checkbox" class="h-4 w-4 accent-blue-500"
                        @change="loadBackgrounds" />
                </label>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onTdlibUpdate } from '../../store/tdlibBus';
import { open } from '@tauri-apps/plugin-dialog';
import { useRouter } from 'vue-router';
import { ChevronLeft as ChevronLeftIcon, Share2 as ShareIcon, Trash2 as TrashIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend, ensureLocalFilePath, isFileReady, safeDownloadFile } from '../../utils/tdlib';
import { settings, type ChatWallpaperVisual } from '../../store/settings';
import { defaultBackgroundFor, emojiChatThemes } from '../../store/chatBackground';
import { isDark } from '../../store/theme';
import { showCopyJsonInMenus } from '../../store/debug';
import type { ContextMenuItem } from '../../components/contextMenu/types';
import { makeCopyJsonItem } from '../../components/contextMenu/copyJsonActions';
import PreviewCard from '../../components/settings/PreviewCard.vue';
import ChatTypeToggle from '../../components/settings/ChatTypeToggle.vue';
import ChatBackgroundLayers from '../../components/chat/ChatBackgroundLayers.vue';
import { DL_PRIORITY } from '../../utils/downloadPriority';
import {
    ensureJpegWallpaper,
    applySelectedWallpaper,
} from '../../utils/wallpaper';
import {
    fillBaseColor,
    localWallpaperRender,
    resolveChatBackground,
    type ChatBackgroundRender,
} from '../../utils/chatBackground';
import type { background, backgrounds, file, httpUrl } from 'tdlib-types';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const backgrounds = ref<background[]>([]);
const forDarkTheme = ref(false);
const selectedKey = ref('');
const selectedLabel = ref(t('wallpaper.followTelegram'));
const hasCustomDefault = ref(false);
const previewRender = ref<ChatBackgroundRender | null>(null);
/** 列表项缩略预览的渲染模型（含渐变 / freeform / 图案） */
const itemRenders = ref<Record<string, ChatBackgroundRender | null>>({});
let unlistenFile: (() => void) | undefined;
const colors = computed(() => [
    { key: 'solid:16777215', value: 16777215, css: '#ffffff', label: t('wallpaper.colorWhite') },
    { key: 'solid:16119285', value: 16119285, css: '#f5f5f5', label: t('wallpaper.colorFog') },
    { key: 'solid:15790320', value: 15790320, css: '#f0f0f0', label: t('wallpaper.colorSilver') },
    { key: 'solid:15132390', value: 15132390, css: '#e6f0ff', label: t('wallpaper.colorSky') },
    { key: 'solid:16777165', value: 16777165, css: '#fff5cd', label: t('wallpaper.colorCream') },
    { key: 'solid:15597825', value: 15597825, css: '#edff81', label: t('wallpaper.colorMint') },
]);
const selectedItem = computed(() =>
    backgrounds.value.find((item) => `remote:${item.id}` === selectedKey.value),
);

/** 缩略图 / 图案文档都很小，列表里统一下载，保证预览就是真实效果 */
function resolveOptions(files: 'full' | 'thumbnail') {
    return { dark: isDark.value, emojiThemes: emojiChatThemes(), files };
}

async function resolveItemRender(item: background, files: 'full' | 'thumbnail' = 'thumbnail') {
    itemRenders.value[item.id] = await resolveChatBackground(item, resolveOptions(files));
}

/** 预览卡：选中项 → 纯色 → 本地缓存 → TDLib 默认背景 */
async function updatePreview() {
    // 预览优先用原图（未下载完成时 resolveDocumentUrl 会回落缩略图）
    const item = selectedItem.value;
    if (item) {
        previewRender.value = await resolveChatBackground(item, resolveOptions('full'));
        return;
    }
    const solid = colors.value.find((color) => color.key === selectedKey.value);
    if (solid) {
        previewRender.value = {
            fill: { kind: 'solid', color: solid.css },
            dimming: 0,
            baseColor: solid.css,
        };
        return;
    }
    const local = localWallpaperRender(settings.chatWallpaper);
    if (local) {
        previewRender.value = local;
        return;
    }
    const current = defaultBackgroundFor(isDark.value);
    previewRender.value = current
        ? await resolveChatBackground(current, resolveOptions('full'))
        : null;
}

function goBack() { router.back(); }

/** 文件 id → 列表项，用于下载完成后回写并重算预览 */
const fileOwners = new Map<number, background>();

function indexFiles(item: background) {
    const thumbnailFile = item.document?.thumbnail?.file;
    const documentFile = item.document?.document;
    if (thumbnailFile?.id) fileOwners.set(thumbnailFile.id, item);
    if (documentFile?.id) fileOwners.set(documentFile.id, item);
}

async function prepareBackground(item: background) {
    indexFiles(item);
    const thumbnail = item.document?.thumbnail;
    if (thumbnail?.file && !isFileReady(thumbnail.file)) {
        await ensureLocalFilePath(thumbnail.file, { priority: DL_PRIORITY.THUMBNAIL });
    }
    // 图案文档是几 KB 的 gzip SVG，下载后列表才能显示真实图案（而非只有底色）
    if (item.type._ === 'backgroundTypePattern') {
        await ensureLocalFilePath(item.document?.document, { priority: DL_PRIORITY.THUMBNAIL });
    }
    await resolveItemRender(item);
}

/** 壁纸原图（高清）；填充 / 图案类背景没有需要落地的原图 */
async function ensureFullResolution(item: background): Promise<string> {
    const documentFile = item.document?.document;
    if (!documentFile) throw new Error(t('wallpaper.noHdFile'));
    if (!isFileReady(documentFile)) {
        await safeDownloadFile(documentFile.id, true, DL_PRIORITY.DEFAULT);
    }
    const refreshed = await tdlibSend({ _: 'getFile', file_id: documentFile.id }) as file;
    item.document!.document = refreshed;
    await resolveItemRender(item, 'full');
    if (!isFileReady(refreshed)) throw new Error(t('wallpaper.stillDownloading'));
    return refreshed.local.path!;
}

async function loadBackgrounds() {
    loading.value = true;
    error.value = '';
    itemRenders.value = {};
    fileOwners.clear();
    try {
        const result = await tdlibSend({ _: 'getInstalledBackgrounds', for_dark_theme: forDarkTheme.value }) as backgrounds;
        backgrounds.value = result.backgrounds ?? [];
        await Promise.all(backgrounds.value.map(prepareBackground));
        // 回填选中态：纯本地壁纸优先（云端没有它的记录），其次当前 TDLib 默认背景
        const current = settings.chatWallpaper;
        if (current?.source === 'local') {
            const match = colors.value.find((color) => color.css.toLowerCase() === (current.color ?? '').toLowerCase());
            selectedKey.value = match?.key ?? '';
            selectedLabel.value = match?.label ?? t('wallpaper.solid');
            hasCustomDefault.value = true;
        } else {
            const cloud = defaultBackgroundFor(isDark.value);
            const match = cloud ? backgrounds.value.find((item) => item.id === cloud.id) : undefined;
            if (match && !selectedItem.value) {
                selectedKey.value = `remote:${match.id}`;
                selectedLabel.value = match.name || t('wallpaper.custom');
            }
            hasCustomDefault.value = !!(cloud || settings.chatWallpaper);
        }
        await updatePreview();
    } catch (err: any) {
        error.value = err?.message || t('wallpaper.loadFailed');
    } finally {
        loading.value = false;
    }
}

/**
 * 选择壁纸后的统一落点：先写本地缓存（重启 / 切换账户都靠这份），
 * 再把 `cloud` 同步到 TDLib 默认背景。
 *
 * `cloud` 为 null 表示纯本地壁纸（纯色）——云端不会被写入，也不会被读取覆盖。
 */
async function save(opts: {
    visual: ChatWallpaperVisual;
    label: string;
    key: string;
    sourcePathForCopy?: string;
    cloud?: { background: any; type: any } | null;
}) {
    saving.value = true;
    try {
        await applySelectedWallpaper(opts.visual, opts.key, opts.sourcePathForCopy);

        let resultId = opts.key;
        // 同步到云端（失败不影响本地已缓存）
        if (opts.cloud) {
            try {
                const result = await tdlibSend({
                    _: 'setDefaultBackground',
                    background: opts.cloud.background,
                    type: opts.cloud.type,
                    for_dark_theme: forDarkTheme.value,
                }) as background;
                if (result?.id) resultId = `remote:${result.id}`;
            } catch (e) {
                console.warn('[WallpaperSettings] setDefaultBackground (cloud) failed:', e);
            }
        }

        selectedKey.value = resultId;
        selectedLabel.value = opts.label;
        hasCustomDefault.value = true;

        await loadBackgrounds();
        MessagePlugin.success(t('wallpaper.updated'));
    } catch (err: any) {
        console.error('[WallpaperSettings] save wallpaper failed:', err);
        MessagePlugin.error(err?.message || err?.error?.message || t('wallpaper.setFailed'));
    } finally {
        saving.value = false;
    }
}

/** 纯色壁纸：纯本地使用，不上传 Telegram */
function setSolid(color: (typeof colors.value)[number]) {
    void save({
        visual: { kind: 'color', color: color.css, source: 'local' },
        label: color.label,
        key: color.key,
    });
}

async function pickLocalWallpaper() {
    const selected = await open({ multiple: false, filters: [{ name: t('lng_in_dlg_photo'), extensions: ['jpg', 'jpeg', 'png'] }] });
    if (!selected) return;
    const rawPath = typeof selected === 'string' ? selected : String(selected);
    try {
        const filePath = await ensureJpegWallpaper(rawPath);
        await save({
            visual: { kind: 'image', path: filePath, source: 'tg' },
            label: t('wallpaper.local'),
            key: `local:${filePath}`,
            sourcePathForCopy: filePath,
            cloud: {
                background: { _: 'inputBackgroundLocal', background: { _: 'inputFileLocal', path: filePath } },
                type: { _: 'backgroundTypeWallpaper', is_blurred: false, is_moving: false },
            },
        });
    } catch (err: any) {
        console.error('[WallpaperSettings] pick local wallpaper failed:', err);
        MessagePlugin.error(err?.message || t('wallpaper.pickFailed'));
        saving.value = false;
    }
}

/**
 * 选用已保存背景。
 * 图片壁纸落一份本地副本（离线可用）；填充 / 渐变 / 图案没有原图，
 * 本地只记主色调，真正的渐变与图案由 TDLib 背景描述渲染。
 */
async function setRemote(item: background) {
    try {
        const render = await resolveChatBackground(item, resolveOptions('thumbnail'));
        let visual: ChatWallpaperVisual;
        let sourcePath: string | undefined;

        if (item.type._ === 'backgroundTypeWallpaper' && item.document?.document) {
            const path = await ensureFullResolution(item);
            visual = { kind: 'image', path, source: 'tg' };
            sourcePath = path;
        } else {
            visual = { kind: 'color', color: fillBaseColor(render?.fill ?? null) ?? '#f5f5f5', source: 'tg' };
        }

        await save({
            visual,
            label: item.name,
            key: `remote:${item.id}`,
            sourcePathForCopy: sourcePath,
            cloud: { background: { _: 'inputBackgroundRemote', background_id: item.id }, type: item.type },
        });
    } catch (err: any) {
        console.error('[WallpaperSettings] wallpaper unavailable:', err);
        MessagePlugin.error(err?.message || t('wallpaper.notReady'));
        saving.value = false;
    }
}

/** 已保存壁纸的右键菜单：复制 JSON（调试开关） / 分享 / 删除 */
function buildBackgroundMenu(item: background): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

    if (showCopyJsonInMenus.value) {
        items.push(makeCopyJsonItem({
            key: 'copy-json',
            label: t('wallpaper.copyJson'),
            getData: () => item,
        }));
    }

    items.push({
        key: 'share',
        label: t('wallpaper.share'),
        icon: ShareIcon,
        divider: showCopyJsonInMenus.value,
        onClick: () => { void shareBackground(item); },
    });

    items.push({
        key: 'delete',
        label: t('wallpaper.delete'),
        icon: TrashIcon,
        danger: true,
        divider: true,
        onClick: () => { void removeBackground(item); },
    });

    return items;
}

/** 分享：取该壁纸的 t.me/bg 链接（TDLib 持久链接）并复制 */
async function shareBackground(item: background) {
    try {
        const url = await tdlibSend({ _: 'getBackgroundUrl', name: item.name, type: item.type }) as httpUrl;
        if (url?._ !== 'httpUrl' || !url.url) {
            MessagePlugin.warning(t('wallpaper.shareUnavailable'));
            return;
        }
        await navigator.clipboard.writeText(url.url);
        MessagePlugin.success(t('wallpaper.shareCopied'));
    } catch (err: any) {
        console.error('[WallpaperSettings] getBackgroundUrl failed:', err);
        MessagePlugin.error(err?.message || t('wallpaper.shareFailed'));
    }
}

/** 删除：从已安装壁纸列表移除；删的若是当前选中的那张，同时清掉本地缓存副本 */
async function removeBackground(item: background) {
    if (!window.confirm(t('wallpaper.deleteConfirm'))) return;
    try {
        await tdlibSend({ _: 'removeInstalledBackground', background_id: item.id });
        if (selectedKey.value === `remote:${item.id}`) {
            await applySelectedWallpaper(null);
            selectedKey.value = '';
            selectedLabel.value = t('wallpaper.followTelegram');
            hasCustomDefault.value = false;
        }
        MessagePlugin.success(t('wallpaper.deleted'));
        await loadBackgrounds();
    } catch (err: any) {
        console.error('[WallpaperSettings] removeInstalledBackground failed:', err);
        MessagePlugin.error(err?.message || t('wallpaper.deleteFailed'));
    }
}

async function resetDefault() {
    saving.value = true;
    // 纯本地壁纸从没写进云端，此时不要动 TDLib 默认背景——
    // 那份是别的来源（官方默认或在其它设备设的），删掉会连带影响那边。
    const wasCloudBacked = settings.chatWallpaper?.source !== 'local';
    try {
        await applySelectedWallpaper(null);
        if (wasCloudBacked) {
            try {
                await tdlibSend({ _: 'deleteDefaultBackground', for_dark_theme: forDarkTheme.value });
            } catch (e) {
                console.warn('[WallpaperSettings] deleteDefaultBackground failed:', e);
            }
        }
        selectedKey.value = '';
        selectedLabel.value = t('wallpaper.followTelegram');
        hasCustomDefault.value = false;
        MessagePlugin.success(t('wallpaper.resetOk'));
        await loadBackgrounds();
    } catch (err: any) {
        MessagePlugin.error(err?.message || t('wallpaper.resetFailed'));
    } finally {
        saving.value = false;
    }
}

onMounted(async () => {
    // 当前背景已在启动时从本地缓存恢复，这里只拉「已保存壁纸」列表
    unlistenFile = onTdlibUpdate('file', (update) => {
        if (update._ !== 'updateFile') return;
        const updatedFile = (update as any).file as file;
        const item = fileOwners.get(updatedFile.id);
        if (!item?.document) return;
        if (item.document.thumbnail?.file.id === updatedFile.id) item.document.thumbnail.file = updatedFile;
        if (item.document.document.id === updatedFile.id) item.document.document = updatedFile;
        void resolveItemRender(item);
        if (selectedItem.value?.id === item.id) void updatePreview();
    });
    await loadBackgrounds();
});
onUnmounted(() => { unlistenFile?.(); });
</script>
