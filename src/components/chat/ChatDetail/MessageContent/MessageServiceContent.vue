<template>
    <div class="text-center py-2">
        <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            {{ serviceText }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MessageContent } from 'tdlib-types';

const props = defineProps<{
    content: MessageContent;
}>();

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
            return `有成员通过邀请链接加入群组`;
        case 'messageChatJoinByRequest':
            return `有成员通过申请加入群组`;
        case 'messageChatDeleteMember':
            return `有成员离开了群组`;
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
        case 'messageGiveawayCompleted':
            return `抽奖活动已结束`;
        case 'messageProximityAlertTriggered':
            return `距离提醒已触发`;
        default:
            return `[系统消息: ${c._}]`;
    }
});
</script>
