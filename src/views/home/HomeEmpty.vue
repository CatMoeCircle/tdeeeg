<template>
    <div class="h-full flex items-center justify-center text-gray-400">
        {{ emptyStateText }}
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const emptyStateText = computed(() => {
    if (route.name === 'contacts') return '联系人详情';
    if (route.name === 'settings') return '选择一个设置项';
    if (route.name === 'archived') return '选择一个归档聊天';
    return '选择一个聊天开始';
});
</script>
