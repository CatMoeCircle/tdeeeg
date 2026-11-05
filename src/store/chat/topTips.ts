import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { onTdlibUpdate, type TdlibUpdate } from "../session/tdlibBus";
import { tdlibSend } from "../../utils/session/tdlib";
import type {
    SuggestedAction,
    UserPrivacySettingRule,
    closeBirthdayUser,
    unconfirmedSession as UnconfirmedSession,
    updateContactCloseBirthdays as UpdateContactCloseBirthdays,
    updateFreezeState as FreezeState,
    updateSuggestedActions as UpdateSuggestedActions,
    updateUnconfirmedSession as UpdateUnconfirmedSession,
} from "tdlib-types";

/**
 * 对话列表顶部的提示卡片。
 *
 * 列表内的卡片同一时刻只显示一张，优先级：冻结 > 未确认登录 > 设置自己的生日。
 * 联系人生日单独走列表顶部的横幅（可与音乐播放条合并）。
 * 所有状态都来自 TDLib 的 update，客户端不做乐观增删：
 * 关闭卡片只是发请求，卡片要等服务端回声（removed_actions / session = null）才消失。
 */
export type TopTipKind = "frozen" | "unconfirmed" | "birthday";

/** 顶部生日卡片里的一行 */
export interface BirthdayRow {
    userId: number;
    month: number;
    day: number;
}

/** 生日建议在 suggestedAction 里的类型名（无参数，可直接当 key） */
const BIRTHDAY_ACTION = "suggestedActionSetBirthdate";

/** 生日卡片最多显示几行，避免联系人扎堆过生日时把列表顶没 */
const MAX_BIRTHDAY_ROWS = 8;

/**
 * suggestedAction 的集合键。
 * 无参类型用 `_`；带参类型必须把参数拼进去，否则不同参数会被当成同一条。
 */
function actionKey(action: SuggestedAction): string {
    switch (action._) {
        case "suggestedActionSetPassword":
            return `${action._}:${action.authorization_delay}`;
        case "suggestedActionConvertToBroadcastGroup":
            return `${action._}:${action.supergroup_id}`;
        case "suggestedActionCustom":
            return `${action._}:${action.name}`;
        default:
            return action._;
    }
}

/**
 * 一年中的第几天（0 起）。
 * 用闰年做基准，保证 2 月 29 日也能正确计算。
 */
function dayOfYear(month: number, day: number): number {
    const start = Date.UTC(2000, 0, 1);
    return Math.round((Date.UTC(2000, month - 1, day) - start) / 86400000);
}

/** 两个生日列表是否包含同一批用户（顺序无关） */
function sameUserIds(a: closeBirthdayUser[], b: closeBirthdayUser[]): boolean {
    if (a.length !== b.length) return false;
    const ids = new Set(b.map((item) => item.user_id));
    return a.every((item) => ids.has(item.user_id));
}

/**
 * Rust 侧缓存的快照（get_cached_top_tips）。
 * 这些 update 都是边沿触发的，webview 被销毁期间到达的会丢，重建后靠它补齐。
 */
interface TopTipsSnapshot {
    suggestedActions?: SuggestedAction[];
    unconfirmedSession?: UnconfirmedSession | null;
    unconfirmedSessionCount?: number;
    freezeState?: FreezeState | null;
    closeBirthdays?: closeBirthdayUser[];
}

export const useTopTipsStore = defineStore("topTips", () => {
    /** 当前建议动作集合。updateSuggestedActions 是增量更新，必须自己维护 */
    const suggestedActions = ref(new Map<string, SuggestedAction>());

    /** 最近一次 updateUnconfirmedSession 里的会话（可能为 null） */
    const unconfirmed = ref<UnconfirmedSession | null>(null);
    /** 待确认会话总数（session 只是其中第一个） */
    const unconfirmedCount = ref(0);

    /** 最近一次 updateFreezeState */
    const freeze = ref<FreezeState | null>(null);
    /** 用户手动关掉冻结卡片；冻结状态变化后重置 */
    const frozenDismissed = ref(false);

    /** 近期/即将过生日的联系人（updateContactCloseBirthdays） */
    const closeBirthdays = ref<closeBirthdayUser[]>([]);
    /** 用户点了“隐藏”：本地先隐藏，TDLib 侧同时隐藏 24 小时 */
    const birthdaysDismissed = ref(false);

    const hasBirthdaySuggestion = computed(() => suggestedActions.value.has(BIRTHDAY_ACTION));
    const isFrozen = computed(() => freeze.value?.is_frozen === true);

    /**
     * 今天过生日的联系人。
     * TDLib 的 updateContactCloseBirthdays 给的是「所有填了生日的联系人」，
     * 所以由客户端按本地日期筛出今天这一批。
     */
    const birthdayRows = computed<BirthdayRow[]>(() => {
        const now = new Date();
        const todayDoy = dayOfYear(now.getMonth() + 1, now.getDate());

        const rows: BirthdayRow[] = [];
        for (const item of closeBirthdays.value) {
            if (dayOfYear(item.birthdate.month, item.birthdate.day) !== todayDoy) continue;
            rows.push({
                userId: item.user_id,
                month: item.birthdate.month,
                day: item.birthdate.day,
            });
            if (rows.length === MAX_BIRTHDAY_ROWS) break;
        }
        return rows;
    });

    /**
     * 未确认会话的 session_id。
     * 设备会话的 id 在 sessionTypeDevice 里；业务机器人会话没有这个字段，返回 null。
     */
    const unconfirmedSessionId = computed<string | null>(() => {
        const session = unconfirmed.value;
        if (!session) return null;
        return session.type?._ === "sessionTypeDevice" ? session.type.session_id : null;
    });

    /** 今天有联系人生日：显示在列表顶部（可与音乐条合并成一张卡） */
    const showBirthdayBanner = computed(() => birthdayRows.value.length > 0 && !birthdaysDismissed.value);

    const topTip = computed<TopTipKind | null>(() => {
        if (isFrozen.value && !frozenDismissed.value) return "frozen";
        if (unconfirmed.value) return "unconfirmed";
        if (hasBirthdaySuggestion.value) return "birthday";
        return null;
    });

    /** 冻结状态每次变化都重新给用户一次提醒机会 */
    watch(freeze, () => {
        frozenDismissed.value = false;
    });

    // ---------------------------------------------------------------------
    // TDLib → 本地状态
    // ---------------------------------------------------------------------

    function handleUpdate(update: TdlibUpdate) {
        liveVersion++;
        switch (update._) {
            case "updateSuggestedActions": {
                const payload = update as unknown as UpdateSuggestedActions;
                const next = new Map(suggestedActions.value);
                for (const action of payload.removed_actions ?? []) {
                    next.delete(actionKey(action));
                }
                for (const action of payload.added_actions ?? []) {
                    next.set(actionKey(action), action);
                }
                // 换新 Map 才会触发响应式
                suggestedActions.value = next;
                break;
            }
            case "updateUnconfirmedSession": {
                const payload = update as unknown as UpdateUnconfirmedSession;
                unconfirmed.value = payload.session ?? null;
                unconfirmedCount.value = payload.unconfirmed_session_count ?? 0;
                break;
            }
            case "updateFreezeState": {
                freeze.value = update as unknown as FreezeState;
                break;
            }
            case "updateContactCloseBirthdays": {
                const payload = update as unknown as UpdateContactCloseBirthdays;
                const next = payload.close_birthday_users ?? [];
                // 只有名单真的变了才重新展示，避免隐藏后同一批数据又把卡片顶回来
                if (!sameUserIds(next, closeBirthdays.value)) {
                    birthdaysDismissed.value = false;
                }
                closeBirthdays.value = next;
                break;
            }
        }
    }

    /** 退出登录 / 会话关闭时清空，避免换号后残留上一个账号的卡片 */
    function handleAuth(update: TdlibUpdate) {
        liveVersion++;
        switch (update._) {
            case "authorizationStateLoggingOut":
            case "authorizationStateClosed":
            case "authorizationStateWaitPhoneNumber":
                reset();
                break;
        }
    }

    let unsubscribeOther: (() => void) | null = null;
    let unsubscribeAuth: (() => void) | null = null;
    /** 已处理的实时 update 数：用于判断快照是否已过时 */
    let liveVersion = 0;

    /** 把 Rust 快照写入本地状态 */
    function applySnapshot(snapshot: TopTipsSnapshot) {
        const actions = new Map<string, SuggestedAction>();
        for (const action of snapshot.suggestedActions ?? []) {
            actions.set(actionKey(action), action);
        }
        suggestedActions.value = actions;
        unconfirmed.value = snapshot.unconfirmedSession ?? null;
        unconfirmedCount.value = snapshot.unconfirmedSessionCount ?? 0;
        freeze.value = snapshot.freezeState ?? null;
        closeBirthdays.value = snapshot.closeBirthdays ?? [];
    }

    async function init() {
        if (unsubscribeOther) return;

        // 先订阅，避免 invoke 往返期间漏掉 update
        unsubscribeOther = onTdlibUpdate("other", handleUpdate);
        unsubscribeAuth = onTdlibUpdate("auth", handleAuth);

        // 再从 Rust 补齐：这些 update 是边沿触发的，webview 被销毁期间到达的会丢
        const version = liveVersion;
        try {
            const snapshot = await invoke<TopTipsSnapshot | null>("get_cached_top_tips");
            // 期间已有实时 update，说明快照可能更旧，跳过
            if (snapshot && liveVersion === version) {
                applySnapshot(snapshot);
            }
        } catch (e) {
            console.warn("[topTips] load cached state failed:", e);
        }
    }

    function destroy() {
        unsubscribeOther?.();
        unsubscribeAuth?.();
        unsubscribeOther = null;
        unsubscribeAuth = null;
    }

    function reset() {
        suggestedActions.value = new Map();
        unconfirmed.value = null;
        unconfirmedCount.value = 0;
        freeze.value = null;
        frozenDismissed.value = false;
        closeBirthdays.value = [];
        birthdaysDismissed.value = false;
    }

    // ---------------------------------------------------------------------
    // 本地状态 → TDLib
    // ---------------------------------------------------------------------

    /** 隐藏生日建议：只发请求，等 updateSuggestedActions 把卡片撤掉 */
    async function hideBirthday() {
        await tdlibSend({
            _: "hideSuggestedAction",
            action: { _: "suggestedActionSetBirthdate" },
        });
    }

    /** 写入生日；year = 0 表示不公开年份 */
    async function setBirthdate(day: number, month: number, year: number) {
        await tdlibSend({
            _: "setBirthdate",
            birthdate: { _: "birthdate", day, month, year },
        });
    }

    /** 读取“谁能看到生日”的第一条规则，用于弹窗里的展示 */
    async function fetchBirthdateVisibility(): Promise<UserPrivacySettingRule | null> {
        const result = await tdlibSend({
            _: "getUserPrivacySettingRules",
            setting: { _: "userPrivacySettingShowBirthdate" },
        });
        return result.rules?.[0] ?? null;
    }

    /** 确认未确认会话（“是我”） */
    async function confirmUnconfirmedSession() {
        const sessionId = unconfirmedSessionId.value;
        if (!sessionId) return;
        await tdlibSend({ _: "confirmSession", session_id: sessionId });
    }

    /** 终止未确认会话（“不是我”） */
    async function terminateUnconfirmedSession() {
        const sessionId = unconfirmedSessionId.value;
        if (!sessionId) return;
        await tdlibSend({ _: "terminateSession", session_id: sessionId });
    }

    function dismissFrozen() {
        frozenDismissed.value = true;
    }

    /** 隐藏生日卡片：本地立即隐藏，同时让 TDLib 隐藏 24 小时 */
    async function hideContactBirthdays() {
        birthdaysDismissed.value = true;
        try {
            await tdlibSend({ _: "hideContactCloseBirthdays" });
        } catch (e) {
            birthdaysDismissed.value = false;
            throw e;
        }
    }

    return {
        // 状态
        suggestedActions,
        unconfirmed,
        unconfirmedCount,
        freeze,
        closeBirthdays,
        birthdayRows,
        showBirthdayBanner,
        hasBirthdaySuggestion,
        isFrozen,
        unconfirmedSessionId,
        topTip,
        // 生命周期
        init,
        destroy,
        reset,
        // 动作
        hideBirthday,
        hideContactBirthdays,
        setBirthdate,
        fetchBirthdateVisibility,
        confirmUnconfirmedSession,
        terminateUnconfirmedSession,
        dismissFrozen,
    };
});
