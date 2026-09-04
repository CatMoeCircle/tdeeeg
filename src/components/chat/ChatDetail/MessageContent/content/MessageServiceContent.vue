<template>
    <div class="text-center py-1" :class="clickable ? 'cursor-pointer' : ''" @click="onClick">
        <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            {{ serviceText }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { MessageContent, message } from 'tdlib-types';
import { ensureUser, getUserDisplayName } from '../../../../../utils/senderInfo';

const props = defineProps<{
    content: MessageContent;
    /** 服务消息发送者的显示名称（清单完成/添加等提示会用到） */
    senderName?: string;
    /** 服务消息发送者（操作者）的用户 id，用于判断成员是否为自行退出 */
    senderUserId?: number;
    /** 当前消息列表（用于按 checklist_message_id 查找清单消息，展示任务文本） */
    messageList?: message[];
}>();

const emit = defineEmits<{
    jump: [messageId: number];
}>();

/** 发送者名称（未解析到时兜底） */
const sender = computed(() => props.senderName?.trim() || '有人');

/** 离开的成员可能已不在群内，主动发 getUser 拉取；用户缓存就绪后文案自动更新 */
watch(
    () => (props.content._ === 'messageChatDeleteMember' ? props.content.user_id : 0),
    (userId) => {
        if (userId) ensureUser(userId);
    },
    { immediate: true },
);

/** 是否为“投票选项被添加/删除”的服务消息；关联的投票消息 id >0 时可点击跳转 */
const pollMessageId = computed(() => {
    const c = props.content;
    if (c._ === 'messagePollOptionAdded' || c._ === 'messagePollOptionDeleted') return c.poll_message_id;
    return 0;
});

const clickable = computed(() => pollMessageId.value > 0);

function onClick() {
    if (clickable.value) emit('jump', pollMessageId.value);
}

/**
 * 从消息列表中按 checklist_message_id 找到 messageChecklist 消息，
 * 返回 任务 id -> 任务纯文本 的映射（找不到对应消息时返回空 Map）。
 */
function findTaskNames(checklistMessageId: number): Map<number, string> {
    const map = new Map<number, string>();
    const listMsg = props.messageList?.find(m => m.id === checklistMessageId);
    if (listMsg?.content._ === 'messageChecklist') {
        for (const task of listMsg.content.list.tasks) {
            map.set(task.id, task.text.text || `#${task.id}`);
        }
    }
    return map;
}

/**
 * 成员离开/被移出的提示文案。messageChatDeleteMember 自带 user_id，
 * 能精确显示“是谁”离开/被移出，而非笼统的“有成员离开”。
 */
function memberRemovedText(userId: number): string {
    const name = getUserDisplayName(userId);
    if (!name) return '有成员离开了群组';
    // 成员自行退出：此时消息发送者即该成员本人
    if (props.senderUserId === userId) return `${name} 退出了群组`;
    // 被其他成员/管理员移出：优先带出操作者
    const actor = props.senderName?.trim();
    if (actor) return `${actor} 将 ${name} 移出了群组`;
    return `${name} 被移出了群组`;
}

const serviceText = computed(() => {
    const c = props.content;
    switch (c._) {
        case 'messageBasicGroupChatCreate':
            return `群组「${c.title}」已创建`;
        case 'messageSupergroupChatCreate':
            return `超级群组「${c.title}」已创建`;
        case 'messageChatChangeTitle':
            return `群组名称已更改为「${c.title}」`;
        case 'messageChatChangePhoto':
            return `群组头像已更新`;
        case 'messageChatDeletePhoto':
            return `群组头像已删除`;
        case 'messageChatAddMembers':
            return `${c.member_user_ids.length} 位成员已加入群组`;
        case 'messageChatJoinByLink':
            return `${sender.value} 通过邀请链接加入了群组`;
        case 'messageChatJoinByRequest':
            return `${sender.value} 通过申请加入了群组`;
        case 'messageChatDeleteMember':
            return memberRemovedText(c.user_id);
        case 'messageChatUpgradeTo':
            return `群组已升级为超级群组`;
        case 'messageChatUpgradeFrom':
            return `群组由基本群组升级而来`;
        case 'messagePinMessage':
            return `已置顶一条消息`;
        case 'messageScreenshotTaken':
            return `对方截取了屏幕`;
        case 'messageChatSetMessageAutoDeleteTime':
            return `自动删除消息时间已设置为 ${c.message_auto_delete_time} 秒`;
        case 'messageForumTopicCreated':
            return `主题「${c.name}」已创建`;
        case 'messageForumTopicEdited':
            return `主题信息已更新`;
        case 'messageForumTopicIsClosedToggled':
            return c.is_closed ? '主题已关闭' : '主题已重新开启';
        case 'messageCustomServiceAction':
            return c.text;
        case 'messageContactRegistered':
            return `对方已注册 Telegram`;
        case 'messageCall':
            return c.is_video ? '视频通话' : '语音通话';
        case 'messageGameScore':
            return `游戏得分已更新`;
        case 'messagePaymentSuccessful':
            return `支付成功`;
        case 'messageGiftedPremium':
            return `赠送了 Telegram Premium`;
        case 'messageGiveaway':
            return `抽奖活动`;
        case 'messageGiveawayCompleted':
            return `抽奖活动已结束`;
        case 'messagePollOptionAdded':
            return `${sender.value} 添加了选项：${c.text.text || ''}`;
        case 'messagePollOptionDeleted':
            return `${sender.value} 删除了选项：${c.text.text || ''}`;
        case 'messageChecklistTasksDone': {
            const names = findTaskNames(c.checklist_message_id);
            const parts: string[] = [];
            const appendGroup = (ids: number[], done: boolean) => {
                if (ids.length === 0) return;
                const action = done ? '标记为已完成' : '标记为未完成';
                const labels = ids.map(id => names.get(id)).filter((n): n is string => !!n);
                if (labels.length === ids.length) {
                    parts.push(`${sender.value} 将「${labels.join('、')}」${action}`);
                } else {
                    parts.push(`${sender.value} 将 ${ids.length} 个任务${action}`);
                }
            };
            appendGroup(c.marked_as_done_task_ids, true);
            appendGroup(c.marked_as_not_done_task_ids, false);
            return parts.length ? parts.join('，') : `${sender.value} 更新了任务清单`;
        }
        case 'messageChecklistTasksAdded': {
            const labels = c.tasks.map(t => t.text.text || `#${t.id}`).filter(Boolean);
            if (labels.length === 0) return `${sender.value} 向任务清单添加了新任务`;
            if (labels.length <= 3) return `${sender.value} 添加了任务「${labels.join('、')}」`;
            return `${sender.value} 添加了 ${labels.length} 个任务`;
        }
        case 'messageProximityAlertTriggered':
            return `距离提醒已触发`;
        default:
            return `[系统消息: ${c._}]`;
    }
});
</script>
