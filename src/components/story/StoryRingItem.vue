<template>
    <StoryRing v-if="chat" :chat-id="chatId" :size="size" :diameter="size" class="shrink-0">
        <Avatar :photo="chat.photo" :title="chat.title" :first-name="names.first" :last-name="names.last"
            :accentColorId="accentOf" />
    </StoryRing>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import StoryRing from "./StoryRing.vue";
import Avatar from "../chat/avatar.vue";
import {
    ensureChat,
    getReactiveChat,
    getChatAccentColorId,
    getChatUserNames,
    ensureChatAccentLoaded,
} from "../../utils/senderInfo";

/**
 * 单个动态圆环头像（标题栏叠加 / 「更多动态」展开条共用）。
 * chat 数据到达前不渲染，挂载即按 chat_id 预取头像与 accent 色。
 */

const props = withDefaults(defineProps<{ chatId: number; size?: number }>(), { size: 22 });

const chat = computed(() => getReactiveChat(props.chatId));
const names = computed(() => getChatUserNames(chat.value));
const accentOf = computed(() => getChatAccentColorId(chat.value));

// 头像需要 chat 数据（photo/title）与 accent 色，进入列表时预取
watch(
    () => props.chatId,
    (id) => {
        void ensureChat(id).then(() => ensureChatAccentLoaded(getReactiveChat(id)));
    },
    { immediate: true },
);
</script>
