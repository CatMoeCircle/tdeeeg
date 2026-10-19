<template>
    <!-- 社区头像：三张折叠卡片（最上层为社区头像），可在任意列表/卡片复用 -->
    <div class="relative shrink-0" :class="sizeClass || 'w-8 h-8'">
        <!-- 折叠：后两张卡片各向左错开一点并轻微倾斜 -->
        <span
            class="absolute inset-0 rounded-[24%] bg-white dark:bg-gray-600 border border-gray-200/70 dark:border-gray-500/40 shadow-sm -rotate-12 -translate-x-1.25translate-y-[1px]"></span>
        <span
            class="absolute inset-0 rounded-[24%] bg-white dark:bg-gray-700 border border-gray-200/70 dark:border-gray-500/40 shadow-sm -rotate-6 -translate-x-0.5"></span>
        <Avatar class="absolute inset-0" :photo="photo" :title="title" :radius="44" />
    </div>
</template>

<script setup lang="ts">
import type { chatPhotoInfo, profilePhoto } from 'tdlib-types';
import Avatar from '../chat/avatar.vue';

defineProps<{
    photo?: chatPhotoInfo | profilePhoto;
    title?: string;
    /** 尺寸类名（默认 w-8 h-8）；折叠卡片会跟随同一尺寸缩放 */
    sizeClass?: string;
}>();
</script>
