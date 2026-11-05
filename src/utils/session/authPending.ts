/** 登录切换过程中排队的手机号（模块级，避免组件重挂载丢失） */
let pendingPhoneLogin: string | null = null;

export function setPendingPhoneLogin(phone: string | null): void {
    pendingPhoneLogin = phone;
}

/** 读取并清空排队手机号 */
export function takePendingPhoneLogin(): string | null {
    const p = pendingPhoneLogin;
    pendingPhoneLogin = null;
    return p;
}

export function peekPendingPhoneLogin(): string | null {
    return pendingPhoneLogin;
}
