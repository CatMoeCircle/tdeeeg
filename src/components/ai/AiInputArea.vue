<script setup lang="ts">
/**
 * 聊天底部的 AI 输入区：活动条 + AI 输入框 + 会话管理弹窗。
 *
 * 为什么单独成组件（性能 + 后台托管）：
 * 1. **重渲染隔离**：流式时每帧都会改活动条的条目。这些状态以前直接住在 ChatDetail 里，
 *    一个增量就带着整棵消息列表（几百个 MessageContent / 头像 / 反应条）一起重渲染 ——
 *    这是「流式一开整个客户端卡顿」的主因。现在状态在这一层，ChatDetail 不再订阅它；
 * 2. **后台托管**：轮次状态存在 store/aiRuntime（按 chatId），本组件只是订阅者。
 *    切走聊天 = 这个组件卸载 = 退订，轮次照跑；切回来重新订阅，立刻看到这段时间的输出，
 *    还能接着点「允许 / 拒绝」。
 *
 * 注意：**不要**把 entries / approval / busy 提到 ChatDetail 再往下传 ——
 * 那样 Vue 的组件更新会一路冒到消息列表，白折腾。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import AiActivityStrip from './AiActivityStrip.vue';
import AiConversationDialog from './AiConversationDialog.vue';
import AiPromptBar from './AiPromptBar.vue';
import { settings } from '../../store/settings';
import { toast } from '../../utils/toast';
import { aiProviders, loadAiProviders, aiProviderReady } from '../../store/aiConfig';
import {
    aiConversations,
    activeConversation,
    createConversation,
    loadConversations,
    loadHistory,
    openConversation,
    renameConversation,
    deleteConversation,
    type ConversationUsage,
} from '../../store/aiConversations';
import {
    beginTurn,
    clearEntries,
    isTurnRunning,
    makeSink,
    replaceEntries,
    setViewingChat,
    settleApproval,
    stopTurn,
    trackTurn,
    turnState,
} from '../../store/aiRuntime';
import { runAiTurn, cancelAiStream, dropHistory, AI_EFFORT_KEYS, AiTurnLimitError, type AiTurnPermissions, type AiTurnThread } from '../../utils/aiChat';
import { historyToActivity } from '../../utils/aiChatHistory';
import type { AiActivityEntry } from './AiActivityStrip.vue';

const props = defineProps<{
    /** 当前聊天（未就绪时为 null） */
    chatId: number | null;
    /** 当前线程（论坛话题 / 频道直信 / 评论线程）：给模型定位，也给工具兜底 */
    thread?: AiTurnThread;
    /** 群 / 频道的写权限；私聊不传 = 不限制 */
    perms?: AiTurnPermissions;
    /** 只读会话（不可发言）：显示提示，AI 照样能读能总结 */
    readOnly?: boolean;
    /** 引用回复：只带定位信息，正文让模型自己 get_message 取 */
    quote?: { name: string; chatId: number; messageId: number } | null;
}>();

const emit = defineEmits<{
    'update:quote': [value: null];
    'jump-quote': [];
    'switch-message': [];
}>();

const { t } = useI18n();

/** 当前聊天 id（0 = 还没进聊天：不落库、不显示会话管理） */
const cid = computed(() => props.chatId ?? 0);

/**
 * 本聊天这一轮的状态。**按 chatId 取**：切走再切回来拿到的还是同一份，
 * 所以后台跑出来的内容不会丢（这是「离开就没了」的根治点）。
 */
const state = computed(() => turnState(cid.value));
const entries = computed(() => state.value.entries);
const approval = computed(() => state.value.approval);
const busy = computed(() => state.value.busy);
/** 活动条展开状态：纯界面状态，留在这里即可 */
const stripExpanded = ref(false);

const aiPromptRef = ref<InstanceType<typeof AiPromptBar> | null>(null);

/** 会话管理弹窗 */
const conversationsOpen = ref(false);
const conversationList = computed(() =>
    aiConversations.chatId === cid.value ? aiConversations.list : [],
);
const conversationsLoading = computed(() => aiConversations.loading);
const usage = computed<ConversationUsage | null>(() =>
    activeConversation(cid.value)?.usage ?? null,
);

/**
 * 切聊天 / 换会话：把该会话落盘的历史铺回活动条。
 * 只读盘、不打断正在跑的轮次（replaceEntries 内部会跳过有轮次在跑的情况）。
 */
let historySeq = 0;
watch(
    cid,
    (chatId) => {
        // 记下「用户正在看哪个聊天」：后台完成 / 待审批的提示据此决定要不要弹（正看着就不打扰）
        setViewingChat(chatId || null);
    },
    { immediate: true },
);
// 组件卸载 = 用户离开了这个聊天；提示从此可以弹
onUnmounted(() => setViewingChat(null));

watch(
    [cid, () => activeConversation(cid.value)?.id ?? ''],
    async ([chatId, conversationId]) => {
        conversationsOpen.value = false;
        if (!chatId) return;
        const seq = ++historySeq;
        await loadConversations(chatId);
        if (seq !== historySeq) return;
        if (!conversationId) {
            // 没有任何会话：清掉上一个聊天的残留（有轮次在跑时 clearEntries 自己会跳过）
            clearEntries(chatId);
            return;
        }
        const loaded = historyToActivity(await loadHistory(chatId, conversationId));
        // 读盘期间又切走了：丢掉这次的旧结果
        if (seq !== historySeq) return;
        replaceEntries(chatId, loaded as AiActivityEntry[], conversationId);
    },
    { immediate: true },
);

/** 会话管理：新建 / 打开 / 重命名 / 删除 */
async function onConversationCreate() {
    const c = await createConversation(cid.value, t('aiConversations.defaultTitle'));
    if (c) await toast.success(t('aiConversations.created', { title: c.title }));
}
async function onConversationOpen(id: string) {
    try {
        await openConversation(cid.value, id);
    } catch (e) {
        await toast.error(String(e));
    }
}
async function onConversationRename(id: string, title: string) {
    try {
        await renameConversation(cid.value, id, title);
    } catch (e) {
        await toast.error(String(e));
    }
}
async function onConversationRemove(id: string) {
    try {
        await deleteConversation(cid.value, id);
        dropHistory(id);
    } catch (e) {
        await toast.error(String(e));
    }
}

/** 选图（随提问一起发给模型） */
async function pickImages(): Promise<string[]> {
    const selected = await openDialog({
        multiple: true,
        title: t('chat.choosePhotoOrVideo'),
        filters: [{
            name: t('chat.photosAndVideos'),
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif'],
        }],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
}

/**
 * 发送：开一轮（登记在 store，**不随组件卸载而中断**）。
 * 活动条实时显示思考 / 输出 / 工具调用；写类工具先挂审核卡片（见 store/aiRuntime 的 gate）。
 */
async function onSend(
    text: string,
    detail: { effort?: string; effortValue?: string; attachments?: string[]; command?: string },
) {
    const chatId = cid.value;
    if (!chatId || isTurnRunning(chatId)) return;

    // 引用回复：只给模型定位信息；引用由输入框顶部芯片承载
    const quote = props.quote;
    emit('update:quote', null);
    const body = text.trim();
    const asked = body || (detail.attachments?.length ? t('aiInput.imageOnly') : '');
    const prompt = asked || text;

    if (!aiProviders.loaded) await loadAiProviders();
    const provider = aiProviders.list.find((p) => p.id === settings.ai.providerId);
    const model = provider?.models.find((m) => m.id === settings.ai.model);
    if (!provider || !model || !aiProviderReady(provider)) {
        void toast.warning(t('aiSettings.notReady'));
        return;
    }
    // 历史按会话落盘：先把该聊天的会话列表拉到，再决定用哪个 / 要不要新建
    if (!aiConversations.loaded || aiConversations.chatId !== chatId) await loadConversations(chatId);
    let conversation = activeConversation(chatId);
    if (!conversation) {
        const firstImage = ((detail.attachments?.[0] ?? '').split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '');
        conversation = await createConversation(chatId, titleFromQuestion(body || firstImage || text));
    }
    if (!conversation) {
        void toast.error(t('aiConversations.createFailed'));
        return;
    }

    const labels = [t('aiInput.effortOff'), t('aiInput.effortDefault'), 'low', 'medium', 'high'];
    const effortIdx = labels.indexOf(detail.effort ?? '');
    const effort = detail.effortValue !== undefined
        ? (detail.effortValue.trim() || null)
        : effortIdx >= 0 ? AI_EFFORT_KEYS[effortIdx] : null;

    // 开一轮：控制器 / 审核通道都登记在 store 里，切走聊天也不会被收走
    const turn = beginTurn(chatId, conversation.id);
    if (!turn) return;

    const run = runAiTurn({
        chatId,
        thread: props.thread,
        conversationId: conversation.id,
        title: conversation.title,
        text: prompt,
        quote: quote ? { chatId: quote.chatId, messageId: quote.messageId } : undefined,
        command: detail.command,
        images: detail.attachments,
        provider,
        model,
        effort,
        sink: makeSink(chatId),
        signal: turn.controller.signal,
        perms: props.perms,
        approvalGate: turn.gate,
    }).then(
        () => undefined,
        (e: unknown) => {
            // 轮数用尽不是故障：提示一句就够，历史已经保留
            if (e instanceof AiTurnLimitError) {
                void toast.warning(t('aiInput.maxSteps'));
                return;
            }
            throw e;
        },
    );

    trackTurn(chatId, turn.token, run, (reason) => {
        // 失败原因写进活动条（切回来也看得见），别只在 toast 里闪一下
        makeSink(chatId).add({
            id: `ai-failed-${Date.now()}`,
            kind: 'output',
            status: 'error',
            text: t('aiActivity.requestFailed', { reason }),
        });
        void toast.error(reason);
    });
}

/** 停止：立刻释放输入框，并让 Rust 真正中断请求；挂着的审核按拒绝收掉 */
function onStop() {
    stopTurn(cid.value, cancelAiStream);
}

/** 审批：结果交给 store 里挂着的 Promise（页面卸载也不影响） */
const onApprove = () => settleApproval(cid.value, true);
const onReject = () => settleApproval(cid.value, false);

onUnmounted(() => {
    // 卸载**不停止**轮次：这正是后台托管的意义（状态与 Promise 都在 store 里）。
    // 只让正在跑的读盘作废，别把结果写回已经换掉的界面。
    historySeq++;
});

defineExpose({ focusInput: () => aiPromptRef.value?.focusInput() });

/** 会话标题兜底：用户那句话截断（模型第一轮会改成更短更好的） */
function titleFromQuestion(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 24) || t('aiConversations.defaultTitle');
}
</script>

<template>
    <div class="px-3 py-2.5">
        <!-- 只读会话（不可发言的频道 / 群）：AI 照样能读能总结，只是不能在这里发言 -->
        <p v-if="readOnly"
            class="mb-2 flex items-start gap-1.5 px-1 text-[12px] leading-4 text-gray-500 dark:text-gray-400">
            <span class="shrink-0 text-amber-500">●</span>
            <span>{{ t('aiInput.noPostPermission') }}</span>
        </p>
        <!-- AI 活动条：用过 AI、有输出 / 工具调用 / 待审核时才在输入框顶部冒出来 -->
        <AiActivityStrip v-if="entries.length > 0 || approval"
            v-model:expanded="stripExpanded"
            :entries="entries" :approval="approval" :busy="busy"
            @approve="onApprove" @reject="onReject" />
        <AiPromptBar ref="aiPromptRef" v-model:conversations-open="conversationsOpen"
            :chat-id="cid" :usage="usage" :on-attach="pickImages" :quote="quote"
            :busy="busy" @send="onSend" @stop="onStop"
            @jump-quote="emit('jump-quote')" @remove-quote="emit('update:quote', null)"
            @switch-message="emit('switch-message')" />

        <!-- 会话管理弹窗：管当前聊天下的 AI 对话 -->
        <AiConversationDialog v-model="conversationsOpen" :chat-id="cid"
            :items="conversationList" :loading="conversationsLoading" @create="onConversationCreate"
            @open="onConversationOpen" @rename="onConversationRename" @remove="onConversationRemove" />
    </div>
</template>
