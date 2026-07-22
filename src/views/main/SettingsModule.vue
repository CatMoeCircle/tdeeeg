<template>
    <ResizableLayout>
        <template #sidebar>
            <SettingsList />
        </template>
        <template #content>
            <router-view v-slot="{ Component }">
                <KeepAlive>
                    <component :is="Component" />
                </KeepAlive>
                <div v-if="!Component" class="h-full flex items-center justify-center text-gray-400">
                    选择一个设置项
                </div>
            </router-view>
        </template>
    </ResizableLayout>
</template>

<script setup lang="ts">
import SettingsList from '../../components/chat/SettingsList.vue';
import ResizableLayout from '../../components/layout/ResizableLayout.vue';
</script>
