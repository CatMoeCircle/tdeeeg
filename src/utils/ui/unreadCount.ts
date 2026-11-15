import { settings } from '../../store/settings/settings';

/**
 * 未读角标文本。
 *
 * 默认（unreadCount99Plus = false）显示真实未读数，三位数也完整显示；
 * 开启后超过 99 的未读数收敛为「99+」。
 * 模板里直接调用即可：读取 settings 会建立响应式依赖，开关切换立即生效。
 */
export function formatUnreadCount(count: number): string {
    if (count > 99 && settings.chatList.unreadCount99Plus) return '99+';
    return String(count);
}
