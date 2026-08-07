<template>
    <!--
        转发来源横幅（仿 Telegram Web K 版，上下结构）：
            转发的消息
        [头像] 来源名 (原始作者)
        「转发的消息」标签与第二行合并为一个内联整体，悬停时一起高亮背景；
        通过 props 传入渲染所需数据，保持组件纯展示、无响应式依赖。
    -->
    <div class="flex min-w-0 justify-start overflow-hidden text-left select-none" :class="rootClass">
        <!-- 整体交互单元：标签 + 头像 + 来源名 (+ 原始作者) -->
        <span class="inline-flex min-w-0 max-w-full flex-col rounded-md px-1.5 py-0.5 transition-colors"
            :style="textStyle" :title="navigable ? '跳转到来源' : undefined"
            :class="navigable ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15' : 'cursor-default'"
            @click.stop="openSource">
            <!-- 第一行：「转发的消息」标签 -->
            <span class="shrink-0 text-[11px] font-medium leading-none opacity-70">转发的消息</span>

            <!-- 第二行：头像 + 来源名 (+ 原始作者) -->
            <span class="mt-1 flex min-w-0 items-center text-xs font-semibold">
                <!-- 转发来源头像（隐藏来源时无头像） -->
                <span v-if="photo !== undefined || accentId !== undefined"
                    class="mr-0.5 inline-flex shrink-0 items-center">
                    <Avatar :photo="photo" :title="name" :accentColorId="accentId" sizeClass="!w-4 !h-4" />
                </span>

                <!-- 来源名称（peer title）+ 原始作者签名（频道帖子 / 匿名群管），同一行内紧跟 -->
                <span class="min-w-0 flex items-center gap-0 overflow-hidden whitespace-nowrap">
                    <span class="min-w-0 max-w-full truncate">{{ name }}</span>
                    <template v-if="originalName">
                        <span class="shrink-0 opacity-80">&nbsp;(</span>
                        <span class="min-w-0 max-w-[45%] shrink truncate">{{ originalName }}</span>
                        <span class="shrink-0 opacity-80">)</span>
                    </template>
                </span>
            </span>
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '../../../avatar.vue';
import type { chatPhotoInfo, profilePhoto } from 'tdlib-types';

const props = defineProps<{
    /** 来源显示名（peer title / 用户姓名） */
    name: string;
    /** 原始作者签名（频道帖子 / 匿名群管），可为空 */
    originalName?: string;
    /** 来源头像 */
    photo?: chatPhotoInfo | profilePhoto;
    /** 来源头像无照片时的 accent 底色 id */
    accentId?: number;
    /** 是否可跳转到来源 */
    navigable?: boolean;
    /** 是否为自己发送的消息：影响文字颜色 */
    self?: boolean;
    /** 是否作为媒体/相册横幅（占满整行 + 内边距） */
    mediaInline?: boolean;
    /** 文字颜色（他人消息的 accent 色；自己消息忽略此项） */
    textColor?: string;
}>();

const emit = defineEmits<{
    openSource: [];
}>();

const openSource = () => {
    if (props.navigable) emit('openSource');
};

/** 整行文字颜色：自己消息浅色，他人消息用传入 accent 色 / 蓝色 */
const textStyle = computed<Record<string, string>>(() => {
    if (props.self) return { color: 'rgba(0,0,0,0.55)' };
    return { color: props.textColor || 'rgb(59 130 246)' };
});

/** 根 class：媒体/相册横幅占满整行并带上下内边距，普通文本消息紧凑 */
const rootClass = computed(() => [
    props.mediaInline ? 'w-full px-2 pt-1 pb-1.5' : 'mb-0.5 -mt-0.5',
]);
</script>
