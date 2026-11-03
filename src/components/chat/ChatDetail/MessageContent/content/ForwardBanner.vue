<template>
    <!--
        转发来源横幅（仿 Telegram Web K 版，上下结构）：
            转发的消息
        [头像] 来源名 (原始作者)
        气泡内「转发的消息」标签与第二行同属一个交互单元，悬停时整块一起高亮背景；
        没有气泡背景时（无 caption 的媒体 / 相册、贴纸等独立消息）横幅直接压在聊天背景上，
        文字看不清，此时补一层服务消息的通用底色（.msg-notice-surface）：
        第一行底色只包住标签文字、第二行底色连头像一起包住，两块同色无缝隙拼成一整块（台阶形），
        既不会在标题右侧留一大片空白，也不会看成两个分开的标签；
        通过 props 传入渲染所需数据，保持组件纯展示、无响应式依赖。
    -->
    <div class="flex min-w-0 justify-start overflow-hidden text-left select-none" :class="rootClass">
        <!-- 整体交互单元：标签 + 头像 + 来源名 (+ 原始作者) -->
        <span class="inline-flex min-w-0 max-w-full flex-col" :style="textStyle"
            :title="navigable ? t('content.jumpToSource') : undefined" :class="unitClass"
            @click.stop="openSource">
            <!-- 第一行：「转发的消息」标签 -->
            <span class="shrink-0 text-[11px] font-medium" :class="labelClass">
                <span class="opacity-70">{{ t('content.forwardedMessage') }}</span>
            </span>

            <!-- 第二行：头像 + 来源名 (+ 原始作者)；无气泡时同样落在整块底色里 -->
            <span class="flex min-w-0 items-center text-xs font-semibold" :class="metaLineClass">
                <!-- 转发来源头像（隐藏来源时无头像） -->
                <span v-if="photo !== undefined || accentId !== undefined"
                    class="mr-0.5 inline-flex shrink-0 items-center">
                    <Avatar :photo="photo" :title="name" :first-name="firstName" :last-name="lastName"
                        :accentColorId="accentId" sizeClass="!w-4 !h-4" />
                </span>

                <!-- 来源名称（peer title）+ 原始作者签名（频道帖子 / 匿名群管），同一行内紧跟 -->
                <span class="min-w-0 flex items-center gap-0 overflow-hidden whitespace-nowrap">
                    <span class="min-w-0 max-w-full truncate"><GlobalEmojiText :text="name" /></span>
                    <template v-if="originalName">
                        <span class="shrink-0 opacity-80">&nbsp;(</span>
                        <span class="min-w-0 max-w-[45%] shrink truncate">{{ originalName }}</span>
                        <span class="shrink-0 opacity-80">)</span>
                    </template>
                </span>
            </span>
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from '../../../avatar.vue';
import GlobalEmojiText from '../../../../common/GlobalEmojiText.vue';
import type { chatPhotoInfo, profilePhoto } from 'tdlib-types';

const { t } = useI18n();

const props = defineProps<{
    /** 来源显示名（peer title / 用户姓名） */
    name: string;
    /** 来源为用户时的姓名拆分（无头像文字用） */
    firstName?: string;
    lastName?: string;
    /** 原始作者签名（频道帖子 / 匿名群管），可为空 */
    originalName?: string;
    /** 来源头像 */
    photo?: chatPhotoInfo | profilePhoto;
    /** 来源头像无照片时的 accent 底色 id */
    accentId?: number;
    /** 是否可跳转到来源 */
    navigable?: boolean;
    /** 是否为自己发送的消息：影响文字颜色 */
    self?: boolean;
    /** 是否作为媒体/相册横幅（占满整行 + 内边距） */
    mediaInline?: boolean;
    /** 横幅是否直接压在聊天背景上（无 caption 的媒体/相册、贴纸等独立消息，没有气泡或卡片底色） */
    bubbleless?: boolean;
    /** 文字颜色（他人消息的 accent 色；自己消息忽略此项） */
    textColor?: string;
}>();

const emit = defineEmits<{
    openSource: [];
}>();

const openSource = () => {
    if (props.navigable) emit('openSource');
};

/** 整行文字颜色：自己消息浅色，他人消息用传入 accent 色 / 蓝色 */
const textStyle = computed((): Record<string, string> => {
    // 无气泡的自己消息：字色交给主题相关 class（深色下用浅字），否则深色背景上看不清
    if (props.bubbleless && props.self) return {};
    if (props.self) return { color: 'rgba(0,0,0,0.55)' };
    return { color: props.textColor || 'rgb(59 130 246)' };
});

/**
 * 交互单元 class：整块底色只铺在这一层（一个元素 = 一个圆角矩形，不会在行与行之间留接缝）。
 * 气泡内是整块悬停高亮；无气泡时这一层补服务消息的通用底色（.msg-notice-surface），
 * 悬停 / 按下由 theme.css 里的 .msg-forward-source 改同一个底色变量。
 */
const unitClass = computed(() => {
    if (props.bubbleless) {
        return [
            props.navigable ? 'cursor-pointer' : 'cursor-default',
            // 悬停反馈的钩子（规则见 theme.css）；底色在两行上，所以用后代选择器
            props.navigable ? 'msg-forward-source' : '',
            // 自己消息在气泡内是浅绿底黑字；无气泡时改为跟随主题，深色下才不会糊在背景里
            props.self ? 'text-black/55 dark:text-white/75' : '',
        ];
    }
    return [
        props.navigable ? 'cursor-pointer' : 'cursor-default',
        'rounded-md px-1.5 py-0.5 transition-colors',
        props.navigable
            ? 'hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15'
            : '',
    ];
});

/**
 * 第一行：底色只包住标签文字（self-start，不拉满整行），只有上缘圆角；
 * 与第二行用同一份底色、同一个 16px 行盒，两块严丝合缝拼成一块。
 * msg-forward-flat：两块拼接时背景模糊会在接缝处断成一条线，所以横幅只取底色不做模糊。
 */
const labelClass = computed(() =>
    props.bubbleless
        // self-start：底色只包住标签文字，不拉满整行（否则右侧会空出一大片）
        // msg-forward-step：右缘底部补一个向外鼓的弯口，让台阶的交接处也是圆的
        ? 'msg-notice-surface msg-forward-flat msg-forward-step relative self-start rounded-t-md px-2 pt-1 pb-px leading-4 transition-colors'
        : 'leading-none',
);

/**
 * 第二行：连头像一起包住；下缘两角圆，右上角（台阶外侧的那个角）也圆，
 * 左上角保持直角与第一行相接，两块拼成一块。
 */
const metaLineClass = computed(() => (props.bubbleless
    ? 'msg-notice-surface msg-forward-flat rounded-b-md rounded-tr-md px-2 pt-px pb-1 transition-colors'
    : 'mt-1'));

/** 根 class：媒体/相册横幅占满整行并带上下内边距，普通文本消息紧凑 */
const rootClass = computed(() => [
    props.mediaInline ? 'w-full px-2 pt-1 pb-1.5' : 'mb-0.5 -mt-0.5',
]);
</script>
