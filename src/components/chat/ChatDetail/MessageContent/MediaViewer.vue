<template>
    <!-- ========== VIDEO MODE ========== -->
    <Teleport to="body">
        <Transition name="viewer-zoom">
            <div v-if="visible && isVideo" class="fixed inset-0 z-9999 flex items-center justify-center"
                @click.self="close" @keydown="onKeydown" tabindex="0" ref="containerRef">
                <!-- Video card -->
                <div class="video-card relative flex flex-col overflow-hidden bg-black/70" :style="playerStyle"
                    @click.stop @mousemove="onVideoMouseMove" @mouseleave="onVideoMouseLeave">
                    <!-- Video element -->
                    <video ref="videoRef" :src="currentSrc" preload="auto" playsinline
                        class="w-full h-full object-contain" @timeupdate="onVideoTimeUpdate"
                        @loadedmetadata="onVideoLoaded" @ended="onVideoEnded" @click="toggleVideoPlay" />

                    <!-- UI overlay (close button + controls + caption) -->
                    <Transition name="fade-ui">
                        <div v-if="videoLoaded && uiVisible" class="absolute inset-0 z-10">
                            <!-- Close button (top-right) -->
                            <button @click="close"
                                class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    class="w-5 h-5">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>

                            <!-- Bottom controls + caption -->
                            <div
                                class="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[320px] max-w-[90%]">
                                <!-- Control card -->
                                <div class="w-full bg-black/60 backdrop-blur-md rounded-2xl px-4 py-3" @click.stop>
                                    <!-- Row 1: volume + play/pause + time -->
                                    <div class="flex items-center justify-between gap-3 mb-2">
                                        <!-- Left: volume -->
                                        <div class="flex items-center gap-1.5 w-[90px] shrink-0">
                                            <button @click="toggleVideoMute"
                                                class="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white shrink-0">
                                                <svg v-if="!videoMuted" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2" class="w-4 h-4">
                                                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                                    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                                                </svg>
                                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                    stroke-width="2" class="w-4 h-4">
                                                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                                    <line x1="23" y1="9" x2="17" y2="15" />
                                                    <line x1="17" y1="9" x2="23" y2="15" />
                                                </svg>
                                            </button>
                                            <input type="range" :min="0" :max="1" :step="0.05" :value="videoVolume"
                                                @input="onVolumeChange" class="w-20 h-1 accent-white cursor-pointer" />
                                        </div>
                                        <!-- Center: play/pause -->
                                        <button @click="toggleVideoPlay"
                                            class="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0">
                                            <svg v-if="!isVideoPlaying" viewBox="0 0 24 24" fill="currentColor"
                                                class="w-5 h-5 ml-0.5">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                            <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                            </svg>
                                        </button>
                                        <!-- Right: time -->
                                        <div class="flex items-center gap-2 w-[90px] shrink-0 justify-end">
                                            <span class="text-white/60 text-xs font-mono">{{
                                                formatTimestamp(videoCurrent) }} /
                                                {{ formatTimestamp(videoDuration) }}</span>
                                        </div>
                                    </div>
                                    <!-- Row 2: progress bar (draggable) -->
                                    <div class="w-full flex items-center">
                                        <input type="range" :min="0" :max="videoDuration || 0" :step="0.1"
                                            :value="videoCurrent" @input="onSeekDrag"
                                            class="w-full h-1 accent-white cursor-pointer appearance-none bg-white/20 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md" />
                                    </div>
                                </div>
                                <!-- Caption card (below controls) -->
                                <div v-if="caption" class="w-full bg-black/60 backdrop-blur-md rounded-xl px-4 py-2"
                                    @click.stop>
                                    <p class="text-white/80 text-sm text-center">{{ caption }}</p>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- ========== PHOTO MODE ========== -->
    <Teleport to="body">
        <div v-if="visible && isImage" class="fixed inset-0 z-9999 bg-black/95 flex flex-col" @wheel.prevent="onWheel"
            @keydown="onKeydown" tabindex="0" ref="containerRef">

            <!-- Top bar -->
            <div
                class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-linear-to-b from-black/60 to-transparent">
                <button @click="close" class="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
                <span class="text-sm text-white/80">{{ currentIndex + 1 }} / {{ totalCount }}</span>
                <div class="w-8"></div>
            </div>

            <!-- Main content area -->
            <div class="flex-1 flex items-center justify-center relative overflow-hidden select-none touch-none"
                ref="contentRef" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
                @pointercancel="onPointerUp">

                <img :src="currentSrc"
                    class="max-w-full max-h-full transition-transform duration-200 ease-out select-none"
                    :style="{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)` }" draggable="false"
                    @dblclick="toggleZoom" />

                <!-- Prev/Next arrows -->
                <button v-if="totalCount > 1"
                    class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors"
                    @click.stop="goTo(currentIndex - 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                <button v-if="totalCount > 1"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors"
                    @click.stop="goTo(currentIndex + 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>

                <!-- Zoom slider -->
                <div
                    class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 w-[220px] bg-black/40 rounded-full px-4 py-2">
                    <button @click.stop="zoomOut"
                        class="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                            <path d="M5 12h14" />
                        </svg>
                    </button>
                    <input type="range" :min="0.25" :max="5" :step="0.01" :value="zoom" @input="onZoomSlider"
                        class="flex-1 h-1 accent-white cursor-pointer" />
                    <button @click.stop="zoomIn"
                        class="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                            <path d="M12 5v14m7-7H5" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';

export interface MediaViewerItem {
    type: 'photo' | 'video';
    src: string;
    thumb?: string;
    caption?: string;
}

const props = defineProps<{
    visible: boolean;
    items: MediaViewerItem[];
    initialIndex?: number;
    initialTime?: number;
    sourceRect?: { x: number; y: number; width: number; height: number } | null;
}>();

const emit = defineEmits<{
    close: [currentTime?: number];
}>();

const currentIndex = ref(props.initialIndex || 0);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);

// Drag state
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartPanX = ref(0);
const dragStartPanY = ref(0);

// Video state
const videoRef = ref<HTMLVideoElement | null>(null);
const isVideoPlaying = ref(false);
const videoMuted = ref(false);
const videoVolume = ref(0.7);
const videoCurrent = ref(0);
const videoDuration = ref(0);
const videoLoaded = ref(false);
const videoProgressPct = computed(() =>
    videoDuration.value > 0 ? (videoCurrent.value / videoDuration.value) * 100 : 0
);

// UI auto-hide state (video mode only)
const uiVisible = ref(true);
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_TIMEOUT_MS = 3000;

function startIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
        uiVisible.value = false;
    }, IDLE_TIMEOUT_MS);
}

function clearIdleTimer() {
    if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}

function onVideoMouseMove() {
    uiVisible.value = true;
    startIdleTimer();
}

function onVideoMouseLeave() {
    uiVisible.value = false;
    clearIdleTimer();
}

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const totalCount = computed(() => props.items.length);
const currentItem = computed(() => props.items[currentIndex.value]);
const isImage = computed(() => currentItem.value?.type === 'photo');
const isVideo = computed(() => currentItem.value?.type === 'video');
const currentSrc = computed(() => currentItem.value?.src || '');
const caption = computed(() => currentItem.value?.caption || '');

// Video card: fill the full screen
const playerStyle = computed(() => {
    if (!isVideo.value) return {};
    return {
        width: '100vw',
        height: '100vh',
        borderRadius: '0',
    };
});

watch(() => props.visible, (v) => {
    if (v) {
        currentIndex.value = props.initialIndex || 0;
        resetZoom();
        isVideoPlaying.value = false;
        videoMuted.value = false;
        videoLoaded.value = false;
        videoCurrent.value = 0;
        videoDuration.value = 0;
    } else {
        if (videoRef.value) {
            videoRef.value.pause();
            videoRef.value.removeAttribute('src');
            videoRef.value.load();
        }
    }
});

watch(currentIndex, () => {
    resetZoom();
    isVideoPlaying.value = false;
    videoMuted.value = false;
    videoLoaded.value = false;
    videoCurrent.value = 0;
    videoDuration.value = 0;
});

function close() {
    emit('close', isVideo.value ? videoCurrent.value : undefined);
}

function onZoomSlider(e: Event) {
    const target = e.target as HTMLInputElement;
    zoom.value = parseFloat(target.value);
}

function goTo(index: number) {
    if (index < 0) index = totalCount.value - 1;
    if (index >= totalCount.value) index = 0;
    currentIndex.value = index;
}

// Zoom
function zoomIn() {
    zoom.value = Math.min(5, zoom.value * 1.5);
}
function zoomOut() {
    const newZoom = zoom.value / 1.5;
    if (newZoom < 0.25) {
        resetZoom();
        return;
    }
    zoom.value = newZoom;
}
function resetZoom() {
    zoom.value = 1;
    panX.value = 0;
    panY.value = 0;
}
function toggleZoom() {
    if (zoom.value > 1) resetZoom();
    else zoom.value = 3;
}

function onWheel(e: WheelEvent) {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom.value = Math.max(0.25, Math.min(5, zoom.value * delta));
}

// Pan / Swipe
function onPointerDown(e: PointerEvent) {
    isDragging.value = true;
    dragStartX.value = e.clientX;
    dragStartY.value = e.clientY;
    dragStartPanX.value = panX.value;
    dragStartPanY.value = panY.value;
    // 捕获指针，确保移出元素后仍能收到事件
    if (contentRef.value) {
        contentRef.value.setPointerCapture(e.pointerId);
    }
}

function onPointerMove(e: PointerEvent) {
    if (!isDragging.value) return;
    const dx = e.clientX - dragStartX.value;
    const dy = e.clientY - dragStartY.value;
    panX.value = dragStartPanX.value + dx;
    panY.value = dragStartPanY.value + dy;
}

function onPointerUp(e: PointerEvent) {
    if (!isDragging.value) return;
    isDragging.value = false;

    const dx = e.clientX - dragStartX.value;
    const dy = e.clientY - dragStartY.value;

    // Swipe: horizontal drag at 1x zoom
    if (zoom.value <= 1.1 && Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.6) {
        if (dx < 0) goTo(currentIndex.value + 1);
        else goTo(currentIndex.value - 1);
    }
    // Reset pan position at 1x zoom
    if (zoom.value <= 1.1) {
        panX.value = 0;
        panY.value = 0;
    }
}

// Keyboard
function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') goTo(currentIndex.value - 1);
    if (e.key === 'ArrowRight') goTo(currentIndex.value + 1);
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-') zoomOut();
    if (e.key === '0') resetZoom();
    if (e.key === ' ') { e.preventDefault(); if (isVideo.value) toggleVideoPlay(); }
}

// Video
async function toggleVideoPlay() {
    if (!videoRef.value) return;
    if (isVideoPlaying.value) {
        videoRef.value.pause();
        isVideoPlaying.value = false;
    } else {
        try {
            await videoRef.value.play();
            isVideoPlaying.value = true;
        } catch (e) {
            isVideoPlaying.value = false;
            console.warn('Video play failed:', e);
        }
    }
}

function toggleVideoMute() {
    videoMuted.value = !videoMuted.value;
    if (videoRef.value) videoRef.value.muted = videoMuted.value;
}

function onVolumeChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    videoVolume.value = val;
    if (videoRef.value) {
        videoRef.value.volume = val;
        videoRef.value.muted = val === 0;
        videoMuted.value = val === 0;
    }
}

function onVideoTimeUpdate() {
    if (videoRef.value) {
        videoCurrent.value = videoRef.value.currentTime;
    }
}

function onVideoLoaded() {
    if (videoRef.value) {
        videoDuration.value = videoRef.value.duration;
        videoLoaded.value = true;
        videoRef.value.volume = videoVolume.value;
        videoRef.value.muted = videoMuted.value;
        // 同步内联视频的播放进度
        if (props.initialTime && props.initialTime > 0) {
            videoRef.value.currentTime = props.initialTime;
            videoCurrent.value = props.initialTime;
        }
        // 自动开始播放
        videoRef.value.play().then(() => {
            isVideoPlaying.value = true;
        }).catch(() => {
            isVideoPlaying.value = false;
        });
        // Show UI and start idle timer
        uiVisible.value = true;
        startIdleTimer();
    }
}

function onVideoEnded() {
    isVideoPlaying.value = false;
    videoCurrent.value = 0;
}

function onSeekDrag(e: Event) {
    if (!videoRef.value) return;
    const val = parseFloat((e.target as HTMLInputElement).value);
    videoRef.value.currentTime = val;
    videoCurrent.value = val;
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Auto focus for keyboard
watch(() => props.visible, (v) => {
    if (v) {
        setTimeout(() => containerRef.value?.focus(), 100);
    }
});

// Cleanup idle timer on unmount
onUnmounted(() => {
    clearIdleTimer();
});
</script>

<style scoped>
/* Video expand/collapse zoom animation */
.viewer-zoom-enter-active {
    transition: opacity 0.25s ease-out;
}

.viewer-zoom-enter-active .video-card {
    transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.viewer-zoom-leave-active {
    transition: opacity 0.2s ease-in;
}

.viewer-zoom-leave-active .video-card {
    transition: transform 0.25s cubic-bezier(0.55, 0.06, 0.68, 0.19);
}

.viewer-zoom-enter-from {
    opacity: 0;
}

.viewer-zoom-enter-from .video-card {
    transform: scale(0.85);
}

.viewer-zoom-leave-to {
    opacity: 0;
}

.viewer-zoom-leave-to .video-card {
    transform: scale(0.9);
}

/* UI fade in/out animation */
.fade-ui-enter-active {
    transition: opacity 0.3s ease-out;
}

.fade-ui-leave-active {
    transition: opacity 0.3s ease-in;
}

.fade-ui-enter-from,
.fade-ui-leave-to {
    opacity: 0;
}
</style>
