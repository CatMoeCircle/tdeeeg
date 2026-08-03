import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 根路径占位：App 初始化完成后由 navigateAfterInit 跳转到 /home 或 /login
    {
      path: "/",
      redirect: "/login",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
    },
    {
      path: "/loginCode",
      name: "loginCode",
      component: () => import("../views/login/Code.vue"),
    },
    {
      path: "/loginPaws",
      name: "loginPaws",
      component: () => import("../views/login/Password.vue"),
    },
    {
      path: "/home",
      name: "home",
      component: () => import("../views/HomeView.vue"),
      redirect: "/home/chats",
      children: [
        {
          path: "chats",
          name: "chats",
          component: () => import("../components/layout/HomeEmptyContent.vue"),
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
          component: () => import("../components/layout/HomeEmptyContent.vue"),
        },
        {
          path: "archived",
          name: "archived",
          component: () => import("../components/layout/HomeEmptyContent.vue"),
        },
        {
          path: "downloads",
          name: "downloads",
          component: () => import("../views/main/DownloadsModule.vue"),
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../components/layout/HomeEmptyContent.vue"),
        },
        {
          path: "settings/appearance",
          name: "settings-appearance",
          component: () => import("../components/settings/AppearanceSettings.vue"),
        },
        {
          path: "settings/download",
          name: "settings-download",
          component: () => import("../components/settings/DownloadSettings.vue"),
        },
      ],
    },
  ],
});

export default router;
