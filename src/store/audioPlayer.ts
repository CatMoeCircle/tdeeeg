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
    /** 可播放的 URL：已下载时为本地路径，未下载时可流式时为 tdstream:// 地址 */
    filePath: string;
    /** 音频文件大小（字节），用于判断是否超出自動下载体积上限 */
    sizeBytes?: number;
    /** 音频 MIME 类型（用于流式播放时传给 tdstream） */
    mimeType?: string;
    /** 是否为流式播放（边下边播，tdstream://）来源 */
    streaming?: boolean;
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

/**
 * 解析音频的可播放来源：
 * - 已完全下载（path && is_downloading_completed）→ 直接使用本地文件；
 * - 未下载但可流式（有已知大小）→ 使用 tdstream:// 边下边播，无需等完整下载；
 * - 否则 → 待完整下载（返回空，由调用方决定是否发起下载）。
 */
function resolveAudioPlaySource(
    file: { id: number; size?: number; local?: { is_downloading_completed?: boolean; path?: string } },
    mimeType: string,
): { url: string; streaming: boolean; ready: boolean } {
    if (isFileReady(file as any)) {
        return { url: convertFileSrc((file.local as any)!.path), streaming: false, ready: true };
    }
    if (file.id > 0 && (file.size ?? 0) > 0) {
        return {
            // 与视频流式一致：mime 原样拼接（保留 /），供 Rust tdstream 处理器按 audio/* 识别
            url: `${convertFileSrc(String(file.id), 'tdstream')}?mime=${mimeType || 'audio/mpeg'}`,
            streaming: true,
            ready: true,
        };
    }
    return { url: '', streaming: false, ready: false };
}

export const useAudioPlayerStore = defineStore('audioPlayer', () => {
    // ======== 播放列表 ========
    const playlist = ref<AudioTrack[]>([]);
    const originalPlaylist = ref<AudioTrack[]>([]); // 保留原始顺序供 list 循环
    const currentIndex = ref(-1);

    /**
     * 已作为「流式下载」注册到下载管理器的 file_id 集合。
     * 同一首歌被反复播放/切换时避免重复 registerDownload 把进度重置为 0。
     */
    const streamingRegisteredFiles = new Set<number>();

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

    /** 将曲目注册为「流式下载」（边下边播，tdstream://），幂等：同一 file 只注册一次。 */
    async function registerStreamingDownload(
        fileId: number,
        title: string,
        chatId: number,
        messageId: number,
        totalSize: number,
    ) {
        if (streamingRegisteredFiles.has(fileId)) return;
        streamingRegisteredFiles.add(fileId);
        await useDownloadStore().registerDownload(
            fileId, title || `audio_${fileId}.mp3`,
            getChatTitle(chatId), totalSize, 'audio',
            undefined, chatId, messageId, false, false, undefined, true,
        );
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
                // 已下载用本地文件；未下载但可流式则预置 tdstream:// 地址（点击即边下边播）
                const src = resolveAudioPlaySource(file, audio.mime_type || 'audio/mpeg');
                tracks.push({
                    messageId: msg.id,
                    chatId: msg.chat_id,
                    title: audio.title || audio.file_name || '未知音乐',
                    performer: audio.performer || '未知艺术家',
                    duration: audio.duration,
                    fileId: file.id,
                    filePath: src.url,
                    mimeType: audio.mime_type || 'audio/mpeg',
                    streaming: src.streaming,
                    ready: src.ready,
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

    /** 下载（或流式）并播放指定索引的曲目 */
    async function playTrack(index: number) {
        if (index < 0 || index >= playlist.value.length) return;

        const track = playlist.value[index];

        // 先确保文件可播放，再切换曲目：能流式则边下边播，否则完整下载。
        if (!track.ready) {
            // 尝试流式播放：已下载用本地文件，未下载但可流式则用 tdstream://（边下边播）。
            // 流式不持久化整份文件到磁盘，故不受自动下载体积上限拦截（用户点击即播放）。
            const info = await tdlibSend({ _: 'getFile', file_id: track.fileId }) as file;
            const src = resolveAudioPlaySource(info, track.mimeType || 'audio/mpeg');
            if (src.ready) {
                track.filePath = src.url;
                track.streaming = src.streaming;
                track.ready = true;
                if (src.streaming && !streamingRegisteredFiles.has(track.fileId)) {
                    // 流式播放本质也是一次下载：注册到下载管理器，让进度可见（updateFile 驱动）。
                    await registerStreamingDownload(track.fileId, track.title || `audio_${track.fileId}.mp3`, track.chatId, track.messageId, info.size || track.sizeBytes || 0);
                }
            } else {
                // 无法流式：遵守自动下载大小限制，超过上限则不自动下载，
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
                    // 重新获取文件路径（仅在完全下载完成时才使用，避免指向残缺/未完成文件）
                    const fileInfo = await tdlibSend({
                        _: 'getFile',
                        file_id: track.fileId,
                    }) as file;
                    if (isFileReady(fileInfo) && fileInfo?.local?.path) {
                        track.filePath = convertFileSrc(fileInfo.local.path);
                        track.streaming = false;
                    }
                } catch (e) {
                    console.error('Failed to download audio:', e);
                    return;
                }
            }
        } else if (track.streaming && !streamingRegisteredFiles.has(track.fileId)) {
            // 由 loadChatAudio 预置的流式曲目（ready + streaming）：首次实际播放时注册进度。
            await registerStreamingDownload(track.fileId, track.title || `audio_${track.fileId}.mp3`, track.chatId, track.messageId, track.sizeBytes || 0);
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

    /**
     * 封面候选构建：区分「音频内嵌封面」与「外部备选封面」的语义。
     *
     * TDLib 语义：
     * - `album_cover_thumbnail`：音频文件内嵌的真实专辑封面，**优先**使用；
     * - `external_album_covers`：仅当音频文件无内置封面时才应作为备选。
     *
     * 因此返回 `{ primary, external }` 两个独立列表，调用方必须先完整尝试 primary，
     * primary 缺失/下载失败后才轮到 external，而不是把它们混在同一个优先级队列里
     * （避免内嵌封面仅因 can_be_downloaded=false 就被外部封面顶替）。
     */
    function buildCoverCandidates(audio: audio) {
        const imgRenderable = (t: thumbnail | undefined): t is thumbnail =>
            !!t && isThumbnailImgRenderable(t.format);

        // primary：内嵌封面。只要可渲染（静态位图）即视为可用，不因 can_be_downloaded 而排除。
        const primary = imgRenderable(audio.album_cover_thumbnail) ? audio.album_cover_thumbnail : undefined;
        // external：外部备选封面。同样只取可渲染的静态位图，按清晰度从高到低排序。
        const external = (audio.external_album_covers ?? [])
            .filter(imgRenderable)
            .sort((a, b) => (b.width * b.height) - (a.width * a.height));

        // minithumbnail base64：始终可用，作为最终兜底缓冲来源
        const miniData = audio.album_cover_minithumbnail?.data;
        const miniCover: CoverResult | undefined = miniData
            ? {
                url: `data:image/jpeg;base64,${miniData}`,
                source: { buffer: base64ToBytes(miniData) },
            }
            : undefined;

        return { primary, external, miniCover };
    }

    /** 判定缩略图文件当前是否已下载就绪且路径有效 */
    function coverFileReady(thumb: thumbnail): boolean {
        return !!thumb && isFileReady(thumb.file) && !!thumb.file.local?.path;
    }

    /** 从 messageAudio 中获取封面（URL 与原生来源）。不阻塞内部解析。 */
    function resolveCover(audioMsg: AudioContentMessage): CoverResult {
        if (audioMsg.content._ !== 'messageAudio') return {};
        const audio = audioMsg.content.audio;
        const { primary, external, miniCover } = buildCoverCandidates(audio);

        // ① 同步扫描内嵌封面（absolute priority）：已下载则直接返回高清路径。
        if (primary && coverFileReady(primary)) {
            return {
                url: convertFileSrc(primary.file.local.path),
                source: {
                    file: primary.file.local.path,
                    ...(miniCover?.source?.buffer ? { buffer: miniCover.source.buffer } : {}),
                },
            };
        }

        // ② 内嵌封面不可用（缺失/未下载）时，同步扫描外部备选封面。
        for (const thumb of external) {
            if (coverFileReady(thumb)) {
                return {
                    url: convertFileSrc(thumb.file.local.path),
                    source: {
                        file: thumb.file.local.path,
                        ...(miniCover?.source?.buffer ? { buffer: miniCover.source.buffer } : {}),
                    },
                };
            }
        }

        // 无可立即使用的文件缩略图，退回 minithumbnail base64
        return miniCover ?? {};
    }

    /**
     * 依次尝试下载封面文件，返回第一个成功下载的本地路径（供 UI / SMTC 使用）。
     * 严格遵循「内嵌封面绝对优先，缺失时再用外部备选」的语义。
     */
    async function downloadFirstCover(audio: audio): Promise<string | undefined> {
        const { primary, external } = buildCoverCandidates(audio);
        const groups = primary ? [primary, ...external] : external;

        for (const thumb of groups) {
            if (!thumb) continue;
            const file = thumb.file;
            if (coverFileReady(thumb)) return file.local.path;
            if (!file.local.can_be_downloaded) continue;
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
                    return downloaded.local.path;
                }
            } catch (_) { }
        }
        return undefined;
    }

    /** 从 messageAudio 中异步下载封面缩略图并返回其 URL（供 UI 使用） */
    async function loadCoverUrl(audioMsg: AudioContentMessage): Promise<string | undefined> {
        const sync = resolveCover(audioMsg);
        if (sync.url) return sync.url;
        if (audioMsg.content._ !== 'messageAudio') return undefined;
        // 内嵌封面绝对优先；仅当其缺失/不可下载时才回退到外部备选。
        const path = await downloadFirstCover(audioMsg.content.audio);
        return path ? convertFileSrc(path) : sync.url;
    }

    /** 异步获取封面原始来源（优先下载文件缩略图路径，失败退回 minithumbnail buffer） */
    async function loadCoverSource(audioMsg: AudioContentMessage): Promise<{ file?: string; buffer?: number[] } | undefined> {
        const sync = resolveCover(audioMsg);
        if (sync.source?.file || sync.source?.buffer) return sync.source;
        if (audioMsg.content._ !== 'messageAudio') return undefined;
        const path = await downloadFirstCover(audioMsg.content.audio);
        return path ? { file: path } : sync.source;
    }

    /** 播放指定消息（从外部调用，如 MessageFileContent） */
    async function playMessageAudio(msg: message) {
        if (msg.content._ !== 'messageAudio') return;
        const audio = msg.content.audio;

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
            const prepared = await prepareAudioForPlay(msg, audio);
            await addTrackInternal(msg, audio, prepared.filePath, prepared.streaming);
        } finally {
            pendingAudioAdds.delete(trackKey);
        }
    }

    /**
     * 确保音频可播放，返回可播放 URL 与是否为流式。
     * - 已下载 → 本地文件；
     * - 未下载但可流式 → tdstream:// 边下边播（用户点击一律流式，不受自动下载上限限制）；
     * - 否则 → 完整下载后返回本地路径。
     */
    async function prepareAudioForPlay(msg: message, audio: any): Promise<{ filePath: string; streaming: boolean }> {
        const file = audio.audio;
        const ready = isFileReady(file);

        // 已下载：直接用本地文件
        if (ready) {
            return { filePath: convertFileSrc(file.local.path), streaming: false };
        }

        // 可流式（有已知大小）：边下边播，无需完整下载
        const src = resolveAudioPlaySource(file, audio.mime_type || 'audio/mpeg');
        if (src.ready && src.streaming) {
            // 流式本质也是下载：注册到下载管理器，让进度可见（幂等）。
            await registerStreamingDownload(
                file.id, audio.title || audio.file_name || `audio_${file.id}.mp3`,
                msg.chat_id, msg.id, file.size || 0,
            );
            return { filePath: src.url, streaming: true };
        }

        // 无法流式：完整下载（用户显式点击播放不受自动下载大小上限限制）
        try {
            await useDownloadStore().registerDownload(file.id, audio.title || audio.file_name || `audio_${file.id}.mp3`, getChatTitle(msg.chat_id), 0, 'audio', undefined, msg.chat_id, msg.id, false);
            await safeDownloadFile(file.id, true);
        } catch (e) {
            console.error('Failed to download audio:', e);
            throw e;
        }

        // 下载完成后获取本地路径（仅在完全下载完成时才使用，避免指向残缺/未完成文件）
        let filePath = '';
        const fileInfo = await tdlibSend({ _: 'getFile', file_id: file.id }) as file;
        if (isFileReady(fileInfo) && fileInfo?.local?.path) {
            filePath = convertFileSrc(fileInfo.local.path);
        }
        return { filePath, streaming: false };
    }


    /** 将一条已就绪的音频曲目加入播放列表（内部使用，调用方需持有去重锁） */
    async function addTrackInternal(msg: message, audio: any, filePath: string, streaming = false) {
        const file = audio.audio;

        const track: AudioTrack = {
            messageId: msg.id,
            chatId: msg.chat_id,
            title: audio.title || audio.file_name || '未知音乐',
            performer: audio.performer || '未知艺术家',
            duration: audio.duration,
            fileId: file.id,
            filePath,
            mimeType: audio.mime_type || 'audio/mpeg',
            streaming,
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
