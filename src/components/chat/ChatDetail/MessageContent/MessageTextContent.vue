<template>
    <p class="text-sm whitespace-pre-wrap break-all">{{ text }}</p>
</template>

<script setup lang="ts">
defineProps<{
    text: string;
}>();
</script>
