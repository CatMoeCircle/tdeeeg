<template>
    <!-- 消息右侧的小圆按钮（参考官方样式，半透明圆底）：转文字（圆形视频）、评论（频道圆形视频）。
         与气泡平级，不占用气泡内部空间；识别结果仍由 MessageVoiceContent 在媒体下方展示 -->
    <div v-if="showTranscribe || showComments" class="ml-2 mb-1 flex shrink-0 flex-col items-center gap-2 self-end">
        <button v-if="showTranscribe" type="button"
            class="relative flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform hover:bg-black/50 active:scale-95"
            :aria-label="t('content.transcribe')" :title="t('content.transcribe')" @click.stop="toggleTranscribe">
            <!-- 识别文本已展开且有结果：向上箭头，点击收起 -->
            <ArrowUpIcon v-if="open && result?._ === 'speechRecognitionResultText'" class="h-4 w-4" />
            <span v-else class="tgico tgico-transcribe text-[14px]" />
            <!-- 识别中：围绕按钮的转圈描边 -->
            <span v-if="transcribing"
                class="pointer-events-none absolute inset-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </button>
        <button v-if="showComments" type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform hover:bg-black/50 active:scale-95"
            :aria-label="commentsLabel" :title="commentsLabel" @click.stop="emit('comments')">
            <span class="tgico tgico-comments text-[14px]" />
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { message } from 'tdlib-types';
import { toast } from '../../../utils/toast';
import { ArrowUpIcon } from 'lucide-vue-next';
import { tdlibSend } from '../../../utils/tdlib';
import { tdPlural } from '../../../utils/tdLang';
import { getMessageProperties } from '../../contextMenu/messageActions';
import { openTranscripts, transcriptKey, speechResultOf } from '../../../composables/speechTranscript';

const props = defineProps<{
    msg: message;
}>();

const emit = defineEmits<{
    comments: [];
}>();

const { t } = useI18n();

const isVideoNote = computed(() => props.msg.content._ === 'messageVideoNote');

/** 是否可转文字：TDLib messageProperties.can_recognize_speech（已含 Premium / 时长等条件）。异步拉取后写入 ref。
 *  语音转文字保留在气泡内（MessageVoiceContent），这里只处理圆形视频。 */
const canRecognize = ref(false);
watch(() => [props.msg.chat_id, props.msg.id] as const, async ([cid, mid]) => {
    canRecognize.value = false;
    if (!isVideoNote.value) return;
    const p = await getMessageProperties(cid, mid);
    canRecognize.value = p?.can_recognize_speech === true;
}, { immediate: true });

const key = computed(() => transcriptKey(props.msg.chat_id, props.msg.id));
const open = computed(() => openTranscripts.has(key.value));
const result = computed(() => speechResultOf(props.msg));
/** 识别进行中：展开且尚无最终结果 */
const transcribing = computed(() => open.value
    && (!result.value || result.value._ === 'speechRecognitionResultPending'));
/** 展开后由气泡内的收起按钮接管，右侧转文字按钮隐藏（与官方一致） */
const showTranscribe = computed(() => isVideoNote.value && canRecognize.value && !open.value);

/**
 * 评论按钮：仅频道圆形视频（独立消息不进气泡内的评论条，只能靠这里进入评论区）。
 * 其余类型的评论条仍在气泡底部（MessageCommentsBar）。
 */
const replyCount = computed(() => props.msg.interaction_info?.reply_info?.reply_count ?? 0);
const showComments = computed(() => isVideoNote.value
    && !!props.msg.is_channel_post && !!props.msg.interaction_info?.reply_info);
const commentsLabel = computed(() => replyCount.value > 0
    ? tdPlural('lng_comments_open_count', replyCount.value)
    : t('lng_comments_open_none'));

async function toggleTranscribe() {
    const k = key.value;
    if (openTranscripts.has(k)) {
        openTranscripts.delete(k);
        return;
    }
    openTranscripts.add(k);
    if (result.value) return;
    try {
        await tdlibSend({ _: 'recognizeSpeech', chat_id: props.msg.chat_id, message_id: props.msg.id });
    } catch (e: any) {
        console.error('recognizeSpeech failed:', e);
        openTranscripts.delete(k); // 失败则收起，避免一直转圈
        toast.error(e?.message || t('chat.transcriptFailed'));
    }
}
</script>
