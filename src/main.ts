import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/css/index.css";

// 引入 tdesign 组件库的少量全局样式变量
import "tdesign-vue-next/es/style/index.css";
import i18n from "./i18n";

const app = createApp(App);

app.use(router);
app.use(i18n);
app.mount("#app");
