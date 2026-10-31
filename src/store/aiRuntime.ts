/**
 * AI 轮次的**后台托管**状态：一轮对话不再挂靠在聊天页组件上。
 *
 * 之前的问题（用户反馈的两条正好对应）：
 * 1. 流式每来一个增量就整块替换 `aiActivityEntries` 数组，活动条只有几行文本，
 *    却把整棵消息列表连同 ChatDetail 一起重渲染 —— 流式一开整个客户端卡顿；
 * 2. 轮次状态（entries / busy / abort / 待审核 Promise）全在 ChatDetail 的 setup 里，
 *    切走聊天时 `resetState()` 会 abort + `ai_chat_cancel`，回到那一页时要重新读历史、
 *    待审核的卡片还被当成「用户拒绝」收掉 —— 离开就等于任务没了。
 *
 * 现在：状态按 `chatId` 存在这里，跑轮次的 Promise 也由这里持有。
 * 页面只是**订阅者**：切走时只是退订（界面不画了），轮次照跑；切回来重新订阅，
 * 立刻看到这段时间的全部输出，还能接着审批。
 *
 * 这里只管「轮次的存活与状态」，不管 UI 怎么画（那是 components/ai/AiInputArea.vue 的事）。
 */
import { computed, reactive, ref } from 'vue';
import type { AiActivityEntry } from '../components/ai/AiActivityStrip.vue';
import type { ApprovalDecision, ApprovalGate, ApprovalRequest } from '../utils/aiTools/types';
import i18n from '../i18n';
import router from '../router';
import { toast } from '../utils/toast';

/** 待审批的一行（活动条底部那行「确认」） */
export interface AiApprovalLine {
  title: string;
  reason?: string;
}

/** 一轮 AI 的实时状态；一个聊天一份（同一聊天同时只有一轮，见 beginTurn 的守卫） */
export interface AiTurnState {
  chatId: number;
  /** 这个聊天当前选中的会话（活动条历史按它铺） */
  conversationId: string;
  /** 活动条条目（流式增量**就地改**这些对象，不整数组替换） */
  entries: AiActivityEntry[];
  /** 待审核的工具调用；null = 没有挂着的审核 */
  approval: AiApprovalLine | null;
  /** 这一轮还在跑 */
  busy: boolean;
  /** 最近一次错误（页面切回来也看得见，不只 toast 一闪） */
  error: string | null;
  /** 这一轮结束的时刻（收尾动画用；0 = 还没结束过） */
  finishedAt: number;
}

/** 一轮的票据：runAiTurn 结束时凭它确认「这次收尾的是不是我自己」 */
interface RunningTurn {
  token: number;
  controller: AbortController;
  /** 挂起中的审核：resolve 即放行 / 拒绝。**不随页面卸载而作废** */
  settleApproval: ((d: ApprovalDecision) => void) | null;
}

/**
 * 被用户主动停止的轮次 token。
 *
 * 停止后 runAiTurn 还会继续往外抛一个 abort 错误（invoke 被取消），
 * 那条路径不能当成「请求失败」报错、也不能弹「后台完成」—— 那是用户的主动操作。
 * 用 token 记一下，收尾时认出来。
 */
const abortedTokens = new Set<number>();

const emptyState = (chatId: number): AiTurnState => ({
  chatId,
  conversationId: '',
  entries: [],
  approval: null,
  busy: false,
  error: null,
  finishedAt: 0,
});

/** chatId → 轮次状态。按聊天隔离：A 聊天在跑时 B 聊天照样能发、能看自己的历史 */
const states = reactive(new Map<number, AiTurnState>());

/** chatId → 当前这一轮 */
const running = new Map<number, RunningTurn>();
let tokenSeq = 0;

/**
 * 正在看的聊天（由聊天页在路由变化时写进来）。
 * 只有**用户不在那个聊天上**时才弹后台提示 —— 正看着就不打扰（活动条已经说明一切）。
 */
let viewingChatId = 0;
export function setViewingChat(chatId: number | null): void {
  viewingChatId = chatId ?? 0;
}

/** 跳到某个聊天的 AI 输入框（提示里的「去看看」动作） */
function openChat(chatId: number): void {
  void router.push({ name: 'chat-detail', params: { id: String(chatId) } });
}

/**
 * 后台提示：用户已经离开那个聊天时才提示。
 *
 * - 待审批：一直等着的审核卡片，**必须**主动告诉用户 —— 否则这一轮永远卡在
 *   「等你点允许」上，用户还以为任务停了（正是这次要修的第二个问题）；
 * - 跑完：离开后才回来的结果给一条带跳转的提示，点一下回到那个聊天看输出。
 *
 * 不自动消失（duration 由 toast 的默认值控制，审批提示用较长时长），
 * 且同一聊天同一原因只弹一次（见 approvalNotified / finishedNotified）。
 */
const approvalNotified = new Set<number>();

function notifyApproval(chatId: number, title: string): void {
  if (chatId === viewingChatId || approvalNotified.has(chatId)) return;
  approvalNotified.add(chatId);
  const t = i18n.global.t;
  void toast.info({
    content: t('aiActivity.backgroundApproval', { title }),
    // 审批可能要等好一会儿，别几秒就消失
    duration: 15000,
    actionLabel: t('aiActivity.goToChat'),
    onAction: () => openChat(chatId),
  });
}

function notifyFinished(chatId: number): void {
  if (chatId === viewingChatId) return;
  const t = i18n.global.t;
  void toast.success({
    content: t('aiActivity.backgroundDone'),
    duration: 8000,
    actionLabel: t('aiActivity.goToChat'),
    onAction: () => openChat(chatId),
  });
}

/**
 * 正在跑的聊天 id（侧栏 / 全局提示用）
 */
const runningIds = ref<number[]>([]);
const syncRunningIds = () => {
  runningIds.value = [...running.keys()];
};

/**
 * 活动条是否处于展开状态。
 *
 * 为什么不放在页面的响应式依赖里：活动条展开会改变输入区高度，消息区底部留白要
 * **钉住不动**（展开只是临时盖上去看，不该把消息顶走）。聊天页只在 ResizeObserver
 * 回调里读它一次，不进渲染依赖，所以这里改值不会引起消息列表重渲染。
 */
export const aiStripExpanded = ref(false);

/** 取（或建）某聊天的轮次状态；页面订阅时也走它 */
export function turnState(chatId: number): AiTurnState {
  let s = states.get(chatId);
  if (!s) {
    s = reactive(emptyState(chatId));
    states.set(chatId, s);
  }
  return s;
}

/** 某聊天是否有跑着的轮次 */
export const isTurnRunning = (chatId: number): boolean => running.has(chatId);

/** 所有正在跑的聊天 id（响应式） */
export const aiRunningChats = computed(() => runningIds.value);

/** 所有「正等着用户点允许」的聊天（切走了也要能提醒用户回来处理） */
export const aiPendingApprovals = computed(() => {
  const out: { chatId: number; title: string }[] = [];
  for (const [chatId, s] of states) {
    if (s.approval) out.push({ chatId, title: s.approval.title });
  }
  return out;
});

/**
 * 新一轮：登记控制器，返回这一轮要用的句柄。
 * 同一聊天已有轮次在跑时返回 null（调用方据此提示「这一轮还没结束」）。
 */
export function beginTurn(chatId: number, conversationId: string): {
  token: number;
  controller: AbortController;
  gate: ApprovalGate;
  state: AiTurnState;
} | null {
  if (running.has(chatId)) return null;
  const controller = new AbortController();
  const token = ++tokenSeq;
  const s = turnState(chatId);
  s.conversationId = conversationId;
  s.busy = true;
  s.error = null;
  s.approval = null;
  s.finishedAt = 0;
  running.set(chatId, { token, controller, settleApproval: null });
  syncRunningIds();
  return { token, controller, gate: makeApprovalGate(chatId, token), state: s };
}

/**
 * 本轮的**审核通道**（作为 `approvalGate` 传给 runAiTurn）。
 *
 * 关键点：这个 Promise 的 resolve 存在 store 里（不在组件里），
 * 所以切走聊天、页面卸载、重新读历史都不会把它弄丢；切回来点「允许」照样放行。
 * 只有停止 / 收尾时才按拒绝收掉。
 */
function makeApprovalGate(chatId: number, token: number): ApprovalGate {
  return (req: ApprovalRequest) =>
    new Promise<ApprovalDecision>((resolve) => {
      const turn = running.get(chatId);
      // 这一轮已经被停止 / 已被新一轮取代：直接按拒绝回，别挂一个永远没人点的卡片
      if (!turn || turn.token !== token) {
        resolve({ granted: false, reason: '本轮已结束' });
        return;
      }
      // 上一张卡还没收（模型连发两个写类调用）：按拒绝收掉，别让前一个 Promise 悬着
      turn.settleApproval?.({ granted: false, reason: '被新的审核请求取代' });
      turn.settleApproval = resolve;
      turnState(chatId).approval = { title: req.summary, reason: req.reason };
      approvalNotified.delete(chatId);
      notifyApproval(chatId, req.summary);
    });
}

/**
 * 页面的审批回调：用户点了「允许 / 拒绝」。
 * 没有挂起的审批 = 已经被别处收过了，直接忽略。
 */
export function settleApproval(chatId: number, granted: boolean, reason?: string): void {
  const turn = running.get(chatId);
  const s = states.get(chatId);
  if (s) s.approval = null;
  if (!turn?.settleApproval) return;
  const settle = turn.settleApproval;
  turn.settleApproval = null;
  settle(granted ? { granted: true } : { granted: false, reason: reason ?? '用户拒绝' });
}

/**
 * 把这一轮的 Promise 交给 store 持有 —— **关键**：store 拿着它，页面卸载不会中断轮次。
 * 结束后统一收尾（busy=false、清待审核、记录错误）。
 */
export function trackTurn(
  chatId: number,
  token: number,
  promise: Promise<void>,
  onError?: (reason: string) => void,
): void {
  void promise.then(
    () => finishTurn(chatId, token, null),
    (e: unknown) => {
      // 用户自己按的停止：abort 会让 invoke 抛错，那不是故障，不报错也不重试
      if (abortedTokens.has(token)) {
        finishTurn(chatId, token, null);
        return;
      }
      const reason = e instanceof Error ? e.message : String(e);
      finishTurn(chatId, token, reason);
      onError?.(reason);
    },
  );
}

function finishTurn(chatId: number, token: number, error: string | null, stopped = false): void {
  const turn = running.get(chatId);
  // 这一轮已经收过尾了（stopTurn 抢先收尾、或同一轮重复回调）：什么都不做。
  // 否则会把用户刚发起的下一轮状态误清掉，也会重复弹「后台完成」。
  if (!turn) {
    abortedTokens.delete(token);
    return;
  }
  // 当前跑的是别的轮次（已被新一轮取代）：也别动
  if (turn.token !== token) return;
  running.delete(chatId);
  syncRunningIds();
  abortedTokens.delete(token);
  // 还挂着审核就是这一轮没走完（停止 / 异常）：按拒绝收掉，否则 Promise 永远悬着
  turn.settleApproval?.({ granted: false, reason: '本轮已结束' });
  approvalNotified.delete(chatId);
  const s = states.get(chatId);
  if (!s) return;
  s.busy = false;
  s.approval = null;
  s.error = error;
  s.finishedAt = Date.now();
  // 用户已经离开这个聊天、且不是自己按的停止：给一条带跳转的提示，别让人以为任务丢了
  // （自己停的不用提示 —— 那是用户的主动操作）
  if (!error && !stopped) notifyFinished(chatId);
}

/**
 * 停止某聊天的这一轮：abort 界面流 + 通知 Rust 真正中断请求。
 * `cancelBackend` 由调用方传（utils/aiChat 的 cancelAiStream），
 * 免得 store 反向依赖 aiChat（那样绕出一圈 import）。
 */
export function stopTurn(chatId: number, cancelBackend?: () => void): void {
  const turn = running.get(chatId);
  if (!turn) return;
  abortedTokens.add(turn.token);
  turn.controller.abort();
  cancelBackend?.();
  turn.settleApproval?.({ granted: false, reason: '用户已停止' });
  // 立刻收尾：用户可以马上发下一条，不用等上一轮的 Promise 落地。
  // stopped = true：自己停的不弹「后台完成」提示。
  finishTurn(chatId, turn.token, null, true);
}

/**
 * 换会话 / 重新进聊天时铺历史：只在**没有轮次在跑**时替换，
 * 否则会把这一轮已经吐出来的内容冲掉（历史是上一次落盘的，不含本轮未完成的部分）。
 */
export function replaceEntries(chatId: number, entries: AiActivityEntry[], conversationId: string): void {
  const s = turnState(chatId);
  s.conversationId = conversationId;
  if (running.has(chatId)) return;
  s.entries = entries;
  s.error = null;
  s.finishedAt = 0;
}

/** 清空某聊天的活动条（删会话 / 停止后重来时用） */
export function clearEntries(chatId: number): void {
  const s = states.get(chatId);
  if (!s || running.has(chatId)) return;
  s.entries = [];
  s.approval = null;
  s.error = null;
  s.finishedAt = 0;
}

/**
 * 轮次状态 → 活动条用的 sink：**就地**改条目对象。
 *
 * 这是卡顿的主因之一：之前每次增量都 `[...entries]` / `entries.map(...)` 建新数组，
 * 触发整棵组件树重渲染。条目对象是 reactive 的，就地改字段只让真正用到它的
 * 那个 DOM 节点更新。
 */
export function makeSink(chatId: number) {
  const s = turnState(chatId);
  return {
    add(entry: AiActivityEntry) {
      s.entries.push(entry);
    },
    update(id: string, patch: Partial<AiActivityEntry>) {
      const e = s.entries.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
    },
    remove(ids: readonly string[]) {
      const drop = new Set<string | number>(ids);
      for (let i = s.entries.length - 1; i >= 0; i--) {
        if (drop.has(s.entries[i].id)) s.entries.splice(i, 1);
      }
    },
  };
}
