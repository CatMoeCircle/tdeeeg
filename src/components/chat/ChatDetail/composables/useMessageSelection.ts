import { computed, onMounted, onUnmounted, ref, type ComputedRef, type ShallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { message } from 'tdlib-types';
import { toast } from '../../../../utils/toast';
import { canDeleteMessage, getMessageProperties } from '../../../contextMenu/messageActions';
import { visible as deletePopupVisible } from '../../../../store/deleteMessage';
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
