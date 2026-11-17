<template>
  <div class="h-full flex flex-col">
    <!-- 顶部返回栏 -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shrink-0">
      <button type="button" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="goBack">
        <ChevronLeftIcon class="w-5 h-5 text-gray-500" />
      </button>
      <h2 class="text-lg font-semibold flex-1">{{ t('statsPage.title') }}</h2>
      <button type="button"
        class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-default"
        :disabled="loading" :title="t('statsPage.refresh')" @click="reload">
        <RefreshCwIcon class="w-4 h-4 text-gray-500" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6" v-smooth-wheel>
      <div class="w-full space-y-6">
        <LoadingSkeleton v-if="loading" variant="form" :rows="4" :label="t('statsPage.loading')" />

        <!-- 无权限 / 不支持类型 / 加载失败 -->
        <section v-else-if="pageState !== 'ready'"
          class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-6 py-12 text-center">
          <div class="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center">
            <LockIcon v-if="pageState === 'noAccess'" class="w-6 h-6 text-gray-400" />
            <ShieldAlertIcon v-else-if="pageState === 'unsupported'" class="w-6 h-6 text-gray-400" />
            <RefreshCwIcon v-else class="w-6 h-6 text-gray-400" />
          </div>
          <p class="mt-3 text-sm font-medium text-gray-800 dark:text-gray-100">{{ stateTitle }}</p>
          <p class="mt-1 text-xs text-gray-400 max-w-md mx-auto leading-5">{{ stateHint }}</p>
          <button v-if="pageState === 'error'" type="button"
            class="mt-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            @click="reload">
            {{ t('statsPage.retry') }}
          </button>
        </section>

        <template v-else>
          <!-- 统计区间与查看范围 -->
          <section class="flex flex-wrap items-center gap-3">
            <CalendarDaysIcon class="w-4 h-4 text-gray-400 shrink-0" />
            <div class="min-w-0">
              <p class="text-sm text-gray-800 dark:text-gray-100">{{ t('statsPage.periodLabel') }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ periodText }}</p>
            </div>
            <div v-if="rangeOptions.length > 1"
              class="ml-auto inline-flex items-center gap-0.5 p-0.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md">
              <button v-for="option in rangeOptions" :key="option.key" type="button"
                class="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                :class="activeRange === option.key
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'"
                @click="activeRange = option.key">
                {{ option.label }}
              </button>
            </div>
          </section>

          <!-- 概览卡片 -->
          <section>
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('statsPage.overview') }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            <div class="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div v-for="card in overviewCards" :key="card.key"
                class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
                <div class="flex items-center gap-2 text-gray-400">
                  <component :is="card.icon" class="w-4 h-4 shrink-0" />
                  <span class="text-xs truncate">{{ card.label }}</span>
                </div>
                <div class="mt-2 flex items-end gap-2 min-w-0">
                  <span class="text-xl font-semibold text-gray-900 dark:text-gray-50 truncate">{{ card.value }}</span>
                  <span v-if="card.growth !== ''" class="inline-flex items-center gap-0.5 text-xs font-medium shrink-0 pb-0.5"
                    :class="card.growthPositive ? 'text-emerald-500' : 'text-rose-500'">
                    <ArrowUpRightIcon v-if="card.growthPositive" class="w-3 h-3" />
                    <ArrowDownRightIcon v-else class="w-3 h-3" />
                    {{ card.growth }}
                  </span>
                </div>
                <p v-if="card.hint !== ''" class="mt-1 text-[11px] text-gray-400 truncate">{{ card.hint }}</p>
              </div>
            </div>
          </section>

          <!-- 图表卡片：纯 SVG 折线 / 柱状 -->
          <section v-for="chart in chartViews" :key="chart.key">
            <div class="flex items-center gap-2 mb-2">
              <component :is="chart.icon" class="w-4 h-4 text-gray-400 shrink-0" />
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{{ chart.title }}</h3>
              <span v-if="chart.loading" class="text-[11px] text-gray-400 shrink-0">{{ t('statsPage.loading') }}</span>
            </div>
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
              <div v-if="chart.loading" class="h-36 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60"></div>
              <div v-else-if="chart.failed"
                class="h-36 flex flex-col items-center justify-center gap-2 text-xs text-gray-400 text-center px-4">
                <span>{{ chart.errorText !== '' ? chart.errorText : t('statsPage.chartError') }}</span>
                <button type="button"
                  class="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  @click="retryChart(chart.key)">
                  {{ t('statsPage.retry') }}
                </button>
              </div>
              <div v-else-if="chart.geometry.empty" class="h-36 flex items-center justify-center text-xs text-gray-400">
                {{ t('statsPage.chartEmpty') }}
              </div>
              <template v-else>
                <div v-if="chart.geometry.legend.length > 1" class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                  <span v-for="item in chart.geometry.legend" :key="item.id"
                    class="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: item.color }"></span>
                    <span class="truncate max-w-40">
                      {{ item.label !== '' ? item.label : t('statsPage.seriesLabel', { index: item.index + 1 }) }}
                    </span>
                  </span>
                </div>
                <svg class="w-full h-36 block" :viewBox="chartViewBox" preserveAspectRatio="none">
                  <line :x1="0" :y1="chart.geometry.zeroY" :x2="CHART_WIDTH" :y2="chart.geometry.zeroY"
                    class="stroke-gray-200 dark:stroke-gray-700" stroke-width="1" vector-effect="non-scaling-stroke" />
                  <g v-for="line in chart.geometry.lines" :key="line.id">
                    <path :d="line.fillPath" :fill="line.color" fill-opacity="0.12" stroke="none" />
                    <path :d="line.path" fill="none" :stroke="line.color" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                  </g>
                  <rect v-for="bar in chart.geometry.bars" :key="bar.key"
                    :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :fill="bar.color" rx="1" />
                </svg>
                <div class="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span class="truncate">{{ chart.geometry.labels[0] }}</span>
                  <span class="truncate">{{ chart.geometry.midLabel }}</span>
                  <span class="truncate">{{ chart.geometry.labels[chart.geometry.labels.length - 1] }}</span>
                </div>
                <div class="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>{{ t('statsPage.maxValue') }}: {{ chart.geometry.maxLabel }}</span>
                  <span v-if="chart.points > 0">{{ t('statsPage.points', { count: chart.points }) }}</span>
                </div>
              </template>
            </div>
          </section>

          <!-- 热门成员 / 活跃管理员 / 邀请者 -->
          <section v-if="topLists.length > 0">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ t('statsPage.topMembers') }}
              </h3>
              <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div v-for="list in topLists" :key="list.key"
                class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md p-4">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ list.title }}
                </h4>
                <div class="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                  <div v-for="row in list.rows" :key="row.id" class="flex items-center gap-3 py-2 min-w-0">
                    <span class="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 text-xs font-semibold flex items-center justify-center shrink-0">
                      {{ row.initial }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-gray-800 dark:text-gray-100 truncate">{{ row.name }}</p>
                      <p class="text-xs text-gray-400 truncate">{{ row.subtitle }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ArrowDownRight as ArrowDownRightIcon,
  ArrowUpRight as ArrowUpRightIcon,
  BellRing as BellRingIcon,
  CalendarDays as CalendarDaysIcon,
  ChevronLeft as ChevronLeftIcon,
  Clock as ClockIcon,
  Eye as EyeIcon,
  Globe as GlobeIcon,
  Languages as LanguagesIcon,
  Lock as LockIcon,
  MessageSquare as MessageSquareIcon,
  RefreshCw as RefreshCwIcon,
  Share2 as Share2Icon,
  ShieldAlert as ShieldAlertIcon,
  Smile as SmileIcon,
  TrendingUp as TrendingUpIcon,
  UserPlus as UserPlusIcon,
  Users as UsersIcon,
} from 'lucide-vue-next';
import type { ChatStatistics, StatisticalGraph, statisticalValue } from 'tdlib-types';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import { isDark } from '../../store/settings/theme';
import { tdlibSend } from '../../utils/session/tdlib';
import {
  buildAxisLabels,
  formatDateRange,
  formatGrowth,
  formatPercent,
  formatStatNumber,
  isPermissionError,
  loadStatGraph,
  sliceGraphByDays,
  tdlibErrorText,
  type StatGraph,
} from '../../utils/chat/statistics';

/** 页面状态：ready 之外的三种都渲染整页提示 */
type PageState = 'ready' | 'noAccess' | 'unsupported' | 'error';

interface ChartState {
  loading: boolean;
  failed: boolean;
  errorText: string;
  graph: StatGraph | null;
  source: StatisticalGraph;
}

interface ChartDefinition {
  key: string;
  titleKey: string;
  graph: StatisticalGraph;
  preferBars: boolean;
  icon: Component;
}

interface ChartLegendItem {
  id: string;
  label: string;
  color: string;
  index: number;
}

interface ChartLine {
  id: string;
  path: string;
  fillPath: string;
  color: string;
}

interface ChartBar {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface ChartGeometry {
  empty: boolean;
  lines: ChartLine[];
  bars: ChartBar[];
  legend: ChartLegendItem[];
  labels: string[];
  midLabel: string;
  zeroY: number;
  maxLabel: string;
}

interface ChartView {
  key: string;
  title: string;
  icon: Component;
  loading: boolean;
  failed: boolean;
  errorText: string;
  geometry: ChartGeometry;
  points: number;
}

interface OverviewCard {
  key: string;
  label: string;
  icon: Component;
  value: string;
  growth: string;
  growthPositive: boolean;
  hint: string;
}

interface TopRow {
  id: number;
  name: string;
  initial: string;
  subtitle: string;
}

interface TopList {
  key: string;
  title: string;
  rows: TopRow[];
}

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const chatId = computed(() => Number(route.params.id));
const hasChatId = computed(() => Number.isFinite(chatId.value) && chatId.value !== 0);

const loading = ref(true);
const pageState = ref<PageState>('ready');
const errorMessage = ref('');
const stats = ref<ChatStatistics | null>(null);
const activeRange = ref('all');

const chartStates = reactive<Record<string, ChartState>>({});
const userNames = reactive<Record<number, string>>({});
const topLists = ref<TopList[]>([]);

/** 请求序号：切群 / 连续刷新时用于丢弃过期请求的回写 */
let requestEpoch = 0;

/** 图表画布坐标系（viewBox 内部单位，实际尺寸由 CSS 决定） */
const CHART_WIDTH = 600;
const CHART_HEIGHT = 140;
const CHART_PAD_TOP = 8;
const CHART_PAD_BOTTOM = 8;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
const chartViewBox = '0 0 ' + String(CHART_WIDTH) + ' ' + String(CHART_HEIGHT);

const EMPTY_GEOMETRY: ChartGeometry = {
  empty: true,
  lines: [],
  bars: [],
  legend: [],
  labels: [],
  midLabel: '',
  zeroY: CHART_HEIGHT - CHART_PAD_BOTTOM,
  maxLabel: '',
};

const stateTitle = computed(() => {
  if (pageState.value === 'noAccess') return t('statsPage.noAccessTitle');
  if (pageState.value === 'unsupported') return t('statsPage.unsupportedTitle');
  return t('statsPage.errorTitle');
});

const stateHint = computed(() => {
  if (pageState.value === 'noAccess') return t('statsPage.noAccessHint');
  if (pageState.value === 'unsupported') return t('statsPage.unsupportedHint');
  return errorMessage.value !== '' ? errorMessage.value : t('statsPage.errorHint');
});

const periodText = computed(() => formatDateRange(stats.value?.period, locale.value));

/** 统计区间总天数：用于判断还能提供哪些查看范围 */
const periodDays = computed(() => {
  const period = stats.value?.period;
  if (!period) return 0;
  const seconds = period.end_date - period.start_date;
  return seconds > 0 ? Math.ceil(seconds / 86400) : 0;
});

const periodEnd = computed(() => stats.value?.period.end_date ?? 0);

/** 是否有可裁剪的时间序列图表 */
const hasTimeSeries = computed(() =>
  Object.values(chartStates).some((state) => !!state.graph && state.graph.timeSeries),
);

/**
 * 查看范围：统计接口本身不提供区间参数（period 由服务端返回），
 * 这里对返回的时间序列做本地窗口裁剪；无时间序列时只保留“全部”。
 */
const rangeOptions = computed<{ key: string; days: number; label: string }[]>(() => {
  const options = [{ key: 'all', days: 0, label: t('statsPage.rangeAll') }];
  if (!hasTimeSeries.value) return options;
  const total = periodDays.value;
  for (const days of [7, 30]) {
    if (total > days + 1) options.push({ key: 'days-' + String(days), days, label: t('statsPage.rangeDays', { days }) });
  }
  return options;
});

const rangeDays = computed(() => {
  const matched = rangeOptions.value.find((option) => option.key === activeRange.value);
  return matched ? matched.days : 0;
});

/** 区间选项随数据变化（例如切到统计区间更短的会话）时，校正已失效的选中项 */
watch(rangeOptions, (options) => {
  if (!options.some((option) => option.key === activeRange.value)) activeRange.value = 'all';
});

function roundPoint(value: number): number {
  return Math.round(value * 100) / 100;
}

function alignedValues(values: number[], count: number): number[] {
  if (values.length === count) return values;
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) result.push(index < values.length ? values[index] : 0);
  return result;
}

/** 纯 SVG 几何：折线 + 面积填充，或分组柱状；负值（如退出人数）以零线为基准向下画 */
function buildChartGeometry(graph: StatGraph, preferBars: boolean, chartLocale: string): ChartGeometry {
  const series = graph.series.filter((item) => item.values.length > 0);
  if (series.length === 0) return EMPTY_GEOMETRY;
  const labels = buildAxisLabels(graph, chartLocale);
  // 逐点求点数与极值：避免大数组用展开传参触发 RangeError
  let count = Math.max(labels.length, graph.xValues.length);
  let high = -Infinity;
  let low = 0;
  for (const item of series) {
    if (item.values.length > count) count = item.values.length;
    for (const value of item.values) {
      if (value > high) high = value;
      if (value < low) low = value;
    }
  }
  if (count === 0 || !Number.isFinite(high)) return EMPTY_GEOMETRY;
  const span = high - low;
  const scaleY = (value: number): number => {
    if (span <= 0) return CHART_HEIGHT - CHART_PAD_BOTTOM;
    return CHART_PAD_TOP + ((high - value) / span) * PLOT_HEIGHT;
  };
  const zeroY = scaleY(0);
  const legend: ChartLegendItem[] = series.map((item, index) => ({
    id: item.id,
    label: item.name,
    color: item.color,
    index,
  }));
  const useBars = preferBars || series.some((item) => item.kind.indexOf('bar') >= 0);
  const lines: ChartLine[] = [];
  const bars: ChartBar[] = [];

  if (useBars) {
    const categoryWidth = CHART_WIDTH / count;
    const barWidth = Math.max(2, (categoryWidth * 0.72) / series.length);
    const groupWidth = barWidth * series.length;
    series.forEach((item, seriesIndex) => {
      const values = alignedValues(item.values, count);
      for (let index = 0; index < count; index += 1) {
        const value = values[index];
        const valueY = scaleY(value);
        const top = Math.min(valueY, zeroY);
        const height = Math.abs(valueY - zeroY);
        bars.push({
          key: item.id + '-' + String(index),
          x: roundPoint(categoryWidth * index + (categoryWidth - groupWidth) / 2 + seriesIndex * barWidth),
          y: roundPoint(top),
          width: roundPoint(Math.max(barWidth - 0.5, 0.5)),
          height: roundPoint(value === 0 ? 0 : Math.max(height, 1)),
          color: item.color,
        });
      }
    });
  } else {
    for (const item of series) {
      const values = alignedValues(item.values, count);
      const points = values.map((value, index) => ({
        x: count === 1 ? CHART_WIDTH / 2 : (CHART_WIDTH * index) / (count - 1),
        y: scaleY(value),
      }));
      const commands: string[] = [];
      points.forEach((point, index) => {
        commands.push((index === 0 ? 'M' : 'L') + String(roundPoint(point.x)) + ',' + String(roundPoint(point.y)));
      });
      const path = commands.join(' ');
      const first = points[0];
      const last = points[points.length - 1];
      const fillPath =
        path +
        ' L' + String(roundPoint(last.x)) + ',' + String(roundPoint(zeroY)) +
        ' L' + String(roundPoint(first.x)) + ',' + String(roundPoint(zeroY)) + ' Z';
      lines.push({ id: item.id, path, fillPath, color: item.color });
    }
  }

  const midIndex = Math.floor((count - 1) / 2);
  return {
    empty: false,
    lines,
    bars,
    legend,
    labels,
    midLabel: count > 2 ? labels[midIndex] || '' : '',
    zeroY: roundPoint(zeroY),
    maxLabel: formatStatNumber(high, chartLocale),
  };
}

/** 把当前查看范围应用到单个图表 */
function applyRange(graph: StatGraph): StatGraph {
  const days = rangeDays.value;
  if (days <= 0 || !graph.timeSeries) return graph;
  return sliceGraphByDays(graph, days, periodEnd.value);
}

function statCard(key: string, labelKey: string, icon: Component, value: statisticalValue): OverviewCard {
  return {
    key,
    label: t(labelKey),
    icon,
    value: formatStatNumber(value.value, locale.value),
    growth: formatGrowth(value.growth_rate_percentage) ?? '',
    growthPositive: value.growth_rate_percentage > 0,
    hint: '',
  };
}

/** 概览卡片：字段以 TDLib 返回的统计类型为准（超级群 vs 频道） */
const overviewCards = computed<OverviewCard[]>(() => {
  const current = stats.value;
  if (!current) return [];
  if (current._ === 'chatStatisticsSupergroup') {
    return [
      statCard('memberCount', 'statsPage.memberCount', UsersIcon, current.member_count),
      statCard('messageCount', 'statsPage.messageCount', MessageSquareIcon, current.message_count),
      statCard('viewerCount', 'statsPage.viewerCount', EyeIcon, current.viewer_count),
      statCard('senderCount', 'statsPage.senderCount', UserPlusIcon, current.sender_count),
    ];
  }
  return [
    statCard('memberCount', 'statsPage.memberCount', UsersIcon, current.member_count),
    {
      key: 'enabledNotifications',
      label: t('statsPage.enabledNotifications'),
      icon: BellRingIcon,
      value: formatPercent(current.enabled_notifications_percentage),
      growth: '',
      growthPositive: true,
      hint: t('statsPage.enabledNotificationsHint'),
    },
    statCard('meanMessageViews', 'statsPage.meanMessageViews', EyeIcon, current.mean_message_view_count),
    statCard('meanMessageShares', 'statsPage.meanMessageShares', Share2Icon, current.mean_message_share_count),
    statCard('meanMessageReactions', 'statsPage.meanMessageReactions', SmileIcon, current.mean_message_reaction_count),
    statCard('meanStoryViews', 'statsPage.meanStoryViews', EyeIcon, current.mean_story_view_count),
    statCard('meanStoryShares', 'statsPage.meanStoryShares', Share2Icon, current.mean_story_share_count),
    statCard('meanStoryReactions', 'statsPage.meanStoryReactions', SmileIcon, current.mean_story_reaction_count),
  ];
});

/** 图表清单：取 TDLib 返回的 statisticalGraph 字段，一个字段一张卡片 */
const chartDefinitions = computed<ChartDefinition[]>(() => {
  const current = stats.value;
  if (!current) return [];
  if (current._ === 'chatStatisticsSupergroup') {
    return [
      { key: 'memberCount', titleKey: 'statsPage.graphMemberCount', graph: current.member_count_graph, preferBars: false, icon: UsersIcon },
      { key: 'join', titleKey: 'statsPage.graphJoin', graph: current.join_graph, preferBars: false, icon: TrendingUpIcon },
      { key: 'joinBySource', titleKey: 'statsPage.graphJoinBySource', graph: current.join_by_source_graph, preferBars: true, icon: UserPlusIcon },
      { key: 'language', titleKey: 'statsPage.graphLanguage', graph: current.language_graph, preferBars: true, icon: LanguagesIcon },
      { key: 'messageContent', titleKey: 'statsPage.graphMessageContent', graph: current.message_content_graph, preferBars: true, icon: MessageSquareIcon },
      { key: 'action', titleKey: 'statsPage.graphAction', graph: current.action_graph, preferBars: true, icon: ShieldAlertIcon },
      { key: 'day', titleKey: 'statsPage.graphDay', graph: current.day_graph, preferBars: true, icon: ClockIcon },
      { key: 'week', titleKey: 'statsPage.graphWeek', graph: current.week_graph, preferBars: true, icon: CalendarDaysIcon },
    ];
  }
  return [
    { key: 'memberCount', titleKey: 'statsPage.graphMemberCount', graph: current.member_count_graph, preferBars: false, icon: UsersIcon },
    { key: 'join', titleKey: 'statsPage.graphJoin', graph: current.join_graph, preferBars: false, icon: TrendingUpIcon },
    { key: 'mute', titleKey: 'statsPage.graphMute', graph: current.mute_graph, preferBars: false, icon: BellRingIcon },
    { key: 'viewCountByHour', titleKey: 'statsPage.graphViewByHour', graph: current.view_count_by_hour_graph, preferBars: true, icon: ClockIcon },
    { key: 'viewCountBySource', titleKey: 'statsPage.graphViewBySource', graph: current.view_count_by_source_graph, preferBars: true, icon: GlobeIcon },
    { key: 'joinBySource', titleKey: 'statsPage.graphJoinBySource', graph: current.join_by_source_graph, preferBars: true, icon: UserPlusIcon },
    { key: 'language', titleKey: 'statsPage.graphLanguage', graph: current.language_graph, preferBars: true, icon: LanguagesIcon },
    { key: 'messageInteraction', titleKey: 'statsPage.graphMessageInteraction', graph: current.message_interaction_graph, preferBars: false, icon: EyeIcon },
    { key: 'messageReaction', titleKey: 'statsPage.graphMessageReaction', graph: current.message_reaction_graph, preferBars: false, icon: SmileIcon },
    { key: 'storyInteraction', titleKey: 'statsPage.graphStoryInteraction', graph: current.story_interaction_graph, preferBars: false, icon: Share2Icon },
    { key: 'storyReaction', titleKey: 'statsPage.graphStoryReaction', graph: current.story_reaction_graph, preferBars: false, icon: SmileIcon },
    { key: 'instantView', titleKey: 'statsPage.graphInstantView', graph: current.instant_view_interaction_graph, preferBars: false, icon: EyeIcon },
  ];
});

const chartViews = computed<ChartView[]>(() => {
  const chartLocale = locale.value;
  return chartDefinitions.value.map((definition) => {
    const state = chartStates[definition.key];
    const graph = state && state.graph ? applyRange(state.graph) : null;
    return {
      key: definition.key,
      title: t(definition.titleKey),
      icon: definition.icon,
      loading: state ? state.loading : true,
      failed: state ? state.failed : false,
      errorText: state ? state.errorText : '',
      geometry: graph ? buildChartGeometry(graph, definition.preferBars, chartLocale) : EMPTY_GEOMETRY,
      points: graph ? graph.xValues.length : 0,
    };
  });
});

function clearChartStates(): void {
  for (const key of Object.keys(chartStates)) delete chartStates[key];
}

/** 并行加载所有图表；异步图表走 getStatisticalGraph，失败只影响单张卡片；epoch 丢弃过期回写 */
async function loadGraphs(epoch: number): Promise<void> {
  const definitions = chartDefinitions.value;
  if (definitions.length === 0 || epoch !== requestEpoch) return;
  const targetChatId = chatId.value;
  for (const definition of definitions) {
    if (epoch !== requestEpoch) return;
    chartStates[definition.key] = {
      loading: true,
      failed: false,
      errorText: '',
      graph: null,
      source: definition.graph,
    };
  }
  await Promise.all(
    definitions.map(async (definition) => {
      const current = chartStates[definition.key];
      if (!current) return;
      try {
        const result = await loadStatGraph(targetChatId, current.source);
        if (epoch !== requestEpoch) return;
        chartStates[definition.key] = {
          loading: false,
          failed: result.status === 'error',
          errorText: result.status === 'error' ? result.message : '',
          graph: result.status === 'ok' ? result.graph : null,
          source: current.source,
        };
      } catch (error) {
        if (epoch !== requestEpoch) return;
        chartStates[definition.key] = {
          loading: false,
          failed: true,
          errorText: tdlibErrorText(error),
          graph: null,
          source: current.source,
        };
      }
    }),
  );
}

async function retryChart(key: string): Promise<void> {
  const current = chartStates[key];
  if (!current) return;
  const epoch = requestEpoch;
  chartStates[key] = { ...current, loading: true, failed: false, errorText: '' };
  try {
    const result = await loadStatGraph(chatId.value, current.source);
    if (epoch !== requestEpoch) return;
    chartStates[key] = {
      loading: false,
      failed: result.status === 'error',
      errorText: result.status === 'error' ? result.message : '',
      graph: result.status === 'ok' ? result.graph : null,
      source: current.source,
    };
  } catch (error) {
    if (epoch !== requestEpoch) return;
    chartStates[key] = {
      loading: false,
      failed: true,
      errorText: tdlibErrorText(error),
      graph: null,
      source: current.source,
    };
  }
}

async function resolveUserName(userId: number): Promise<string> {
  const cached = userNames[userId];
  if (cached) return cached;
  try {
    const user = await tdlibSend({ _: 'getUser', user_id: userId });
    const fullName = [user.first_name, user.last_name]
      .filter((part) => part !== '')
      .join(' ')
      .trim();
    const resolved = fullName !== '' ? fullName : t('statsPage.unknownUser');
    userNames[userId] = resolved;
    return resolved;
  } catch {
    userNames[userId] = t('statsPage.unknownUser');
    return userNames[userId];
  }
}

function initialOf(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

/** 热门成员：仅超级群统计提供 top_senders / top_administrators / top_inviters；epoch 丢弃过期回写 */
async function loadTopLists(statistics: ChatStatistics, epoch: number): Promise<void> {
  topLists.value = [];
  if (statistics._ !== 'chatStatisticsSupergroup' || epoch !== requestEpoch) return;
  const groups: TopList[] = [];
  const senders = statistics.top_senders.slice(0, 5);
  if (senders.length > 0) {
    const rows = await Promise.all(
      senders.map(async (item) => {
        const name = await resolveUserName(item.user_id);
        return {
          id: item.user_id,
          name,
          initial: initialOf(name),
          subtitle: t('statsPage.sentMessagesCount', { count: item.sent_message_count }),
        };
      }),
    );
    groups.push({ key: 'senders', title: t('statsPage.topSenders'), rows });
  }
  const administrators = statistics.top_administrators.slice(0, 5);
  if (administrators.length > 0) {
    const rows = await Promise.all(
      administrators.map(async (item) => {
        const name = await resolveUserName(item.user_id);
        return {
          id: item.user_id,
          name,
          initial: initialOf(name),
          subtitle: t('statsPage.adminActions', {
            deleted: item.deleted_message_count,
            banned: item.banned_user_count,
            restricted: item.restricted_user_count,
          }),
        };
      }),
    );
    groups.push({ key: 'administrators', title: t('statsPage.topAdministrators'), rows });
  }
  const inviters = statistics.top_inviters.slice(0, 5);
  if (inviters.length > 0) {
    const rows = await Promise.all(
      inviters.map(async (item) => {
        const name = await resolveUserName(item.user_id);
        return {
          id: item.user_id,
          name,
          initial: initialOf(name),
          subtitle: t('statsPage.addedMembersCount', { count: item.added_member_count }),
        };
      }),
    );
    groups.push({ key: 'inviters', title: t('statsPage.topInviters'), rows });
  }
  if (epoch !== requestEpoch) return;
  topLists.value = groups;
}

async function reload(): Promise<void> {
  if (!hasChatId.value) {
    loading.value = false;
    pageState.value = 'unsupported';
    return;
  }
  const epoch = ++requestEpoch;
  loading.value = true;
  pageState.value = 'ready';
  errorMessage.value = '';
  stats.value = null;
  activeRange.value = 'all';
  clearChartStates();
  topLists.value = [];
  try {
    const chat = await tdlibSend({ _: 'getChat', chat_id: chatId.value });
    if (epoch !== requestEpoch) return;
    const chatType = chat.type;
    if (chatType._ !== 'chatTypeSupergroup') {
      pageState.value = 'unsupported';
      return;
    }
    // 统计只对管理员开放：先看 supergroupFullInfo.can_get_statistics，避免用报错当权限判断
    let canGetStatistics = true;
    try {
      const fullInfo = await tdlibSend({ _: 'getSupergroupFullInfo', supergroup_id: chatType.supergroup_id });
      canGetStatistics = fullInfo.can_get_statistics;
    } catch {
      canGetStatistics = true;
    }
    if (epoch !== requestEpoch) return;
    if (!canGetStatistics) {
      pageState.value = 'noAccess';
      return;
    }
    const statistics = await tdlibSend({
      _: 'getChatStatistics',
      chat_id: chatId.value,
      is_dark: isDark.value,
    });
    if (epoch !== requestEpoch) return;
    stats.value = statistics;
    // 图表与热门成员各自异步补齐，不阻塞概览先出现
    void loadGraphs(epoch).catch(() => undefined);
    void loadTopLists(statistics, epoch).catch(() => {
      if (epoch === requestEpoch) topLists.value = [];
    });
  } catch (error) {
    if (epoch !== requestEpoch) return;
    if (isPermissionError(error)) {
      pageState.value = 'noAccess';
    } else {
      pageState.value = 'error';
      errorMessage.value = tdlibErrorText(error);
    }
  } finally {
    if (epoch === requestEpoch) loading.value = false;
  }
}

function goBack(): void {
  router.back();
}

watch(
  () => route.params.id,
  () => {
    if (hasChatId.value) void reload();
  },
);

onMounted(() => {
  if (hasChatId.value) void reload();
  else {
    loading.value = false;
    pageState.value = 'unsupported';
  }
});
</script>
