/**
 * 实时位置回写：把设备定位的变化通过 editMessageLiveLocation 同步到已发出的消息。
 *
 * 只在能拿到 navigator.geolocation 的环境生效；WebView2 没有定位服务时直接跳过
 *（位置发送弹窗已经给出降级提示，消息就是用户确认的那个静态点）。
 */
import { watch } from 'vue';
import type { location } from 'tdlib-types';
import { tdlibSend } from '../session/tdlib';

/** 弹窗可选的实时位置时长：15 分钟 / 1 小时 / 8 小时（秒） */
export const LIVE_LOCATION_PERIODS = [900, 3600, 28800] as const;
/** TDLib 允许的 live_period 区间：60-86400 秒（0x7FFFFFFF 表示永久，这里不提供） */
export const LIVE_LOCATION_MIN_PERIOD = 60;
export const LIVE_LOCATION_MAX_PERIOD = 86400;

/** 两次回写之间的最短间隔，避免频繁 editMessageLiveLocation */
const MIN_UPDATE_INTERVAL_MS = 15_000;
/** 位移小于该距离（米）时不回写，除非已经超过强制间隔 */
const MIN_MOVE_METERS = 10;
const FORCE_INTERVAL_MS = 60_000;

interface LiveLocationSessionParams {
    chatId: number;
    messageId: number;
    /** 选定的 TDLib live_period（秒） */
    livePeriod: number;
    /** 发送时的初始位置（还没拿到新定位前就是它） */
    initial: location;
}

interface LiveLocationSession {
    stop: () => void;
}

/** 正在回写的消息：key = chatId:messageId */
const sessions = new Map<string, LiveLocationSession>();

function sessionKey(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
}

/** 停止某个聊天下所有实时位置回写：同一聊天只保留最新一条的 watcher，避免并行 watchPosition */
function stopLiveLocationSessionsForChat(chatId: number): void {
    const prefix = `${chatId}:`;
    for (const [key, session] of [...sessions]) {
        if (key.startsWith(prefix)) session.stop();
    }
}

/**
 * 清空所有实时位置回写（退出登录 / 切换账号时调用）。
 * 模块级 watcher 与定时器最长会跑满 live_period（8 小时），换账号前必须收掉。
 */
export function clearLiveLocationSessions(): void {
    for (const session of [...sessions.values()]) session.stop();
    sessions.clear();
}

/** 是否已挂好账号切换清理 */
let accountSwitchCleanupInstalled = false;

/**
 * 账号切换 / 退出登录时自动清空回写。
 *
 * 账号状态在 Pinia 的 accounts store（src/store/session/accounts.ts）里，这里用动态
 * import + 响应式 watcher 挂接：模块可能在 Pinia 安装前被加载，静态 import 会拿不到
 * store 实例，动态 import 也避免与 UI 层形成循环依赖。store 不可用时静默跳过，
 * 调用方仍可显式调用 clearLiveLocationSessions()。
 */
function installAccountSwitchCleanup(): void {
    if (accountSwitchCleanupInstalled) return;
    accountSwitchCleanupInstalled = true;
    void import('../../store/session/accounts')
        .then(({ useAccountsStore }) => {
            try {
                const accounts = useAccountsStore();
                watch(() => accounts.activeAccount?.id, () => clearLiveLocationSessions());
            } catch {
                // Pinia 未就绪（单测 / 预初始化阶段）：忽略
            }
        })
        .catch(() => {
            // store 加载失败：不影响发送与回写，账号切换时由调用方清理
        });
}

/** 两点间球面距离（米）：只用来判断是否值得回写，不需要高精度 */
function distanceMeters(a: location, b: location): number {
    const earthRadius = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 停止某条消息的实时位置回写（不存在时静默返回） */
export function stopLiveLocationUpdates(chatId: number, messageId: number): void {
    sessions.get(sessionKey(chatId, messageId))?.stop();
}

/**
 * 开始回写实时位置；调用方必须在 sendMessage 成功后传入返回的 message。
 * 没有定位能力时静默返回，避免给用户造成「正在广播」的错觉。
 */
export function startLiveLocationUpdates(params: LiveLocationSessionParams): void {
    const { chatId, messageId, initial } = params;
    const requestedPeriod = Math.round(params.livePeriod);
    if (!Number.isFinite(requestedPeriod) || requestedPeriod <= 0) return;
    // 同一聊天只保留最新一条实时位置的回写，避免多条消息并行 watchPosition
    stopLiveLocationSessionsForChat(chatId);
    installAccountSwitchCleanup();

    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) return;

    const period = Math.min(LIVE_LOCATION_MAX_PERIOD, Math.max(LIVE_LOCATION_MIN_PERIOD, requestedPeriod));
    const key = sessionKey(chatId, messageId);
    const expiresAt = Date.now() + period * 1000;
    let lastSentPoint = initial;
    let lastSentAt = 0;
    let latestPosition: GeolocationPosition | null = null;
    let updating = false;
    let stopped = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (watchId !== null) geo.clearWatch(watchId);
        if (timer !== null) clearInterval(timer);
        sessions.delete(key);
    };

    const pushUpdate = async (pos: GeolocationPosition) => {
        if (stopped || updating) return;
        if (Date.now() >= expiresAt) {
            stop();
            return;
        }
        const next: location = {
            _: 'location',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            // TDLib 用 horizontal_accuracy 表示位置精度圆（米），0 表示未知
            horizontal_accuracy: Math.max(0, Math.round(pos.coords.accuracy || 0)),
        };
        const elapsed = Date.now() - lastSentAt;
        if (elapsed < MIN_UPDATE_INTERVAL_MS) return;
        // 没怎么动就不必发；但超过强制间隔仍同步一次，保持「实时」观感
        if (distanceMeters(lastSentPoint, next) < MIN_MOVE_METERS && elapsed < FORCE_INTERVAL_MS) return;
        updating = true;
        lastSentAt = Date.now();
        try {
            await tdlibSend({
                _: 'editMessageLiveLocation',
                chat_id: chatId,
                message_id: messageId,
                location: {
                    _: 'liveLocation',
                    location: next,
                    // 编辑时保持原始 live_period：服务端按消息发送时间计算过期，不会因此延长
                    live_period: period,
                    heading: 0,
                    proximity_alert_radius: 0,
                },
            });
            lastSentPoint = next;
        } catch (e) {
            // 消息过期 / 被删除 / 失去权限：停止回写，避免持续报错
            const code = (e as { code?: number })?.code;
            const message = String((e as { message?: string })?.message ?? '');
            if (code === 400 || /expired|not found|can't|cannot|already/i.test(message)) stop();
        } finally {
            updating = false;
        }
    };

    watchId = geo.watchPosition(
        (pos) => {
            latestPosition = pos;
            void pushUpdate(pos);
        },
        (err) => {
            console.warn('Live location watch failed:', err.message);
            // 超时（3）可能只是暂时没定位到；权限被拒 / 定位服务不可用才彻底停止
            if (err.code !== 3) stop();
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 },
    );

    timer = setInterval(() => {
        if (stopped) return;
        if (Date.now() >= expiresAt) {
            stop();
            return;
        }
        if (latestPosition) void pushUpdate(latestPosition);
    }, MIN_UPDATE_INTERVAL_MS);

    sessions.set(key, { stop });
}
