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
          path: "settings/wallpaper",
          name: "settings-wallpaper",
          component: () => import("../views/settings/WallpaperSettings.vue"),
        },
        {
          path: "settings/download",
          name: "settings-download",
          component: () => import("../views/settings/DownloadSettings.vue"),
        },
        {
          path: "settings/notifications",
          name: "settings-notifications",
          component: () => import("../views/settings/NotificationSettings.vue"),
        },
        {
          path: "settings/proxy",
          name: "settings-proxy",
          component: () => import("../views/settings/ProxySettings.vue"),
        },
        {
          path: "settings/language",
          name: "settings-language",
          component: () => import("../views/settings/LanguageSettings.vue"),
        },
        {
          path: "settings/translate",
          name: "settings-translate",
          component: () => import("../views/settings/TranslateSettings.vue"),
        },
        {
          path: "settings/debug",
          name: "settings-debug",
          component: () => import("../views/settings/DeveloperSettings.vue"),
        },
        {
          path: "settings/system",
          name: "settings-system",
          component: () => import("../views/settings/SystemSettings.vue"),
        },
        {
          path: "settings/edit-profile",
          name: "settings-edit-profile",
          component: () => import("../views/settings/EditProfileSettings.vue"),
        },
        {
          path: "settings/privacy",
          name: "settings-privacy",
          component: () => import("../views/settings/PrivacySettings.vue"),
        },
        {
          path: "settings/devices",
          name: "settings-devices",
          component: () => import("../views/settings/DevicesSettings.vue"),
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
        // ===== 群组/频道编辑（创建者 / 管理员）=====
        {
          path: "chat-edit/:id",
          name: "chat-edit",
          component: () => import("../views/group/GroupEditPage.vue"),
        },
        {
          path: "chat-edit/:id/type",
          name: "group-type",
          component: () => import("../views/group/GroupTypePage.vue"),
        },
        {
          path: "chat-edit/:id/linked",
          name: "group-linked",
          component: () => import("../views/group/GroupLinkedChatPage.vue"),
        },
        {
          path: "chat-edit/:id/permissions",
          name: "group-permissions",
          component: () => import("../views/group/GroupPermissionsPage.vue"),
        },
        {
          path: "chat-edit/:id/admins",
          name: "group-admins",
          component: () => import("../views/group/GroupAdminsPage.vue"),
        },
        {
          path: "chat-edit/:id/members",
          name: "group-members",
          component: () => import("../views/group/GroupMembersPage.vue"),
        },
        {
          path: "chat-edit/:id/blacklist",
          name: "group-blacklist",
          component: () => import("../views/group/GroupBlacklistPage.vue"),
        },
        {
          path: "chat-edit/:id/event-log",
          name: "group-event-log",
          component: () => import("../views/group/GroupEventLogPage.vue"),
        },
        {
          path: "chat-edit/:id/appearance",
          name: "group-appearance",
          component: () => import("../views/group/GroupAppearancePage.vue"),
        },
        {
          path: "chat-edit/:id/direct-messages",
          name: "group-direct-messages",
          component: () => import("../views/group/GroupDirectMessagesPage.vue"),
        },
        {
          path: "chat-edit/:id/topics",
          name: "group-topics",
          component: () => import("../views/group/GroupTopicsPage.vue"),
        },
        {
          path: "chat-edit/:id/invite-links",
          name: "group-invite-links",
          component: () => import("../views/group/GroupInviteLinksPage.vue"),
        },
        {
          path: "chat-edit/:id/reactions",
          name: "group-reactions",
          component: () => import("../views/group/GroupReactionsPage.vue"),
        },
      ],
    },
    // 兜底：未匹配路由回到根占位，避免 router-view 渲染空白
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export default router;
