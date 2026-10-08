<template>
    <span v-if="ids.length" class="flex items-center -space-x-1.5 shrink-0">
        <StoryRing v-for="id in ids" :key="id" :chat-id="id" :size="22" :diameter="22" class="shrink-0" no-drag>
            <Avatar v-if="chatOf(id)" :photo="chatOf(id)!.photo" :title="chatOf(id)!.title"
                :accentColorId="accentOf(id)" />
        </StoryRing>
    </span>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import StoryRing from "./StoryRing.vue";
import Avatar from "../chat/avatar.vue";
import { getChatStoryState, getActiveStoryChatIds, getResolvedSelfChatId } from "../../store/storyRing";
import {
    ensureChat,
    getReactiveChat,
    getChatAccentColorId,
    ensureChatAccentLoaded,
} from "../../utils/senderInfo";

/**
 * 标题栏右侧的动态头像叠加（最多 3 个），像回应/评论那样叠放，
 * 每个头像自带动态渐变描边（看过后变灰）。点击直接播放对应对话的动态。
 */

/** 最多展示 3 个，与回应/评论叠加保持一致 */
const MAX = 3;

const ids = computed(() => {
    const self = getResolvedSelfChatId();
    // 含已看完的动态（看完只变灰、不摘除），自己的动态固定排最前
    const list = getActiveStoryChatIds().filter((id) => id !== self);
    if (self && getChatStoryState(self)) list.unshift(self);
    return list.slice(0, MAX);
});

const chatOf = (id: number) => getReactiveChat(id);

const accentOf = (id: number) => getChatAccentColorId(chatOf(id));

// 头像需要 chat 数据（photo/title）与 accent 色，进入列表时预取
watch(
    ids,
    (list) => {
        for (const id of list) {
            void ensureChat(id).then(() => ensureChatAccentLoaded(getReactiveChat(id)));
        }
    },
    { immediate: true },
);
</script>
