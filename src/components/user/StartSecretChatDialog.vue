<template>
  <ModalDialog :model-value="modelValue" :title="t('secretChatCreate.title')" @update:model-value="onVisibilityChange">
    <div class="space-y-4">
      <!-- 对方信息：确认这次私密聊天是为谁创建 -->
      <div class="flex items-center gap-3">
        <Avatar v-if="targetUser" :photo="targetUser.profile_photo" :title="displayName"
          :first-name="targetUser.first_name" :last-name="targetUser.last_name"
          :accentColorId="targetUser.accent_color_id" size-class="!w-12 !h-12" />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ displayName }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('secretChatCreate.subtitle') }}</p>
        </div>
      </div>

      <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {{ t('secretChatCreate.description', { name: displayName }) }}
      </p>

      <ul class="space-y-2.5">
        <li class="flex items-start gap-2.5">
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <LockIcon class="h-4 w-4" />
          </span>
          <span class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {{ t('secretChatCreate.deviceOnly') }}
          </span>
        </li>
        <li class="flex items-start gap-2.5">
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheckIcon class="h-4 w-4" />
          </span>
          <span class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {{ t('secretChatCreate.noCloud') }}
          </span>
        </li>
      </ul>
    </div>

    <template #footer>
      <BaseButton type="button" variant="ghost" size="sm" :disabled="submitting" @click="close">
        {{ t('lng_cancel') }}
      </BaseButton>
      <BaseButton type="button" size="sm" :disabled="!targetUserId || submitting" @click="submit">
        {{ submitting ? t('secretChatCreate.creating') : t('secretChatCreate.create') }}
      </BaseButton>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Lock as LockIcon, ShieldCheck as ShieldCheckIcon } from 'lucide-vue-next';
import type { user } from 'tdlib-types';
import ModalDialog from '../ui/modal/ModalDialog.vue';
import BaseButton from '../ui/button/BaseButton.vue';
import Avatar from '../chat/avatar.vue';
import { tdlibSend } from '../../utils/session/tdlib';
import { ensureChat } from '../../utils/profile/senderInfo';
import { toast } from '../../utils/ui/toast';

/**
 * 「开始私密聊天」确认弹窗。
 *
 * 私密聊天只能通过 TDLib 的 createNewSecretChat 创建：端到端加密、密钥只在本设备，
 * 消息不进入云端。确认后创建成功即跳转到该会话；创建失败（例如对方是机器人、
 * 与该用户已存在未结束的私密聊天）直接把 TDLib 错误提示给用户。
 */
const props = defineProps<{
  modelValue: boolean;
  /** 目标用户（资料页已有完整 user 对象时优先传入，用于显示头像与名字） */
  user?: user | null;
  /** 只有 user_id 时的兜底参数（props.user 缺省时生效） */
  userId?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();
const router = useRouter();

/** 请求进行中：按钮进入 loading 并禁止关闭，避免重复创建 */
const submitting = ref(false);

const targetUser = computed<user | null>(() => props.user ?? null);
const targetUserId = computed(() => props.user?.id ?? props.userId ?? 0);
const displayName = computed(() => {
  const u = targetUser.value;
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return name || t('secretChatCreate.unknownUser');
});

// 每次重新打开都清掉上次残留的提交态
watch(
  () => props.modelValue,
  (open) => {
    if (open) submitting.value = false;
  },
);

/** 关闭弹窗（创建过程中不允许关闭） */
function close() {
  if (submitting.value) return;
  emit('update:modelValue', false);
}

function onVisibilityChange(visible: boolean) {
  if (visible) {
    emit('update:modelValue', true);
    return;
  }
  close();
}

/** 创建私密聊天：成功跳转会话，失败按 TDLib 错误提示 */
async function submit() {
  const userId = targetUserId.value;
  if (!userId || submitting.value) return;
  submitting.value = true;

  let chatId = 0;
  try {
    const chat = await tdlibSend({ _: 'createNewSecretChat', user_id: userId });
    chatId = chat.id;
    // 预热聊天对象缓存，聊天页首帧即可拿到标题/头像
    void ensureChat(chatId).catch(() => {});
  } catch (e) {
    submitting.value = false;
    const message = (e as { message?: string } | null | undefined)?.message;
    toast.error(message || t('secretChatCreate.failed'));
    return;
  }

  submitting.value = false;
  emit('update:modelValue', false);
  await router.push({ name: 'chat-detail', params: { id: String(chatId) } });
}
</script>
