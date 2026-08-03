import { openUrl } from '@tauri-apps/plugin-opener';
import { confirmExternalLink } from '../store/externalLink';

/**
 * 打开外部链接前弹出确认对话框（"是否跳转外部"），确认后再调用系统浏览器打开。
 *
 * 仅对真正的「外部链接」（http/https/mailto/tel）做确认；Telegram 内部链接（t.me / tg://）
 * 由调用方在传入前自行解析跳转，不会走到这里。
 *
 * 确认弹窗使用项目自定义样式（ExternalLinkConfirm.vue），只显示站点域名而非完整链接；
 * 用户确认后打开链接并 resolve；取消/关闭则 reject。
 *
 * @param url 要打开的外部链接
 * @returns 用户确认后 resolve；取消则 reject（调用方可据此决定是否停止后续逻辑）
 */
export function confirmAndOpenExternalLink(url: string): Promise<void> {
    return confirmExternalLink(url).then(() => {
        return openUrl(url).catch((e) => {
            console.error('Open external link failed:', e);
            throw e;
        });
    });
}
