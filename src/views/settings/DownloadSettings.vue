<template>
    <div class="h-full flex flex-col bg-white dark:bg-gray-900">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-lg font-semibold">数据和存储</h2>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
            <div class="max-w-2xl">

                <!-- ===== 自动下载区域 ===== -->
                <div class="space-y-6">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">自动下载
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 自动下载总开关 -->
                    <div class="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div>
                            <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">启用自动下载</h4>
                            <p class="text-xs text-gray-400 mt-0.5">关闭后将不会自动下载任何媒体文件</p>
                        </div>
                        <ToggleSwitch :modelValue="settings.autoDownload.enabled"
                            @update:modelValue="settings.autoDownload.enabled = $event" />
                    </div>

                    <template v-if="settings.autoDownload.enabled">

                        <!-- ===== 图片（折叠） ===== -->
                        <CollapsibleSection :open="openSections.photos" title="图片" description="视频封面、图片、贴纸、音频封面等"
                            @toggle="openSections.photos = !openSections.photos">
                            <ChatTypeToggle v-for="cat in categories" :key="'photo-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.photos[cat.key]"
                                @update:modelValue="settings.autoDownload.photos[cat.key] = $event" />
                        </CollapsibleSection>

                        <!-- ===== 视频（折叠） ===== -->
                        <CollapsibleSection :open="openSections.videos" title="视频" description="自动下载小于指定体积的视频"
                            @toggle="openSections.videos = !openSections.videos">
                            <ChatTypeToggle v-for="cat in categories" :key="'video-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.videos[cat.key]"
                                @update:modelValue="settings.autoDownload.videos[cat.key] = $event" />
                            <div class="flex items-center justify-between py-2 mt-1">
                                <span class="text-sm text-gray-600 dark:text-gray-400">最大体积</span>
                                <div class="flex items-center gap-2">
                                    <input type="range" min="1" max="500" step="1"
                                        v-model.number="settings.autoDownload.videos.maxSize"
                                        class="w-24 h-1 accent-blue-500" />
                                    <EditableNumber :value="settings.autoDownload.videos.maxSize" unit="MB" :min="1"
                                        :max="500" @update:value="settings.autoDownload.videos.maxSize = $event" />
                                </div>
                            </div>
                        </CollapsibleSection>

                        <!-- ===== 文件（折叠） ===== -->
                        <CollapsibleSection :open="openSections.files" title="文件" description="自动下载小于指定体积的文档文件"
                            @toggle="openSections.files = !openSections.files">
                            <ChatTypeToggle v-for="cat in categories" :key="'file-' + cat.key" :label="cat.label"
                                :modelValue="settings.autoDownload.files[cat.key]"
                                @update:modelValue="settings.autoDownload.files[cat.key] = $event" />
                            <div class="flex items-center justify-between py-2 mt-1">
                                <span class="text-sm text-gray-600 dark:text-gray-400">最大体积</span>
                                <div class="flex items-center gap-2">
                                    <input type="range" min="1" max="500" step="1"
                                        v-model.number="settings.autoDownload.files.maxSize"
                                        class="w-24 h-1 accent-blue-500" />
                                    <EditableNumber :value="settings.autoDownload.files.maxSize" unit="MB" :min="1"
                                        :max="500" @update:value="settings.autoDownload.files.maxSize = $event" />
                                </div>
                            </div>
                        </CollapsibleSection>

                    </template>

                    <div v-else class="pb-4 text-xs text-gray-400 text-center">
                        自动下载已关闭，需要手动点击下载按钮来获取媒体文件。
                    </div>
                </div>

                <!-- ===== 存储管理区域 ===== -->
                <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">存储管理
                        </h3>
                        <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>

                    <!-- 数据存放位置选择 -->
                    <div class="mb-8 mt-6">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">数据存放位置</h4>

                        <div class="space-y-3">
                            <!-- AppData 模式 -->
                            <div class="flex items-center justify-between p-4 rounded-xl border transition-colors"
                                :class="dataMode === 'appdata'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700'">
                                <div class="flex items-center">
                                    <div
                                        class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-gray-100 dark:bg-gray-700 text-gray-500">
                                        <AppWindowIcon class="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">系统数据目录
                                            （AppData）</h4>
                                        <p class="text-xs text-gray-400 mt-0.5">数据保存在系统用户目录，卸载/移动应用后数据不受影响
                                        </p>
                                        <p class="text-[11px] text-gray-300 dark:text-gray-600 mt-1 break-all">{{
                                            dataInfo.appdata_dir }}</p>
                                    </div>
                                </div>
                                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                    :class="dataMode === 'appdata' ? 'border-blue-500' : 'border-gray-300'">
                                    <div v-if="dataMode === 'appdata'" class="w-2 h-2 rounded-full bg-blue-500"></div>
                                </div>
                            </div>

                            <!-- 应用自带目录模式 -->
                            <div class="flex items-center justify-between p-4 rounded-xl border transition-colors"
                                :class="dataMode === 'portable'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-gray-700'">
                                <div class="flex items-center">
                                    <div
                                        class="w-9 h-9 rounded-full flex items-center justify-center mr-3 bg-teal-100 dark:bg-teal-900/30 text-teal-600">
                                        <FolderOpenIcon class="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">应用自带目录（便携）
                                        </h4>
                                        <p class="text-xs text-gray-400 mt-0.5">数据保存在应用目录内，随应用一起移动</p>
                                        <p class="text-[11px] text-gray-300 dark:text-gray-600 mt-1 break-all">{{
                                            dataInfo.portable_dir }}</p>
                                    </div>
                                </div>
                                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                    :class="dataMode === 'portable' ? 'border-blue-500' : 'border-gray-300'">
                                    <div v-if="dataMode === 'portable'" class="w-2 h-2 rounded-full bg-blue-500"></div>
                                </div>
                            </div>
                        </div>

                        <p class="text-xs text-amber-500 dark:text-amber-400 mt-3">
                            切换存储位置需要关闭 TDLib 并移动数据，完成后应用将自动重启。
                        </p>
                    </div>

                    <!-- 数据统计 -->
                    <div class="mb-6">
                        <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">数据统计</h4>

                        <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div
                                class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-600 dark:text-gray-300">当前数据目录</span>
                                <span class="text-xs text-gray-400 font-mono break-all max-w-[60%] text-right">{{
                                    dataInfo.current_dir }}</span>
                            </div>
                            <div
                                class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-600 dark:text-gray-300">TDLib 数据库</span>
                                <span class="text-xs text-gray-500">{{ formatSize(dataInfo.tdlib_size) }}</span>
                            </div>
                            <div
                                class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                <span class="text-sm text-gray-600 dark:text-gray-300">下载记录</span>
                                <span class="text-xs text-gray-500">{{ formatSize(dataInfo.downloads_size) }}</span>
                            </div>
                            <div class="flex items-center justify-between px-4 py-3">
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">总计</span>
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{
                                    formatSize(dataInfo.total_size) }}</span>
                            </div>
                        </div>

                        <!-- 迁移按钮 -->
                        <button type="button" @click="startMigration"
                            class="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            :disabled="migrating">
                            <FolderSyncIcon class="w-5 h-5" />
                            {{ buttonLabel }}
                        </button>
                    </div>
                </div>

            </div>
        </div>

        <!-- 迁移提示弹窗（纯文本，无进度条） -->
        <Teleport to="body">
            <Transition name="elc-fade">
                <div v-if="migrating"
                    class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div
                        class="w-105 max-w-[92vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden p-5 flex flex-col items-center">
                        <FolderSyncIcon class="w-10 h-10 text-blue-500 animate-pulse mb-3" />
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">正在迁移数据</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 text-center">{{ progressMessage }}</p>
                        <p class="mt-3 text-[11px] text-gray-400 text-center">
                            迁移过程中会关闭 TDLib 并移动数据，完成后应用将自动重启。
                        </p>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { MessagePlugin } from 'tdesign-vue-next';
import { AppWindowIcon, FolderOpenIcon, FolderSyncIcon } from 'lucide-vue-next';
import { settings } from '../../store/settings';
import type { AutoDownloadByType } from '../../store/settings';
import ToggleSwitch from '../../components/settings/ToggleSwitch.vue';
import CollapsibleSection from '../../components/settings/CollapsibleSection.vue';
import ChatTypeToggle from '../../components/settings/ChatTypeToggle.vue';
import EditableNumber from '../../components/settings/EditableNumber.vue';

interface DataLocationInfo {
    mode: string;
    current_dir: string;
    appdata_dir: string;
    portable_dir: string;
    config_dir: string;
    tdlib_size: number;
    downloads_size: number;
    total_size: number;
}

interface MigrationProgress {
    percent: number;
    stage: string;
    message: string;
}

const categories: { key: keyof AutoDownloadByType; label: string }[] = [
    { key: 'contacts', label: '联系人' },
    { key: 'privateChats', label: '私聊' },
    { key: 'channels', label: '频道' },
    { key: 'groups', label: '群组' },
];

const openSections = reactive({
    photos: false,
    videos: false,
    files: false,
});

// ===== 存储位置/数据迁移 =====
const dataInfo = ref<DataLocationInfo>({
    mode: 'appdata',
    current_dir: '',
    appdata_dir: '',
    portable_dir: '',
    config_dir: '',
    tdlib_size: 0,
    downloads_size: 0,
    total_size: 0,
});

const dataMode = computed(() => dataInfo.value.mode);
const migrating = ref(false);
const progressMessage = ref('');

let unlistenFn: UnlistenFn | null = null;

function formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return (val >= 100 ? val.toFixed(0) : val.toFixed(1)) + ' ' + units[i];
}

async function loadDataInfo() {
    try {
        dataInfo.value = await invoke<DataLocationInfo>('get_data_location');
    } catch (e) {
        console.error('get_data_location failed:', e);
    }
}

const buttonLabel = computed(() => {
    if (migrating.value) return '正在迁移…';
    return dataMode.value === 'appdata'
        ? '迁移到应用自带目录'
        : '迁移回系统数据目录（AppData）';
});

async function startMigration() {
    const targetMode = dataMode.value === 'appdata' ? 'portable' : 'appdata';
    const from = dataMode.value === 'appdata' ? '系统数据目录' : '应用自带目录';

    // 迁移前确认（轻量，使用原生 confirm）
    const ok = window.confirm(
        `将从此位置迁移数据：\n${from}\n\n迁移过程中会关闭 TDLib 并移动全部数据，完成后应用将自动重启。是否继续？`
    );

    if (!ok) return;

    migrating.value = true;
    progressMessage.value = '准备迁移…';

    try {
        await invoke('migrate_data_dir', { mode: targetMode });
        // 迁移成功且已触发重启；此处的返回不会真正执行（进程被重启）
    } catch (e) {
        console.error('migrate_data_dir failed:', e);
        migrating.value = false;
        MessagePlugin.error({
            content: String(e || '迁移失败'),
            placement: 'top-right',
        });
        await loadDataInfo();
    }
}

onMounted(async () => {
    await loadDataInfo();
    unlistenFn = await listen<MigrationProgress>('data-migration-progress', (event) => {
        const p = event.payload;
        progressMessage.value = p.message || '处理中…';
        // 出错时后端也会立即重启；此处仅用于 UI 反馈
        if (p.stage === 'error') {
            progressMessage.value = p.message || '迁移出错';
        }
    });
});

onUnmounted(() => {
    unlistenFn?.();
});
</script>

<style scoped></style>
