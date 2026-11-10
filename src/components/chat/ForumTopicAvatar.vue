<template>
    <!-- 话题头像：General 用主题色 #，设置过自定义 emoji 的用透明 emoji，其余用主题色首字母方块。
         与对话列表（论坛 list 模式）和侧边栏共用，避免两处 icon 样式漂移。 -->
    <div class="flex shrink-0 items-center justify-center overflow-hidden" :style="rootStyle">
        <CustomEmojiInline v-if="customEmojiId" :emojiId="customEmojiId" :size="emojiSize" />
        <span v-else class="font-bold leading-none text-white" :style="{ fontSize: `${fontSize}px` }">
            {{ initial }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { forumTopic } from 'tdlib-types';
import CustomEmojiInline from '../common/CustomEmojiInline.vue';

const props = withDefaults(defineProps<{
    topic: forumTopic;
    /** 头像边长（px） */
    size?: number;
    /** 圆角（px） */
    radius?: number;
}>(), {
    size: 40,
    radius: 12,
});

/** 与 ChatList / TopicTagBar / ForumTopicList 里的主题色表保持一致 */
const TOPIC_ICON_COLORS: Record<number, string> = {
    0x6FB9F0: '#6FB9F0',
    0xFFD67E: '#FFD67E',
    0xCB86DB: '#CB86DB',
    0x8EEE98: '#8EEE98',
    0xFF93B2: '#FF93B2',
    0xFB6F5F: '#FB6F5F',
};

const color = computed(() => TOPIC_ICON_COLORS[props.topic.info.icon.color] || '#6FB9F0');
const initial = computed(() =>
    props.topic.info.is_general ? '#' : (props.topic.info.name.substring(0, 1) || '#').toUpperCase(),
);
/** General 忽略自定义 emoji（对齐 ChatList 现有规则） */
const customEmojiId = computed(() => {
    if (props.topic.info.is_general) return '';
    const id = props.topic.info.icon.custom_emoji_id;
    return id && id !== '0' ? String(id) : '';
});
const emojiSize = computed(() => Math.round(props.size * 0.72));
const fontSize = computed(() => Math.round(props.size * 0.42));

const rootStyle = computed(() => ({
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${props.radius}px`,
    // 自定义 emoji 话题不铺底色，只显示 emoji 本身；General / 首字母才用主题色方块
    backgroundColor: customEmojiId.value ? 'transparent' : color.value,
}));
</script>
