import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import type {
  user,
  userFullInfo,
  chatPhoto,
  receivedGift,
  MessageSender,
  story,
  phoneNumberInfo,
} from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";
import { ensureUser, ensureChat } from "../utils/senderInfo";

/**
 * 个人资料页状态管理（Pinia setup store）。
 *
 * 负责按 userId 拉取并缓存个人资料页所需的全部数据：
 *   - 基础用户信息（复用 senderInfo 的 getUser 缓存）
 *   - 完整信息（getUserFullInfo：bio、个人/公开照片、商业信息、礼物数、共同群组数等）
 *   - 个人照片墙（getUserProfilePhotos）
 *   - 礼物列表（getReceivedGifts）
 *   - 共同群组（getGroupsInCommon）
 *   - 动态列表（getChatActiveStories + getChatPostedToChatPageStories）
 *
 * 每个 userId 独立维护 `loading` 等状态，切换个人资料页互不干扰。
 */
export const useUserProfileStore = defineStore("userProfile", () => {
  /** 每个用户的基础信息（user）缓存 */
  const users = reactive(new Map<number, user>());
  /** 每个用户的完整信息（userFullInfo）缓存 */
  const fullInfos = reactive(new Map<number, userFullInfo>());
  /** 每个用户的个人照片墙 */
  const photos = reactive(new Map<number, chatPhoto[]>());
  /** 每个用户的礼物列表 */
  const gifts = reactive(new Map<number, receivedGift[]>());
  /** 每个用户的共同群组（chat id 列表） */
  const commonGroups = reactive(new Map<number, number[]>());
  /** 每个用户的动态列表（普通动态 + 归档动态合并，按日期倒序） */
  const stories = reactive(new Map<number, story[]>());
  /** 每个用户的普通（活跃）动态 */
  const activeStories = reactive(new Map<number, story[]>());
  /** 每个用户的归档动态 */
  const archivedStories = reactive(new Map<number, story[]>());

  /** 是否正在加载（按 userId） */
  const loading = reactive(new Map<number, boolean>());
  /** 是否加载完成（按 userId） */
  const loaded = reactive(new Map<number, boolean>());
  /** 是否加载出错（按 userId） */
  const error = reactive(new Map<number, boolean>());

  /** 进行中的请求（避免重复请求同一用户） */
  const pending = new Map<number, Promise<void>>();

  /** 当前正在查看的资料页用户 id（可选，用于高亮/日志） */
  const activeUserId = ref<number | undefined>(undefined);

  /** 获取用户基础信息（自 senderInfo 缓存，未命中则请求） */
  async function fetchUser(userId: number): Promise<void> {
    await ensureUser(userId);
    const u = (await tdlibSend({ _: "getUser", user_id: userId })) as user;
    users.set(userId, u);
  }

  /** 获取用户完整信息 */
  async function fetchFullInfo(userId: number): Promise<userFullInfo | undefined> {
    try {
      const info = (await tdlibSend({ _: "getUserFullInfo", user_id: userId })) as userFullInfo;
      fullInfos.set(userId, info);
      return info;
    } catch (e) {
      console.error("Failed to fetch user full info", e);
      return undefined;
    }
  }

  /** 获取个人照片墙 */
  async function fetchPhotos(userId: number): Promise<void> {
    try {
      const res = (await tdlibSend({ _: "getUserProfilePhotos", user_id: userId, offset: 0, limit: 100 })) as {
        photos: chatPhoto[];
      };
      photos.set(userId, res.photos ?? []);
    } catch (e) {
      console.error("Failed to fetch user profile photos", e);
    }
  }

  /** 获取用户收到的礼物（保存到个人资料页的） */
  async function fetchGifts(userId: number): Promise<void> {
    try {
      const owner: MessageSender = { _: "messageSenderUser", user_id: userId };
      const res = (await tdlibSend({
        _: "getReceivedGifts",
        owner_id: owner,
        exclude_unsaved: true,
        exclude_saved: false,
        exclude_unlimited: false,
        offset: "",
        limit: 100,
      })) as { gifts: receivedGift[] };
      gifts.set(userId, res.gifts ?? []);
    } catch (e) {
      console.error("Failed to fetch user gifts", e);
    }
  }

  /** 获取共同群组 */
  async function fetchCommonGroups(userId: number): Promise<void> {
    try {
      const res = (await tdlibSend({
        _: "getGroupsInCommon",
        user_id: userId,
        offset_chat_id: 0,
        limit: 100,
      })) as { chat_ids: number[] };
      const ids = res.chat_ids ?? [];
      commonGroups.set(userId, ids);
      // 预取聊天信息以便显示标题/头像
      await Promise.all(ids.map((id) => ensureChat(id).catch(() => { })));
    } catch (e) {
      console.error("Failed to fetch common groups", e);
    }
  }

  /** 获取用户动态列表（普通动态 + 归档动态，用于资料页动态区展示） */
  async function fetchStories(userId: number): Promise<void> {
    try {
      // 先拿私聊 chat id
      const privateChat = (await tdlibSend({
        _: "createPrivateChat",
        user_id: userId,
        force: false,
      }).catch(() => undefined)) as { id?: number } | undefined;
      const chatId = privateChat?.id;
      if (!chatId) return;

      // 1. 普通动态：getChatPostedToChatPageStories 返回用户发布到主页的动态（完整 story[]）
      //    —— 这是个人资料页真正展示的「当前动态区」（对查看他人资料页有效，无需管理员权限）。
      let fullActive: story[] = [];
      try {
        const page = (await tdlibSend({
          _: "getChatPostedToChatPageStories",
          chat_id: chatId,
          from_story_id: 0,
          limit: 100,
        })) as { stories: story[] };
        fullActive = page.stories ?? [];
      } catch (e) { /* 忽略：无主页动态 */ }

      // 2. 归档动态：getChatArchivedStories 返回的历史动态（完整 story[]，通常需管理员权限，
      //    对他人资料页多为空），去重掉已在主页展示过的动态，避免重复。
      const pageIds = new Set<number>(fullActive.map((s) => s.id));
      const fullArchived: story[] = [];
      try {
        const archived = (await tdlibSend({
          _: "getChatArchivedStories",
          chat_id: chatId,
          from_story_id: 0,
          limit: 100,
        })) as { stories: story[] };
        for (const s of archived.stories) {
          if (!pageIds.has(s.id)) {
            fullArchived.push(s);
          }
        }
      } catch (e) { /* 忽略 */ }

      // 分别按发布日期倒序
      fullActive.sort((a, b) => b.date - a.date);
      fullArchived.sort((a, b) => b.date - a.date);
      activeStories.set(userId, fullActive);
      archivedStories.set(userId, fullArchived);
      // 合并（普通动态在前，归档动态在后），供需要合并展示的场景使用
      stories.set(userId, [...fullActive, ...fullArchived]);
    } catch (e) {
      // 忽略：无法获取动态时不阻塞
      console.error("Failed to fetch user stories", e);
    }
  }

  /** 拉取单个用户的全部个人资料数据 */
  async function loadProfile(userId: number): Promise<void> {
    activeUserId.value = userId;
    if (loaded.get(userId)) return;
    const inFlight = pending.get(userId);
    if (inFlight) return inFlight;
    loading.set(userId, true);
    error.set(userId, false);
    const p = (async () => {
      try {
        await Promise.all([
          fetchUser(userId),
          fetchFullInfo(userId),
          fetchPhotos(userId),
          fetchGifts(userId),
          fetchCommonGroups(userId),
          fetchStories(userId),
        ]);
        loaded.set(userId, true);
      } catch (e) {
        error.set(userId, true);
        console.error("Failed to load profile", e);
      } finally {
        loading.set(userId, false);
        pending.delete(userId);
      }
    })();
    pending.set(userId, p);
    return p;
  }

  /** 刷新单个用户的全部数据（重新拉取） */
  async function refreshProfile(userId: number): Promise<void> {
    loaded.delete(userId);
    photos.delete(userId);
    gifts.delete(userId);
    commonGroups.delete(userId);
    stories.delete(userId);
    await loadProfile(userId);
  }

  /**
   * 订阅 TDLib 推送，保持资料页实时更新（不轮询）。
   * 服务端一推送 update 就刷新对应缓存的 user / userFullInfo / status / accent 色。
   */
  let updatesInitialized = false;
  async function initUserProfileUpdates(): Promise<void> {
    if (updatesInitialized) return;
    updatesInitialized = true;
    const { listen } = await import("@tauri-apps/api/event");
    await listen<TdlibUpdatePayload>("tdlib-update", (event) => {
      const update = event.payload;
      if (!update || typeof update !== "object") return;
      const type_ = (update as any)._;
      // 用户基础数据变更 → 刷新 user 缓存
      if (type_ === "updateUser" && (update as any).user?.id) {
        users.set((update as any).user.id, (update as any).user);
      }
      // 用户完整资料变更 → 刷新 userFullInfo 缓存
      else if (type_ === "updateUserFullInfo" && typeof (update as any).user_id === "number") {
        fullInfos.set((update as any).user_id, (update as any).user_full_info);
      }
      // 在线状态变更 → 更新 user.status（若在缓存中）
      else if (type_ === "updateUserStatus" && typeof (update as any).user_id === "number") {
        const uid = (update as any).user_id as number;
        const u = users.get(uid);
        if (u && (update as any).status) {
          u.status = (update as any).status;
        }
      }
      // 名称/头像主题色变更
      else if (type_ === "updateUserAccentColor" && typeof (update as any).user_id === "number") {
        const u = users.get((update as any).user_id);
        if (u && typeof (update as any).accent_color_id === "number") {
          u.accent_color_id = (update as any).accent_color_id;
        }
      } else if (type_ === "updateUserProfileAccentColor" && typeof (update as any).user_id === "number") {
        const u = users.get((update as any).user_id);
        if (u && typeof (update as any).profile_accent_color_id === "number") {
          u.profile_accent_color_id = (update as any).profile_accent_color_id;
        }
      }
      // 用户 emoji 状态变更
      else if (type_ === "updateUserEmojiStatus" && typeof (update as any).user_id === "number") {
        const u = users.get((update as any).user_id);
        if (u) {
          u.emoji_status = (update as any).emoji_status;
        }
      }
    });
  }

  /** 电话号码格式化信息（匿名号判断 / 国家与运营商）；失败返回 undefined */
  async function getPhoneInfo(userId: number): Promise<phoneNumberInfo | undefined> {
    const u = users.get(userId);
    const phone = u?.phone_number;
    if (!phone) return undefined;
    try {
      const info = (await tdlibSend({
        _: "getPhoneNumberInfoSync",
        phone_number_prefix: phone,
      })) as phoneNumberInfo;
      return info;
    } catch (e) {
      console.error("Failed to get phone number info", e);
      return undefined;
    }
  }

  return {
    users,
    fullInfos,
    photos,
    gifts,
    commonGroups,
    stories,
    activeStories,
    archivedStories,
    loading,
    loaded,
    error,
    activeUserId,
    loadProfile,
    refreshProfile,
    fetchUser,
    fetchFullInfo,
    initUserProfileUpdates,
    getPhoneInfo,
  };
});

/** TDLib update 事件的松散类型（扩展自 senderInfo 的 TdlibUpdate） */
interface TdlibUpdatePayload {
  _?: string;
  [key: string]: unknown;
}
