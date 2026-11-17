import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { user } from 'tdlib-types';

/**
 * 「开始私密聊天」弹窗的全局状态。
 *
 * 资料页（UserProfile）点击「开始私密聊天」时调用 openStartDialog(user)，
 * 由资料页渲染 StartSecretChatDialog 并把 startDialogVisible / startDialogUser
 * 绑定到弹窗的 v-model 与 user 上；弹窗关闭时清空目标用户。
 */
export const useSecretChatStore = defineStore('secretChatCreate', () => {
  /** 待创建私密聊天的目标用户；null 表示弹窗未打开 */
  const startDialogUser = ref<user | null>(null);

  /** 弹窗可见性：可直接绑定到 StartSecretChatDialog 的 v-model，关闭时清空目标用户 */
  const startDialogVisible = computed<boolean>({
    get: () => startDialogUser.value !== null,
    set: (visible) => {
      if (!visible) startDialogUser.value = null;
    },
  });

  /** 打开「开始私密聊天」弹窗 */
  function openStartDialog(target: user) {
    startDialogUser.value = target;
  }

  /** 关闭「开始私密聊天」弹窗 */
  function closeStartDialog() {
    startDialogUser.value = null;
  }

  return { startDialogUser, startDialogVisible, openStartDialog, closeStartDialog };
});
