import { computed, onMounted, onUnmounted, ref, type ComputedRef, type ShallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { message } from 'tdlib-types';
import { toast } from '../../../../utils/ui/toast';
import { canDeleteMessage, getMessageProperties } from '../../../contextMenu/messageActions';
import { visible as deletePopupVisible } from '../../../../store/chat/deleteMessage';
import { isServiceMessage } from './messageType';

/** 多选上限：与 Telegram 官方客户端一致，单次最多选中 100 条消息 */
const MAX_SELECTED_MSG_COUNT = 100;

/**
 * 多选模式 + 转发选择器。
 *
 * 从 `ChatDetail/index.vue` 抽出；删除弹窗由调用方以回调注入（避免循环依赖）。
 */
export function useMessageSelection(deps: {
    messages: ShallowRef<message[]>;
    chatId: ComputedRef<number | undefined>;
    openDeletePopup: (msgs: message[]) => Promise<void>;
}) {
    const { messages, chatId, openDeletePopup } = deps;
    const { t } = useI18n();

    // ===== 多选模式 =====
    const selectionMode = ref(false);
    /** 多选中选中的消息 id 集合（按加入顺序用数组保持稳定） */
    const selectedMsgIds = ref<number[]>([]);
    /** 选中消息中「可删除」的 id 集合（异步按 messageProperties 刷新） */
    const deletableSelectedIds = ref<Set<number>>(new Set());
    /** 权限刷新请求令牌：避免快速切换选择时旧结果覆盖新结果 */
    let selectionPermToken = 0;

    /** 切换到多选模式（服务消息不可选；相册内单条媒体也各自独立选中） */
    function enterSelectionMode(msg: message) {
        if (isServiceMessage(msg)) return;
        selectionMode.value = true;
        if (!selectedMsgIds.value.includes(msg.id)) selectedMsgIds.value.push(msg.id);
        void refreshSelectionPermissions();
    }

    /** 退出多选模式 */
    function exitSelectionMode() {
        selectionMode.value = false;
        selectedMsgIds.value = [];
        deletableSelectedIds.value = new Set();
        selectionPermToken++;
        endDragSelect();
    }

    /** 切换单条消息的选中状态（相册内每条媒体各自独立） */
    function toggleSelectMsg(msg: message) {
        toggleSelectMsgById(msg.id);
    }

    /** 按消息 id 切换选中状态；服务消息不可选 */
    function toggleSelectMsgById(msgId: number) {
        const msg = messages.value.find(m => m.id === msgId);
        if (!msg || isServiceMessage(msg)) return;
        const idx = selectedMsgIds.value.indexOf(msgId);
        if (idx >= 0) {
            selectedMsgIds.value.splice(idx, 1);
        } else {
            if (selectedMsgIds.value.length >= MAX_SELECTED_MSG_COUNT) {
                toast.warning(t('chat.selectLimit', { max: MAX_SELECTED_MSG_COUNT }));
                return;
            }
            selectedMsgIds.value.push(msgId);
        }
        void refreshSelectionPermissions();
    }

    /** 相册是否整体被选中（左侧圆点状态） */
    function isAlbumSelected(msgs: message[]): boolean {
        return msgs.length > 0 && msgs.every(m => selectedMsgIds.value.includes(m.id));
    }

    /** 点击相册左侧圆点：全选 / 取消整个相册 */
    function toggleSelectAlbum(msgs: message[]) {
        if (msgs.length === 0) return;
        if (isAlbumSelected(msgs)) {
            const ids = new Set(msgs.map(m => m.id));
            selectedMsgIds.value = selectedMsgIds.value.filter(id => !ids.has(id));
        } else {
            const adding = msgs.filter(m => !selectedMsgIds.value.includes(m.id));
            if (selectedMsgIds.value.length + adding.length > MAX_SELECTED_MSG_COUNT) {
                toast.warning(t('chat.selectLimit', { max: MAX_SELECTED_MSG_COUNT }));
                return;
            }
            for (const m of adding) selectedMsgIds.value.push(m.id);
        }
        void refreshSelectionPermissions();
    }

    /** 消息是否被选中 */
    function isMsgSelected(msgId: number): boolean {
        return selectedMsgIds.value.includes(msgId);
    }

    // ===== 拖动区间选择（选择模式下按住左键滑动） =====
    /** 是否正在进行拖动区间选择（沿用到 UI 上禁用文本选中 / 光标样式） */
    const dragSelecting = ref(false);
    /**
     * 起点行覆盖的消息 id（相册行含多条）。
     * 按 id 而非下标记锚点：拖动到边缘会补载历史/裁剪窗口，数组下标会漂移。
     */
    let dragAnchorIds: number[] = [];
    /** 拖动开始时的选中快照：每帧都基于快照重算，避免来回拖动累积误差 */
    let dragBaseIds: number[] = [];
    /** 起点未选中 → 区间选中；起点已选中 → 区间取消选中（与官方一致） */
    let dragAddRange = true;
    /** 本次拖动是否已提示过数量上限（拖动中只提示一次） */
    let dragLimitWarned = false;

    /** 消息 id → messages 中的下标 */
    function msgIndexById(msgId: number): number {
        return messages.value.findIndex(m => m.id === msgId);
    }

    /** 一组消息 id 在 messages 中覆盖的下标区间（相册行会跨多格） */
    function rowIndexRange(rowMsgIds: number[]): { from: number; to: number } | null {
        let from = Number.POSITIVE_INFINITY;
        let to = -1;
        for (const id of rowMsgIds) {
            const idx = msgIndexById(id);
            if (idx < 0) continue;
            if (idx < from) from = idx;
            if (idx > to) to = idx;
        }
        return to < 0 ? null : { from, to };
    }

    /**
     * 开始一次拖动区间选择。
     * `rowMsgIds` 为按下时鼠标所在消息行的全部消息 id（相册行是多条）。
     * 返回 false 表示该行不可参与拖动选择。
     */
    function beginDragSelect(rowMsgIds: number[]): boolean {
        if (rowIndexRange(rowMsgIds) === null) return false;
        const firstId = rowMsgIds[0];
        if (firstId === undefined) return false;
        dragAnchorIds = [...rowMsgIds];
        dragBaseIds = [...selectedMsgIds.value];
        // 起点落在「已有多选」的行上 → 拖动取消区间选中；否则一律为选中。
        // 只选了一条时仍走选中：右键「多选」会先选中该条，用户接着从它往下拖是常见手势。
        dragAddRange = !(dragBaseIds.length > 1 && dragBaseIds.includes(firstId));
        dragLimitWarned = false;
        dragSelecting.value = true;
        return true;
    }

    /**
     * 把区间终点更新到鼠标当前所在的消息行。
     * 区间始终覆盖「起点行 ~ 当前行」的完整消息序列（相册内部消息一并纳入）。
     */
    function updateDragSelect(rowMsgIds: number[]) {
        if (!dragSelecting.value || dragAnchorIds.length === 0 || rowMsgIds.length === 0) return;
        const anchor = rowIndexRange(dragAnchorIds);
        const current = rowIndexRange(rowMsgIds);
        if (!anchor || !current) return;
        const start = Math.min(anchor.from, current.from);
        const end = Math.max(anchor.to, current.to);
        const slice = messages.value.slice(start, end + 1);
        // 向上拖时从起点朝反向铺：达到 100 上限时停在光标一侧，而不是顿在区间另一端
        const range = current.from < anchor.from ? slice.reverse() : slice;
        applyDragRange(range);
    }

    /** 按起始快照 + 当前区间重算选中集合（服务消息不参与，超出上限即截断） */
    function applyDragRange(range: message[]) {
        let next: number[];
        if (dragAddRange) {
            const baseSet = new Set(dragBaseIds);
            next = [...dragBaseIds];
            for (const m of range) {
                if (isServiceMessage(m) || baseSet.has(m.id)) continue;
                if (next.length >= MAX_SELECTED_MSG_COUNT) {
                    if (!dragLimitWarned) {
                        dragLimitWarned = true;
                        toast.warning(t('chat.selectLimit', { max: MAX_SELECTED_MSG_COUNT }));
                    }
                    break;
                }
                next.push(m.id);
            }
        } else {
            const removeSet = new Set<number>();
            for (const m of range) {
                if (!isServiceMessage(m)) removeSet.add(m.id);
            }
            next = dragBaseIds.filter(id => !removeSet.has(id));
        }
        const prev = selectedMsgIds.value;
        if (next.length === prev.length && next.every((id, i) => id === prev[i])) return;
        selectedMsgIds.value = next;
        void refreshSelectionPermissions();
    }

    /** 结束拖动区间选择（状态复位，选中结果保留） */
    function endDragSelect() {
        if (!dragSelecting.value) return;
        dragSelecting.value = false;
        dragAnchorIds = [];
        dragBaseIds = [];
        dragLimitWarned = false;
    }

    /** 刷新选中消息的删除权限（getMessageProperties 离线预取 + 缓存判定） */
    async function refreshSelectionPermissions() {
        const token = ++selectionPermToken;
        const cid = chatId.value;
        const ids = [...selectedMsgIds.value];
        const result = new Set<number>();
        if (cid === undefined) {
            deletableSelectedIds.value = result;
            return;
        }
        await Promise.all(ids.map(async (id) => {
            const msg = messages.value.find((m) => m.id === id);
            if (!msg) return;
            if (canDeleteMessage(msg, cid)) {
                result.add(id);
                return;
            }
            // 缓存未命中时预取精确权限后再判定
            await getMessageProperties(cid, id);
            if (canDeleteMessage(msg, cid)) result.add(id);
        }));
        // 期间选择已变化则丢弃过期结果
        if (token !== selectionPermToken) return;
        deletableSelectedIds.value = result;
    }

    /** 选中的消息是否全部可删除（多选删除按钮的启用状态） */
    const canDeleteSelected = computed(() =>
        selectedMsgIds.value.length > 0 &&
        selectedMsgIds.value.every((id) => deletableSelectedIds.value.has(id))
    );

    /** 删除所有选中消息（按发送者集合决定弹窗能提供的批量动作） */
    async function onDeleteSelected() {
        if (!canDeleteSelected.value) return;
        const selected = new Set(selectedMsgIds.value);
        const msgs = messages.value.filter(m => selected.has(m.id));
        if (msgs.length === 0) return;
        await openDeletePopup(msgs);
    }

    /**
     * 多选模式下的键盘处理：Delete 键走与工具栏删除按钮相同的校验，
     * Escape 退出多选。输入框内的按键不拦截。
     */
    function onSelectionKeydown(e: KeyboardEvent) {
        if (!selectionMode.value || deletePopupVisible.value) return;
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (e.key === 'Escape') {
            exitSelectionMode();
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!canDeleteSelected.value) return;
            e.preventDefault();
            void onDeleteSelected();
        }
    }

    onMounted(() => window.addEventListener('keydown', onSelectionKeydown));
    onUnmounted(() => window.removeEventListener('keydown', onSelectionKeydown));

    // ===== 转发选择器 =====
    const forwardPickerVisible = ref(false);
    const forwardMessageIds = ref<number[]>([]);

    /** 转发选择器消息快照：供判断是否含媒体说明（相册/图/视/音/GIF/文件 caption） */
    const forwardMessagesSnapshot = computed(() => {
        const ids = new Set(forwardMessageIds.value);
        return messages.value.filter((m) => ids.has(m.id));
    });

    /** 打开转发选择器（用当前选中消息） */
    function openForwardPicker() {
        if (selectedMsgIds.value.length === 0) return;
        forwardMessageIds.value = [...selectedMsgIds.value];
        forwardPickerVisible.value = true;
    }

    /** 右键「转发」：对单条消息打开转发选择器 */
    function startForward(msg: message) {
        forwardMessageIds.value = [msg.id];
        forwardPickerVisible.value = true;
    }

    /** 转发完成后退出多选 */
    function onForwardDone() {
        exitSelectionMode();
    }

    return {
        MAX_SELECTED_MSG_COUNT,
        selectionMode,
        selectedMsgIds,
        enterSelectionMode,
        exitSelectionMode,
        toggleSelectMsg,
        toggleSelectMsgById,
        isAlbumSelected,
        toggleSelectAlbum,
        isMsgSelected,
        dragSelecting,
        beginDragSelect,
        updateDragSelect,
        endDragSelect,
        canDeleteSelected,
        onDeleteSelected,
        forwardPickerVisible,
        forwardMessageIds,
        forwardMessagesSnapshot,
        openForwardPicker,
        startForward,
        onForwardDone,
    };
}
