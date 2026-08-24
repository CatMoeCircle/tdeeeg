<template>
    <!-- ========== VIDEO MODE ========== -->
    <Teleport to="body">
        <Transition name="viewer-zoom">
            <div v-if="visible && isVideo" class="fixed inset-0 z-999 flex items-center justify-center"
                @click.self="close" @keydown="onKeydown" tabindex="0" ref="containerRef">
                <!-- Video card -->
                <div ref="videoContainerRef" class="video-card relative flex flex-col overflow-hidden bg-black/70"
                    :style="playerStyle" @click.stop @mousemove="onVideoMouseMove" @mouseleave="onVideoMouseLeave">
                    <!-- Video element -->
                    <video ref="videoRef" :src="effectiveVideoSrc" preload="auto" playsinline loop
                        class="w-full h-full object-contain" @timeupdate="onVideoTimeUpdate"
                        @loadedmetadata="onVideoLoaded" @ended="onVideoEnded" @click="toggleVideoPlay" />

                    <!-- 视频未下载（未自动下载）：显示缩略图 + 手动下载按钮 -->
                    <div v-if="isVideo && currentCanDownload"
                        class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60" @click.stop>
                        <!-- 缩略图预览 -->
                        <img v-if="currentThumb" :src="currentThumb"
                            class="absolute inset-0 w-full h-full object-contain opacity-40 pointer-events-none" />
                        <button @click="close"
                            class="absolute top-3 left-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                        <!-- 下载按钮 -->
                        <button v-if="!videoDownloading" @click.stop="handleViewerVideoDownload"
                            class="relative z-10 w-16 h-16 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 flex items-center justify-center transition-colors"
                            title="下载视频">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                class="w-8 h-8 text-white">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        </button>
                        <LoaderIndicator v-else
                            :progress="videoDownloadProgress > 0 ? videoDownloadProgress : undefined" size="52"
                            color="#ffffff" />
                        <span v-if="!videoDownloading" class="relative z-10 mt-3 text-sm text-white/90">尚未下载，点击下载</span>
                        <span v-else class="relative z-10 mt-3 text-sm text-white/90">
                            {{ videoDownloadProgress > 0 ? `下载中 ${Math.round(videoDownloadProgress * 100)}%` : '下载中…' }}
                        </span>
                    </div>

                    <!-- 视频加载中：关闭按钮 + 加载指示器 + 下载进度（此时无控制条） -->
                    <div v-if="isVideo && !videoLoaded && !currentCanDownload"
                        class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 cursor-pointer"
                        @click="close" title="点击关闭">
                        <button @click.stop="close"
                            class="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                        <LoaderIndicator :progress="imageProgress > 0 ? imageProgress : undefined" size="52"
                            color="#ffffff" />
                        <span class="mt-3 text-sm text-white/80">
                            {{ imageProgress > 0 ? `下载中 ${Math.round(imageProgress * 100)}%` : '加载中…' }}
                        </span>
                        <div v-if="imageProgress > 0" class="mt-3 w-52 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div class="h-full bg-white transition-all duration-300"
                                :style="{ width: imageProgress * 100 + '%' }"></div>
                        </div>
                    </div>

                    <!-- Prev/Next arrows (hidden with UI control, only in video mode) -->
                    <button v-if="totalCount > 1" @click.stop="goTo(currentIndex - 1)"
                        class="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-opacity duration-300"
                        :class="uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <button v-if="totalCount > 1" @click.stop="goTo(currentIndex + 1)"
                        class="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-opacity duration-300"
                        :class="uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </button>

                    <!-- UI overlay (close button + controls + caption) -->
                    <Transition name="fade-ui">
                        <div v-if="videoLoaded && uiVisible" class="absolute inset-0 z-10">
                            <!-- Close button (top-left) -->
                            <button @click="close"
                                class="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    class="w-5 h-5">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>

                            <!-- Bottom controls + caption -->
                            <div
                                class="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-100 max-w-[92%]">
                                <!-- Control card -->
                                <div class="w-full bg-black/60 backdrop-blur-md rounded-2xl px-4 py-2.5" @click.stop>
                                    <!-- Row 1: volume / play-pause / speed + quality + fullscreen -->
                                    <div class="flex items-center justify-between gap-2 mb-1">
                                        <!-- Left: volume -->
                                        <div class="flex items-center gap-2 w-37 shrink-0">
                                            <button @click="toggleVideoMute"
                                                class="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white shrink-0">
                                                <svg v-if="!videoMuted" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2" class="w-4.5 h-4.5">
                                                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                                    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                                                </svg>
                                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                    stroke-width="2" class="w-4.5 h-4.5">
                                                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                                    <line x1="23" y1="9" x2="17" y2="15" />
                                                    <line x1="17" y1="9" x2="23" y2="15" />
                                                </svg>
                                            </button>
                                            <input type="range" :min="0" :max="1" :step="0.05" :value="videoVolume"
                                                @input="onVolumeChange" class="w-24 h-1 accent-white cursor-pointer" />
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
                                        <!-- Right: speed + quality + fullscreen -->
                                        <div class="flex items-center gap-1 w-37 shrink-0 justify-end">
                                            <!-- Speed -->
                                            <div class="relative">
                                                <button @click.stop="toggleSpeedMenu"
                                                    class="h-7 px-2 flex items-center justify-center text-white/80 hover:text-white rounded-md hover:bg-white/10 transition-colors text-sm font-medium min-w-8">
                                                    {{ playbackRate }}x
                                                </button>
                                                <Transition name="fade-ui">
                                                    <div v-if="speedMenuVisible"
                                                        class="absolute bottom-full mb-2 right-0 bg-black/85 backdrop-blur-md rounded-xl py-1.5 px-1 shadow-xl min-w-22">
                                                        <button v-for="s in speedOptions" :key="s"
                                                            @click="setPlaybackRate(s)"
                                                            class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                                                            :class="playbackRate === s ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'">
                                                            <span>{{ s }}x</span>
                                                            <svg v-if="playbackRate === s" viewBox="0 0 24 24"
                                                                fill="none" stroke="currentColor" stroke-width="2.5"
                                                                class="w-3.5 h-3.5">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </Transition>
                                            </div>
                                            <!-- Quality -->
                                            <div v-if="currentQualities.length > 1" class="relative">
                                                <button @click.stop="toggleQualityMenu"
                                                    class="h-7 px-2 flex items-center justify-center text-white/80 hover:text-white rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
                                                    {{ qualityLabel }}
                                                </button>
                                                <Transition name="fade-ui">
                                                    <div v-if="qualityMenuVisible"
                                                        class="absolute bottom-full mb-2 right-0 bg-black/85 backdrop-blur-md rounded-xl py-1.5 px-1 shadow-xl min-w-22">
                                                        <button v-for="q in currentQualities" :key="q.id"
                                                            @click="selectQuality(q)"
                                                            class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                                                            :class="q.src === activeQualitySrc ? 'text-white bg-white/15' : 'text-white/70 hover:text-white hover:bg-white/10'">
                                                            <span>{{ q.label }}</span>
                                                            <svg v-if="q.src === activeQualitySrc" viewBox="0 0 24 24"
                                                                fill="none" stroke="currentColor" stroke-width="2.5"
                                                                class="w-3.5 h-3.5">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </Transition>
                                            </div>
                                            <!-- Fullscreen -->
                                            <button @click.stop="toggleFullscreen"
                                                class="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white rounded-md hover:bg-white/10 transition-colors shrink-0">
                                                <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2" class="w-4.5 h-4.5">
                                                    <path
                                                        d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                                                </svg>
                                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                    stroke-width="2" class="w-4.5 h-4.5">
                                                    <path
                                                        d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <!-- Row 2 (bottom): progress bar with time on both sides -->
                                    <div class="flex items-center gap-3">
                                        <span class="text-white/70 text-xs font-mono shrink-0 w-10 text-right">{{
                                            formatTimestamp(videoCurrent) }}</span>
                                        <input type="range" :min="0" :max="videoDuration || 0" :step="0.1"
                                            :value="videoCurrent" @input="onSeekDrag"
                                            class="flex-1 h-1.5 accent-white cursor-pointer appearance-none bg-white/20 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md" />
                                        <span class="text-white/70 text-xs font-mono shrink-0 w-10">{{
                                            formatTimestamp(videoDuration) }}</span>
                                    </div>
                                </div>
                                <!-- Caption card (below controls) -->
                                <div v-if="caption"
                                    class="media-caption-scroll text-white w-full max-h-[4.2rem] overflow-y-auto bg-black/60 backdrop-blur-md rounded-xl px-4 py-2"
                                    @click.stop>
                                    <MessageTextContent v-if="captionFormatted?.text" :formattedText="captionFormatted"
                                        class="text-center text-white/90 dark:text-white/90" />
                                    <p v-else class="text-sm text-white/80 text-center">{{ caption }}</p>
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
        <div v-if="visible && isImage" class="fixed inset-0 z-9999 bg-black/70 flex flex-col" @wheel.prevent="onWheel"
            @keydown="onKeydown" @click.self="close" tabindex="0" ref="imageContainerRef">

            <!-- Top bar (close button only) -->
            <div class="absolute top-0 left-0 right-0 z-10 flex items-center px-4 py-3">
                <button @click="close" class="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Main content area -->
            <div class="flex-1 flex items-center justify-center relative overflow-hidden select-none touch-none"
                ref="contentRef" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
                @pointercancel="onPointerUp">

                <img v-if="!isAnimation && currentSrc" :src="currentSrc" ref="imageRef"
                    class="max-w-full max-h-full transition-transform duration-200 ease-out select-none"
                    :style="{ transform: `scale(${zoom}) rotate(${rotation}deg) translate(${panX}px, ${panY}px)` }"
                    draggable="false" @dblclick="toggleZoom" />
                <video v-else-if="isAnimation && currentSrc" :src="currentSrc" autoplay loop muted playsinline
                    class="max-w-full max-h-full transition-transform duration-200 ease-out select-none"
                    :style="{ transform: `scale(${zoom}) rotate(${rotation}deg) translate(${panX}px, ${panY}px)` }"
                    @dblclick="toggleZoom" />

                <!-- 加载中：预览缩略图 + 待加载提示 + 进度（点击可关闭查看器） -->
                <div v-if="isImageLoading" @click="close" title="点击关闭"
                    class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 cursor-pointer">
                    <!-- 缩略图预览（若有） -->
                    <img v-if="hasThumbPreview" :src="currentThumb"
                        class="max-w-[80%] max-h-[70%] object-contain opacity-70 blur-[1px]" draggable="false" />
                    <!-- 加载指示器：有进度则按进度显示，否则转圈 -->
                    <div class="mt-6 flex flex-col items-center justify-center gap-3">
                        <LoaderIndicator :progress="imageProgress > 0 ? imageProgress : undefined" size="42"
                            color="#ffffff" />
                        <!-- 待加载文字 / 下载百分比 -->
                        <span class="text-sm text-white/80">
                            {{ imageProgress > 0 ? `下载中 ${Math.round(imageProgress * 100)}%` : '待加载…' }}
                        </span>
                        <!-- 进度条（下载中显示实际进度） -->
                        <div v-if="imageProgress > 0" class="w-52 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div class="h-full bg-white transition-all duration-300"
                                :style="{ width: imageProgress * 100 + '%' }"></div>
                        </div>
                    </div>
                    <!-- 右上角关闭按钮（加载时也可见） -->
                    <button @click.stop="close"
                        class="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

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

            </div>

            <!-- Bottom: left (progress/sender/date) + center (caption card) + right (zoom/rotate) -->
            <div
                class="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-4 px-4 pb-3 pt-3 pointer-events-none">
                <!-- Left: progress + sender + date -->
                <div class="flex flex-col gap-0.5 text-left min-w-0 shrink-0 pointer-events-auto">
                    <span class="text-sm font-medium text-white/90">{{ currentIndex + 1 }} / {{ totalCount }}</span>
                    <span v-if="currentSenderName || currentDate" class="text-xs text-white/60">
                        <template v-if="currentSenderName">{{ currentSenderName }}</template>
                        <template v-if="currentSenderName && currentDate">&nbsp;</template>
                        <template v-if="currentDate">{{ formatDateTime(currentDate) }}</template>
                    </span>
                </div>

                <!-- Center: caption card -->
                <div class="flex-1 flex justify-center min-w-0 pointer-events-auto" @wheel.stop>
                    <div v-if="caption"
                        class="media-caption-scroll text-white max-h-[4.2rem] overflow-y-auto bg-black/60 backdrop-blur-md rounded-2xl px-4 py-2 max-w-full">
                        <MessageTextContent v-if="captionFormatted?.text" :formattedText="captionFormatted"
                            class="text-center text-white/90 dark:text-white/90" />
                        <p v-else class="text-sm text-white/85 text-center">{{ caption }}</p>
                    </div>
                </div>

                <!-- Right: zoom / rotate controls (horizontal) -->
                <div class="flex items-center gap-2 shrink-0 pointer-events-auto">
                    <button @click.stop="zoomIn"
                        class="w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="11" y1="8" x2="11" y2="14" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                    </button>
                    <button @click.stop="zoomOut"
                        class="w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                    </button>
                    <button @click.stop="rotate90"
                        class="w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { isMediaViewerActive } from '../../../../store/mediaViewer';
import { pauseAudioForVideo, onVideoStopped } from '../../../../store/videoPlayback';
import { useDownloadStore } from '../../../../store/downloads';
import { useChatStore } from '../../../../store/chat';
import { openContextMenu } from '../../../../store/contextMenu';
import type { ContextMenuItem } from '../../../../components/contextMenu/types';
import { EyeIcon, CornerUpRightIcon, DownloadIcon, FolderOpenIcon, CopyIcon } from 'lucide-vue-next';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { copyFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { MessagePlugin } from 'tdesign-vue-next';
import type { formattedText } from 'tdlib-types';
import { tdlibSend, downloadingFiles } from '../../../../utils/tdlib';
import { DL_PRIORITY } from '../../../../utils/downloadPriority';
import { settings } from '../../../../store/settings';
import MessageTextContent from './content/MessageTextContent.vue';
import LoaderIndicator from '../../../common/LoaderIndicator';

export interface MediaViewerVideoQuality {
    /** 唯一标识 */
    id: string;
    /** 视频宽度 */
    width: number;
    /** 视频高度 */
    height: number;
    /** 画质视频源地址 */
    src: string;
    /** 显示标签，如 1080p */
    label: string;
}

export interface MediaViewerItem {
    type: 'photo' | 'video' | 'animation';
    src: string;
    thumb?: string;
    caption?: string;
    /** caption 富文本（含 entities），用于渲染消息实体与保留换行 */
    captionFormatted?: formattedText;
    /** 发送人显示名称（可选） */
    senderName?: string;
    /** 消息发送时间（Unix 秒，可选） */
    date?: number;
    /** 可选画质列表（仅视频，若存在多种画质） */
    qualities?: MediaViewerVideoQuality[];
    /** 所属消息 ID（用于查看/转发） */
    messageId?: number;
    /** 所属对话 ID（用于查看/转发） */
    chatId?: number;
    /** 本地文件路径（用于打开/另存为） */
    localPath?: string;
    /** 文件名称（tdlib 提供，用于另存为默认名） */
    fileName?: string;
    /** 主文件未就绪但可手动下载（用于未自动下载的视频，播放器内显示下载按钮） */
    canDownload?: boolean;
    /** 主文件 ID（配合 canDownload 用于手动触发下载） */
    fileId?: number;
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
    /** 查看：跳转到该媒体所属消息 */
    jumpToMessage: [messageId: number];
    /** 转发该媒体所属消息 */
    forwardMessage: [messageId: number];
}>();

const currentIndex = ref(props.initialIndex || 0);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const rotation = ref(0);

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
const videoVolume = ref(settings.player.mediaVolume);
const videoCurrent = ref(0);
const videoDuration = ref(0);
const videoLoaded = ref(false);
// Progress bar computed (videoProgressPct) placeholder for future UI

// 播放倍速
const playbackRate = ref(1);
const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

// 画质选择（video）
/** 当前选中的画质 src */
const activeQualitySrc = ref('');
const qualityMenuVisible = ref(false);
const speedMenuVisible = ref(false);
const isFullscreen = ref(false);
const videoContainerRef = ref<HTMLElement | null>(null);

/** 当前视频项的可选画质列表 */
const currentQualities = computed(() => currentItem.value?.qualities || []);
/** 当前选中的画质项 */
const activeQuality = computed(() =>
    currentQualities.value.find((q) => q.src === activeQualitySrc.value)
    || currentQualities.value[currentQualities.value.length - 1]
);
/** 画质标签，如 1080p */
const qualityLabel = computed(() => activeQuality.value?.label || '');

// ---- 视频未下载时的手动下载（未自动下载的视频显示下载按钮） ----
/** 查看器内手动下载完成后的本地 src（覆盖 media 项的 src，用于播放未自动下载的视频） */
const videoSrcOverride = ref('');
/** 是否正在手动下载视频 */
const videoDownloading = ref(false);
/** 手动下载进度（0~1） */
const videoDownloadProgress = ref(0);
/** 当前视频项是否可手动下载（未就绪但能下载） */
const currentCanDownload = computed(
    () => isVideo.value && !effectiveVideoSrc.value && !!currentItem.value?.canDownload
);
/** 当前视频有效 src：优先手动下载完成后的本地文件，其次 media 项 src */
const effectiveVideoSrc = computed(() => videoSrcOverride.value || currentSrc.value);

/** 手动下载当前视频（未自动下载的视频，用户点击下载按钮触发） */
async function handleViewerVideoDownload() {
    const item = currentItem.value;
    if (!item || !item.fileId || videoDownloading.value) return;
    const fileId = item.fileId;
    if (downloadingFiles.has(fileId)) return;
    videoDownloading.value = true;
    videoDownloadProgress.value = 0;
    downloadingFiles.add(fileId);
    try {
        const fileName = item.fileName || `video_${item.messageId || fileId}.mp4`;
        // 注册到下载管理器（正常显示，不隐藏），让用户能看到下载进度
        const chatTitle = item.chatId
            ? useChatStore().chats[item.chatId]?.title || `对话 #${item.chatId}`
            : '';
        useDownloadStore().registerDownload(fileId, fileName, chatTitle, 0, 'video', undefined, item.chatId, item.messageId, false, false);
        // 用户手动点击下载：走 addFileToDownloads（持久化下载列表）
        await tdlibSend({
            _: 'addFileToDownloads',
            file_id: fileId,
            chat_id: item.chatId,
            message_id: item.messageId,
            priority: DL_PRIORITY.USER_ACTIVE,
        });
        // 轮询下载进度
        const timer = setInterval(async () => {
            try {
                const info = await tdlibSend({ _: 'getFile', file_id: fileId }) as any;
                const total = info?.size || 1;
                const downloaded = info?.local?.downloaded_size || 0;
                videoDownloadProgress.value = Math.min(1, downloaded / total);
                if (info?.local?.is_downloading_completed && info?.local?.path) {
                    clearInterval(timer);
                    downloadingFiles.delete(fileId);
                    videoDownloading.value = false;
                    videoSrcOverride.value = convertFileSrc(info.local.path);
                    videoLoaded.value = false;
                    // 立即开始播放
                    isVideoPlaying.value = false;
                    videoCurrent.value = 0;
                }
            } catch (_) {
                clearInterval(timer);
                downloadingFiles.delete(fileId);
                videoDownloading.value = false;
            }
        }, 500);
    } catch (e) {
        downloadingFiles.delete(fileId);
        videoDownloading.value = false;
        console.error('MediaViewer video download failed:', e);
        MessagePlugin.error('视频下载失败');
    }
}

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
const imageContainerRef = ref<HTMLElement | null>(null);
/** 当前显示的图片元素（复制回退路径用：转 PNG 后写入剪贴板） */
const imageRef = ref<HTMLImageElement | null>(null);
/** 当前可见的查看器根（视频或图片容器） */
const viewerRoot = computed(() => isVideo.value ? containerRef.value : imageContainerRef.value);
const contentRef = ref<HTMLElement | null>(null);

const totalCount = computed(() => props.items.length);
const currentItem = computed(() => props.items[currentIndex.value]);
const isImage = computed(() => currentItem.value?.type === 'photo' || currentItem.value?.type === 'animation');
const isVideo = computed(() => currentItem.value?.type === 'video');
const isAnimation = computed(() => currentItem.value?.type === 'animation');
const currentSrc = computed(() => currentItem.value?.src || '');
const currentThumb = computed(() => currentItem.value?.thumb || '');
const caption = computed(() => currentItem.value?.caption || '');
/** caption 富文本（含 entities），用于渲染消息实体与保留换行 */
const captionFormatted = computed(() => currentItem.value?.captionFormatted);
const currentSenderName = computed(() => currentItem.value?.senderName || '');
const currentDate = computed(() => currentItem.value?.date || 0);

// ---- 图片加载状态 ----
const downloadStore = useDownloadStore();
/** 当前媒体对应下载项（按 chatId+messageId 匹配，用于图片未就绪时显示进度） */
const currentDownload = computed(() => {
    const cid = currentItem.value?.chatId;
    const mid = currentItem.value?.messageId;
    if (cid === undefined || mid === undefined) return undefined;
    return Object.values(downloadStore.items).find((d) => d.chat_id === cid && d.message_id === mid);
});
/** 图片下载/加载进度（0~1） */
const imageProgress = computed(() => {
    const p = currentDownload.value?.progress;
    return typeof p === 'number' ? Math.min(1, Math.max(0, p)) : 0;
});
/** 图片是否仍在加载（无主图 src） */
const isImageLoading = computed(() => isImage.value && !currentSrc.value);
/** 是否有缩略图可用于预览 */
const hasThumbPreview = computed(() => !!currentThumb.value);

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
    isMediaViewerActive.value = v;
    if (v) {
        currentIndex.value = props.initialIndex || 0;
        resetZoom();
        isVideoPlaying.value = false;
        videoMuted.value = false;
        videoLoaded.value = false;
        videoCurrent.value = 0;
        videoDuration.value = 0;
        playbackRate.value = 1;
        videoSrcOverride.value = '';
        videoDownloading.value = false;
        videoDownloadProgress.value = 0;
        activeQualitySrc.value = props.items[currentIndex.value]?.src || '';
        speedMenuVisible.value = false;
        qualityMenuVisible.value = false;
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
    rotation.value = 0;
    isVideoPlaying.value = false;
    videoMuted.value = false;
    videoLoaded.value = false;
    videoCurrent.value = 0;
    videoDuration.value = 0;
    playbackRate.value = 1;
    videoSrcOverride.value = '';
    videoDownloading.value = false;
    videoDownloadProgress.value = 0;
    activeQualitySrc.value = props.items[currentIndex.value]?.src || '';
    speedMenuVisible.value = false;
    qualityMenuVisible.value = false;
});

function close() {
    if (isVideo.value) onVideoStopped();
    emit('close', isVideo.value ? videoCurrent.value : undefined);
}

function goTo(index: number) {
    if (index < 0) index = totalCount.value - 1;
    if (index >= totalCount.value) index = 0;
    currentIndex.value = index;
}

// ==================== 右键菜单 ====================
/** 当前媒体项本地路径（用于打开 / 另存为） */
const currentLocalPath = computed(() => currentItem.value?.localPath || '');
const currentMessageId = computed(() => currentItem.value?.messageId);
/** 当前媒体项文件名称（tdlib 提供，另存为默认名） */
const currentFileName = computed(() => currentItem.value?.fileName || '');
/** 是否有本地文件（决定 打开/另存为 是否可用） */
const hasLocalFile = computed(() => currentLocalPath.value.length > 0);

/** 查看：关闭查看器并跳转到该媒体所在消息 */
function handleViewItem() {
    const id = currentMessageId.value;
    if (id === undefined) return;
    emit('jumpToMessage', id);
}

/** 转发该媒体所在消息 */
function handleForwardItem() {
    const id = currentMessageId.value;
    if (id === undefined) return;
    emit('forwardMessage', id);
}

/** 激活系统「打开方式」对话框，选择应用打开本地文件 */
async function handleOpenWith() {
    const p = currentLocalPath.value;
    if (!p) return;
    try {
        await invoke('open_with_dialog', { path: p });
    } catch (e) {
        console.error('open_with_dialog failed:', e);
        MessagePlugin.error('打开文件失败');
    }
}

/** 另存为：弹出保存对话框并把源文件复制到目标位置 */
async function handleSaveAs() {
    const p = currentLocalPath.value;
    if (!p) return;
    try {
        // 优先使用 tdlib 提供的文件名称
        const defaultName = currentFileName.value || 'media';
        const dest = await save({
            title: '另存为',
            defaultPath: defaultName,
        });
        if (!dest) return; // 用户取消
        await copyFile(p, dest);
        MessagePlugin.success('已另存为');
    } catch (e) {
        console.error('saveAs failed:', e);
        MessagePlugin.error('另存为失败');
    }
}

/** 复制图片到剪贴板：优先原生（即时、无格式限制、不会清空剪贴板）；无本地文件时回退 Canvas 转 PNG */
async function handleCopyImage() {
    // 主路径：本地文件 → Rust 原生写入系统剪贴板
    const lp = currentLocalPath.value;
    if (lp) {
        try {
            await invoke('copy_image_to_clipboard', { path: lp });
            MessagePlugin.success('已复制到剪贴板');
            return;
        } catch (e) {
            console.error('native copy image failed:', e);
            // 回退到 Canvas 转 PNG
        }
    }
    // 回退路径：用已加载的图片元素转 PNG（异步剪贴板 API 仅支持 image/png）
    const img = imageRef.value;
    if (!img || !img.naturalWidth) {
        MessagePlugin.error('复制失败');
        return;
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2d context unavailable');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) throw new Error('toBlob returned null');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        MessagePlugin.success('已复制到剪贴板');
    } catch (e) {
        console.error('copy image failed:', e);
        MessagePlugin.error('复制失败');
    }
}

/** 打开查看器右键菜单 */
function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [];
    console.log('[MediaViewer][CM] onContextMenu fired', {
        isVideo: isVideo.value,
        isImage: isImage.value,
        currentMessageId: currentMessageId.value,
        currentSrc: currentSrc.value,
        hasLocalFile: hasLocalFile.value,
        thumb: currentThumb.value,
    });

    // 查看（跳转到消息）
    if (currentMessageId.value !== undefined) {
        items.push({
            key: 'view',
            label: '查看',
            icon: EyeIcon,
            onClick: handleViewItem,
        });
    }

    // 图片额外：复制图片数据
    if (isImage.value) {
        items.push({
            key: 'copy',
            label: '复制',
            icon: CopyIcon,
            onClick: handleCopyImage,
        });
    }

    // 转发
    if (currentMessageId.value !== undefined) {
        items.push({
            key: 'forward',
            label: '转发',
            icon: CornerUpRightIcon,
            onClick: handleForwardItem,
        });
    }

    // 另存为
    if (hasLocalFile.value) {
        items.push({
            key: 'save-as',
            label: '另存为',
            icon: DownloadIcon,
            onClick: handleSaveAs,
        });
    }

    // 使用其他应用打开
    if (hasLocalFile.value) {
        items.push({
            key: 'open-with',
            label: '使用其他应用打开',
            icon: FolderOpenIcon,
            onClick: handleOpenWith,
        });
    }

    if (items.length === 0) {
        console.warn('[MediaViewer][CM] no menu items', {
            isVideo: isVideo.value,
            isImage: isImage.value,
            messageId: currentMessageId.value,
            hasLocal: hasLocalFile.value,
        });
        return;
    }
    console.log('[MediaViewer][CM] opening', { x: e.clientX, y: e.clientY, count: items.length, labels: items.map(i => i.label) });
    openContextMenu(e.clientX, e.clientY, items, e.target as HTMLElement);
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
function rotate90() {
    rotation.value = (rotation.value + 90) % 360;
}

/** 格式化日期：2026/01/03 12:45 */
function formatDateTime(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function onWheel(e: WheelEvent) {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom.value = Math.max(0.25, Math.min(5, zoom.value * delta));
}

// Pan / Swipe
function onPointerDown(e: PointerEvent) {
    // 只处理鼠标左键/触控；右键用于弹出上下文菜单，不参与拖拽
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement | null;
    // 不要去劫持控件的指针事件，否则无法点击方向键按钮。
    if (target?.closest('button, input, textarea, a')) return;

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
    // 记忆媒体播放器音量，跨会话保留
    settings.player.mediaVolume = val;
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
        // 应用当前倍速
        videoRef.value.playbackRate = playbackRate.value;
        // 同步画质源（当前项 src 未选定时作为默认）
        if (!activeQualitySrc.value) {
            activeQualitySrc.value = props.items[currentIndex.value]?.src || '';
        }
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
    onVideoStopped();
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

// ---- 播放倍速 ----
function setPlaybackRate(rate: number, showMenu = true) {
    playbackRate.value = rate;
    if (videoRef.value) videoRef.value.playbackRate = rate;
    if (showMenu) speedMenuVisible.value = false;
}

// ---- 播放速度菜单 ----
function selectQuality(q: MediaViewerVideoQuality) {
    if (activeQualitySrc.value === q.src) {
        qualityMenuVisible.value = false;
        return;
    }
    activeQualitySrc.value = q.src;
    qualityMenuVisible.value = false;
    // 记录当前进度与播放状态，重载视频后恢复
    const targetTime = videoRef.value ? videoRef.value.currentTime : 0;
    const wasPlaying = isVideoPlaying.value;
    if (videoRef.value) {
        videoRef.value.src = q.src;
        videoRef.value.load();
        videoLoaded.value = false;
        videoRef.value.onloadedmetadata = () => {
            if (videoRef.value && targetTime > 0) {
                videoRef.value.currentTime = targetTime;
            }
            videoLoaded.value = true;
            if (wasPlaying) {
                videoRef.value?.play().then(() => { isVideoPlaying.value = true; }).catch(() => { isVideoPlaying.value = false; });
            }
        };
    }
}
function toggleQualityMenu() {
    qualityMenuVisible.value = !qualityMenuVisible.value;
    speedMenuVisible.value = false;
}
function toggleSpeedMenu() {
    speedMenuVisible.value = !speedMenuVisible.value;
    qualityMenuVisible.value = false;
}

// ---- 全屏 ----
async function toggleFullscreen() {
    if (!videoContainerRef.value) return;
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            isFullscreen.value = false;
        } else {
            await videoContainerRef.value.requestFullscreen();
            isFullscreen.value = true;
        }
    } catch (e) {
        console.warn('Fullscreen toggle failed:', e);
    }
}

// Auto focus for keyboard
watch(() => props.visible, (v) => {
    if (v) {
        setTimeout(() => viewerRoot.value?.focus(), 100);
    }
});

/** 文档级右键监听：仅当右键命中查看器内部时才打开菜单（不受元素挂载时序影响） */
function onDocContextMenu(e: MouseEvent) {
    const root = viewerRoot.value;
    const isV = isVideo.value;
    const targeting = (e.target as HTMLElement | null)?.className || (e.target as HTMLElement | null)?.tagName || 'null';
    console.log('[MediaViewer][CM] doc contextmenu°', {
        visible: props.visible,
        isVideo: isV,
        isImage: isImage.value,
        hasRoot: !!root,
        rootTag: root?.tagName,
        targetClass: targeting,
        contains: root ? (e.target as Node | null ? root.contains(e.target as Node) : false) : false,
    });
    if (!root || !props.visible) return;
    const target = e.target as Node | null;
    if (target && root.contains(target)) {
        onContextMenu(e);
    }
}

// 全屏打开视频时暂停音乐
onMounted(() => {
    if (isVideo.value) pauseAudioForVideo();
    document.addEventListener('contextmenu', onDocContextMenu);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    console.log('[MediaViewer][CM] mounted, contextmenu listener bound to document');
});

function onFullscreenChange() {
    isFullscreen.value = !!document.fullscreenElement;
}

// Cleanup idle timer on unmount
onUnmounted(() => {
    clearIdleTimer();
    if (isFullscreen.value && document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
    }
    document.removeEventListener('contextmenu', onDocContextMenu);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
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

/* 查看器 caption 滚动容器：隐藏滚动条但保留滚动能力 */
.media-caption-scroll::-webkit-scrollbar {
    display: none;
}

.media-caption-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
}
</style>
