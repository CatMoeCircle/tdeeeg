import { reactive, watch } from "vue";

const SETTINGS_KEY = "tdgram-settings";

interface Settings {
  folderStyle: "tabs" | "pills" | "text";
}

const defaultSettings: Settings = {
  folderStyle: "tabs",
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
