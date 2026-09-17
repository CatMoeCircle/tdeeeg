<template>
    <div ref="rootEl" class="w-full min-w-0 max-w-[320px]">
        <!-- 标题：链接色，仿官方 Invoice -->
        <p class="text-sm font-medium leading-5 wrap-break-word" :style="{ color: titleColor }">
            <GlobalEmojiText :text="content.product_info.title" />
        </p>

        <!-- 描述 -->
        <p v-if="content.product_info.description?.text"
            class="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-gray-800 dark:text-gray-200">
            <FormattedTextInline :formattedText="content.product_info.description" :size="16" />
        </p>

        <!-- 媒体区：paid_media 优先，其次 product_info.photo -->
        <div v-if="mediaPlan" class="relative mt-1.5 overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-700"
            :style="mediaStyle" :class="{ 'cursor-pointer': canOpenViewer }" role="button"
            :tabindex="canOpenViewer ? 0 : -1" @click="onMediaClick" @keydown.enter.prevent="onMediaClick"
            @keydown.space.prevent="onMediaClick">
            <!-- 高清图 -->
            <img v-if="mediaSrc && !mediaIsVideo" :src="mediaSrc"
                class="absolute inset-0 w-full h-full object-cover select-none" alt="" draggable="false" />
            <!-- 视频 / 动态缩略图 -->
            <video v-else-if="mediaSrc && mediaIsVideo" :src="mediaSrc"
                class="absolute inset-0 w-full h-full object-cover select-none" autoplay loop muted playsinline />
            <!-- minithumbnail 渐进占位 -->
            <img v-else-if="placeholderSrc" :src="placeholderSrc"
                class="absolute inset-0 w-full h-full object-cover blur-sm scale-105 select-none" alt=""
                draggable="false" />
            <!-- 无图占位 -->
            <div v-else class="absolute inset-0 flex items-center justify-center">
                <ReceiptTextIcon class="w-8 h-8 text-gray-400" />
            </div>

            <!-- 未下载：手动下载 -->
            <RichMediaDownload v-if="!mediaSrc && mediaPlan.file" :file="mediaPlan.file"
                :file-name="`invoice_${mediaPlan.file.id}`" file-type="photo" :chat-id="chatId" overlay />

            <!-- 金额角标：左上角「¥490 账单」 -->
            <span
                class="absolute top-2 left-2 z-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[12px] font-semibold leading-none text-white select-none pointer-events-none">
                {{ badgeText }}
            </span>

            <!-- 付费媒体锁定态：暗化 + 解锁提示 -->
            <div v-if="isPreviewLocked"
                class="absolute inset-0 z-1 flex flex-col items-center justify-center gap-1 bg-black/45 text-white">
                <LockIcon class="w-6 h-6 opacity-90" />
                <span class="text-xs font-medium">{{ payCtaText }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { convertFileSrc } from '@tauri-apps/api/core';
import { LockIcon, ReceiptTextIcon } from 'lucide-vue-next';
import type { file, message, messageInvoice, photo as TdPhoto, video as TdVideo, PaidMedia } from 'tdlib-types';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';
import FormattedTextInline from '../../../FormattedTextInline.vue';
import RichMediaDownload from '../rich/RichMediaDownload.vue';
import { isFileReady, safeDownloadFile } from '../../../../../utils/tdlib';
import { openMediaViewer } from '../../../../../store/mediaViewer';
import { pickSmallPhotoSize, pickBigPhotoSize, pickBigPhotoDimensions } from '../../../../../utils/photoSizes';
import { fitMediaSize } from '../../../../../utils/fitMediaSize';
import { formatInvoiceAmount } from '../../../../../utils/money';
import { shouldAutoDownloadPhotos } from '../../../../../utils/autoDownload';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { useViewportLoad } from '../../../../../composables/useViewportLoad';
import { isThumbnailVideoRenderable } from '../../../../../utils/thumbnail';

const props = defineProps<{
    content: messageInvoice;
    chatId?: number;
    messageId?: number;
    /** 完整消息对象（媒体查看器跳转/转发需要） */
    message?: message;
    topicId?: number;
    senderName?: string;
}>();

const { t } = useI18n();

const titleColor = '#2AABEE';

const amountText = computed(() =>
    formatInvoiceAmount(props.content.total_amount, props.content.currency),
);

/** 图片左上角角标：「¥490 账单」 */
const badgeText = computed(() => {
    const testKey = 'lng_payments_invoice_label_test';
    const key = 'lng_payments_invoice_label';
    const raw = props.content.is_test ? t(testKey) : t(key);
    // 语言包未命中时 vue-i18n 会回传 key 本身，这里兜底中文
    const label = !raw || raw === key || raw === testKey
        ? (props.content.is_test ? '测试账单' : '账单')
        : raw;
    return `${amountText.value} ${label}`;
});

const payCtaText = computed(() => `支付 ${amountText.value}`);

interface MediaPlan {
    kind: 'photo' | 'video';
    file?: file;
    /** MPEG4/WEBM 动态缩略图需用 <video> */
    fileIsVideo?: boolean;
    placeholder?: string;
    width: number;
    height: number;
    /** paidMediaPreview：媒体未解锁 */
    locked?: boolean;
    /** 查看器用完整媒体文件（大图 / 视频本体） */
    viewerFile?: file;
    viewerKind?: 'photo' | 'video';
    duration?: number;
}

function photoPlan(p: TdPhoto | undefined, locked = false): MediaPlan | undefined {
    if (!p?.sizes?.length) return undefined;
    const bigFile = pickBigPhotoSize(p);
    const smallFile = pickSmallPhotoSize(p);
    const dims = pickBigPhotoDimensions(p);
    const readyFile = [bigFile, smallFile].find((f) => f && isFileReady(f)) ?? bigFile ?? smallFile;
    return {
        kind: 'photo',
        file: readyFile,
        placeholder: p.minithumbnail?.data
            ? `data:image/jpeg;base64,${p.minithumbnail.data}`
            : undefined,
        width: dims.width,
        height: dims.height,
        locked,
        viewerFile: bigFile,
        viewerKind: 'photo',
    };
}

function videoPlan(v: TdVideo | undefined, locked = false): MediaPlan | undefined {
    if (!v) return undefined;
    const thumb = v.thumbnail;
    const placeholder = v.minithumbnail?.data
        ? `data:image/jpeg;base64,${v.minithumbnail.data}`
        : undefined;
    const base = {
        kind: 'video' as const,
        fileIsVideo: false,
        placeholder,
        width: thumb?.width || v.width,
        height: thumb?.height || v.height,
        locked,
        viewerFile: v.video,
        viewerKind: 'video' as const,
        duration: v.duration,
    };
    if (thumb?.file && isThumbnailVideoRenderable(thumb.format)) {
        return { ...base, file: thumb.file, fileIsVideo: true };
    }
    if (thumb?.file) {
        return { ...base, file: thumb.file };
    }
    return base;
}

function paidMediaPlan(pm: PaidMedia | undefined): MediaPlan | undefined {
    if (!pm) return undefined;
    switch (pm._) {
        case 'paidMediaPhoto':
            return photoPlan(pm.photo);
        case 'paidMediaVideo':
            return videoPlan(pm.video);
        case 'paidMediaPreview':
            return {
                kind: 'photo',
                file: undefined,
                placeholder: pm.minithumbnail?.data
                    ? `data:image/jpeg;base64,${pm.minithumbnail.data}`
                    : undefined,
                width: pm.width || 1,
                height: pm.height || 1,
                locked: true,
            };
        default:
            return undefined;
    }
}

const mediaPlan = computed<MediaPlan | undefined>(() => {
    return paidMediaPlan(props.content.paid_media) ?? photoPlan(props.content.product_info.photo);
});

const mediaSrc = ref<string | undefined>(undefined);
const mediaIsVideo = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const downloading = ref(false);

const placeholderSrc = computed(() => mediaPlan.value?.placeholder);
const isPreviewLocked = computed(() => !!mediaPlan.value?.locked);

const mediaStyle = computed(() => {
    const plan = mediaPlan.value;
    if (!plan) return undefined;
    const fitted = fitMediaSize(plan.width, plan.height, { maxHeight: 280 });
    return {
        width: `${fitted.width}px`,
        maxWidth: '100%',
        aspectRatio: `${Math.max(1, plan.width)} / ${Math.max(1, plan.height)}`,
    };
});

async function loadMedia() {
    const plan = mediaPlan.value;
    if (!plan || plan.locked) return;
    const f = plan.file;
    if (!f) return;
    if (isFileReady(f)) {
        mediaSrc.value = convertFileSrc(f.local.path);
        mediaIsVideo.value = !!plan.fileIsVideo;
        return;
    }
    if (!shouldAutoDownloadPhotos(props.chatId)) return;
    if (downloading.value) return;
    downloading.value = true;
    try {
        await safeDownloadFile(f.id, true, DL_PRIORITY.DEFAULT);
        if (f.local.is_downloading_completed && f.local.path) {
            mediaSrc.value = convertFileSrc(f.local.path);
            mediaIsVideo.value = !!plan.fileIsVideo;
        }
    } catch {
        /* 保持占位 */
    } finally {
        downloading.value = false;
    }
}

/** 可打开查看器：未锁定，且有可用媒体（图片需预览已就绪；视频可未下载，由查看器处理） */
const canOpenViewer = computed(() => {
    const plan = mediaPlan.value;
    if (!plan || plan.locked) return false;
    if (plan.viewerKind === 'photo' || plan.kind === 'photo') return !!mediaSrc.value;
    return !!(plan.viewerFile || plan.file || mediaSrc.value);
});

function onMediaClick() {
    const plan = mediaPlan.value;
    if (!plan || plan.locked || !canOpenViewer.value) return;
    const viewerReady = plan.viewerFile && isFileReady(plan.viewerFile) ? plan.viewerFile : undefined;
    const displayReady = plan.file && isFileReady(plan.file) ? plan.file : undefined;
    // 优先大图/视频本体，其次已就绪的展示文件
    const file = viewerReady ?? displayReady ?? plan.viewerFile ?? plan.file;
    if (!file) return;
    openMediaViewer({
        messageId: props.messageId,
        chatId: props.chatId,
        topicId: props.topicId,
        senderName: props.senderName,
        message: props.message,
        file,
        type: plan.viewerKind ?? 'photo',
        thumb: plan.placeholder,
        duration: plan.duration,
    });
}

// 进入视口后再拉高清图（与气泡图片策略一致）
const { start: startViewport } = useViewportLoad(rootEl, () => {
    return loadMedia();
});

watch(
    () => [props.content.paid_media, props.content.product_info.photo, props.messageId],
    () => {
        mediaSrc.value = undefined;
        mediaIsVideo.value = false;
        void loadMedia();
    },
    { deep: true },
);

onMounted(() => {
    startViewport();
    // 已下载文件直接展示；未下载则交给视口门控
    void loadMedia();
});

onUnmounted(() => {
    downloading.value = false;
});
</script>
