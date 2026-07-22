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
}

const defaultSettings: Settings = {
  folderStyle: "tabs",
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
};

// Load from localStorage
const savedSettings = localStorage.getItem(SETTINGS_KEY);
const initialState = savedSettings
  ? JSON.parse(savedSettings)
  : defaultSettings;

export const settings = reactive<Settings>(initialState);

// Save to localStorage on change
watch(
  settings,
  (newSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  },
  { deep: true }
);
