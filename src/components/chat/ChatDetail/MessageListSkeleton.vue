<template>
    <div class="absolute inset-0 z-0 pointer-events-none overflow-hidden flex flex-col messages-scroll"
        :style="[topPadding, tagPad, { paddingBottom: bottomPad }]" aria-hidden="true">
        <div class="flex-1"></div>
        <div v-for="n in 8" :key="n" class="flex mb-4" :class="n % 3 === 0 ? 'justify-end' : 'justify-start'">
            <div v-if="n % 3 !== 0" class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 mr-2 shrink-0"></div>
            <div class="p-3 rounded-lg"
                :class="n % 3 === 0 ? 'bg-blue-200 dark:bg-blue-900' : 'bg-gray-200 dark:bg-gray-700'"
                :style="{ width: (120 + (n * 17) % 180) + 'px', height: '48px' }">
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/** 首屏骨架屏遮罩：叠在消息列表上，定位完成前露出，避免「先露一批再跳到已读锚点」的闪跳。 */
defineProps<{
    topPadding: Record<string, string>;
    tagPad: Record<string, string>;
    bottomPad: string;
}>();
</script>
