<template>
    <div :class="containerClass" :style="containerStyle">
        <!-- 已删除账户：不显示照片/首字母，改用 tgico 图标 + 归档灰色渐变 -->
        <div v-if="deletedAccount" class="w-full h-full flex items-center justify-center text-white select-none"
            :style="{ background: deletedBackground }">
            <span class="tgico tgico-avatar-deletedaccount" :style="{ fontSize: iconSize }"></span>
        </div>
        <img v-else-if="avatar && !imgError" :src="avatar" alt="avatar" class="w-full h-full object-cover"
            @error="onImgError" />
        <div v-else class="w-full h-full flex items-center justify-center text-xs select-none"
            :class="initialsTextClass" :style="initialsStyle">{{ initials }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { chatPhotoInfo, profilePhoto } from "tdlib-types";
import { tdlibSend, isFileReady, downloadingFiles } from '../../utils/tdlib';
import { convertFileSrc } from "@tauri-apps/api/core";
import { useDownloadStore } from '../../store/downloads';
import { useColors } from '../../store/colors';

const props = defineProps<{
    photo?: chatPhotoInfo | profilePhoto;
    title?: string;
    sizeClass?: string;
    /** 是否使用方形圆角（用于话题群组头像），radius 提供时优先使用 radius */
    square?: boolean;
    /** 圆角角度 0~100（0=方形，100=圆形），话题群组统一使用 */
    radius?: number;
    /** 无头像时的名称头像主题色 id（Telegram accent_color_id） */
    accentColorId?: number;
    /** 是否已删除账户：显示 tgico 删除图标 + 归档灰色渐变背景 */
    deletedAccount?: boolean;
}>();

const { accentAvatarBackground } = useColors();

/** 已删除账户的归档灰色渐变（Web K: --peer-avatar-archive-top/bottom） */
const deletedBackground = 'linear-gradient(#B8C2CC, #9EAAB5)';

/** 图标尺寸约为头像尺寸的 55% */
const iconSize = computed(() => {
    const px = /(\d+)x?/.exec(props.sizeClass || '');
    const size = px ? parseInt(px[1], 10) : 54;
    return `${Math.round(size * 0.52)}px`;
});

const imgError = ref(false);

function onImgError() {
    imgError.value = true;
}

const initials = computed(() => {
    const t = props.title || '';
    return t.substring(0, 2);
});

/** 无头像时：有 accentColorId 用其主题渐变背景 + 白色文字；否则按标题哈希回退到内置渐变色，避免千篇一律的灰底 */
const initialsStyle = computed(() => {
    const id = typeof props.accentColorId === 'number' ? props.accentColorId : hashAccentId();
    return { background: accentAvatarBackground(id) };
});

const initialsTextClass = computed(() => 'text-white');

/** 标题哈希 → 0~6，用于无 accent 数据时仍能显示不同的内置渐变色 */
function hashAccentId(): number {
    const t = props.title || '';
    let h = 0;
    for (let i = 0; i < t.length; i++) {
        h = (h * 31 + t.charCodeAt(i)) >>> 0;
    }
    return h % 7;
}

/** 圆角百分比：radius 0~100 → 0%~50%（0=方形，100=圆形） */
const radiusPct = computed(() => {
    if (typeof props.radius === 'number') {
        return props.radius * 0.5;
    }
    if (props.square) return 0;
    return 50;
});

const containerStyle = computed(() => ({ borderRadius: `${radiusPct.value}%` }));

const containerClass = computed(() => {
    const base = `w-full h-full bg-gray-300 shrink-0 overflow-hidden`;
    if (props.sizeClass) return ` ${props.sizeClass} ${base}`;
    return base;
});


const avatar = ref<string | undefined>(props.photo?.minithumbnail ? `data:image/jpeg;base64,${props.photo.minithumbnail.data}` : undefined);

watch(
    () => props.photo,
    async (photo) => {
        imgError.value = false;
        if (!photo) {
            avatar.value = undefined;
            return;
        }

        // 缩略图
        if (photo.minithumbnail) {
            avatar.value = `data:image/jpeg;base64,${photo.minithumbnail.data}`;
        }

        // 已下载
        if (isFileReady(photo.small)) {
            avatar.value = convertFileSrc(photo.small.local.path);
            return;
        }

        // 仅当文件可下载且未在下载中时触发
        if (photo.small?.id && !downloadingFiles.has(photo.small.id) && !isFileReady(photo.small)) {
            downloadingFiles.add(photo.small.id);
            // 头像：记录为隐藏资源，不需要来源（chat_id/message_id 留空）
            const fileName = `${props.title || '头像'}_${photo.small.id}.jpg`;
            await useDownloadStore().registerDownload(photo.small.id, fileName, '', 0, 'avatar', undefined, undefined, undefined, true);
            try {
                const file = await tdlibSend({
                    _: "downloadFile",
                    file_id: photo.small.id,
                    priority: 1,
                    offset: 0,
                    limit: 0,
                    synchronous: true,
                });
                if (file.local?.path) {
                    avatar.value = convertFileSrc(file.local.path);
                }
            } finally {
                downloadingFiles.delete(photo.small.id);
            }
        }
    },
    { immediate: true } // 非常重要
);

</script>