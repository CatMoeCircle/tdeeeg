import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { tdlibSend, safeDownloadFile, isFileReady } from '../utils/tdlib';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { message, thumbnail, audio, file, chat } from 'tdlib-types';
import { useDownloadStore } from './downloads';
import { useChatStore } from './chat';
import { isThumbnailImgRenderable } from '../utils/thumbnail';
import { shouldAutoDownloadAudio } from '../utils/autoDownload';

export interface AudioTrack {
    messageId: number;
    chatId: number;
    title: string;
    performer: string;
    duration: number;
    fileId: number;
    filePath: string;
    /** 音频文件大小（字节），用于判断是否超出自動下载体积上限 */
    sizeBytes?: number;
    coverPath?: string;
    /**
     * 封面原始来源，供原生 SMTC 使用：
     * - `{ file }`：已下载的缩略图本地路径（优先，最清晰）
     * - `{ buffer }`：图片原始字节（minithumbnail base64 解码）
     */
    coverSource?: { file?: string; buffer?: number[] };
    /** 是否已下载完成可供播放 */
    ready: boolean;
    /** 曲目来源：'profile' = 某用户的资料音乐列表；缺省/undefined = 普通对话消息 */
    source?: 'profile' | 'message';
}

export type RepeatMode = 'none' | 'one' | 'all' | 'shuffle';

export const useAudioPlayerStore = defineStore('audioPlayer', () => {
    // ======== 播放列表 ========
    const playlist = ref<AudioTrack[]>([]);
    const originalPlaylist = ref<AudioTrack[]>([]); // 保留原始顺序供 list 循环
    const currentIndex = ref(-1);

    // ======== 播放状态 ========
    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);
    const volume = ref(0.8);
    const repeatMode = ref<RepeatMode>('none');

    // ======== UI 状态 ========
    const showEntry = ref(false);      // 是否显示入口栏
    const showOverlay = ref(false);    // 是否显示弹出控制面板

    // ======== 资料音乐状态 ========
    /** 当前已加载的资料音乐所属用户 id（资料页重复点击同一用户时直接展开列表，不刷新） */
    const profileAudioUserId = ref<number | null>(null);

    // ======== 播放去重锁 ========
    /**
     * 正在添加进播放列表的曲目唯一键（`${chatId}:${messageId}`）。
     * 防止多次点击同一首歌时，在异步下载的间隙被并发地重复 push 进播放列表。
     */
    const pendingAudioAdds = new Set<string>();

    // ======== Computed ========
    const currentTrack = computed(() =>
        currentIndex.value >= 0 && currentIndex.value < playlist.value.length
            ? playlist.value[currentIndex.value]
            : null
    );

    const hasNext = computed(() => {
        if (playlist.value.length === 0) return false;
        if (repeatMode.value === 'shuffle') return true;
        return currentIndex.value < playlist.value.length - 1;
    });

    const hasPrev = computed(() => {
        if (playlist.value.length === 0) return false;
        if (repeatMode.value === 'shuffle') return true;
        return currentIndex.value > 0;
    });

    // ======== Actions ========

    /** 获取对话标题 */
    function getChatTitle(chatId: number): string {
        const cs = useChatStore();
        return cs.chats[chatId]?.title || `对话 #${chatId}`;
    }

    /** 搜索聊天中的所有音频消息，构建播放列表 */
    async function loadChatAudio(chatId: number, fromMessageId = 0) {
        try {
            const result = await tdlibSend({
                _: 'searchChatMessages',
                chat_id: chatId,
                query: '',
                filter: { _: 'searchMessagesFilterAudio' },
                limit: 50,
                from_message_id: fromMessageId,
                offset: 0,
            }) as { messages: message[] };

            if (!result.messages || result.messages.length === 0) return;

            const tracks: AudioTrack[] = [];
            const coverPromises: Promise<void>[] = [];
            for (const msg of result.messages) {
                if (msg.content._ !== 'messageAudio') continue;
                const audio = msg.content.audio;
                const file = audio.audio;
                const ready = isFileReady(file);
                tracks.push({
                    messageId: msg.id,
                    chatId: msg.chat_id,
                    title: audio.title || audio.file_name || '未知音乐',
                    performer: audio.performer || '未知艺术家',
                    duration: audio.duration,
                    fileId: file.id,
                    filePath: ready ? convertFileSrc(file.local.path) : '',
                    ready,
                    sizeBytes: file.size || 0,
                });
                // 异步加载封面（UI URL + 原生 SMTC 来源）
                coverPromises.push(
                    (async () => {
                        const idx = tracks.findIndex(t => t.messageId === msg.id);
                        if (idx < 0) return;
                        const [url, source] = await Promise.all([
                            loadCoverUrl(msg),
                            loadCoverSource(msg),
                        ]);
                        tracks[idx].coverPath = url;
                        tracks[idx].coverSource = source;
                    })()
                );
            }
            // searchChatMessages 返回逆序（最新的在前），反转成正序
            tracks.reverse();

            // 追加到现有播放列表
            const existingIds = new Set(playlist.value.map(t => t.messageId));
            const newTracks = tracks.filter(t => !existingIds.has(t.messageId));
            if (newTracks.length === 0) return;

            originalPlaylist.value = [...originalPlaylist.value, ...newTracks];
            playlist.value = [...playlist.value, ...newTracks];

            // 开始下载第一个音频
            if (!showEntry.value && playlist.value.length > 0) {
                showEntry.value = true;
            }

            // 等待封面加载完成（确保播放器/系统媒体控件一开始就有封面），
            // 再决定自动播放。封面来自 minithumbnail 同步可得的会立即返回。
            await Promise.allSettled(coverPromises);

            // 如果还没有正在播放，自动播放第一个新添加的
            if (currentIndex.value === -1) {
                await playTrack(playlist.value.length - newTracks.length);
            }
        } catch (e) {
            console.error('loadChatAudio error:', e);
        }
    }

    /** 下载并播放指定索引的曲目 */
    async function playTrack(index: number) {
        if (index < 0 || index >= playlist.value.length) return;

        const track = playlist.value[index];

        // 先确保文件已下载就绪，再切换曲目
        if (!track.ready) {
            // 遵守自动下载大小限制：超过上限的音频不自动下载，
            // 保持未就绪状态（由消息上的下载按钮手动下载后播放）。
            const chatData = useChatStore().chats[track.chatId] as chat | undefined;
            const audioSize = track.sizeBytes || 0;
            if (!shouldAutoDownloadAudio(chatData, audioSize)) {
                return;
            }
            try {
                // 音乐播放触发下载：记录到正常下载列表，保留来源对话与消息
                await useDownloadStore().registerDownload(track.fileId, track.title || `audio_${track.fileId}.mp3`, getChatTitle(track.chatId), 0, 'audio', undefined, track.chatId, track.messageId, false);
                await safeDownloadFile(track.fileId, true);
                track.ready = true;
                // 重新获取文件路径
                const fileInfo = await tdlibSend({
                    _: 'getFile',
                    file_id: track.fileId,
                }) as file;
                if (fileInfo?.local?.path) {
                    track.filePath = convertFileSrc(fileInfo.local.path);
                }
            } catch (e) {
                console.error('Failed to download audio:', e);
                return;
            }
        }

        // 文件就绪后再切换当前曲目，确保 audioSrc 能拿到有效路径
        currentIndex.value = index;
        isPlaying.value = true;
        showEntry.value = true;
        currentTime.value = 0;
        duration.value = track.duration;
    }

    /** 播放/暂停切换 */
    function togglePlay() {
        if (playlist.value.length === 0) return;
        if (currentIndex.value === -1) {
            playTrack(0);
            return;
        }
        isPlaying.value = !isPlaying.value;
        // 兜底：只要恢复播放就确保入口栏显示（关闭后从系统控件/其他入口恢复播放时）
        if (isPlaying.value) {
            showEntry.value = true;
        }
    }

    /** 下一首 */
    function nextTrack() {
        if (playlist.value.length === 0) return;

        let nextIdx: number;
        switch (repeatMode.value) {
            case 'shuffle':
                nextIdx = Math.floor(Math.random() * playlist.value.length);
                break;
            case 'one':
                nextIdx = currentIndex.value; // 单曲循环由 audio 标签的 loop 处理
                break;
            case 'all':
                nextIdx = (currentIndex.value + 1) % playlist.value.length;
                break;
            default:
                nextIdx = currentIndex.value + 1;
                if (nextIdx >= playlist.value.length) {
                    isPlaying.value = false;
                    return;
                }
                break;
        }
        playTrack(nextIdx);
    }

    /** 上一首 */
    function prevTrack() {
        if (playlist.value.length === 0) return;
        if (currentIndex.value <= 0) {
            // 从头播放
            playTrack(0);
            return;
        }

        let prevIdx: number;
        switch (repeatMode.value) {
            case 'shuffle':
                prevIdx = Math.floor(Math.random() * playlist.value.length);
                break;
            case 'one':
                prevIdx = currentIndex.value;
                break;
            case 'all':
                prevIdx = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length;
                break;
            default:
                prevIdx = currentIndex.value - 1;
                break;
        }
        playTrack(prevIdx);
    }

    /** 切换循环模式：none → one → all → shuffle → none */
    function cycleRepeatMode() {
        const modes: RepeatMode[] = ['none', 'one', 'all', 'shuffle'];
        const idx = modes.indexOf(repeatMode.value);
        repeatMode.value = modes[(idx + 1) % modes.length];
    }

    /** 设置进度 */
    function seek(time: number) {
        currentTime.value = Math.max(0, Math.min(time, duration.value));
    }

    /** 设置音量 */
    function setVolume(v: number) {
        volume.value = Math.max(0, Math.min(1, v));
    }

    /** 关闭入口栏（停止播放） */
    function close() {
        isPlaying.value = false;
        showEntry.value = false;
        showOverlay.value = false;
        currentTime.value = 0;
        // 重置当前索引，确保关闭后再次播放同一首歌曲时能重新触发 playTrack → 重新显示入口栏
        currentIndex.value = -1;
    }

    /** 切换弹出面板 */
    function toggleOverlay() {
        showOverlay.value = !showOverlay.value;
    }

    /** 封面解析结果 */
    interface CoverResult {
        /** 用于 UI 渲染的图片 URL */
        url?: string;
        /** 原生 SMTC 使用的封面来源 */
        source?: { file?: string; buffer?: number[] };
    }

    /** 封面解析用参数：兼容完整 message（对话场景）与仅含音频内容的极简消息（资料音乐场景） */
    type AudioContentMessage = message | { content: { _: 'messageAudio'; audio: audio } };

    /** Base64 → Uint8Array */
    function base64ToBytes(b64: string): number[] {
        try {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return Array.from(bytes);
        } catch {
            return [];
        }
    }

    /** 从 messageAudio 中获取封面（URL 与原生来源）。不阻塞内部解析。 */
    function resolveCover(audioMsg: AudioContentMessage): CoverResult {
        if (audioMsg.content._ !== 'messageAudio') return {};
        const audio = audioMsg.content.audio;

        // ① 内嵌 minithumbnail base64：始终可用（40x40，清晰度较低，作为原生缓冲来源兜底）
        const miniData = audio.album_cover_minithumbnail?.data;
        const miniCover: CoverResult | undefined = miniData
            ? {
                url: `data:image/jpeg;base64,${miniData}`,
                source: { buffer: base64ToBytes(miniData) },
            }
            : undefined;

        // ② 缩略图文件（静态位图，取最高清优先下载返回本地路径）
        const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
            !!t && isThumbnailImgRenderable(t.format) && !!t.file.local?.can_be_downloaded;

        const primary = imgRenderable(audio.album_cover_thumbnail) ? audio.album_cover_thumbnail : undefined;
        const external = (audio.external_album_covers ?? [])
            .filter(imgRenderable)
            .sort((a, b) => (a.width * a.height) - (b.width * b.height));

        const candidates: thumbnail[] = primary
            ? [primary, ...external.reverse()]
            : [...external.reverse()];

        // 同步扫描已下载的缩略图（无需异步）
        for (const thumb of candidates) {
            if (!thumb) continue;
            const file = thumb.file;
            if (isFileReady(file) && file.local.path) {
                // 同时携带 minithumbnail buffer：Media Session 优先用数据 URL 渲染封面，
                // 原生 SMTC 优先用高清文件路径；两者都提供以最大化封面成功率。
                return {
                    url: convertFileSrc(file.local.path),
                    source: {
                        file: file.local.path,
                        ...(miniCover?.source?.buffer ? { buffer: miniCover.source.buffer } : {}),
                    },
                };
            }
        }

        // 无可立即使用的文件缩略图，退回 minithumbnail base64
        return miniCover ?? {};
    }

    /** 从 messageAudio 中异步下载封面缩略图并返回其 URL（供 UI 使用） */
    async function loadCoverUrl(audioMsg: AudioContentMessage): Promise<string | undefined> {
        const sync = resolveCover(audioMsg);
        if (sync.url) return sync.url;
        if (audioMsg.content._ !== 'messageAudio') return undefined;
        const audio = audioMsg.content.audio;

        // 尝试异步下载缩略图文件
        const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
            !!t && isThumbnailImgRenderable(t.format) && !!t.file.local?.can_be_downloaded;
        const primary = imgRenderable(audio.album_cover_thumbnail) ? audio.album_cover_thumbnail : undefined;
        const external = (audio.external_album_covers ?? [])
            .filter(imgRenderable)
            .sort((a, b) => (a.width * a.height) - (b.width * b.height));
        const candidates: thumbnail[] = primary
            ? [primary, ...external.reverse()]
            : [...external.reverse()];

        for (const thumb of candidates) {
            if (!thumb) continue;
            const file = thumb.file;
            if (file.local.can_be_downloaded && !isFileReady(file)) {
                try {
                    const downloaded = await tdlibSend({
                        _: 'downloadFile',
                        file_id: file.id,
                        priority: 1,
                        offset: 0,
                        limit: 0,
                        synchronous: true,
                    });
                    if (isFileReady(downloaded) && downloaded.local?.path) {
                        return convertFileSrc(downloaded.local.path);
                    }
                } catch (_) { }
            }
        }
        return sync.url;
    }

    /** 异步获取封面原始来源（优先下载文件缩略图路径，失败退回 minithumbnail buffer） */
    async function loadCoverSource(audioMsg: AudioContentMessage): Promise<{ file?: string; buffer?: number[] } | undefined> {
        const sync = resolveCover(audioMsg);
        if (sync.source?.file || sync.source?.buffer) return sync.source;
        if (audioMsg.content._ !== 'messageAudio') return undefined;
        const audio = audioMsg.content.audio;

        const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
            !!t && isThumbnailImgRenderable(t.format) && !!t.file.local?.can_be_downloaded;
        const primary = imgRenderable(audio.album_cover_thumbnail) ? audio.album_cover_thumbnail : undefined;
        const external = (audio.external_album_covers ?? [])
            .filter(imgRenderable)
            .sort((a, b) => (a.width * a.height) - (b.width * b.height));
        const candidates: thumbnail[] = primary
            ? [primary, ...external.reverse()]
            : [...external.reverse()];

        for (const thumb of candidates) {
            if (!thumb) continue;
            const file = thumb.file;
            try {
                if (!isFileReady(file)) {
                    if (!file.local.can_be_downloaded) continue;
                    const downloaded = await tdlibSend({
                        _: 'downloadFile',
                        file_id: file.id,
                        priority: 1,
                        offset: 0,
                        limit: 0,
                        synchronous: true,
                    });
                    if (isFileReady(downloaded) && downloaded.local?.path) {
                        return { file: downloaded.local.path };
                    }
                } else if (file.local.path) {
                    return { file: file.local.path };
                }
            } catch (_) { }
        }
        return sync.source;
    }

    /** 播放指定消息（从外部调用，如 MessageFileContent） */
    async function playMessageAudio(msg: message) {
        if (msg.content._ !== 'messageAudio') return;
        const audio = msg.content.audio;
        const file = audio.audio;

        // 唯一键：同一对话 + 同一消息才算同一条歌曲
        const trackKey = `${msg.chat_id}:${msg.id}`;

        // ① 已在播放列表中：切换/播放，不重复添加
        const existingIdx = playlist.value.findIndex(
            t => t.chatId === msg.chat_id && t.messageId === msg.id
        );
        if (existingIdx >= 0) {
            if (existingIdx === currentIndex.value) {
                togglePlay();
            } else {
                await playTrack(existingIdx);
            }
            return;
        }

        // ② 并发去重锁：若该曲目正在异步添加（下载）中，直接忽略本次点击，
        //    避免在 await 下载的间隙被并发触发而重复 push 进播放列表
        if (pendingAudioAdds.has(trackKey)) return;
        pendingAudioAdds.add(trackKey);

        try {
            await addTrackInternal(msg, audio, await ensureAudioFileReady(msg, file, audio));
        } finally {
            pendingAudioAdds.delete(trackKey);
        }
    }

    /** 确保音频文件已下载就绪，返回可用于播放的本地 filePath */
    async function ensureAudioFileReady(msg: message, file: any, audio: any): Promise<string> {
        const ready = isFileReady(file);

        // 先确保文件下载完成
        if (!ready) {
            // 用户显式点击播放等同于点击下载：不受自动下载大小上限限制，
            // 一律下载该音频（下载按钮会同步进入下载状态），完成后即可播放。
            try {
                // 音乐播放触发下载：记录到正常下载列表，保留来源对话与消息
                await useDownloadStore().registerDownload(file.id, audio.title || audio.file_name || `audio_${file.id}.mp3`, getChatTitle(msg.chat_id), 0, 'audio', undefined, msg.chat_id, msg.id, false);
                await safeDownloadFile(file.id, true);
            } catch (e) {
                console.error('Failed to download audio:', e);
                throw e;
            }
        }

        // 下载完成后获取文件路径
        let filePath = '';
        if (isFileReady(file)) {
            filePath = convertFileSrc(file.local.path);
        } else {
            try {
                const fileInfo = await tdlibSend({ _: 'getFile', file_id: file.id }) as file;
                if (fileInfo?.local?.path) {
                    filePath = convertFileSrc(fileInfo.local.path);
                }
            } catch (_) { }
        }
        return filePath;
    }

    /** 将一条已就绪的音频曲目加入播放列表（内部使用，调用方需持有去重锁） */
    async function addTrackInternal(msg: message, audio: any, filePath: string) {
        const file = audio.audio;

        const track: AudioTrack = {
            messageId: msg.id,
            chatId: msg.chat_id,
            title: audio.title || audio.file_name || '未知音乐',
            performer: audio.performer || '未知艺术家',
            duration: audio.duration,
            fileId: file.id,
            filePath,
            ready: !!filePath, // 未就绪（如超出自動下载上限）时不视为可播放
            sizeBytes: file.size || 0,
        };

        // 幂等保护：加入前再次检查（以防极端竞态），存在则不重复添加
        const existsAfter = playlist.value.findIndex(
            t => t.chatId === msg.chat_id && t.messageId === msg.id
        );
        if (existsAfter >= 0) {
            if (existsAfter === currentIndex.value) {
                togglePlay();
            } else {
                await playTrack(existsAfter);
            }
            return;
        }

        // 加入列表后立即加载封面并写回，确保播放器一开始就有封面
        playlist.value.push(track);
        originalPlaylist.value.push(track);

        // 同步可得的封面（minithumbnail base64 或已下载缩略图）立即写入，避免闪烁
        const syncCover = resolveCover(msg);
        if (syncCover.url || syncCover.source) {
            const idx = playlist.value.findIndex(t => t.chatId === msg.chat_id && t.messageId === msg.id);
            if (idx >= 0) {
                if (syncCover.url) playlist.value[idx].coverPath = syncCover.url;
                if (syncCover.source) playlist.value[idx].coverSource = syncCover.source;
            }
        }

        // 异步补齐高清单个缩略图封面
        (async () => {
            const idx = playlist.value.findIndex(t => t.chatId === msg.chat_id && t.messageId === msg.id);
            if (idx < 0) return;
            const [url, source] = await Promise.all([
                loadCoverUrl(msg),
                loadCoverSource(msg),
            ]);
            if (url) playlist.value[idx].coverPath = url;
            if (source) playlist.value[idx].coverSource = source;
        })();

        // playTrack 内部会设置 showEntry = true
        await playTrack(playlist.value.length - 1);
    }

    /** 设置播放列表（替换现有） */
    function setPlaylist(tracks: AudioTrack[], startIndex = 0) {
        playlist.value = [...tracks];
        originalPlaylist.value = [...tracks];
        if (tracks.length > 0) {
            showEntry.value = true;
            playTrack(startIndex);
        }
    }

    /**
     * 加载并播放某个用户的资料音乐列表（替换当前播放列表）。
     * 资料音乐无来源对话，逐首显式下载（不受自动下载体积上限限制）。
     * - 首次点击：加载列表并直接播放第一首。
     * - 首次点击：加载列表并直接播放第一首。
     * - 再次点击同一用户：不刷新，从头开始播放并展开列表。
     */
    async function playUserProfileAudios(userId: number) {
        // 同一用户且列表已加载：不刷新；若当前未在播放该用户资料音乐，则从头开始播放
        if (profileAudioUserId.value === userId && playlist.value.length > 0) {
            if (!isPlaying.value || currentTrack.value?.source !== 'profile') {
                setPlaylist(playlist.value, 0);
            }
            showEntry.value = true;
            showOverlay.value = true;   // 展开列表
            return;
        }

        try {
            const res = (await tdlibSend({
                _: 'getUserProfileAudios',
                user_id: userId,
                offset: 0,
                limit: 100,
            })) as { audios?: audio[] };
            const audios = (res?.audios ?? []).filter((a) => a && a.audio);
            if (audios.length === 0) return;

            const tracks: AudioTrack[] = [];
            await Promise.all(audios.map(async (a) => {
                // 资料音乐无对话：显式下载，不受自动下载体积上限限制
                const file = a.audio;
                if (!isFileReady(file)) {
                    try {
                        await safeDownloadFile(file.id, true);
                    } catch (e) {
                        console.error('Failed to download profile audio:', e);
                    }
                }
                // 下载完成后需重新获取文件路径（原 file 对象不会自动更新 local.path）
                let filePath = '';
                if (isFileReady(file) && file.local?.path) {
                    filePath = convertFileSrc(file.local.path);
                } else {
                    try {
                        const fileInfo = await tdlibSend({ _: 'getFile', file_id: file.id }) as file;
                        if (fileInfo.local?.path) {
                            filePath = convertFileSrc(fileInfo.local.path);
                        }
                    } catch (_) { }
                }

                const track: AudioTrack = {
                    messageId: 0,
                    chatId: 0,
                    title: a.title || a.file_name || '未知音乐',
                    performer: a.performer || '未知艺术家',
                    duration: a.duration,
                    fileId: file.id,
                    filePath,
                    ready: !!filePath,
                    sizeBytes: file.size || 0,
                    source: 'profile',
                };

                // 封面：复用现有解析逻辑（mock 成 messageAudio 消息）
                const fakeMsg: AudioContentMessage = { content: { _: 'messageAudio', audio: a } };
                const sync = resolveCover(fakeMsg);
                if (sync.url) track.coverPath = sync.url;
                if (sync.source) track.coverSource = sync.source;
                tracks.push(track);
            }));

            // 异步补齐高清封面
            (async () => {
                await Promise.all(audios.map(async (a, i) => {
                    const fakeMsg: AudioContentMessage = { content: { _: 'messageAudio', audio: a } };
                    const url = await loadCoverUrl(fakeMsg);
                    if (url && tracks[i]) tracks[i].coverPath = url;
                }));
            })();

            // 替换播放列表并直接播放第一首
            profileAudioUserId.value = userId;
            setPlaylist(tracks, 0);
        } catch (e) {
            console.error('Failed to load user profile audios:', e);
        }
    }

    return {
        playlist,
        originalPlaylist,
        currentIndex,
        isPlaying,
        currentTime,
        duration,
        volume,
        repeatMode,
        showEntry,
        showOverlay,
        currentTrack,
        hasNext,
        hasPrev,
        loadChatAudio,
        playTrack,
        togglePlay,
        nextTrack,
        prevTrack,
        cycleRepeatMode,
        seek,
        setVolume,
        close,
        toggleOverlay,
        playMessageAudio,
        setPlaylist,
        playUserProfileAudios,
        profileAudioUserId,
    };
});
