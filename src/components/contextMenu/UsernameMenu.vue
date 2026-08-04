<template>
    <Teleport to="body">
        <Transition name="um-drop">
            <div v-if="visible" ref="rootRef" class="fixed z-10000" :style="menuStyle" @contextmenu.prevent.stop>
                <div class="um-card" @click.stop>
                    <!-- ① 顶部：用户名 + 复制 -->
                    <button type="button" class="um-copy" @click="copyUsername">
                        <AtSignIcon class="w-4 h-4" />
                        <span class="min-w-0 flex-1 truncate text-left">{{ username }}</span>
                        <span class="um-copy-hint">复制用户名</span>
                    </button>

                    <div class="um-divider"></div>

                    <!-- ② 加载骨架屏 -->
                    <div v-if="loading" class="um-body">
                        <div class="um-skeleton um-skeleton-avatar"></div>
                        <div class="flex-1 min-w-0">
                            <div class="um-skeleton um-skeleton-line" style="width: 60%"></div>
                            <div class="um-skeleton um-skeleton-line" style="width: 40%"></div>
                        </div>
                    </div>

                    <!-- ③ 解析失败 -->
                    <div v-else-if="errorMessage" class="um-body um-notfound">
                        <div
                            class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <GhostIcon class="w-5 h-5 text-gray-400" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ username }}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ errorMessage }}</p>
                        </div>
                    </div>

                    <!-- ④ 解析结果 -->
                    <div v-else-if="display" class="um-body" role="button" tabindex="0" @click="go" @keydown.enter="go">
                        <div class="w-10 h-10 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <Avatar :photo="display.photo" :title="display.name" sizeClass="w-10 h-10"
                                :accentColorId="display.accentId" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{{ display.name
                                }}</p>
                            <p class="text-xs text-blue-500 dark:text-blue-400">{{ typeLabel }}</p>
                        </div>
                        <span class="um-go">
                            <span>前往</span>
                            <ChevronRightIcon class="w-4 h-4" />
                        </span>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { AtSignIcon, GhostIcon, ChevronRightIcon } from "lucide-vue-next";
import { MessagePlugin } from "tdesign-vue-next";
import Avatar from "../chat/avatar.vue";
import {
    visible, loading, errorMessage, username, display,
    usernameMenuPosition, closeUsernameMenu,
} from "../../store/usernameMenu";

const router = useRouter();
const rootRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({ left: "0px", top: "0px" });

const typeLabel = computed(() =>
    display.value?.isChat ? "群组 / 频道" : "Telegram 用户"
);

/** 复制用户名 */
async function copyUsername() {
    try {
        await navigator.clipboard.writeText(`@${username.value}`);
        await MessagePlugin.success({ content: "已复制用户名", placement: "top-right" });
        closeUsernameMenu();
    } catch (e) {
        console.error("Copy username failed:", e);
    }
}

/** 前往：跳转到该会话资料页 */
function go() {
    const d = display.value;
    if (!d) return;
    closeUsernameMenu();
    router.push(`/home/chat/${d.chatId}`);
}

/** 关闭（点外部 / Esc） */
function onOutside(e: MouseEvent) {
    const el = rootRef.value;
    if (el && !el.contains(e.target as Node)) {
        closeUsernameMenu();
    }
}
function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeUsernameMenu();
}

/** 定位（视口内夹紧） */
async function positionMenu() {
    await nextTick();
    const el = rootRef.value;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    let left = usernameMenuPosition.x.value;
    let top = usernameMenuPosition.y.value;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin;
    if (top + h > window.innerHeight - margin) top = window.innerHeight - h - margin;
    menuStyle.value = { left: `${Math.max(margin, left)}px`, top: `${Math.max(margin, top)}px` };
}

watch(visible, async (v) => {
    if (v) {
        await positionMenu();
        document.addEventListener("mousedown", onOutside);
        document.addEventListener("keydown", onKey);
    } else {
        document.removeEventListener("mousedown", onOutside);
        document.removeEventListener("keydown", onKey);
    }
});

onUnmounted(() => {
    document.removeEventListener("mousedown", onOutside);
    document.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.um-card {
    width: 280px;
    max-width: calc(100vw - 16px);
    border-radius: 14px;
    background: #fff;
    color: #111827;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    overflow: hidden;
}

:global(.dark .um-card) {
    background: #1f2937;
    color: #f3f4f6;
    border-color: rgba(255, 255, 255, 0.1);
}

.um-copy {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    font-size: 13px;
    color: inherit;
    cursor: pointer;
    transition: background 0.15s;
}

.um-copy:hover {
    background: rgba(0, 0, 0, 0.05);
}

:global(.dark) .um-copy:hover {
    background: rgba(255, 255, 255, 0.08);
}

.um-copy-hint {
    font-size: 11px;
    color: #9ca3af;
}

.um-divider {
    height: 1px;
    background: rgba(0, 0, 0, 0.06);
}

:global(.dark) .um-divider {
    background: rgba(255, 255, 255, 0.08);
}

.um-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    cursor: pointer;
    transition: background 0.15s;
}

.um-body:hover {
    background: rgba(0, 0, 0, 0.05);
}

:global(.dark) .um-body:hover {
    background: rgba(255, 255, 255, 0.08);
}

/* 骨架屏 */
.um-skeleton-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%);
    background-size: 400% 100%;
    animation: um-shimmer 1.4s ease infinite;
}

:global(.dark) .um-skeleton-avatar {
    background: linear-gradient(90deg, #374151 25%, #4b5563 37%, #374151 63%);
    background-size: 400% 100%;
    animation: um-shimmer 1.4s ease infinite;
}

.um-skeleton-line {
    height: 10px;
    border-radius: 4px;
    margin-bottom: 6px;
    background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%);
    background-size: 400% 100%;
    animation: um-shimmer 1.4s ease infinite;
}

:global(.dark) .um-skeleton-line {
    background: linear-gradient(90deg, #374151 25%, #4b5563 37%, #374151 63%);
    background-size: 400% 100%;
    animation: um-shimmer 1.4s ease infinite;
}

.um-notfound {
    cursor: default;
}

.um-notfound:hover {
    background: transparent;
}

.um-go {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    font-weight: 500;
    color: #3b82f6;
    white-space: nowrap;
}

@keyframes um-shimmer {
    0% {
        background-position: 100% 0;
    }

    100% {
        background-position: 0 0;
    }
}

.um-drop-enter-active,
.um-drop-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.um-drop-enter-from,
.um-drop-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
