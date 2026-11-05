import { ref } from "vue";
import type { story } from "tdlib-types";

/** 故事播放器是否打开，供 TitleBar / ChatDetail 等感知 */
export const isStoryViewerActive = ref(false);

const viewerVisible = ref(false);
const viewerIndex = ref(0);
const viewerItems = ref<story[]>([]);

export function getStoryViewerState() {
  return { viewerVisible, viewerIndex, viewerItems };
}

/** 打开故事播放器：传入故事列表与起始下标 */
export function openStoryViewer(stories: story[], startIndex = 0) {
  if (!stories.length) return;
  viewerItems.value = stories;
  viewerIndex.value = Math.max(0, Math.min(startIndex, stories.length - 1));
  viewerVisible.value = true;
  isStoryViewerActive.value = true;
}

export function closeStoryViewer() {
  viewerVisible.value = false;
  isStoryViewerActive.value = false;
}
