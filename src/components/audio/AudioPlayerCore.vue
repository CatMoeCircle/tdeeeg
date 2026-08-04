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

    try {
        mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.performer,
            album: '',
            artwork,
        });
    } catch (e) {
        // 设置元数据失败时忽略
    }
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


let syncPositionQueued = false;
/** 高频进度同步：用 requestAnimationFrame 合并，只在播放中更新进度。 */
function pushPosition() {
    if (syncPositionQueued) return;
    syncPositionQueued = true;
    requestAnimationFrame(() => {
        syncPositionQueued = false;
        if (player.isPlaying) {
            syncMediaSessionPosition();
        }
    });
}

/** 低频元数据/封面/状态同步（仅在曲目或封面变化、播放状态切换时调用）。 */
function pushSmtc(force = false) {
    void force;
    syncMediaSession();
    syncMediaSessionState();
    // 同步进度一次；进度本身由 pushPosition 高频接管。
    syncMediaSessionPosition();
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
    // 同步系统媒体控件播放状态（低频，元数据路径）
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
    // 进度更新：高频且轻量（requestAnimationFrame 合并，仅 setPositionState），
    // 避免在视图切换等主线程繁忙时段造成 SMTC 大量重建而卡慢音频。
    pushPosition();
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
