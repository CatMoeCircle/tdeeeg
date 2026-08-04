<template>
    <!-- 隐藏的 HTML5 Audio 元素，由 store 控制 -->
    <audio ref="audioRef" preload="auto" @timeupdate="onTimeUpdate" @loadedmetadata="onLoaded" @ended="onEnded"
        @error="onError" @play="onPlay" @pause="onPause" :loop="player.repeatMode === 'one'">
    </audio>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useAudioPlayerStore } from '../../store/audioPlayer';

const player = useAudioPlayerStore();
const audioRef = ref<HTMLAudioElement | null>(null);

// =====================================================================
// Windows 系统媒体传输控件 (SMTC) 同步 —— 仅用前端 Media Session API。
// 原生 Rust 的 SystemMediaTransportControls.GetForCurrentView() 在 Tauri
// Win32 环境会抛 0x80070578（找不到关联视图，无 WinRT 视图），无法工作，
// 因此不再调用原生后端，改由 WebView2 原生支持的 navigator.mediaSession
// 承载 SMTC：同步标题/艺术家/封面/状态/进度并接收系统命令。
// 封面优先用 minithumbnail base64 数据 URL（无 CORS，必然可加载）。
// =====================================================================

const mediaSession =
    typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
const hasMediaSession = !!mediaSession;

/** 将当前曲目同步到 Media Session（含封面） */
function syncMediaSession() {
    if (!hasMediaSession) return;
    const track = player.currentTrack;
    if (!track) return;

    // 封面 artwork：优先用 minithumbnail base64 数据 URL（无 CORS，必然可加载），
    // 其次用本地封面路径 URL（清晰度更高）。两者都提供，系统会选用可加载的那张。
    const artwork: MediaImage[] = [];

    // ① 数据 URL（minithumbnail base64，无 CORS 最可靠）。
    // coverPath 已是 data: URL 时直接用原始串，避免 buffer 往返引入错误。
    const miniDataUrl = track.coverPath?.startsWith('data:') ? track.coverPath : undefined;
    const dataUrl = miniDataUrl
        || (track.coverSource?.buffer
            ? (() => {
                try {
                    const b64 = bytesToBase64(track.coverSource!.buffer!);
                    return b64 ? `data:image/jpeg;base64,${b64}` : undefined;
                } catch {
                    return undefined;
                }
            })()
            : undefined);
    if (dataUrl) {
        // minithumbnail 为 40x40，同时声明更大尺寸以适配不同端展示
        artwork.push({ src: dataUrl, sizes: '40x40' }, { src: dataUrl, sizes: '512x512' });
    }

    // ② 本地封面路径 URL（若与数据 URL 是同源信息，仍附上高清版本）。
    // artwork.src 必须是浏览器可解析的 URL；若 coverPath 是原始 Windows 路径
    // （如 C:\Music\cover.jpg），需转成 file:///C:/Music/cover.jpg。
    const cover = track.coverPath;
    const coverUrl = toValidArtworkUrl(cover);
    if (coverUrl && !coverUrl.startsWith('data:')) {
        artwork.push({ src: coverUrl, sizes: '512x512' }, { src: coverUrl, sizes: '256x256' });
    }
    // 若上面 ① 里 coverPath 已是 data URL，直接用 coverPath
    if (artwork.length === 0 && coverUrl) {
        artwork.push({ src: coverUrl, sizes: '512x512' });
    }

    // [诊断 Step 1] 创建 MediaMetadata 前输出输入
    console.log('[MediaSession] before create', {
        coverPath: track.coverPath,
        coverSource: track.coverSource,
        artwork,
        artwork0src: artwork[0] ? artwork[0].src.slice(0, 100) : null,
    });

    try {
        mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.performer,
            album: '',
            artwork,
        });
    } catch (e) {
        console.warn('Failed to set media session metadata:', e);
    }

    // [诊断 Step 5] 创建后检查是否被过滤
    console.log('[MediaSession] after create metadata', navigator.mediaSession?.metadata);
    console.log('[MediaSession] after create artwork', navigator.mediaSession?.metadata?.artwork);
    const metaArtwork: readonly MediaImage[] = navigator.mediaSession?.metadata?.artwork ?? [];
    console.log('[MediaSession] artwork verified', {
        artworkArrayLen: artwork.length,
        metadataArtworkLen: metaArtwork.length,
        firstSrc: metaArtwork[0]?.src?.slice(0, 100) ?? null,
        isEmpty: metaArtwork.length === 0,
    });
}

/** Uint8Array → base64 */
function bytesToBase64(bytes: number[]): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

/** 将封面源转为浏览器可解析的 URL（artwork.src 要求）。 */
function toValidArtworkUrl(src: string | undefined): string | undefined {
    if (!src) return undefined;
    const s = src.trim();
    if (!s) return undefined;
    // 已是 URL（data:、http(s):、file:、asset:、blob: 等）
    if (/^(data:|https?:|file:|asset:|blob:)/i.test(s)) return s;
    // 原始 Windows 绝对路径 → file:/// 形式
    if (/^[a-zA-Z]:[\\/]/.test(s)) {
        return 'file:///' + s.replace(/\\/g, '/');
    }
    return s;
}

/** 同步 Media Session 播放状态 */
function syncMediaSessionState() {
    if (!hasMediaSession) return;
    try {
        mediaSession.playbackState = player.isPlaying ? 'playing' : 'paused';
    } catch (e) {
        // 忽略
    }
}

/** 同步 Media Session 进度 */
function syncMediaSessionPosition() {
    if (!hasMediaSession) return;
    if (!player.currentTrack || !(player.duration > 0)) return;
    try {
        mediaSession.setPositionState({
            duration: player.duration,
            playbackRate: 1,
            position: player.currentTime,
        });
    } catch (e) {
        // 进度为 0 时常抛异常，忽略
    }
}

/** 同步元数据/封面/状态/进度到 Media Session（带微任务合并节流） */
let pendingSync = false;
function pushSmtc(force = false) {
    syncMediaSession();
    syncMediaSessionState();
    syncMediaSessionPosition();
    // 进度由 timeupdate 高频触发，用微任务合并避免每 tick 都重算
    if (!force && !pendingSync) {
        pendingSync = true;
        queueMicrotask(() => {
            pendingSync = false;
            syncMediaSession();
            syncMediaSessionState();
            syncMediaSessionPosition();
        });
    }
}

/** 注册 Media Session 系统命令（一次性注册） */
let mediaHandlersBound = false;
function bindMediaActionHandlers() {
    if (!hasMediaSession || mediaHandlersBound) return;
    mediaHandlersBound = true;
    const on = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
        try {
            mediaSession.setActionHandler(action, handler);
        } catch (e) {
            // 不支持的动作忽略
        }
    };
    on('play', () => {
        if (player.currentIndex === -1) player.playTrack(0);
        else if (!player.isPlaying) player.togglePlay();
    });
    on('pause', () => {
        if (player.isPlaying) player.togglePlay();
    });
    on('nexttrack', () => player.nextTrack());
    on('previoustrack', () => player.prevTrack());
    on('seekto', (d) => {
        if (typeof d.seekTime === 'number') player.seek(d.seekTime);
    });
    on('stop', () => {
        if (player.isPlaying) player.togglePlay();
    });
}

onMounted(() => {
    bindMediaActionHandlers();
    pushSmtc(true);
});

// 监听曲目变化 → 同步元数据/封面（新的曲目，强制立即同步）
watch(() => player.currentTrack, () => {
    pushSmtc(true);
});

// 监听当前曲目封面的异步加载完成 → 封面就绪后重新同步，避免“有歌无封面”
// artwork 依赖 coverPath / coverSource.buffer / coverSource.file 三者，
// 三者任意变化都必须强制重新推送（deep watch 覆盖 coverSource 对象本身的变化）。
watch(
    () => {
        const t = player.currentTrack;
        if (!t) return '';
        return JSON.stringify({
            coverPath: t.coverPath ?? '',
            coverSource: t.coverSource ?? null,
        });
    },
    (val, oldVal) => {
        if (val && val !== oldVal) {
            console.log('[MediaSession] cover changed, re-sync', val);
            pushSmtc(true);
        }
    },
    { deep: true }
);

const audioSrc = computed(() => {
    const track = player.currentTrack;
    return track?.filePath || '';
});

// 监听音频源变化 → 加载并播放
watch(audioSrc, (newSrc, oldSrc) => {
    if (!newSrc || !audioRef.value) return;
    const audio = audioRef.value;
    // 只在源真正变化时才 reload，避免重复触发
    if (newSrc !== oldSrc) {
        audio.src = newSrc;
        audio.load();
        if (player.isPlaying) {
            audio.play().catch(() => { });
        }
    }
});

// 监听播放状态
watch(() => player.isPlaying, (playing) => {
    const audio = audioRef.value;
    if (!audio) return;
    if (playing && audio.paused) {
        audio.play().catch(() => { });
    } else if (!playing && !audio.paused) {
        audio.pause();
    }
    // 同步系统媒体控件播放状态
    pushSmtc();
});

// 监听 seek
watch(() => player.currentTime, (time) => {
    const audio = audioRef.value;
    if (!audio || !audio.src) return;
    // 只在差异较大时 seek，避免循环
    if (Math.abs(audio.currentTime - time) > 0.5) {
        audio.currentTime = time;
    }
    // 同步系统媒体控件进度（内部节流）
    pushSmtc();
});

// 监听音量
watch(() => player.volume, (vol) => {
    if (audioRef.value) {
        audioRef.value.volume = vol;
    }
}, { immediate: true });

// 监听切换曲目时重置进度
watch(() => player.currentIndex, () => {
    player.seek(0);
});

function onTimeUpdate() {
    const audio = audioRef.value;
    if (audio && !isNaN(audio.currentTime)) {
        player.currentTime = audio.currentTime;
    }
    // 进度更新（内置微任务合并节流）
    pushSmtc();
}

function onLoaded() {
    const audio = audioRef.value;
    if (audio && !isNaN(audio.duration)) {
        player.duration = audio.duration;
        if (player.isPlaying) {
            audio.play().catch(() => { });
        }
    }
    pushSmtc();
}

function onEnded() {
    // 单曲循环由 audio.loop 处理
    if (player.repeatMode === 'one') return;
    player.nextTrack();
}

function onError() {
    const audio = audioRef.value;
    const errMsg = audio?.error?.message || 'unknown';
    const src = audio?.src || 'no-src';
    console.warn('Audio playback error:', errMsg, 'src:', src);
    player.nextTrack();
}

function onPlay() {
    player.isPlaying = true;
}

function onPause() {
    // 只在非主动调用 pause 时更新状态
    // 由 store 的 togglePlay 控制
}
</script>
