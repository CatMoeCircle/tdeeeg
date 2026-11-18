// 构建架构常量：编译期由 vite 的 define 注入（见 vite.config.ts）。
//
// 取值来自 Tauri 注入的 TAURI_ENV_ARCH（tauri build / tauri dev），纯 vite build
// 时退回 Node 的 process.arch，统一成 x64 / arm64 / x86 / arm。
// 设置页版本行显示为 `tdeeeg v0.2.6 · x64`，与安装包名里的架构后缀一致。
export const appArch: string = __APP_ARCH__;
