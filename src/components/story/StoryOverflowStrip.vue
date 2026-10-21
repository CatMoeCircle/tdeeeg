<template>
    <!-- 「更多动态」展开条：搜索栏上方显示全部动态，过多时左右滑动，由标题栏右侧箭头控制 -->
    <Transition name="story-strip">
        <div v-if="storiesExpanded && ids.length" class="story-strip">
            <div class="overflow-hidden min-h-0">
                <div ref="scrollEl" class="flex items-start gap-1 overflow-x-auto no-scrollbar px-2.5 pt-1.5 pb-2"
                    @wheel="onWheel">
                    <div v-for="id in ids" :key="id" class="flex flex-col items-center gap-1 w-14 shrink-0">
                        <StoryRingItem :chat-id="id" :size="48" />
                        <span class="w-full text-center text-[11px] leading-3.5 text-gray-600 dark:text-gray-300 truncate"
                            :title="nameOf(id)">{{ nameOf(id) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import StoryRingItem from "./StoryRingItem.vue";
import { getOrderedStoryChatIds, storiesExpanded } from "../../store/storyRing";
import { getChatTitle, getReactiveChat } from "../../utils/senderInfo";

/** 展开时显示全部动态（自己最前）；数量多就左右滑动 */
const ids = computed(() => (storiesExpanded.value ? getOrderedStoryChatIds() : []));

function nameOf(chatId: number): string {
    return getChatTitle(getReactiveChat(chatId));
}

const scrollEl = ref<HTMLElement | null>(null);

/** 鼠标竖轮 → 横向滑动（触控板/拖拽仍走原生横向滚动） */
function onWheel(e: WheelEvent) {
    const el = scrollEl.value;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
}
</script>

<style scoped>
/* 0fr ↔ 1fr 的 grid 行高过渡：不用写死 max-height，动态行数也不会截断 */
.story-strip {
    display: grid;
    grid-template-rows: 1fr;
    flex-shrink: 0;
}

.story-strip-enter-active,
.story-strip-leave-active {
    transition: grid-template-rows 0.24s ease, opacity 0.18s ease, transform 0.24s ease;
}

.story-strip-enter-from,
.story-strip-leave-to {
    grid-template-rows: 0fr;
    opacity: 0;
    transform: translateY(-4px);
}
</style>
