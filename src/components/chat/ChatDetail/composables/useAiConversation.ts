import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { AiActivityEntry } from '../../../ai/AiActivityStrip.vue';
import { toast } from '../../../../utils/toast';
import i18n from '../../../../i18n';
import { useAccountsStore } from '../../../../store/accounts';
import {
    aiConversations,
    activeConversation,
    createConversation,
    deleteConversation,
    loadConversations,
    loadHistory,
    openConversation,
    renameConversation,
    setAiConversationsAccount,
} from '../../../../store/aiConversations';
import { historyToActivity } from '../../../../utils/aiChatHistory';
import { dropHistory } from '../../../../utils/aiChat';

/**
 * AI 会话（对话）管理：跟随当前聊天，存在 Rust 后端。
 *
 * 从 `ChatDetail/index.vue` 抽出。会话管理弹窗只做新建 / 打开 / 重命名 / 删除；
 * 活动条历史读取需要回调注入（`aiActivityEntries` / `stopTurn`），避免和 AI 轮次状态耦合。
 */
export function useAiConversation(deps: {
    chatId: ComputedRef<number | undefined>;
    aiActivityEntries: Ref<AiActivityEntry[]>;
    /** 当前正在跑的一轮 AI：换会话前先停掉 */
    stopTurn: () => void;
}) {
    const { chatId, aiActivityEntries, stopTurn } = deps;
    const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params as never);
    const accountsStore = useAccountsStore();

    const conversationsOpen = ref(false);

    /** 对话操作统一走当前聊天 id（undefined = 还没进聊天，用 0 = 不落库） */
    const currentChatId = () => chatId.value ?? 0;

    /** 当前对话的用量（没有对话 / 还没用过 AI 时 null → 底部状态行不显示） */
    const aiUsage = computed(() => activeConversation(currentChatId())?.usage ?? null);

    /**
     * 会话管理弹窗的列表。列表是异步拉的，切聊天后它可能还是上一个聊天的，
     * 所以归属对不上就先按空显示，别把上一个群的对话挂到当前输入框上。
     */
    const aiConversationList = computed(() =>
        aiConversations.chatId === currentChatId() ? aiConversations.list : [],
    );

    async function onConversationCreate() {
        const c = await createConversation(currentChatId(), t('aiConversations.defaultTitle'));
        if (c) await toast.success(t('aiConversations.created', { title: c.title }));
    }

    async function onConversationOpen(id: string) {
        try {
            await openConversation(currentChatId(), id);
        } catch (e) {
            await toast.error(String(e));
        }
    }

    async function onConversationRename(id: string, title: string) {
        try {
            await renameConversation(currentChatId(), id, title);
        } catch (e) {
            await toast.error(String(e));
        }
    }

    async function onConversationRemove(id: string) {
        try {
            await deleteConversation(currentChatId(), id);
            // 内存里的上下文缓存也丢掉，否则删了还能接着聊旧上下文
            dropHistory(id);
        } catch (e) {
            await toast.error(String(e));
        }
    }

    // 换聊天：列表是「当前聊天」的，必须重拉；弹窗顺手关掉，免得停在上一组对话上
    watch(chatId, (id) => {
        conversationsOpen.value = false;
        if (id) void loadConversations(id, true);
    }, { immediate: true });

    /**
     * 换对话或重新进入聊天时，把该对话落盘的历史读回来铺进活动条，
     * 这样上次的来回看得见，模型也接着同一份上下文聊。
     */
    watch(
        () => activeConversation(currentChatId())?.id ?? '',
        async (id) => {
            // 换会话 = 换上下文：这一轮还在跑就先停掉，别让上一段的输出混进新会话的活动条
            stopTurn();
            aiActivityEntries.value = [];
            if (!id) return;
            const cid = currentChatId();
            const entries = historyToActivity(await loadHistory(cid, id));
            // 读盘期间又换了会话 / 换了聊天：丢掉这次的旧结果
            if (activeConversation(currentChatId())?.id !== id) return;
            aiActivityEntries.value = entries;
        },
        { immediate: true },
    );

    /**
     * 账号 id：后端按账号分目录存对话，所以切账号要跟着换。
     * 账号比聊天先就绪时这里会同步跑一次（那时 activeChatId 还是 undefined，不拉列表）；
     * 账号就绪晚于聊天的情形，这里补一次重新拉，否则列表会停在「空账号目录」的结果上。
     */
    watch(
        () => accountsStore.activeAccount?.id,
        (id) => {
            setAiConversationsAccount(id);
            if (currentChatId()) void loadConversations(currentChatId(), true);
        },
        { immediate: true },
    );

    return {
        conversationsOpen,
        currentChatId,
        aiUsage,
        aiConversationList,
        aiConversationsLoading: computed(() => aiConversations.loading),
        onConversationCreate,
        onConversationOpen,
        onConversationRename,
        onConversationRemove,
    };
}
