<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
            <button type="button" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" @click="goBack"
                aria-label="返回">
                <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">对话壁纸</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl space-y-6">
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">默认壁纸
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">没有单独设置聊天背景时，新对话会使用这里的壁纸。</p>
                    <div class="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div class="h-32 relative overflow-hidden">
                            <div class="absolute inset-0" :style="previewBackgroundStyle"></div>
                            <div class="absolute inset-0 bg-white"
                                :style="{ opacity: settings.chatWallpaperOverlayOpacity / 100 }"></div>
                            <div class="absolute inset-0 bg-black/5"></div>
                            <div
                                class="absolute left-4 bottom-4 z-10 rounded-2xl rounded-bl-md bg-white/90 dark:bg-gray-800/90 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 shadow-sm">
                                对话壁纸预览</div>
                            <div
                                class="absolute right-4 bottom-4 z-10 rounded-2xl rounded-br-md bg-blue-500/90 px-3 py-2 text-xs text-white shadow-sm">
                                看起来不错</div>
                        </div>
                        <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3">
                            <span class="text-xs text-gray-500 dark:text-gray-400">{{ selectedLabel }}</span><button
                                type="button"
                                class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                                :disabled="saving || !hasCustomDefault" @click="resetDefault">恢复默认</button>
                        </div>
                    </div>
                    <div
                        class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-4">
                        <ChatTypeToggle label="全屏显示壁纸" v-model="settings.chatWallpaperFullScreen" />
                        <div>
                            <div class="flex items-center justify-between"><span
                                    class="text-sm text-gray-600 dark:text-gray-300">白色叠加</span><span
                                    class="text-xs text-gray-400">{{ settings.chatWallpaperOverlayOpacity }}%</span>
                            </div>
                            <input v-model.number="settings.chatWallpaperOverlayOpacity" type="range" min="0" max="100"
                                step="1" class="mt-2 w-full accent-blue-500" />
                            <p class="mt-1 text-xs text-gray-400">降低壁纸对消息和界面的干扰</p>
                        </div>
                        <div>
                            <div class="flex items-center justify-between"><span
                                    class="text-sm text-gray-600 dark:text-gray-300">图片模糊度</span><span
                                    class="text-xs text-gray-400">{{ settings.chatWallpaperBlur }}px</span></div>
                            <input v-model.number="settings.chatWallpaperBlur" type="range" min="0" max="24" step="1"
                                class="mt-2 w-full accent-blue-500" />
                        </div>
                    </div>
                </section>
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            添加壁纸</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">从本地选择图片文件作为壁纸</p>
                    <button type="button" :disabled="saving" @click="pickLocalWallpaper"
                        class="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors disabled:opacity-50">
                        选择图片文件</button>
                </section>
                <section class="border-b border-gray-200 dark:border-gray-700 pb-8">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">纯色壁纸
                        </h3>
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
                            已保存壁纸</h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                    <div v-if="loading" class="mt-5 py-8 text-center text-sm text-gray-400">正在加载壁纸...</div>
                    <div v-else-if="backgrounds.length === 0"
                        class="mt-5 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 py-8 text-center text-sm text-gray-400">
                        暂无已保存壁纸</div>
                    <div v-else class="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3"><button
                            v-for="background in backgrounds" :key="background.id" type="button"
                            class="relative aspect-4/3 overflow-hidden rounded-xl border bg-gray-100 dark:bg-gray-800 transition-colors"
                            :class="selectedKey === `remote:${background.id}` ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'"
                            @click="setRemote(background)"><img
                                v-if="coverSources[background.id] || thumbnailSources[background.id]"
                                :src="coverSources[background.id] || thumbnailSources[background.id]" alt=""
                                class="absolute inset-0 h-full w-full object-cover" />
                            <div v-else class="absolute inset-0" :style="backgroundPreviewStyle(background)"></div>
                            <div class="absolute inset-0 bg-linear-to-t from-black/25 to-transparent"></div>
                        </button></div>
                    <p v-if="error" class="mt-3 text-xs text-red-500">{{ error }}</p>
                </section>
                <label
                    class="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 cursor-pointer">
                    <div>
                        <p class="text-sm text-gray-800 dark:text-gray-100">深色模式下使用深色壁纸</p>
                        <p class="mt-0.5 text-xs text-gray-400">切换后重新加载对应的已安装壁纸</p>
                    </div><input v-model="forDarkTheme" type="checkbox" class="h-4 w-4 accent-blue-500"
                        @change="loadBackgrounds" />
                </label>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useRouter } from 'vue-router';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-vue-next';
import { MessagePlugin } from 'tdesign-vue-next';
import { tdlibSend, isFileReady, safeDownloadFile } from '../../utils/tdlib';
import { isThumbnailImgRenderable } from '../../utils/thumbnail';
import { settings } from '../../store/settings';
import { DL_PRIORITY } from '../../utils/downloadPriority';
import ChatTypeToggle from '../../components/settings/ChatTypeToggle.vue';
import type { background, backgrounds, file, Update } from 'tdlib-types';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const backgrounds = ref<background[]>([]);
const forDarkTheme = ref(false);
const selectedKey = ref('');
const selectedLabel = ref('跟随 Telegram 默认壁纸');
const hasCustomDefault = ref(false);
const thumbnailSources = ref<Record<string, string>>({});
const coverSources = ref<Record<string, string>>({});
let unlisten: UnlistenFn | undefined;
const colors = [
    { key: 'solid:16777215', value: 16777215, css: '#ffffff', label: '白色' }, { key: 'solid:16119285', value: 16119285, css: '#f5f5f5', label: '雾灰' }, { key: 'solid:15790320', value: 15790320, css: '#f0f0f0', label: '银灰' }, { key: 'solid:15132390', value: 15132390, css: '#e6f0ff', label: '晴蓝' }, { key: 'solid:16777165', value: 16777165, css: '#fff5cd', label: '奶油黄' }, { key: 'solid:15597825', value: 15597825, css: '#edff81', label: '薄荷绿' },
];
const previewStyle = computed(() => {
    const color = colors.find((item) => item.key === selectedKey.value);
    if (color) return { backgroundColor: color.css };
    const visual = settings.chatWallpaper;
    if (visual?.kind === 'image' && visual.path) {
        return { backgroundColor: '#f5f5f5', backgroundImage: `url("${convertFileSrc(visual.path)}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (visual?.color) return { backgroundColor: visual.color };
    return { background: 'linear-gradient(135deg, #dbeafe, #fef3c7)' };
});
const previewBackgroundStyle = computed(() => ({
    ...previewStyle.value,
    filter: `blur(${settings.chatWallpaperBlur}px)`,
    transform: settings.chatWallpaperBlur > 0 ? 'scale(1.05)' : undefined,
}));
function goBack() { router.back(); }
function backgroundPreviewStyle(item: background) { return item.is_dark ? { background: 'linear-gradient(135deg, #172554, #334155)' } : { background: 'linear-gradient(135deg, #bfdbfe, #fef3c7)' }; }
function getThumbnail(item: background) { return item.document?.thumbnail; }
function updateThumbnailSource(item: background) {
    const thumbnail = getThumbnail(item);
    if (!thumbnail || !isThumbnailImgRenderable(thumbnail.format)) return;
    const thumbnailFile = thumbnail.file;
    if (isFileReady(thumbnailFile)) {
        thumbnailSources.value[item.id] = convertFileSrc(thumbnailFile.local.path);
    }
}
function getDocumentFile(item: background) { return item.document?.document; }
function updateCoverSource(item: background) {
    const documentFile = getDocumentFile(item);
    if (documentFile && isFileReady(documentFile)) coverSources.value[item.id] = convertFileSrc(documentFile.local.path);
}
async function prepareThumbnail(item: background) {
    const thumbnail = getThumbnail(item);
    if (thumbnail && isThumbnailImgRenderable(thumbnail.format)) {
        updateThumbnailSource(item);
        if (!isFileReady(thumbnail.file)) await safeDownloadFile(thumbnail.file.id, true, DL_PRIORITY.THUMBNAIL);
        updateThumbnailSource(item);
    }
}
async function ensureFullResolution(item: background): Promise<string> {
    const documentFile = getDocumentFile(item);
    if (!documentFile) throw new Error('该壁纸没有可用的高清文件');
    if (!isFileReady(documentFile)) {
        await safeDownloadFile(documentFile.id, true, DL_PRIORITY.DEFAULT);
    }
    const refreshed = await tdlibSend({ _: 'getFile', file_id: documentFile.id }) as file;
    item.document!.document = refreshed;
    updateCoverSource(item);
    if (!isFileReady(refreshed)) throw new Error('高清壁纸仍在下载中，请稍后重试');
    return refreshed.local.path!;
}
async function loadBackgrounds() { loading.value = true; error.value = ''; thumbnailSources.value = {}; coverSources.value = {}; try { const result = await tdlibSend({ _: 'getInstalledBackgrounds', for_dark_theme: forDarkTheme.value }) as backgrounds; backgrounds.value = result.backgrounds ?? []; await Promise.all(backgrounds.value.map(prepareThumbnail)); } catch (err: any) { error.value = err?.message || '加载壁纸失败'; } finally { loading.value = false; } }
async function save(backgroundInput: any, type: any, label: string, key: string, visual: { kind: 'color' | 'image'; color?: string; path?: string }, localDoc?: { thumbnailPath?: string; documentPath?: string }) { saving.value = true; try { await tdlibSend({ _: 'setDefaultBackground', background: backgroundInput, type, for_dark_theme: forDarkTheme.value }); settings.chatWallpaper = visual; selectedKey.value = key; selectedLabel.value = label; hasCustomDefault.value = true; window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed')); if (localDoc) { const fakeId = `local_${Date.now()}`; const fakeDoc: any = { _: 'document', file_name: 'wallpaper.jpg', mime_type: 'image/jpeg', document: { _: 'file', id: Date.now(), size: 0, expected_size: 0, local: { _: 'localFile', can_be_downloaded: false, can_be_uploaded: false, is_downloading_active: false, is_downloading_completed: true, is_uploading_active: false, is_uploading_completed: false, path: localDoc.documentPath ?? localDoc.thumbnailPath ?? '' }, remote: { _: 'remoteFile', id: '', unique_id: '', is_uploading_active: false, is_uploading_completed: false } } }; if (localDoc.thumbnailPath) { fakeDoc.thumbnail = { _: 'thumbnail', format: { _: 'thumbnailFormatJpeg' }, width: 0, height: 0, file: { _: 'file', id: Date.now() + 1, size: 0, expected_size: 0, local: { _: 'localFile', can_be_downloaded: false, can_be_uploaded: false, is_downloading_active: false, is_downloading_completed: true, is_uploading_active: false, is_uploading_completed: false, path: localDoc.thumbnailPath }, remote: { _: 'remoteFile', id: '', unique_id: '', is_uploading_active: false, is_uploading_completed: false } } }; } const newItem: background = { _: 'background', id: fakeId, is_default: false, is_dark: false, name: label, document: fakeDoc, type: type as any }; backgrounds.value = [...backgrounds.value, newItem]; if (localDoc.thumbnailPath) thumbnailSources.value[fakeId] = convertFileSrc(localDoc.thumbnailPath); if (localDoc.documentPath) coverSources.value[fakeId] = convertFileSrc(localDoc.documentPath); } MessagePlugin.success('对话壁纸已更新'); } catch (err: any) { console.error('[WallpaperSettings] setDefaultBackground failed:', err); MessagePlugin.error(err?.message || err?.error?.message || '设置壁纸失败'); } finally { saving.value = false; } }
function setSolid(color: typeof colors[number]) { void save(null, { _: 'backgroundTypeFill', fill: { _: 'backgroundFillSolid', color: color.value } }, color.label, color.key, { kind: 'color', color: color.css }); }
async function pickLocalWallpaper() {
    const selected = await open({ multiple: false, filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }] });
    if (!selected) return;
    const filePath = typeof selected === 'string' ? selected : selected as string;
    await save(
        { _: 'inputBackgroundLocal', background: { _: 'inputFileLocal', path: filePath } },
        { _: 'backgroundTypeWallpaper', is_blurred: false, is_moving: false },
        '本地壁纸',
        `local:${filePath}`,
        { kind: 'image', path: filePath },
        { thumbnailPath: filePath, documentPath: filePath },
    );
}
async function setRemote(item: background) {
    saving.value = true;
    try {
        const path = await ensureFullResolution(item);
        await save({ _: 'inputBackgroundRemote', background_id: item.id }, item.type, item.name, `remote:${item.id}`, { kind: 'image', path });
    } catch (err: any) {
        console.error('[WallpaperSettings] high-resolution wallpaper unavailable:', err);
        MessagePlugin.error(err?.message || '高清壁纸尚未准备好');
    } finally {
        saving.value = false;
    }
}
async function resetDefault() { saving.value = true; try { await tdlibSend({ _: 'deleteDefaultBackground', for_dark_theme: forDarkTheme.value }); settings.chatWallpaper = null; selectedKey.value = ''; selectedLabel.value = '跟随 Telegram 默认壁纸'; hasCustomDefault.value = false; window.dispatchEvent(new Event('tdgram:chat-wallpaper-changed')); MessagePlugin.success('已恢复默认壁纸'); await loadBackgrounds(); } catch (err: any) { MessagePlugin.error(err?.message || '恢复默认壁纸失败'); } finally { saving.value = false; } }
onMounted(async () => {
    unlisten = await listen<Update>('tdlib-update', (event) => {
        if (event.payload._ !== 'updateFile') return;
        const updatedFile = event.payload.file as file;
        const item = backgrounds.value.find((background) => background.document?.thumbnail?.file.id === updatedFile.id || background.document?.document.id === updatedFile.id);
        if (!item?.document) return;
        if (item.document.thumbnail?.file.id === updatedFile.id) {
            item.document.thumbnail.file = updatedFile;
            updateThumbnailSource(item);
        }
        if (item.document.document.id === updatedFile.id) {
            item.document.document = updatedFile;
            updateCoverSource(item);
        }
    });
    await loadBackgrounds();
});
onUnmounted(() => { unlisten?.(); });
</script>