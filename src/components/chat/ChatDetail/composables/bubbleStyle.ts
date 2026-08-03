import type { message } from 'tdlib-types';
import type { AccentColorStyle } from '../../../../store/colors';
import { isStandaloneMessage } from './messageType';

/**
 * 消息气泡样式计算（纯函数，无任何响应式依赖）。
 *
 * 将 `ChatDetail/index.vue` 中与气泡外观相关的计算逻辑独立出来：
 * - 自己消息的 accent 柔和渐变背景
 * - 气泡圆角（组内连接小圆角规则）
 * - 气泡 zoom 缩放 + 圆角合并
 * - 消息区 CSS 变量
 *
 * 所有依赖（用户设置、主题色、发送者判断、气泡宽度、消息列表）都以参数注入，
 * 保持模块纯函数、可独立测试。
 */

/** 单条消息气泡的样式入参 */
export interface BubbleStyleItem {
    msg: message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    index: number;
}

/** 消息显示设置（取自 `settings.message`） */
export interface MessageDisplaySettings {
    cornerRadius: number;
    fontSize: number;
    scale: number;
}

/** 气泡圆角计算所需的外部依赖 */
export interface BubbleRadiusDeps {
    /** 当前消息列表（用于查找相邻消息） */
    messages: message[];
    /** 每条消息气泡实测宽度映射（msgId → px），用于同宽连接判断 */
    bubbleWidths: Record<number, number>;
    /** 判断消息是否为"自己发送" */
    isSelf: (msg: message) => boolean;
}

/** 气泡背景计算所需的外部依赖 */
export interface BubbleBackgroundDeps {
    /** 取某条消息发送者 accent 色 id */
    getSenderAccentId: (msg: message) => number | undefined;
    /** 计算 accent 色样式集（含 main RGB 主色） */
    accentColorStyle: (id: number) => AccentColorStyle;
    /** 当前是否为暗色主题 */
    isDark: boolean;
}

/**
 * 计算自己消息气泡背景：用发送者（通常为当前用户）的 accent 主色做柔和渐变。
 * 暗色下用较深 tint + 白字，亮色下用较浅 tint + 深字。
 *
 * @param msg - 消息对象
 * @param deps - 外部依赖
 * @returns 内联 background 样式对象
 */
export function selfBubbleStyle(
    msg: message,
    deps: BubbleBackgroundDeps,
): Record<string, string> {
    const id = deps.getSenderAccentId(msg);
    const main = id === undefined ? [106, 178, 242] : deps.accentColorStyle(id).main;
    const [r = 106, g = 178, b = 242] = main;
    if (deps.isDark) {
        // 暗色：主色加深 + 半透明白叠出柔和底
        return { background: `linear-gradient(135deg, rgba(${r},${g},${b},0.28), rgba(${r},${g},${b},0.16))` };
    }
    // 亮色：主色浅 tint
    return { background: `linear-gradient(135deg, rgba(${r},${g},${b},0.18), rgba(${r},${g},${b},0.10))` };
}

/**
 * 相册（outgoing）气泡背景：复用 {@link selfBubbleStyle} 的 accent 柔和底。
 *
 * @param item - 相册条目（取第一条消息）
 * @param deps - 外部依赖
 * @returns 内联 background 样式对象
 */
export function selfAlbumStyle(
    item: { messages: message[] },
    deps: BubbleBackgroundDeps,
): Record<string, string> {
    return selfBubbleStyle(item.messages[0], deps);
}

/**
 * 生成消息气泡圆角 CSS：使用用户设置的圆角半径 + 组内连接小圆角（6px）。
 * 规则与旧的 `getMessageBorderRadius` 一致：
 * - 自己消息：右上角为尾巴/连接角；
 * - 他人消息：左下角朝向头像始终小圆角，左侧连接上一条，右侧仅当相邻消息同宽才连接。
 *
 * @param msg - 消息对象
 * @param item - 气泡的组内位置信息
 * @param deps - 外部依赖
 * @returns `TLpx TRpx BRpx BLpx` 圆角字符串
 */
export function messageRadiusCss(
    msg: message,
    item: { isFirstInGroup: boolean; isLastInGroup: boolean; index: number },
    deps: BubbleRadiusDeps & { cornerRadius: number },
): string {
    const r = deps.cornerRadius;
    const isMe = deps.isSelf(msg);
    const first = item.isFirstInGroup;

    if (isMe) {
        // 自己消息：右上角为尾巴/连接角（6px），其余为用户半径
        const last = item.isLastInGroup;
        // order: TL TR BR BL
        if (first && last) return `${r}px 6px ${r}px ${r}px`; // 仅右上角小
        if (first) return `${r}px 6px 6px ${r}px`;            // 右上角+右下角小（组中间）
        if (last) return `${r}px 6px ${r}px ${r}px`;
        return `${r}px 6px 6px ${r}px`;
    }

    // 他人消息（左侧，头像在左下角）：左下角始终小圆角（6px）
    let tl = r, tr = r, br = r, bl = 6;
    // 非组内第一条：左上角连接上一条（小圆角）
    if (!first) tl = 6;
    // 右侧：仅当相邻消息宽度一致时才连接（中间消息左右对称连接）
    const myWidth = deps.bubbleWidths[msg.id];
    if (myWidth !== undefined) {
        const M = deps.messages;
        if (!item.isFirstInGroup) {
            const prevMsg = M[item.index - 1];
            if (prevMsg && !isStandaloneMessage(prevMsg) && deps.bubbleWidths[prevMsg.id] === myWidth) {
                tr = 6;
            }
        }
        if (!item.isLastInGroup) {
            const nextMsg = M[item.index + 1];
            if (nextMsg && !isStandaloneMessage(nextMsg) && deps.bubbleWidths[nextMsg.id] === myWidth) {
                br = 6;
            }
        }
    }
    return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/** 气泡样式计算所需的外部依赖 */
export interface BubbleStyleDeps extends BubbleRadiusDeps, BubbleBackgroundDeps {
    /** 用户消息显示设置 */
    settings: MessageDisplaySettings;
}

/**
 * 计算单条消息气泡内联样式：合并本体 scale（zoom）与圆角，自己消息叠加 accent 背景。
 *
 * @param item - 气泡的组内位置信息
 * @param deps - 外部依赖
 * @returns 内联样式对象
 */
export function bubbleStyle(
    item: BubbleStyleItem,
    deps: BubbleStyleDeps,
): Record<string, string> {
    const style: Record<string, string> = {
        zoom: String(deps.settings.scale),
        borderRadius: messageRadiusCss(item.msg, item, {
            ...deps,
            cornerRadius: deps.settings.cornerRadius,
        }),
    };
    // 独立消息（贴纸 / 动画表情）不渲染消息气泡，不叠加背景
    if (deps.isSelf(item.msg) && !isStandaloneMessage(item.msg)) {
        Object.assign(style, selfBubbleStyle(item.msg, deps));
    }
    return style;
}

/**
 * 计算相册气泡内联样式：scale + 圆角 + self 背景。
 *
 * @param item - 相册条目
 * @param deps - 外部依赖
 * @returns 内联样式对象
 */
export function albumStyle(
    item: { messages: message[] },
    deps: BubbleStyleDeps,
): Record<string, string> {
    const style: Record<string, string> = {
        zoom: String(deps.settings.scale),
        borderRadius: deps.settings.cornerRadius + 'px',
    };
    if (deps.isSelf(item.messages[0])) {
        Object.assign(style, selfAlbumStyle(item, deps));
    }
    return style;
}

/**
 * 生成消息区 CSS 变量对象（供文本组件继承字体/圆角/缩放）。
 *
 * @param settings - 用户消息显示设置
 * @returns CSS 变量映射对象
 */
export function messagesStyleCss(settings: MessageDisplaySettings): Record<string, string> {
    return {
        '--msg-corner-radius': `${settings.cornerRadius}px`,
        '--msg-font-size': `${settings.fontSize}px`,
        '--msg-scale': String(settings.scale),
    };
}
