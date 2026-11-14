import i18n from "../../i18n";
import { settings } from "../../store/settings/settings";
import { confirmLockdown } from "../../store/session/lockdownConfirm";

/**
 * HTML 组件安全模式的判定与闸门。
 *
 * 作用域就是名字：只处理**客户端渲染 / 打开**这一层。主线是机器人下发的 HTML
 * 组件不自动加载，另外三个分项（Mini App / 风险文件 / 陌生会话）是同一开关下的
 * 可选扩展，不要在文案里把它写成覆盖媒体、支付、隐私的全局安全模式。
 *
 * 设计约束：
 * - 判定只读 `settings.lockdown`，不碰 TDLib 设置，关闭即可完整还原；
 * - 所有确认都走同一个弹窗（`store/session/lockdownConfirm`），
 *   调用方只需要 `if (!(await requireLockdown(...))) return;`；
 * - 用户取消抛出的 `canceled` 在闸门内部吞掉，调用方不用写 try/catch。
 */

/** 受安全模式影响的动作类型 */
export type LockdownAction = "nonContacts" | "widgets" | "miniApps" | "files";

/** 是否开启安全模式 */
export function isLockdownOn(): boolean {
    return settings.lockdown.enabled;
}

/** 某一分项是否启用（总开关关闭时一律 false） */
export function isLockdownRuleOn(action: LockdownAction): boolean {
    if (!settings.lockdown.enabled) return false;
    switch (action) {
        case "nonContacts":
            return settings.lockdown.confirmNonContacts;
        case "widgets":
            return settings.lockdown.confirmWidgets;
        case "miniApps":
            return settings.lockdown.confirmMiniApps;
        case "files":
            return settings.lockdown.warnFiles;
    }
}

/** 每个动作对应的文案键（title / description / confirm） */
const ACTION_KEYS: Record<LockdownAction, { title: string; desc: string; confirm: string }> = {
    nonContacts: {
        title: "lockdown.nonContactTitle",
        desc: "lockdown.nonContactDesc",
        confirm: "lockdown.openChat",
    },
    widgets: {
        title: "lockdown.widgetTitle",
        desc: "lockdown.widgetDesc",
        confirm: "lockdown.loadWidget",
    },
    miniApps: {
        title: "lockdown.miniAppTitle",
        desc: "lockdown.miniAppDesc",
        confirm: "lockdown.openMiniApp",
    },
    files: {
        title: "lockdown.fileTitle",
        desc: "lockdown.fileDesc",
        confirm: "lockdown.openFile",
    },
};

/**
 * 闸门：需要确认时弹窗，用户点确认返回 true，取消返回 false。
 * 安全模式（或该分项）未开启时直接返回 true，调用方无需分支。
 *
 * @param action 动作类型，决定文案
 * @param detail 追加到说明后面的具体信息（会话名 / 文件名）
 */
export async function requireLockdown(action: LockdownAction, detail?: string): Promise<boolean> {
    if (!isLockdownRuleOn(action)) return true;
    const keys = ACTION_KEYS[action];
    const t = i18n.global.t;
    const description = detail ? `${t(keys.desc)}\n\n${detail}` : t(keys.desc);
    try {
        await confirmLockdown({
            title: t(keys.title),
            description,
            confirmLabel: t(keys.confirm),
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * 高风险扩展名：系统会直接执行、或让用户以为是文档/图片的可执行载体。
 * 命中后安全模式下只允许"在文件夹中显示"，不交给系统打开。
 */
const DANGEROUS_EXTENSIONS = new Set([
    // Windows 可执行 / 脚本
    "exe", "scr", "com", "pif", "bat", "cmd", "ps1", "psm1", "vbs", "vbe",
    "js", "jse", "wsf", "wsh", "hta", "msi", "msp", "cpl", "reg", "inf",
    "dll", "ocx", "sys", "lnk", "url", "scf", "iso", "img", "vhd", "vhdx",
    // 跨平台安装包 / 宏文档
    "app", "dmg", "pkg", "command", "sh", "bash", "zsh", "run",
    "jar", "jnlp", "apk", "deb", "rpm", "appimage",
    "docm", "xlsm", "pptm",
]);

/** 取小写扩展名（无扩展名返回空串） */
export function fileExtension(fileName?: string | null): string {
    if (!fileName) return "";
    const base = fileName.split(/[\\/]/).pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return "";
    return base.slice(dot + 1).toLowerCase();
}

/** 是否属于高风险文件（安全模式只允许定位、不允许直接打开） */
export function isDangerousFile(fileName?: string | null): boolean {
    return DANGEROUS_EXTENSIONS.has(fileExtension(fileName));
}
