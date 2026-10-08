import { reactive, ref } from "vue";
import type { chatActiveStories, story, Updates } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";
import { onTdlibUpdate } from "./tdlibBus";
import { openStoryViewer } from "./storyViewer";

/**
 * 动态（Story）圆环状态：按 chat_id 维护「是否有活跃动态 / 是否有未读 / 是否直播」。
 *
 * 数据来源（全部来自 TDLib，不轮询）：
 *   - updateChatActiveStories → 实时更新（属于 tdlib-chat 通道）
 *   - getCurrentState         → 启动时补种：早期推送在前端订阅前已下发且不重发
 *   - loadActiveStories       → 翻页多拉（主/归档列表）
 *   - getChatActiveStories    → 按需拉取单个对话（打开动态前补齐）
 *
 * 已读判断：TDLib 只给 max_read_story_id，未读 = 存在 story_id > max_read_story_id 的动态
 * （与 Unigram ChatActiveStoriesExtensions.CountUnread 一致）。查看动态后由 StoryViewer
 * 调用 markStoriesRead 做本地即时反馈（圆环立即变灰），服务端推送随后兜底。
 */

export interface ChatStoryState {
  unread: boolean;
  live: boolean;
  /** 该对话当前可见的动态数量 */
  count: number;
}

interface ChatStoryEntry {
  unread: boolean;
  live: boolean;
  count: number;
  /** 排序权重：越大越靠前（chatActiveStories.order） */
  order: number;
  /** 已读到的动态 id（服务端） */
  maxReadId: number;
  /** 本地已整段查看过：圆环立即变灰，直到服务端推送新状态覆盖 */
  localRead: boolean;
  /** 本地已查看的动态 id（逐条打开时记录，全部看完才算已读） */
  viewedIds: Set<number>;
  /** 该对话的动态 id 全量（用于判断是否全部看完） */
  storyIds: Set<number>;
}

const byChat = reactive(new Map<number, ChatStoryEntry>());

/** 用户 id → 动态所在 chat_id（个人资料页按 user 显示圆环用） */
const chatToUser = reactive(new Map<number, number>());

/** 写入/合并一个 chatActiveStories（保留本地已读标记） */
function setActiveStories(a: chatActiveStories, userId?: number) {
  const prev = byChat.get(a.chat_id);
  const infos = a.stories ?? [];
  const maxReadId = a.max_read_story_id ?? 0;

  let unread = false;
  for (const s of infos) {
    if (s.story_id > maxReadId && !prev?.viewedIds.has(s.story_id)) unread = true;
  }

  if (!infos.length && !unread) {
    byChat.delete(a.chat_id);
    return;
  }
  if (userId) chatToUser.set(a.chat_id, userId);
  byChat.set(a.chat_id, {
    unread: unread && !prev?.localRead,
    live: infos.some((s) => s.is_live),
    count: infos.length,
    order: a.order ?? 0,
    maxReadId,
    localRead: prev?.localRead ?? false,
    viewedIds: prev?.viewedIds ?? new Set<number>(),
    storyIds: new Set(infos.map((s) => s.story_id)),
  });
}

/** 按 user_id 查动态状态（个人资料页用） */
export function getUserStoryState(userId: number | undefined | null): ChatStoryState | null {
  if (!userId) return null;
  for (const [chatId, e] of byChat) {
    if (chatToUser.get(chatId) === userId) {
      return { unread: e.unread, live: e.live, count: e.count };
    }
  }
  return null;
}

/** 该用户是否已在动态表中（含已读） */
export function hasUserStories(userId: number | undefined | null): boolean {
  if (!userId) return false;
  for (const [chatId] of byChat) {
    if (chatToUser.get(chatId) === userId) return true;
  }
  return false;
}

/** 已解析的 用户 id → 私聊 chat_id */
export function getUserChatId(userId: number | undefined | null): number | undefined {
  if (!userId) return undefined;
  for (const [chatId, uid] of chatToUser) if (uid === userId) return chatId;
  return undefined;
}

/** 用户 id → 私聊 chat_id（缓存） */
const userChats = reactive(new Map<number, number>());

/** 解析某用户的私聊 chat_id */
export async function resolveUserChatId(userId: number): Promise<number | undefined> {
  if (userChats.has(userId)) return userChats.get(userId);
  try {
    const chat = (await tdlibSend({ _: "createPrivateChat", user_id: userId, force: false })) as {
      id?: number;
    };
    if (chat?.id) {
      userChats.set(userId, chat.id);
      return chat.id;
    }
  } catch {
    /* 忽略 */
  }
  return undefined;
}

/** 拉取某用户（私聊）的动态状态，个人资料页挂载时调用 */
export async function ensureUserStories(userId: number): Promise<void> {
  const chatId = await resolveUserChatId(userId);
  if (!chatId) return;
  try {
    const res = (await tdlibSend({ _: "getChatActiveStories", chat_id: chatId })) as chatActiveStories;
    setActiveStories(res, userId);
  } catch {
    /* 忽略 */
  }
}

/** 当前对话的动态状态；无活跃动态返回 null */
export function getChatStoryState(chatId: number | undefined | null): ChatStoryState | null {
  if (!chatId) return null;
  const e = byChat.get(chatId);
  if (!e) return null;
  return { unread: e.unread, live: e.live, count: e.count };
}

/**
 * 所有**仍有活跃动态**的对话（含已看完的），按 order 倒序。
 * 看完不摘除、只变灰，所以这里不能按 unread 过滤。
 */
export function getActiveStoryChatIds(): number[] {
  return [...byChat.keys()].sort((a, b) => {
    const ea = byChat.get(a)!;
    const eb = byChat.get(b)!;
    return eb.order - ea.order || b - a;
  });
}

/** 是否存在活跃动态（标题栏叠加是否显示） */
export function hasAnyStories(): boolean {
  return byChat.size > 0;
}

/** 逐条查看动态后本地即时标记（服务端 update 到达前的反馈） */
export function markStoriesRead(chatId: number, storyIds: number[]) {
  const e = byChat.get(chatId);
  if (!e || e.localRead) return;
  for (const id of storyIds) e.viewedIds.add(id);
  // 全部动态都已看过才算读：圆环立即变灰
  if (e.storyIds.size > 0 && [...e.storyIds].every((id) => e.viewedIds.has(id))) {
    e.localRead = true;
  }
  e.unread = e.unread && !e.localRead;
}

/** 拉取单个对话的活跃动态并写入状态（打开动态前补齐用）；返回完整动态列表 */
export async function fetchChatActiveStories(chatId: number): Promise<story[]> {
  let res: chatActiveStories;
  try {
    res = (await tdlibSend({ _: "getChatActiveStories", chat_id: chatId })) as chatActiveStories;
    setActiveStories(res);
  } catch {
    return [];
  }
  // chatActiveStories.stories 只是 storyInfo，需 getStory 补全后才能交给播放器
  const infos = res.stories ?? [];
  const full = await Promise.all(
    infos.map((s) =>
      tdlibSend({ _: "getStory", story_poster_chat_id: chatId, story_id: s.story_id }).catch(() => undefined),
    ),
  );
  return full.filter((s): s is story => !!s);
}

/**
 * 打开动态播放器（供头像/圆环点击）。
 * chatId 缺省时：先按 userId 解析私聊，再回退到当前用户的私聊。
 */
export async function openChatStories(
  chatId?: number | null,
  startIndex = 0,
  userId?: number | null,
) {
  let id = chatId ?? undefined;
  if (!id && userId) id = await resolveUserChatId(userId);
  if (!id) id = await getSelfChatId();
  if (!id) return;
  const list = await fetchChatActiveStories(id);
  if (!list.length) return;
  openStoryViewer(list, startIndex);
}

// ===== 当前用户的私聊（自己的动态） =====

let selfChatId: number | undefined;
let selfChatPromise: Promise<number | undefined> | null = null;
/** 响应式镜像：`selfChatId` 解析完成后驱动标题栏圆环重新计算 */
const selfChatIdRef = ref<number | undefined>(undefined);

/** 当前用户的私聊 chat id（Saved Messages / 自己的动态所在对话），缓存 */
export async function getSelfChatId(): Promise<number | undefined> {
  if (selfChatId) return selfChatId;
  if (selfChatPromise) return selfChatPromise;
  selfChatPromise = (async () => {
    try {
      const me = (await tdlibSend({ _: "getMe" })) as { id?: number };
      if (!me?.id) return undefined;
      const chat = (await tdlibSend({ _: "createPrivateChat", user_id: me.id, force: false })) as {
        id?: number;
      };
      selfChatId = chat?.id;
      selfChatIdRef.value = selfChatId;
      return selfChatId;
    } catch {
      return undefined;
    } finally {
      selfChatPromise = null;
    }
  })();
  return selfChatPromise;
}

/** 当前用户是否有活跃动态（标题栏自己的头像是否画环） */
export function getSelfStoryState(): ChatStoryState | null {
  return getChatStoryState(selfChatIdRef.value);
}

/** 已解析到自己的私聊时同步返回（未解析返回 undefined） */
export function getResolvedSelfChatId(): number | undefined {
  return selfChatIdRef.value;
}

/** 解析自己的私聊并拉取其动态状态（标题栏挂载时调用一次） */
export async function ensureSelfStories(): Promise<void> {
  const id = await getSelfChatId();
  if (id) await fetchChatActiveStories(id);
}

let initialized = false;

/** 注册 update 监听并从当前状态补齐种子（幂等；需在授权就绪后调用） */
export async function initStoryRing(): Promise<void> {
  if (initialized) return;
  initialized = true;

  onTdlibUpdate("chat", (update) => {
    if (!update || typeof update !== "object") return;
    if (update._ === "updateChatActiveStories" && (update as any).active_stories) {
      setActiveStories((update as any).active_stories as chatActiveStories);
    }
  });

  // 补齐启动早期错过的推送。
  //
  // `updateChatActiveStories` 只在状态变化时推一次，TDLib 不重发；前端总线在 bootstrap
  // 之后才订阅，启动时随对话列表下发的那批会永久丢失（loadActiveStories 只翻页、不重发，
  // 全部加载完还会直接返回 404）。Unigram 不会有这问题，因为它的 update 循环从客户端
  // 启动就订阅。这里用 getCurrentState 的当前全量快照做种子——与 store/colors.ts 播种
  // accent 色是同一套路。
  //
  // 只填空缺：订阅之后到达的推送一定比快照新，不覆盖。
  try {
    const state = (await tdlibSend({ _: "getCurrentState" })) as Updates;
    for (const update of state?.updates ?? []) {
      if (
        update &&
        (update as any)._ === "updateChatActiveStories" &&
        (update as any).active_stories &&
        !byChat.has((update as any).active_stories.chat_id)
      ) {
        setActiveStories((update as any).active_stories as chatActiveStories);
      }
    }
  } catch (e) {
    console.warn("[storyRing] 从 getCurrentState 播种动态状态失败", e);
  }

  // 翻页拉取（主列表 + 归档列表；TDLib 无 storyListContacts；已加载完会返回 404，忽略）
  for (const list of ["storyListMain", "storyListArchive"]) {
    try {
      await tdlibSend({ _: "loadActiveStories", story_list: { _: list } } as never);
    } catch {
      /* 404 / 无权限：忽略 */
    }
  }
}
