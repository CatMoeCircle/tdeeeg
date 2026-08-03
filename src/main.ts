import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/css/index.css";

// 引入 tdesign 组件库的少量全局样式变量
import "tdesign-vue-next/es/style/index.css";
import i18n from "./i18n";
import vContextMenu from "./directives/contextMenu";
import vSmoothWheel from "./directives/smoothWheel";
import { closeContextMenu } from "./store/contextMenu";

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

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
// 注册 v-context-menu 指令
app.directive("context-menu", vContextMenu);
// 注册 v-smooth-wheel（滚轮平滑滚动）指令
app.directive("smooth-wheel", vSmoothWheel);
app.mount("#app");
