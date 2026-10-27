<template>
    <!-- 通用骨架屏：列表 / 表单 / 平铺网格。
         用于替换各路由「加载中…」的整块留白——先出帧，数据到了再换成真内容。 -->
    <div>
        <!-- 无障碍 / 保留原有 i18n 文案：视觉上是骨架，读屏仍能读到「加载中」 -->
        <span v-if="label" class="sr-only">{{ label }}</span>
        <div class="animate-pulse select-none" aria-hidden="true">
            <!-- 列表：可选头像 + 两行文字 -->
            <template v-if="variant === 'list'">
                <div v-for="n in rows" :key="n" class="flex items-center gap-3 py-2.5">
                    <div v-if="avatar" class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0"></div>
                    <div class="flex-1 min-w-0 space-y-2">
                        <div class="h-3.5 rounded bg-gray-200 dark:bg-gray-700" :style="{ width: barWidth(n, 0) }">
                        </div>
                        <div v-if="subtitle" class="h-3 rounded bg-gray-200 dark:bg-gray-700"
                            :style="{ width: barWidth(n, 1) }"></div>
                    </div>
                </div>
            </template>

            <!-- 表单：小标题 + 控件块 -->
            <template v-else-if="variant === 'form'">
                <section v-for="n in rows" :key="n" class="space-y-3 py-2">
                    <div class="h-3.5 w-28 rounded bg-gray-200 dark:bg-gray-700"></div>
                    <div class="h-11 rounded-xl bg-gray-200/70 dark:bg-gray-800/60"></div>
                    <div v-if="n % 2 === 0" class="h-11 rounded-xl bg-gray-200/70 dark:bg-gray-800/60"></div>
                </section>
            </template>

            <!-- 平铺网格：壁纸 / 媒体预览 -->
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div v-for="n in rows" :key="n" class="aspect-[3/4] rounded-xl bg-gray-200 dark:bg-gray-700"></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        /** list：列表行；form：表单段落；tiles：平铺网格 */
        variant?: 'list' | 'form' | 'tiles';
        /** 行数 / 段落数 / 格子数 */
        rows?: number;
        /** 列表左侧头像占位 */
        avatar?: boolean;
        /** 列表第二行副标题占位 */
        subtitle?: boolean;
        /** 读屏文案（一般传原来的「加载中」词条） */
        label?: string;
    }>(),
    {
        variant: 'list',
        rows: 6,
        avatar: false,
        subtitle: true,
        label: '',
    },
);

/** 稳定的伪随机行宽：每行一样长看起来像表格，不像内容 */
const WIDTHS = [72, 54, 81, 63, 88, 58];
const barWidth = (n: number, line: number) => `${WIDTHS[(n * 3 + line) % WIDTHS.length]}%`;
</script>
