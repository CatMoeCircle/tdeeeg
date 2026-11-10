<template>
    <!-- 位置发送弹窗：TDLib 静态地图 + 拖动 / 缩放选址，中心红针的位置就是发送的坐标 -->
    <ModalDialog :model-value="modelValue" :title="t('lng_maps_point')" @update:model-value="close">
        <div class="space-y-3">
            <!-- 地图画布：touch-none 阻止触摸滚动，select-none 阻止拖动时选中图片 / 文本 -->
            <div ref="mapEl"
                class="location-map-grid relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                :class="dragging ? 'cursor-grabbing' : 'cursor-grab'" @pointerdown="onPointerDown"
                @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerCancel"
                @lostpointercapture="onPointerCancel" @dragstart.prevent>
                <!-- 地图图：按容器宽度等比缩放（512 宽的缩略图），拖动只改 translate，松手才换图 -->
                <img v-if="mapSrc" :src="mapSrc" alt="" draggable="false"
                    class="pointer-events-none absolute inset-0 h-full w-full max-w-none object-cover"
                    :style="imageStyle" @error="onMapImageError" />

                <!-- 拉图进度：加载中叠一个转圈，加载失败时只剩网格底 -->
                <div v-if="loading" class="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <LoaderIcon class="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
                </div>

                <!-- 中心定位针：针尖落在地图中心（与 RichMap 的样式一致） -->
                <span
                    class="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full items-center justify-center">
                    <MapPinIcon class="h-10 w-10 fill-red-500 text-red-500 drop-shadow" />
                    <span class="absolute h-3.5 w-3.5 rounded-full bg-white" style="top: 9px;"></span>
                </span>

                <!-- 缩放 +/-：TDLib 限制 13-20；pointerdown.stop 防止点按钮时启动拖动 -->
                <div class="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/95 shadow-sm dark:border-gray-600 dark:bg-gray-900/90"
                    @pointerdown.stop>
                    <button type="button" :disabled="zoom >= MAP_ZOOM_MAX" :aria-label="t('lng_media_zoom_in')"
                        :title="t('lng_media_zoom_in')"
                        class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                        @click="changeZoom(1)">
                        <PlusIcon class="h-4 w-4" />
                    </button>
                    <span class="h-px w-full bg-gray-200 dark:bg-gray-700"></span>
                    <button type="button" :disabled="zoom <= MAP_ZOOM_MIN" :aria-label="t('lng_media_zoom_out')"
                        :title="t('lng_media_zoom_out')"
                        class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                        @click="changeZoom(-1)">
                        <MinusIcon class="h-4 w-4" />
                    </button>
                </div>

                <!-- 缩放级别角标 -->
                <span
                    class="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-white backdrop-blur-sm">
                    z{{ zoom }}
                </span>
            </div>

            <!-- 当前中心坐标 + 我的位置（只在用户点击时请求定位权限） -->
            <div class="flex items-center justify-between gap-3">
                <p class="min-w-0 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                    {{ latitudeText }}°, {{ longitudeText }}°
                </p>
                <BaseButton variant="ghost" size="sm" :disabled="locating" @click="useMyLocation">
                    <span class="flex items-center gap-1.5">
                        <LoaderIcon v-if="locating" class="h-3.5 w-3.5 animate-spin" />
                        <LocateFixedIcon v-else class="h-3.5 w-3.5" />
                        {{ t('location.myLocation') }}
                    </span>
                </BaseButton>
            </div>
        </div>

        <template #footer>
            <BaseButton variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton type="button" size="sm" @click="submit">{{ t('lng_maps_point_send') }}</BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { convertFileSrc } from '@tauri-apps/api/core';
import { LocateFixed as LocateFixedIcon, Loader2 as LoaderIcon, MapPin as MapPinIcon, Minus as MinusIcon, Plus as PlusIcon } from 'lucide-vue-next';
import type { location } from 'tdlib-types';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import { ensureLocalFilePath, tdlibSend } from '../../../utils/session/tdlib';
import { toast } from '../../../utils/ui/toast';
import {
    DEFAULT_GEO_POINT,
    DRAG_THRESHOLD_PX,
    LAST_LOCATION_STORAGE_KEY,
    MAP_ZOOM_DEFAULT,
    MAP_ZOOM_MAX,
    MAP_ZOOM_MIN,
    centerOnOffsetPoint,
    clampZoom,
    formatCoordinate,
    normalizeGeoPoint,
    panCenterByPixels,
    parseStoredGeoPoint,
    serializeGeoPoint,
    type GeoPoint,
} from '../../../utils/chat/locationPicker';

const props = defineProps<{
    modelValue: boolean;
    /** 用于 getMapThumbnailFile 的 chat_id（TDLib 用它生成对应场景的地图，未知传 0） */
    chatId?: number;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
    /** 用户确认的位置，父组件负责 inputMessageLocation 发送 */
    (e: 'submit', location: location): void;
}>();

const { t } = useI18n();

/** 向 TDLib 请求的地图像素尺寸（限制 16-1024）；显示时按容器宽度等比缩放 */
const MAP_THUMB_WIDTH = 512;
const MAP_THUMB_HEIGHT = 384;

/** 定位参数：不自动请求权限，只在点「我的位置」时调一次 */
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 };

const mapEl = ref<HTMLDivElement | null>(null);
const mapSrc = ref('');
/** 已经画出图片的那张地图的中心；拖动位移都相对它计算 */
const center = ref<GeoPoint>({ ...DEFAULT_GEO_POINT });
const zoom = ref(MAP_ZOOM_DEFAULT);
/** 拖动位移（CSS px）；拖动结束后先留着，等新图到位再归零，视觉上不会先弹回原位 */
const offsetX = ref(0);
const offsetY = ref(0);
const dragging = ref(false);
const loading = ref(false);
const locating = ref(false);
/** 松手 / 缩放 / 定位后正在请求的目标中心；加载完成前它就是「当前选择」 */
const pendingCenter = ref<GeoPoint | null>(null);

/** 请求代次：拖动松手、缩放、定位都可能连发，只让最后一次的结果落地 */
let loadSeq = 0;

/**
 * 当前选中的位置：请求中的目标优先，其次是「已提交中心 + 进行中的拖动位移」。
 * 这样拖动过程中坐标能实时跟着变，而请求回来之前也不会把旧中心当成选择结果。
 */
const currentLocation = computed<GeoPoint>(() => {
    if (pendingCenter.value) return pendingCenter.value;
    const scale = displayScale();
    return panCenterByPixels(center.value, offsetX.value / scale, offsetY.value / scale, zoom.value);
});

const latitudeText = computed(() => formatCoordinate(currentLocation.value.latitude));
const longitudeText = computed(() => formatCoordinate(currentLocation.value.longitude));

const imageStyle = computed(() => ({ transform: `translate(${offsetX.value}px, ${offsetY.value}px)` }));

/**
 * 屏幕像素 → 地图像素的比例。
 * TDLib 返回的是 MAP_THUMB_WIDTH 宽的图，这里按容器宽度等比渲染（4:3 正好铺满），
 * 所以 1 CSS px 对应 1/scale 个地图像素；Mercator 换算必须用折算后的像素数，
 * 否则窄窗口下拖同样距离会飞得更远。
 */
function displayScale(): number {
    const width = mapEl.value?.clientWidth ?? 0;
    return width > 0 ? width / MAP_THUMB_WIDTH : 1;
}

/** 两点是否几乎重合（误差小于 1e-7 度约 1 厘米，用来跳过无意义的地图重拉） */
function isSamePoint(a: GeoPoint, b: GeoPoint): boolean {
    return Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7;
}

/** 读取上次发送的位置（坏数据 / 存储被禁用都当作没有） */
function readLastLocation(): GeoPoint | null {
    try {
        return parseStoredGeoPoint(window.localStorage.getItem(LAST_LOCATION_STORAGE_KEY));
    } catch {
        return null;
    }
}

function writeLastLocation(point: GeoPoint) {
    try {
        window.localStorage.setItem(LAST_LOCATION_STORAGE_KEY, serializeGeoPoint(point));
    } catch {
        // 存不下就算了，只是下次打开的默认位置
    }
}

/**
 * 拉取以 target 为中心的地图缩略图。
 * 只在松手 / 缩放 / 定位后各调一次：拖动过程中只做 CSS translate，不发请求。
 */
async function loadMap(target: GeoPoint) {
    const seq = ++loadSeq;
    loading.value = true;
    try {
        const file = await tdlibSend({
            _: 'getMapThumbnailFile',
            location: {
                _: 'location',
                latitude: target.latitude,
                longitude: target.longitude,
                horizontal_accuracy: 0,
            },
            zoom: clampZoom(zoom.value),
            width: MAP_THUMB_WIDTH,
            height: MAP_THUMB_HEIGHT,
            // 高分屏请求 2x / 3x 位图，TDLib 的 scale 只允许 1-3
            scale: Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))),
            chat_id: props.chatId ?? 0,
        });
        const path = await ensureLocalFilePath(file);
        if (seq !== loadSeq) return; // 过期响应直接丢
        if (!path) throw new Error('map thumbnail is not available locally');
        mapSrc.value = convertFileSrc(path);
        // 新图到位后才归零位移：此刻旧图「已拖动」的显示位置正好等价于新图居中
        center.value = target;
        offsetX.value = 0;
        offsetY.value = 0;
        pendingCenter.value = null;
    } catch (e) {
        if (seq !== loadSeq) return;
        console.error('Load location map failed:', e);
        // 失败不留白：清掉图片走网格占位，坐标照常可用、照常能发送
        mapSrc.value = '';
        center.value = target;
        offsetX.value = 0;
        offsetY.value = 0;
        pendingCenter.value = null;
    } finally {
        if (seq === loadSeq) loading.value = false;
    }
}

/** 每次打开都重新读一遍上次位置；地图文件也重新拉（缩放 / 聊天可能变了） */
function openPicker() {
    center.value = readLastLocation() ?? { ...DEFAULT_GEO_POINT };
    zoom.value = MAP_ZOOM_DEFAULT;
    offsetX.value = 0;
    offsetY.value = 0;
    pendingCenter.value = null;
    mapSrc.value = '';
    loadSeq++; // 作废上一次打开遗留的请求
    loading.value = false;
    void loadMap(center.value);
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) openPicker();
    },
    { immediate: true },
);

function close() {
    loadSeq++; // 关掉后不再接受遗留响应
    loading.value = false;
    dragging.value = false;
    emit('update:modelValue', false);
}

/** Esc 关闭（捕获阶段拦截，避免同时触发聊天页的 Esc 行为） */
function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !props.modelValue) return;
    e.stopPropagation();
    close();
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) window.addEventListener('keydown', onKeydown, true);
        else window.removeEventListener('keydown', onKeydown, true);
    },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));

let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let startOffsetX = 0;
let startOffsetY = 0;
/** 本次手势的累计位移，只用来区分点击 / 拖动 */
let movedX = 0;
let movedY = 0;

function onPointerDown(e: PointerEvent) {
    // 只处理左键 / 触摸 / 触控笔，右键留给系统菜单
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = offsetX.value;
    startOffsetY = offsetY.value;
    movedX = 0;
    movedY = 0;
    dragging.value = true;
    // 捕获指针：拖出画布外也继续跟手，松手事件不会丢
    mapEl.value?.setPointerCapture(e.pointerId);
    e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    movedX = e.clientX - startX;
    movedY = e.clientY - startY;
    offsetX.value = startOffsetX + movedX;
    offsetY.value = startOffsetY + movedY;
}

/** 收尾手势：先把 pointerId 清掉，releasePointerCapture 触发的 lostpointercapture 就会幂等返回 */
function endGesture() {
    const id = pointerId;
    pointerId = null;
    dragging.value = false;
    if (id === null) return;
    try {
        mapEl.value?.releasePointerCapture(id);
    } catch {
        // 指针已经释放（例如系统取消），忽略
    }
}

function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    const scale = displayScale();
    // 已积累的位移换算成「拖动后的中心」
    let target = panCenterByPixels(center.value, offsetX.value / scale, offsetY.value / scale, zoom.value);
    const isTap = Math.abs(movedX) <= DRAG_THRESHOLD_PX && Math.abs(movedY) <= DRAG_THRESHOLD_PX;
    const rect = mapEl.value?.getBoundingClientRect();
    if (isTap && rect) {
        // 点击：把点击点（相对画布中心的偏移）移到中心
        const clickX = e.clientX - (rect.left + rect.width / 2);
        const clickY = e.clientY - (rect.top + rect.height / 2);
        target = centerOnOffsetPoint(target, clickX / scale, clickY / scale, zoom.value);
    }
    endGesture();
    target = normalizeGeoPoint(target);
    // 中心其实没动（例如点了正中心）：不必再拉一次图，直接归位
    if (isSamePoint(target, center.value)) {
        pendingCenter.value = null;
        offsetX.value = 0;
        offsetY.value = 0;
        return;
    }
    pendingCenter.value = target;
    // 整个手势只在松手时发一次请求
    void loadMap(target);
}

/** 手势被系统取消（窗口失焦等）：回到已提交的中心，不发请求 */
function onPointerCancel() {
    if (pointerId === null) return;
    endGesture();
    // 已经松手发过请求时位移要留到新图到位，否则会先弹回旧位置
    if (pendingCenter.value) return;
    offsetX.value = 0;
    offsetY.value = 0;
}

function changeZoom(delta: number) {
    const next = clampZoom(zoom.value + delta);
    if (next === zoom.value) return;
    // 先按当前 zoom / 位移算出真实中心，再换级，避免缩放时位置漂移
    const target = currentLocation.value;
    zoom.value = next;
    pendingCenter.value = normalizeGeoPoint(target);
    void loadMap(pendingCenter.value);
}

/** 我的位置：只在用户点击时请求权限；失败 / 不支持时提示拖动地图 */
function useMyLocation() {
    if (locating.value) return;
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) {
        toast.warning(t('location.myLocationFailed'));
        return;
    }
    locating.value = true;
    geo.getCurrentPosition(
        (pos) => {
            locating.value = false;
            const target = normalizeGeoPoint({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
            });
            pendingCenter.value = target;
            void loadMap(target);
        },
        (err) => {
            locating.value = false;
            console.warn('Location unavailable:', err.message);
            toast.warning(t('location.myLocationFailed'));
        },
        GEO_OPTIONS,
    );
}

/** 图片解码失败（本地文件被清理等）：退回网格占位，坐标仍然有效 */
function onMapImageError() {
    mapSrc.value = '';
}

function submit() {
    const point = normalizeGeoPoint(currentLocation.value);
    writeLastLocation(point);
    emit('submit', {
        _: 'location',
        latitude: point.latitude,
        longitude: point.longitude,
        horizontal_accuracy: 0,
    });
    close();
}
</script>

<style scoped>
/* 地图占位底：浅色 / 深色都用网格线，加载中或加载失败时不出现空白块 */
.location-map-grid {
    background-color: #f8fafc;
    background-image:
        linear-gradient(to right, rgb(100 116 139 / 0.14) 1px, transparent 1px),
        linear-gradient(to bottom, rgb(100 116 139 / 0.14) 1px, transparent 1px);
    background-size: 28px 28px;
}

:global(html.dark .location-map-grid) {
    background-color: #1f2937;
    background-image:
        linear-gradient(to right, rgb(148 163 184 / 0.14) 1px, transparent 1px),
        linear-gradient(to bottom, rgb(148 163 184 / 0.14) 1px, transparent 1px);
}
</style>
