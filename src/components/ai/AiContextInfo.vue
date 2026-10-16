<script setup lang="ts">
/**
 * 输入框底部的上下文状态：当前对话用了多少上下文，以及 token 账目。
 *
 * 数据来自当前对话的用量记录（store/aiConversations 的 usage）：
 * - 占用百分比 = 最近一次请求的输入 token / 模型上下文窗口（窗口未知时那一段不显示）
 * - 输入 / 输出 / 缓存 都是累计值；括号里是**最近一次请求**的量（缓存那格是命中率）
 * - 请求次数
 *
 * 接口返回 usage 时用真实值；没返回时由发送管线本地估算（estimateTokens）后照样记进同一个账，
 * 所以这里不区分来源。有对话就显示（还没发出去时是 0），没有对话时整行不显示。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtTokens, type ConversationUsage } from '../../store/aiConversations';

const props = defineProps<{
    usage: ConversationUsage;
    /** 输入框语义色：与 AiPromptBar 同一套 --pb-ink */
    muted?: boolean;
}>();

const { t } = useI18n();

const used = computed(() => props.usage.lastInputTokens || 0);
const limit = computed(() => props.usage.contextLength || 0);
/** 占用百分比（0~100 整数）；窗口未知 = null */
const percent = computed(() => (limit.value > 0 ? Math.min(100, Math.round((used.value * 100) / limit.value)) : null));

/** 进度条颜色：80% 以上转橙、95% 以上转红（快要顶到窗口了得看得出来） */
const barClass = computed(() => {
    const p = percent.value;
    if (p === null) return 'bg-[var(--app-brand)]';
    if (p >= 95) return 'bg-red-500';
    if (p >= 80) return 'bg-amber-500';
    return 'bg-[var(--app-brand)]';
});

/** 一行小字：输入 117K（最近 21K）· 输出 2K（最近 107）· 缓存 8K（命中 62%）· 5 次请求 */
const cells = computed(() => {
    const u = props.usage;
    const out: { key: string; label: string; value: string }[] = [
        { key: 'in', label: t('aiContext.input'), value: cell(u.inputTokens, u.lastInputTokens) },
        { key: 'out', label: t('aiContext.output'), value: cell(u.outputTokens, u.lastOutputTokens) },
    ];
    if (u.cachedTokens > 0 || u.cacheWriteTokens > 0) {
        // 括号里是命中率：命中缓存的输入 / 全部输入（累计值算的，所以是「这一段的平均命中率」）
        const rate = u.inputTokens > 0 ? Math.round((u.cachedTokens * 100) / u.inputTokens) : null;
        out.push({
            key: 'cache',
            label: t('aiContext.cached'),
            value: `${fmtTokens(u.cachedTokens)}${rate === null ? '' : t('aiContext.hit', { v: `${rate}%` })}`,
        });
    }
    return out;
});

/** 累计值 +「最近一次」；最近一次为 0、或与累计相同（只发过一次）就不加括号 */
function cell(total: number, last: number): string {
    const head = fmtTokens(total);
    return last > 0 && last !== total ? `${head}${t('aiContext.last', { v: fmtTokens(last) })}` : head;
}
</script>

<template>
    <div class="mt-1 px-1.5 text-[11px] leading-4"
        :class="muted ? '[color:color-mix(in_srgb,var(--pb-ink)_55%,transparent)]' : 'text-gray-500 dark:text-gray-400'"
        :aria-label="t('aiContext.title')">
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <!-- 上下文占用：数字 + 细进度条；窗口未知时只留字 -->
            <span v-if="percent !== null" class="inline-flex items-center gap-1.5">
                <span>{{ t('aiContext.context') }}</span>
                <span class="h-1 w-14 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <span class="block h-full rounded-full transition-[width] duration-300" :class="barClass"
                        :style="{ width: `${percent}%` }" />
                </span>
                <span class="font-medium">{{ percent }}%</span>
                <span>{{ fmtTokens(used) }}/{{ fmtTokens(limit) }}</span>
            </span>
            <span v-else>{{ t('aiContext.noWindow') }}</span>

            <span class="opacity-40">·</span>
            <span v-for="c in cells" :key="c.key">{{ c.label }} {{ c.value }}</span>
            <span class="opacity-40">·</span>
            <span>{{ t('aiContext.requests', { n: usage.requests }) }}</span>
        </div>
    </div>
</template>
