import { reactive, watch } from "vue";

const SETTINGS_KEY = "tdgram-settings";

/**
 * 按对话类型的自动下载配置
 */
export interface AutoDownloadByType {
  contacts: boolean;
  groups: boolean;
  privateChats: boolean;
  channels: boolean;
}

export interface AutoDownloadPhotosConfig extends AutoDownloadByType {
  // 图片始终对所有类型启用，故只需 enabled
  enabled: boolean;
}

export interface AutoDownloadVideosConfig extends AutoDownloadByType {
  enabled: boolean;
  /** 自动下载最大体积，单位 MB */
  maxSize: number;
}

export interface AutoDownloadFilesConfig extends AutoDownloadByType {
  enabled: boolean;
  /** 自动下载最大体积，单位 MB */
  maxSize: number;
}

interface Settings {
  folderStyle: "tabs" | "pills" | "text";
  /** 加载指示器样式（ldrs loader 名，ring2 为默认） */
  loadingStyle: "ring2" | "squircle" | "square" | "reuleaux" | "infinity" | "trefoil";
  /** 是否在分组栏选项卡中显示未读消息计数器 */
  showFolderUnread: boolean;
  /** 是否在分组栏选项卡中显示分组图标 */
  showFolderIcons: boolean;
  /** 聊天列表显示设置 */
  chatList: {
    /** 头像圆角角度 0~100（0=方形，100=圆形） */
    avatarCornerRadius: number;
    /** 话题模式（论坛群组）头像是否跟随头像圆角；关闭时按方形显示 */
    forumAvatarFollowsRadius: boolean;
    /** 最后消息前显示发送者迷你头像 */
    showSenderMiniAvatar: boolean;
    /** 未读消息角标显示在消息预览左侧 */
    badgeOnLeft: boolean;
    /** 左侧未读角标仅对静音对话生效 */
    badgeOnLeftMutedOnly: boolean;
    /** 分组栏未读计数模式：chats=未读对话数量（默认），messages=未读消息总数 */
    unreadCountMode: "chats" | "messages";
    /** 归档位置：top=全部对话顶部，sidebar=侧边栏导航，hidden=隐藏 */
    archivePosition: "top" | "sidebar" | "hidden";
  };
  /** 消息显示设置 */
  message: {
    /** 消息气泡圆角半径（px） */
    cornerRadius: number;
    /** 消息气泡四角对称：true=四个角都用 cornerRadius，false=头像侧角用 6px 小圆角 */
    cornerRadiusSymmetrical: boolean;
    /** 消息文本字体大小（px） */
    fontSize: number;
    /** 消息整体比例缩放（0.8 ~ 1.2） */
    scale: number;
    /** 点击 bot 命令（如 /start）时：true=添加到输入框（而非直接发送） */
    botCommandInsert: boolean;
  };
  /** 贴纸显示设置 */
  sticker: {
    /** 贴纸大小（px） */
    size: number;
    /** 是否隐藏贴纸右下角发送时间小胶囊 */
    hideTimestamp: boolean;
  };
  autoDownload: {
    /** 自动下载总开关 */
    enabled: boolean;
    /** 图片（包括视频封面、贴纸、音频封面） — 默认全部启用 */
    photos: AutoDownloadPhotosConfig;
    /** 视频 */
    videos: AutoDownloadVideosConfig;
    /** 文件（文档） */
    files: AutoDownloadFilesConfig;
  };
  /** 代理设置 */
  proxy: {
    /**
     * 代理模式：
     * - disabled：禁用代理
     * - system：使用系统代理
     * - custom：使用代理列表中的某个代理
     */
    mode: "disabled" | "system" | "custom";
    /** 自定义模式下选中的代理 ID（来自代理列表 getProxies） */
    selectedProxyId: number | null;
  };
  /** 播放器设置（跨会话记忆） */
  player: {
    /** 音乐播放器音量（0~1），持久化记忆 */
    musicVolume: number;
    /** 音乐播放器列表循环模式：none=顺序, one=单曲循环, all=列表循环, shuffle=随机 */
    musicRepeatMode: "none" | "one" | "all" | "shuffle";
    /** 媒体播放器（视频查看器）音量（0~1），持久化记忆 */
    mediaVolume: number;
  };
}

const defaultSettings: Settings = {
  folderStyle: "tabs",
  loadingStyle: "ring2",
  showFolderUnread: true,
  showFolderIcons: true,
  chatList: {
    avatarCornerRadius: 100,
    forumAvatarFollowsRadius: false,
    showSenderMiniAvatar: false,
    badgeOnLeft: false,
    badgeOnLeftMutedOnly: false,
    unreadCountMode: "chats",
    archivePosition: "sidebar",
  },
  message: {
    cornerRadius: 18,
    cornerRadiusSymmetrical: false,
    fontSize: 14,
    scale: 1,
    botCommandInsert: false,
  },
  sticker: {
    size: 160,
    hideTimestamp: false,
  },
  autoDownload: {
    enabled: true,
    photos: {
      enabled: true,
      contacts: true,
      groups: true,
      privateChats: true,
      channels: true,
    },
    videos: {
      enabled: true,
      contacts: true,
      groups: true,
      privateChats: true,
      channels: true,
      maxSize: 10,
    },
    files: {
      enabled: true,
      contacts: true,
      groups: true,
      privateChats: true,
      channels: true,
      maxSize: 3,
    },
  },
  proxy: {
    mode: "disabled",
    selectedProxyId: null,
  },
  player: {
    musicVolume: 0.8,
    musicRepeatMode: "none",
    mediaVolume: 0.7,
  },
};

// Load from localStorage（与默认值深度合并，确保新增的嵌套字段始终有默认值）
function mergeSettings(defaults: any, saved: any): any {
  if (
    typeof defaults === "object" && defaults !== null && !Array.isArray(defaults) &&
    typeof saved === "object" && saved !== null && !Array.isArray(saved)
  ) {
    const result: any = { ...defaults };
    for (const key of Object.keys(saved)) {
      result[key] = mergeSettings(defaults[key], saved[key]);
    }
    return result;
  }
  return saved !== undefined ? saved : defaults;
}

const savedSettings = localStorage.getItem(SETTINGS_KEY);
const initialState = mergeSettings(defaultSettings, savedSettings ? JSON.parse(savedSettings) : {});

export const settings = reactive<Settings>(initialState);

// Save to localStorage on change
watch(
  settings,
  (newSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  },
  { deep: true }
);
