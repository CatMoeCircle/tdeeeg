<template>
    <!-- 贴纸缩略图：只有 file id，按格式挑渲染方式（webp → img / tgs → Lottie / webm → video） -->
    <span v-if="loading || src" class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded"
        :style="{ width: size + 'px', height: size + 'px' }">
        <TgsPlayer v-if="kind === 'tgs' && src" :src="src" :size="size" :loop="true" :autoplay="true"
            @error="onMediaError" />
        <video v-else-if="kind === 'webm' && src" :src="src" autoplay loop muted playsinline
            class="h-full w-full object-contain" @error="onMediaError" />
        <img v-else-if="src" :src="src" class="h-full w-full object-contain" :alt="alt" draggable="false"
            @error="onMediaError" />
        <!-- 还没就绪：灰色骨架；拿不到文件就什么都不留（chip 里还有 emoji 字符兜底） -->
        <span v-else-if="loading" class="h-full w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </span>
</template>

<script setup lang="ts">
/**
 * 按文件 id 显示一张贴纸（AI 接管的「本人常用贴纸」用）。
 *
 * 风格画像里只存了贴纸的**主文件 id**（TallyItem.id），没有 sticker 对象，
 * 所以这里：getFile 拿本地状态 → 没下载就用 downloadFile 拉下来 → convertFileSrc 出 URL。
 * 格式从 TallyItem.format 来（统计时记下的）；旧数据没记就按路径后缀 / 文件头猜。
 * 全部失败时只是留一个灰块，不抛错、不影响设置页。
 */
import { onMounted, ref, shallowRef } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { file } from 'tdlib-types';
import TgsPlayer from '../common/TgsPlayer.vue';
import { ensureLocalFilePath, localPathIfReady, metaDownloadFile, tdlibSend } from '../../utils/tdlib';
import { DL_TAG } from '../../utils/downloadTags';
import type { StickerKind } from '../../utils/aiTakeoverPrompt';

const props = withDefaults(defineProps<{
    /** 贴纸主文件 id（十进制字符串） */
    fileId: string;
    /** 贴纸格式（TallyItem.format；旧数据可能没有） */
    format?: StickerKind;
    /** 显示边长（px） */
    size?: number;
    alt?: string;
}>(), { size: 18, alt: '' });

const src = shallowRef('');
const kind = ref<StickerKind>('webp');
const loading = ref(true);

/** 扩展名 → 格式（拿到文件路径后兜底用） */
function guessKind(path: string): StickerKind {
    const ext = path.split(/[.\\/]/).pop()?.toLowerCase();
    if (ext === 'tgs') return 'tgs';
    if (ext === 'webm' || ext === 'mp4') return 'webm';
    return 'webp';
}

/**
 * 读文件头判格式：旧版本存的统计没有 format，扩展名也未必带，
 * 直接当 webp 渲染会把 tgs / webm 显示成破图。
 * gzip(1f 8b) = tgs，EBML(1a 45 df a3) = webm，RIFF = webp。
 */
async function sniffKind(url: string): Promise<StickerKind | null> {
    try {
        const res = await fetch(url);
        const reader = res.body?.getReader();
        let head = new Uint8Array(0);
        if (reader) {
            // 贴纸文件很小，读到 16 字节就够；分片可能不足，多读几轮
            while (head.length < 16) {
                const chunk = await reader.read();
                if (chunk.done || !chunk.value) break;
                const merged = new Uint8Array(head.length + chunk.value.length);
                merged.set(head);
                merged.set(chunk.value, head.length);
                head = merged;
            }
            void reader.cancel();
        } else {
            head = new Uint8Array(await res.arrayBuffer()).slice(0, 16);
        }
        if (head.length < 4) return null;
        if (head[0] === 0x1f && head[1] === 0x8b) return 'tgs';
        if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
        if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return 'webp';
        return null;
    } catch {
        return null;
    }
}

const EXT: Record<StickerKind, string> = { webp: 'webp', tgs: 'tgs', webm: 'webm' };

/** 渲染器报错（格式猜错了 / 文件坏了）：退回灰块，别留破图 */
function onMediaError() {
    src.value = '';
    loading.value = false;
}

onMounted(async () => {
    const id = Number(props.fileId);
    if (!Number.isFinite(id) || id <= 0) {
        loading.value = false;
        return;
    }
    try {
        // getFile 是离线方法：只查本地状态，不产生网络请求
        const info = (await tdlibSend({ _: 'getFile', file_id: id })) as file;
        let path = localPathIfReady(info);
        if (!path) {
            const k = props.format ?? 'webp';
            // 先登记展示元数据：下载列表里归到「贴纸」隐藏分类，不刷屏主列表
            metaDownloadFile(id, {
                fileName: `sticker_${id}.${EXT[k]}`,
                fileType: 'sticker',
                hiddenCategory: 'sticker',
                tags: [DL_TAG.STICKER],
            });
            path = await ensureLocalFilePath(info);
        }
        if (!path) return;
        const url = convertFileSrc(path);
        // 格式未知：有明确后缀信后缀，否则读文件头
        const fromExt = guessKind(path);
        kind.value = props.format ?? (fromExt !== 'webp' ? fromExt : (await sniffKind(url)) ?? 'webp');
        src.value = url;
    } catch {
        // 静默回退：保持灰块
    } finally {
        loading.value = false;
    }
});
</script>
