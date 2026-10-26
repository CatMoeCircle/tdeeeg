<script setup lang="ts">
/**
 * AI 会话总管理（AI 配置页的入口进来）：账号下**全部聊天**的对话。
 *
 * 与聊天内弹窗同一套数据（store/aiConversations），区别只在这里跨聊天、按 chat_id 分组。
 * 不做消息查看：只有标题 / 用量 / 重命名 / 删除。打开 = 把该对话设为它所属聊天的当前对话
 * （顺带跳到那个聊天，否则「打开」看不到效果）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from '../../utils/toast';
import LoadingSkeleton from '../../components/common/LoadingSkeleton.vue';
import {
    ChevronLeft as ChevronLeftIcon,
    MessagesSquare as ChatIcon,
    Pencil as PencilIcon,
    Search as SearchIcon,
    Trash2 as Trash2Icon,
    X as XIcon,
} from 'lucide-vue-next';
import { tdlibSend } from '../../utils/tdlib';
import { useAccountsStore } from '../../store/accounts';
import { useChatStore } from '../../store/chat';
import {
    deleteConversation,
    fmtTokens,
    loadAllConversations,
    openConversation,
    renameConversation,
    setAiConversationsAccount,
    type AiConversation,
} from '../../store/aiConversations';

const router = useRouter();
const { t } = useI18n();
const accountsStore = useAccountsStore();
const chatStore = useChatStore();

const items = ref<AiConversation[]>([]);
const loading = ref(true);
const query = ref('');
/** 正在重命名的对话 id；'' = 没有 */
const editingId = ref('');
const draftTitle = ref('');
/** 聊天标题缓存：chat_id → 标题（列表里只有 id，标题按需补，补不到就显示 id） */
const chatTitles = reactive<Record<number, string>>({});

/** 按 chat_id 分组，组内沿用后端给的更新时间倒序 */
const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const out = new Map<number, AiConversation[]>();
  for (const c of items.value) {
    const title = chatTitle(c.chatId);
    if (q && !c.title.toLowerCase().includes(q) && !title.toLowerCase().includes(q) && !String(c.chatId).includes(q)) continue;
    const list = out.get(c.chatId);
    if (list) list.push(c);
    else out.set(c.chatId, [c]);
  }
  return [...out.entries()].map(([chatId, list]) => ({ chatId, list }));
});

/** 该组的总请求次数（组头显示「N 个对话 · M 次请求」） */
const groupRequests = (list: AiConversation[]) => list.reduce((n, c) => n + c.usage.requests, 0);

function chatTitle(chatId: number): string {
  // 聊天列表里已有就直接用（不额外请求）
  const cached = chatStore.chats[chatId]?.title;
  if (cached && cached !== '…') return cached;
  return chatTitles[chatId] ?? String(chatId);
}

/** 列表里出现的聊天 id 逐个补标题（只补缺的，失败就保持 id 显示） */
async function fillChatTitles() {
  const ids = [...new Set(items.value.map((c) => c.chatId))];
  await Promise.all(
    ids.map(async (id) => {
      if (chatTitles[id] || (chatStore.chats[id]?.title && chatStore.chats[id]?.title !== '…')) return;
      try {
        const chat = await tdlibSend({ _: 'getChat', chat_id: id });
        if (chat?.title) chatTitles[id] = chat.title;
      } catch {
        // 聊天被删 / 取不到：保持显示 id，不影响管理
      }
    }),
  );
}

async function refresh() {
  loading.value = true;
  try {
    items.value = await loadAllConversations();
  } finally {
    loading.value = false;
  }
  await fillChatTitles();
}

function startRename(c: AiConversation) {
  editingId.value = c.id;
  draftTitle.value = c.title;
}

async function commitRename(c: AiConversation) {
  const title = draftTitle.value.trim();
  editingId.value = '';
  if (!title || title === c.title) return;
  try {
    await renameConversation(c.chatId, c.id, title);
    c.title = title;
  } catch (e) {
    await toast.error(String(e));
  }
}

async function remove(c: AiConversation) {
  if (!window.confirm(t('aiConversations.deleteConfirm', [c.title]))) return;
  try {
    await deleteConversation(c.chatId, c.id);
    await refresh();
  } catch (e) {
    await toast.error(String(e));
  }
}

/** 打开：设为该聊天的当前对话，然后跳到聊天里（不然「打开」看不出发生了什么） */
async function open(c: AiConversation) {
  try {
    await openConversation(c.chatId, c.id);
    await router.push(`/home/chat/${c.chatId}`);
  } catch (e) {
    await toast.error(String(e));
  }
}

/** 每行副标题：用量 + 最近更新时间 */
function metaOf(c: AiConversation): string {
  const parts = [t('aiConversations.requests', { n: c.usage.requests })];
  if (c.usage.inputTokens || c.usage.outputTokens) {
    parts.push(
      t('aiContext.input') + ' ' + fmtTokens(c.usage.inputTokens),
      t('aiContext.output') + ' ' + fmtTokens(c.usage.outputTokens),
    );
  }
  if (c.usage.contextLength > 0) {
    parts.push(t('aiConversations.ctxUsed', { used: fmtTokens(c.usage.lastInputTokens), limit: fmtTokens(c.usage.contextLength) }));
  }
  return parts.join(' · ');
}

const when = (ms: number) => (ms ? new Date(ms).toLocaleString() : '');

onMounted(() => {
  // 账号就绪可能晚于本页挂载：那时候按空账号拉会得到空列表，
  // 所以既在这里拉一次，也在账号变化时补拉（见上面的 watch）。
  setAiConversationsAccount(accountsStore.activeAccount?.id);
  if (accountsStore.activeAccount?.id !== undefined) void refresh();
});

/**
 * 账号比本页晚就绪的情形：拿到 id 后重新拉一次，
 * 否则会停在「空账号目录」的结果上，页面看着像没有对话。
 */
watch(
  () => accountsStore.activeAccount?.id,
  (id) => {
    if (id === undefined) return;
    setAiConversationsAccount(id);
    void refresh();
  },
);
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex items-center gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <button type="button" class="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                @click="router.back()">
                <ChevronLeftIcon class="h-5 w-5 text-gray-500" />
            </button>
            <h2 class="text-lg font-semibold">{{ t('aiConversations.allTitle') }}</h2>
            <div class="relative ml-auto w-56 shrink-0">
                <SearchIcon class="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input v-model="query" type="text" :placeholder="t('aiConversations.searchPh')"
                    class="w-full rounded-lg border border-gray-200 bg-white py-1.5 pr-7 pl-8 text-xs text-gray-900 outline-none focus:border-[var(--app-brand)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                <button v-if="query" type="button" :aria-label="t('lng_close')"
                    class="absolute top-1/2 right-2 grid h-4 w-4 -translate-y-1/2 place-items-center text-gray-400 hover:text-gray-600"
                    @click="query = ''">
                    <XIcon class="h-3 w-3" />
                </button>
            </div>
        </div>

        <div class="custom-scrollbar flex-1 overflow-y-auto p-6" v-smooth-wheel>
            <div class="mx-auto max-w-3xl">
                <LoadingSkeleton v-if="loading" class="py-2" :rows="5" :label="t('aiConversations.loading')" />
                <p v-else-if="!groups.length" class="py-8 text-center text-sm text-gray-400">
                    {{ t('aiConversations.allEmpty') }}</p>

                <!-- 按聊天分组：一个 chat_id 一块，下面是它的全部对话 -->
                <section v-for="g in groups" :key="g.chatId" class="mb-6">
                    <div class="mb-2 flex items-center gap-2">
                        <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            <ChatIcon class="h-3 w-3" :stroke-width="2" />
                        </span>
                        <button type="button"
                            class="min-w-0 cursor-pointer truncate text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
                            :title="t('aiConversations.gotoChat')"
                            @click="router.push(`/home/chat/${g.chatId}`)">
                            {{ chatTitle(g.chatId) }}
                        </button>
                        <span class="shrink-0 text-[11px] text-gray-400">
                            {{ t('aiConversations.groupMeta', { n: g.list.length, m: groupRequests(g.list) }) }}
                        </span>
                    </div>

                    <ul class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-700/60 dark:border-gray-700">
                        <li v-for="c in g.list" :key="c.id" class="flex items-center gap-3 px-3 py-2.5"
                            :class="c.active ? 'bg-[color-mix(in_srgb,var(--app-brand)_8%,transparent)]' : ''">
                            <div class="min-w-0 flex-1">
                                <input v-if="editingId === c.id" v-model="draftTitle" type="text"
                                    :aria-label="t('aiConversations.rename')"
                                    class="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-[var(--app-brand)] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    @keydown.enter.prevent="commitRename(c)" @keydown.esc.prevent="editingId = ''"
                                    @blur="commitRename(c)" />
                                <template v-else>
                                    <p class="truncate text-sm text-gray-900 dark:text-gray-100">
                                        {{ c.title }}
                                        <span v-if="c.active" class="ml-1 text-[11px] text-[var(--app-brand)]">
                                            {{ t('aiConversations.current') }}</span>
                                    </p>
                                    <p class="mt-0.5 truncate text-[11px] text-gray-400">
                                        {{ metaOf(c) }} <span v-if="c.updatedAt">· {{ when(c.updatedAt) }}</span>
                                    </p>
                                </template>
                            </div>
                            <div class="flex shrink-0 items-center gap-1">
                                <button type="button"
                                    class="cursor-pointer rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5"
                                    @click="open(c)">
                                    {{ t('aiConversations.open') }}
                                </button>
                                <button type="button" :aria-label="t('aiConversations.rename')"
                                    :title="t('aiConversations.rename')"
                                    class="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                    @click="startRename(c)">
                                    <PencilIcon class="h-3.5 w-3.5" :stroke-width="2" />
                                </button>
                                <button type="button" :aria-label="t('aiConversations.remove')"
                                    :title="t('aiConversations.remove')"
                                    class="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                                    @click="remove(c)">
                                    <Trash2Icon class="h-3.5 w-3.5" :stroke-width="2" />
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>
            </div>
        </div>
    </div>
</template>
