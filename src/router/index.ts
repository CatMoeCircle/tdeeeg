import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 根路径占位：应用初始化（授权态稳定）之前的空白页。
    // 真实跳转 /home 或 /login 由 main.ts 的 bootstrap 在 mount 前完成，
    // 这里不重定向到 /login，避免启动时闪现登录页。
    {
      path: "/",
      name: "boot",
      component: () => import("../views/auth/Booting.vue"),
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/auth/LoginView.vue"),
    },
    {
      path: "/loginCode",
      name: "loginCode",
      component: () => import("../views/auth/login/Code.vue"),
    },
    {
      path: "/loginPaws",
      name: "loginPaws",
      component: () => import("../views/auth/login/Password.vue"),
    },
    {
      path: "/home",
      name: "home",
      component: () => import("../views/home/HomeView.vue"),
      redirect: "/home/chats",
      children: [
        {
          path: "chats",
          name: "chats",
          component: () => import("../views/home/HomeEmpty.vue"),
        },
        {
          // Chat detail is a top-level home page, not a nested chat-list page.
          path: "chat/:id/topics/:topicId",
          name: "chat-topic-detail",
          component: () => import("../components/chat/ChatDetail/index.vue"),
        },
        {
          path: "chat/:id",
          name: "chat-detail",
          component: () => import("../components/chat/ChatDetail/index.vue"),
        },
        {
          path: "contacts",
          name: "contacts",
          component: () => import("../views/home/HomeEmpty.vue"),
        },
        {
          path: "archived",
          name: "archived",
          component: () => import("../views/home/HomeEmpty.vue"),
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../views/home/HomeEmpty.vue"),
        },
        {
          path: "settings/appearance",
          name: "settings-appearance",
          component: () => import("../views/settings/AppearanceSettings.vue"),
        },
        {
          path: "settings/download",
          name: "settings-download",
          component: () => import("../views/settings/DownloadSettings.vue"),
        },
        {
          path: "settings/proxy",
          name: "settings-proxy",
          component: () => import("../views/settings/ProxySettings.vue"),
        },
        {
          path: "settings/storage",
          name: "settings-storage",
          component: () => import("../views/settings/StorageSettings.vue"),
        },
        {
          path: "settings/debug",
          name: "settings-debug",
          component: () => import("../views/settings/DeveloperSettings.vue"),
        },
        {
          path: "user/:id",
          name: "user-profile",
          component: () => import("../views/user/UserProfile.vue"),
        },
        {
          // 频道/群组资料页：复用 UserProfile.vue，通过路由名区分「聊天模式」
          path: "chat-profile/:id",
          name: "chat-profile",
          component: () => import("../views/user/UserProfile.vue"),
        },
      ],
    },
  ],
});

export default router;
