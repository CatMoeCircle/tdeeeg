import { createApp } from "vue";
import { createPinia } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import App from "./App.vue";
import router from "./router";
import "./assets/css/index.css";

// 引入 tdesign 组件库的少量全局样式变量
import "tdesign-vue-next/es/style/index.css";
import i18n from "./i18n";
import vContextMenu from "./directives/contextMenu";
import vSmoothWheel from "./directives/smoothWheel";
import { closeContextMenu } from "./store/contextMenu";
import { initTdlib, waitForAuthorization } from "./init";
import { registerLoaderStyle, type LoaderStyle } from "./components/common/LoaderIndicator";
import { settings } from "./store/settings";
import { initRlottie } from "./utils/rlottiePreload";

// 全局右键处理：
// - 输入框/可编辑元素/链接等保留原生右键（便于复制粘贴等）
// - 其余元素阻止默认菜单；若某处希望使用自定义右键菜单，由其元素的 v-context-menu 指令接管
window.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    // 关闭上一次打开的菜单
    closeContextMenu();
    if (!target) return;
    const tag = target.tagName?.toLowerCase();
    // 输入类元素保留原生菜单
    if (
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable ||
        target.getAttribute?.("contenteditable") === "true"
    ) {
        return;
    }
    // 若目标或其祖先已有 v-context-menu 指令，则该指令已处理并 stopPropagation，
    // 这里的 preventDefault 不会误伤（指令在捕获阶段由元素自身触发后已调用 preventDefault）。
    // 其余情况阻止默认右键菜单。
    e.preventDefault();
});

// 屏蔽开发者工具快捷键：F12，以及 Ctrl/Cmd+Shift+I / J / C（打开 DevTools / 元素审查）。
// 用户仍可通过「开发者选项 → 打开开发者工具」按钮主动打开（Rust open_devtools）。
window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    const shortcut = e.key === "F12" ||
        (key === "i" && e.shiftKey && (e.ctrlKey || e.metaKey)) ||
        (key === "j" && e.shiftKey && (e.ctrlKey || e.metaKey)) ||
        (key === "c" && e.shiftKey && (e.ctrlKey || e.metaKey));
    if (shortcut) {
        e.preventDefault();
        e.stopPropagation();
    }
});

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
// 注册 v-context-menu 指令
app.directive("context-menu", vContextMenu);
// 注册 v-smooth-wheel（滚轮平滑滚动）指令
app.directive("smooth-wheel", vSmoothWheel);

// 应用启动流程：
// 1. 先初始化 TDLib 及各模块事件监听（不渲染 App）
// 2. 等待授权态稳定（Ready / WaitCode... 等），据此跳转 /home 或 /login
// 3. 完成后再挂载并渲染 App.vue，从而避免启动时闪现登录页
async function bootstrap() {
    // 等待 router 就绪，确保后续 push 基于已解析的路由表执行
    await router.isReady();

    // 设置 TDLib 参数（连接正式/测试数据中心，使用自定义或默认 API 凭据），须在 init_tdlib 之前调用。
    // 用户可在「系统设置」中修改 use_test_dc / api_id / api_hash（持久化到 settings.system）。
    const sys = settings.system;
    await invoke("set_tdlib_parameters", {
        useTestDc: sys.useTestDc,
        ...(sys.customApiCreds && sys.apiId && sys.apiHash
            ? { api_id: Number(sys.apiId), api_hash: sys.apiHash }
            : {}),
    });

    let authState: "ready" | "login";
    try {
        await initTdlib();
        authState = await waitForAuthorization();
    } catch (e) {
        console.error("Error initializing TDLib:", e);
        authState = "login";
    }

    // mount 前先跳到对应路由
    await router.push(authState === "ready" ? "/home" : "/login");

    // 预注册加载指示器样式（ldrs 自定义元素）。
    // ldrs 在打包后会被拆到独立 chunk（LoaderIndicator-*），其 register() 代码
    // 随 chunk 按需加载。这里在挂载前提前注册当前生效样式，确保首个 LoaderIndicator
    // 渲染为已定义的自定义元素（避免出现未知元素的空白闪烁）。
    registerLoaderStyle(settings.loadingStyle as LoaderStyle);

    // 预加载 rlottie WASM 运行时（RlottiePlayer 依赖 window.Module / RLottieModule /
    // RLottieHandler 全局），必须在任何 RlottiePlayer 组件挂载之前完成。
    await initRlottie();

    // 授权态稳定、路由已定位，再渲染 App.vue
    app.mount("#app");
}

bootstrap();
