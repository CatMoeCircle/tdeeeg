<template>
    <ResizableLayout>
        <template #sidebar>
            <ContactList />
        </template>
        <template #content>
            <div class="h-full flex items-center justify-center text-gray-400">
                联系人详情
            </div>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import ContactList from '../../components/chat/ContactList.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
</script>
