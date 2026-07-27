<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-vue-next';

const appWindow = getCurrentWindow();

const minimize = () => appWindow.minimize();
const maximize = () => appWindow.toggleMaximize();
const close = () => appWindow.close();
</script>

<template>
    <div data-tauri-drag-region class="h-8 flex justify-between items-center select-none w-full shrink-0 bg-white/40">
        <div class="pl-4 text-sm font-medium text-gray-700 pointer-events-none">
            <p class="truncate w-48">TDEEEG</p>
        </div>
        <Teleport to="body">
            <div class="fixed top-0 right-0 flex h-8 z-9999">
                <button @click="minimize"
                    class="w-12 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors focus:outline-none">
                    <Minus :size="18" />
                </button>
                <button @click="maximize"
                    class="w-12 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors focus:outline-none">
                    <Square :size="14" />
                </button>
                <button @click="close"
                    class="w-12 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-500 transition-colors focus:outline-none">
                    <X :size="18" />
                </button>
            </div>
        </Teleport>
    </div>
</template>
