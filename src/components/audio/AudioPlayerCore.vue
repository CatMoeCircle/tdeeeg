<template>
    <!-- 隐藏的 HTML5 Audio 元素，由 store 控制 -->
    <audio ref="audioRef" preload="auto" @timeupdate="onTimeUpdate" @loadedmetadata="onLoaded" @ended="onEnded"
        @error="onError" @play="onPlay" @pause="onPause" :loop="player.repeatMode === 'one'">
    </audio>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useAudioPlayerStore } from '../../store/audioPlayer';

const player = useAudioPlayerStore();
const audioRef = ref<HTMLAudioElement | null>(null);

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
}

function onLoaded() {
    const audio = audioRef.value;
    if (audio && !isNaN(audio.duration)) {
        player.duration = audio.duration;
        if (player.isPlaying) {
            audio.play().catch(() => { });
        }
    }
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
