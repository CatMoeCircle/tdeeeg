import { computed, ref, type Ref } from 'vue';
import { formatDateLabel } from './dateLabel';
import type { DisplayItem } from './messageItems';

/**
 * 滚动时吸在顶栏底部的日期浮层。
 *
 * 从 `ChatDetail/index.vue` 抽出；只依赖消息展示条目、容器与露出状态，
 * 不挂 scroll 监听（滚动路径由调用方 rAF 合帧后调用 scheduleUpdateStickyDate）。
 */
export function useStickyDate(deps: {
    messagesContainer: Ref<HTMLElement | null>;
    listRevealed: Ref<boolean>;
    /** 延迟求值：messageItems 在组件里定义得比本 composable 晚 */
    getMessageItems: () => DisplayItem[];
}) {
    const { messagesContainer, listRevealed, getMessageItems } = deps;

    const stickyDateText = ref<string | null>(null);
    /** 向下滚动时隐藏吸顶日期，向上滚动时重新显示 */
    const stickyDateHidden = ref(false);
    /** 实际展示的吸顶日期：有日期且未因向下滚动隐藏时才显示 */
    const stickyDateDisplay = computed(() =>
        stickyDateHidden.value ? null : stickyDateText.value,
    );

    /**
     * 根据 messageItems 推导的日期区块起点 + 滚动位置，更新吸顶日期。
     *
     * 不依赖「日期分隔是否已渲染」：
     * - 有日期分隔时用分隔节点；分隔尚未挂载时用该日第一条消息兜底；
     * - 首日通常没有分隔条，直接用第一条消息作为区块起点。
     * 起点 top 越过内容区顶缘后显示该日吸顶日期；起点仍可见时隐藏（由内联分隔展示日期）。
     */
    function updateStickyDate(el?: HTMLElement | null) {
        const container = el ?? messagesContainer.value;
        if (!container || !listRevealed.value) {
            stickyDateText.value = null;
            return;
        }
        const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
        const threshold = container.getBoundingClientRect().top + paddingTop;
        const items = getMessageItems();

        // 一次 querySelectorAll 建索引，替代逐条 querySelector（滚动时 O(n) DOM 查询是强制回流热点）
        const stickyByKey = new Map<string, HTMLElement>();
        const msgElById = new Map<number, HTMLElement>();
        for (const node of container.querySelectorAll<HTMLElement>('[data-sticky-key], [data-msg-id]')) {
            const key = node.dataset.stickyKey;
            if (key) stickyByKey.set(key, node);
            const id = node.dataset.msgId;
            if (id) msgElById.set(Number(id), node);
        }

        type Section = { text: string; el: Element | null };
        const sections: Section[] = [];
        let currentDateText: string | null = null;
        /** 日期分隔条已出现但 DOM 尚未挂载时，用该日第一条已渲染消息兜底起点 */
        let pendingSectionText: string | null = null;

        for (const item of items) {
            if (item.type === 'date') {
                currentDateText = item.text;
                const sep = stickyByKey.get(item.key);
                if (sep) {
                    sections.push({ text: item.text, el: sep });
                    pendingSectionText = null;
                } else {
                    pendingSectionText = item.text;
                }
            } else if (item.type === 'single' || item.type === 'album') {
                const msg = item.type === 'single' ? item.msg : item.messages[0];
                const msgEl = msgElById.get(msg.id);
                if (pendingSectionText) {
                    // 分隔未挂载：等该日第一条能定位到的消息出现再记区块
                    if (msgEl) {
                        sections.push({ text: pendingSectionText, el: msgEl });
                        pendingSectionText = null;
                    }
                } else if (sections.length === 0) {
                    // 首日通常无分隔条：用第一条能定位到的消息作为区块起点
                    currentDateText = currentDateText ?? formatDateLabel(msg.date);
                    if (msgEl) sections.push({ text: currentDateText, el: msgEl });
                }
            }
        }

        let active: string | null = null;
        for (const s of sections) {
            if (!s.el) continue;
            if (s.el.getBoundingClientRect().top < threshold) {
                active = s.text;
            } else {
                break;
            }
        }
        stickyDateText.value = active;
    }

    /** 滚动路径上的吸顶日期更新：rAF 合帧，避免每帧 scroll 事件都做一次 DOM 测量 */
    let stickyDateRaf = 0;
    function scheduleUpdateStickyDate(el?: HTMLElement | null) {
        if (stickyDateRaf) return;
        stickyDateRaf = requestAnimationFrame(() => {
            stickyDateRaf = 0;
            updateStickyDate(el);
        });
    }

    return { stickyDateText, stickyDateHidden, stickyDateDisplay, updateStickyDate, scheduleUpdateStickyDate };
}
