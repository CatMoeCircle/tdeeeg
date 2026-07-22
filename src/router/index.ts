import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
          component: () => import("../views/main/ChatModule.vue"),
          children: [
            {
              path: ":id",
              name: "chat-detail",
              component: () =>
                import("../components/chat/ChatDetail/index.vue"),
            },
          ],
        },
        {
          path: "contacts",
          name: "contacts",
          component: () => import("../views/main/ContactModule.vue"),
        },
        {
          path: "archived",
          name: "archived",
          component: () => import("../views/main/ArchivedModule.vue"),
        },
        {
          path: "downloads",
          name: "downloads",
          component: () => import("../views/main/DownloadsModule.vue"),
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../views/main/SettingsModule.vue"),
          children: [
            {
              path: "appearance",
              name: "settings-appearance",
              component: () =>
                import("../components/settings/AppearanceSettings.vue"),
            },
            {
              path: "download",
              name: "settings-download",
              component: () =>
                import("../components/settings/DownloadSettings.vue"),
            },
          ],
        },
      ],
    },
  ],
});

export default router;
