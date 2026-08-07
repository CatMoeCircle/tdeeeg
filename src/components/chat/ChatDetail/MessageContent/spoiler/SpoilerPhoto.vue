<template>
    <div class="rounded-lg overflow-hidden">
        <!-- 富消息图片剧透：粒子遮罩 + 点击 ripple 波纹揭示 -->
        <SpoilerMedia :has-spoiler="hasSpoiler">
            <slot />
        </SpoilerMedia>
    </div>
</template>

<script setup lang="ts">
import SpoilerMedia from './SpoilerMedia.vue';

defineProps<{
    hasSpoiler?: boolean;
}>();
</script>
