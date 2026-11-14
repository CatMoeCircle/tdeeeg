<template>
    <!-- 外层宽度 = 小部件宽度（0 时由气泡撑满），使 caption 与底部时间共享同一宽度 -->
    <div ref="rootEl" class="message-widget" :style="containerStyle">
        <!-- Caption above：字色跟气泡走（与媒体消息一致） -->
        <div v-if="showCaptionAbove && hasCaption" class="msg-body-text pb-1">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" :messageId="messageId" />
        </div>

        <!--
          小部件本体：HTML 由机器人下发，只能放进沙箱 iframe。
          文档经 `widget://`（Windows: http://widget.localhost）协议返回，是独立 origin：
          - 主文档 CSP 不会继承过去，小部件脚本可以执行、能量自身高度；
          - iframe 不带 allow-same-origin → opaque origin，读不到主文档；
          - IPC 另由响应头 CSP（connect-src 'none'）与 IPC_GUARD_SCRIPT 掐断。

          底色透明：小部件直接贴在气泡上（气泡的白 / 绿 / 深色就是它的底），
          自己画了背景（--tg-theme-bg-color 等）就由它自己盖住。
        -->
        <div class="relative w-full overflow-hidden rounded-lg bg-transparent" :style="frameStyle">
            <iframe v-if="frameSrc" ref="iframeEl" class="block h-full w-full border-0 bg-transparent"
                :src="frameSrc" :title="t('preview.widget')" sandbox="allow-scripts" referrerpolicy="no-referrer"
                loading="lazy" @load="onFrameLoad" />
            <!-- HTML 为空才算真的不支持 -->
            <div v-else-if="htmlEmpty"
                class="flex h-full w-full items-center justify-center px-3 text-center text-xs text-gray-400">
                {{ t('content.unsupportedContent') }}
            </div>
            <!-- 安全模式：文档还没注册（register 根本没调），点一下再确认加载 -->
            <div v-else-if="locked"
                class="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                <LockIcon class="w-5 h-5 text-gray-400" />
                <p class="text-xs text-gray-400">{{ t('lockdown.widgetHidden') }}</p>
                <button type="button"
                    class="rounded-lg bg-[var(--app-brand,#2aabee)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                    @click="revealWidget">
                    {{ t('lockdown.loadWidget') }}
                </button>
            </div>
        </div>

        <!-- Caption below -->
        <div v-if="!showCaptionAbove && hasCaption" class="msg-body-text pt-1">
            <MessageTextContent :formattedText="captionFormatted" :chatId="chatId" :messageId="messageId" />
        </div>

        <!-- 回应（由 MessageContent 默认插槽传入）：放在小部件与底部时间之间 -->
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { Lock as LockIcon } from 'lucide-vue-next';
import type { formattedText, messageWidget } from 'tdlib-types';
import MessageTextContent from './MessageTextContent.vue';
import { useColors } from '../../../../../store/settings/colors';
import { settings } from '../../../../../store/settings/settings';
import { useUserStore } from '../../../../../store/session/user';
import { handleWidgetCall, widgetViewer, type WidgetCallPayload } from '../../../../../utils/widget/widgetHost';
import { isLockdownRuleOn, requireLockdown } from '../../../../../utils/security/lockdown';
import emojiFontUrl from '../../../../../assets/apple.ttf?url';

const { t } = useI18n();
const { isDark, accentColorStyle } = useColors();
const router = useRouter();
const userStore = useUserStore();

const props = defineProps<{
    content: messageWidget;
    chatId?: number;
    messageId?: number;
    /** 发送者 accent_color_id：小部件里的链接 / 强调色跟消息配色一致 */
    accentColorId?: number;
}>();

const EMPTY_TEXT: formattedText = { _: 'formattedText', text: '', entities: [] };

/** TDLib 未给高度（0 = 高度不固定）时的兜底高度；小部件回报真实高度后立即替换 */
const DEFAULT_WIDGET_HEIGHT = 200;
/** 回报高度的合理区间：夹紧，避免畸形文档把气泡撑爆 */
const MIN_WIDGET_HEIGHT = 40;
const MAX_WIDGET_HEIGHT = 1200;
/** 高度回调用消息键（宿主与沙箱文档之间的约定） */
const HEIGHT_KEY = 'tdgramWidgetHeight';
const THEME_KEY = 'tdgramWidgetTheme';

const rootEl = ref<HTMLElement | null>(null);
const iframeEl = ref<HTMLIFrameElement | null>(null);
/** 小部件页面地址（由 Rust 侧 register_widget_html 注册） */
const frameSrc = ref('');
/** 小部件回报的内容高度（0 = 还没量到） */
const measuredHeight = ref(0);
let registerSeq = 0;

/**
 * 安全模式下是否仍处于"未加载"状态。
 *
 * 这里刻意不是盖一层遮罩：`register()` 在锁定期间直接不调用 Rust 侧的
 * `register_widget_html`，机器人下发的 HTML 连 WebView 都不进——
 * 比"加载后再藏起来"彻底。
 */
const unlockedByUser = ref(false);
const locked = computed(() => isLockdownRuleOn('widgets') && !unlockedByUser.value);

/** 用户点击占位条：确认后注册文档 */
async function revealWidget() {
    if (!(await requireLockdown('widgets'))) return;
    unlockedByUser.value = true;
    await register();
}

const captionFormatted = computed<formattedText>(() => props.content.caption ?? EMPTY_TEXT);
const hasCaption = computed(() => !!captionFormatted.value.text);
const showCaptionAbove = computed(() => !!props.content.show_caption_above_media);
const htmlEmpty = computed(() => !(props.content.html ?? '').trim());
/** TDLib：width = 0 表示小部件占满消息气泡宽度 */
const fillWidth = computed(() => !(props.content.width > 0));
/** TDLib：height = 0 表示高度不固定，由小部件回报 */
const autoHeight = computed(() => !(props.content.height > 0));

/** 消息强调色：优先用发送者 accent（与回复栏、链接预览同源），无则用默认蓝 */
const accent = computed(() => accentColorStyle(props.accentColorId ?? 5));

const containerStyle = computed<Record<string, string>>(() => ({
    width: fillWidth.value ? '100%' : `${props.content.width}px`,
    maxWidth: '100%',
}));

const frameStyle = computed<Record<string, string>>(() => {
    const h = autoHeight.value
        ? (measuredHeight.value > 0 ? measuredHeight.value : DEFAULT_WIDGET_HEIGHT)
        : props.content.height;
    return { height: `${h}px` };
});

// ===== 主题 =====

/** 应用级主题变量：原样拷进小部件文档，widget 里也能用我们自己的 token */
const APP_THEME_VARS = [
    '--app-brand',
    '--app-brand-hover',
    '--app-brand-active',
    '--app-brand-soft',
    '--app-brand-softer',
    '--app-success',
    '--app-warning',
    '--app-error',
    '--app-bg-page',
    '--app-bg-container',
    '--app-bg-elevated',
    '--app-bg-muted',
    '--app-border',
    '--app-border-strong',
    '--app-blue-verified',
    '--app-text-primary',
    '--app-text-secondary',
    '--app-text-placeholder',
    '--app-text-disabled',
    '--app-radius-xs',
    '--app-radius-sm',
    '--app-radius-md',
    '--app-radius-lg',
    '--app-radius-xl',
    '--app-shadow-1',
    '--app-shadow-2',
    '--app-shadow-3',
    '--app-scrollbar-width',
    '--app-scrollbar-width-compact',
    '--app-scrollbar-radius',
    '--app-scrollbar-thumb',
    '--app-scrollbar-thumb-hover',
    '--app-scrollbar-thumb-active',
    '--app-scrollbar-track-hover',
] as const;

/** 与 index.css 的全局字体栈保持一致的兜底值（真实值从主文档 body 的计算样式读） */
const APP_FONT_STACK =
    'system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",' +
    '"Noto Sans CJK SC","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** 小部件文档的一份主题快照 */
interface WidgetTheme {
    /** 暗色 */
    dark: boolean;
    /** 正文基准字号（px），跟随「消息字体大小」设置 */
    fontSize: number;
    /** 气泡正文色（小部件里 var(--tg-theme-text-color) 取同一色） */
    textColor: string;
    /** 变量表：app token + Bot API themeParams（--tg-theme-*） */
    vars: Record<string, string>;
}

/** 读元素上的 CSS 变量（未设置返回空串） */
function readVar(el: Element | null, name: string): string {
    if (!el) return '';
    return getComputedStyle(el).getPropertyValue(name).trim();
}

/** 气泡是否透明（无气泡消息 / 气泡背景走自定义皮肤时兜底用） */
function isTransparent(color: string): boolean {
    return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

/**
 * 采集当前主题：
 * - `--app-*` 直接从根节点拷贝（应用主题层是唯一真源，改色只改 theme.css）；
 * - 前景/底色取**气泡本体**的实际渲染色（自己消息绿底、自定义皮肤都自动跟随）；
 * - 再按 Bot API 的 themeParams 命名映射一套 `--tg-theme-*`，机器人小部件按官方变量写样式即可直接适配。
 */
function currentTheme(): WidgetTheme {
    const root = document.documentElement;
    const dark = isDark.value;
    const vars: Record<string, string> = {};
    for (const name of APP_THEME_VARS) {
        const value = readVar(root, name);
        if (value) vars[name] = value;
    }

    const bubbleEl = rootEl.value?.closest('[data-bubble-msg-id]') as HTMLElement | null;
    const bubbleStyle = bubbleEl ? getComputedStyle(bubbleEl) : null;
    const textColor = bubbleStyle?.color || (dark ? 'rgba(255,255,255,0.9)' : '#1f2937');
    const bubbleBg = bubbleStyle?.backgroundColor ?? '';
    const surface = !isTransparent(bubbleBg)
        ? bubbleBg
        : (vars[dark ? '--app-bg-elevated' : '--app-bg-container'] || (dark ? '#2c2c2c' : '#ffffff'));
    const muted = vars['--app-bg-muted'] || surface;
    const fontSize = parseFloat(readVar(rootEl.value, '--msg-font-size')) || settings.message.fontSize || 14;

    const link = accent.value.text || vars['--app-brand'] || '#2aabee';
    const brand = vars['--app-brand'] || accent.value.color || link;

    // 字体栈直接取主文档 body 的计算值：全局字体（含 emoji）改一处，小部件跟着变
    vars['--app-widget-font-family'] = getComputedStyle(document.body).fontFamily || APP_FONT_STACK;

    vars['--tg-theme-bg-color'] = surface;
    vars['--tg-theme-text-color'] = textColor;
    vars['--tg-theme-hint-color'] = vars['--app-text-secondary'] || textColor;
    vars['--tg-theme-subtitle-text-color'] = vars['--app-text-secondary'] || textColor;
    vars['--tg-theme-link-color'] = link;
    vars['--tg-theme-accent-text-color'] = link;
    vars['--tg-theme-button-color'] = brand;
    vars['--tg-theme-button-text-color'] = '#ffffff';
    vars['--tg-theme-secondary-bg-color'] = muted;
    vars['--tg-theme-header-bg-color'] = surface;
    vars['--tg-theme-section-bg-color'] = vars['--app-bg-elevated'] || surface;
    vars['--tg-theme-section-header-text-color'] = link;
    vars['--tg-theme-section-separator-color'] = vars['--app-border'] || 'rgba(0,0,0,0.08)';
    vars['--tg-theme-destructive-text-color'] = vars['--app-error'] || '#d54941';

    return { dark, fontSize, textColor, vars };
}

// ===== 沙箱文档 =====

/**
 * 兜底脚本：掐断 iframe 里的 Tauri IPC 通道。
 *
 * 主防线是响应头 CSP 的 `connect-src 'none'`：Tauri 的 IPC 实际走
 * `fetch('http://ipc.localhost/…')`，在小部件里一定失败。
 * 但 Tauri 的初始化脚本会注入到**所有框架**，iframe 里仍然存在
 * `__TAURI_INTERNALS__` 与 `window.ipc`，所以这里再把底层的
 * `chrome.webview.postMessage` 换成空函数（WebView2 上可覆盖），
 * 即使将来放宽 CSP，小部件也发不出 IPC。
 */
const IPC_GUARD_SCRIPT = [
    '<script>(function(){',
    'try{',
    // 覆盖成不可写 / 不可配置的属性：普通赋值可以被 `delete` 掉、再从原型链拿回原生方法
    'var noop=function(){};',
    'var kill=function(obj){if(!obj)return;',
    'try{Object.defineProperty(obj,"postMessage",{value:noop,writable:false,configurable:false});}',
    'catch(e){try{obj.postMessage=noop;}catch(e2){}}};',
    'var w=window.chrome&&window.chrome.webview;',
    'kill(w);',
    // 原生方法若挂在原型上，单独覆盖实例会被 delete 掉后回退，原型也一并堵上
    'try{var proto=w&&Object.getPrototypeOf(w);if(proto&&proto!==Object.prototype)kill(proto);}catch(e){}',
    '}catch(e){}})();<\/script>',
].join('');

/**
 * 主题同步脚本：主题跟着应用走（应用可强制明暗，与系统偏好无关）。
 * 宿主在 load 与主题 / 字号变化时把整份变量表 postMessage 进来，避免换主题就重载 iframe。
 */
const THEME_SCRIPT = [
    '<script>(function(){',
    'function apply(t){try{',
    'if(!t)return;var r=document.documentElement;',
    'if(typeof t.dark==="boolean"){r.setAttribute("data-td-theme",t.dark?"dark":"light");r.style.colorScheme=t.dark?"dark":"light";}',
    'var vars=t.vars||{};',
    'for(var k in vars){if(Object.prototype.hasOwnProperty.call(vars,k)){r.style.setProperty(k,String(vars[k]));}}',
    'if(t.textColor){r.style.color=t.textColor;}',
    'if(t.fontSize){r.style.fontSize=t.fontSize+"px";}',
    '}catch(e){}}',
    'window.addEventListener("message",function(e){var d=e.data;',
    'if(d&&typeof d==="object"&&d.' + THEME_KEY + ')apply(d.' + THEME_KEY + ');});',
    '})();<\/script>',
].join('');

/** 高度回报脚本：ResizeObserver + load 后上报 documentElement.scrollHeight */
const HEIGHT_SCRIPT = [
    '<script>(function(){',
    'var scheduled=false,last=0;',
    'function send(){try{var d=document.documentElement,b=document.body;',
    'var h=Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0);',
    'if(h>0&&Math.abs(h-last)>1){last=h;parent.postMessage({' + HEIGHT_KEY + ':h},"*");}}catch(e){}}',
    'function schedule(){if(scheduled)return;scheduled=true;',
    'try{requestAnimationFrame(function(){scheduled=false;send();});}catch(e){scheduled=false;send();}}',
    'try{new ResizeObserver(schedule).observe(document.documentElement);}catch(e){}',
    'window.addEventListener("load",schedule);',
    'document.addEventListener("DOMContentLoaded",schedule);',
    'schedule();setTimeout(schedule,120);setTimeout(schedule,600);',
    '})();<\/script>',
].join('');

/**
 * 基础样式：字体 / 字色 / 行高 / 链接 / 选中 / 滚动条全部对齐主文档，
 * 小部件自身不写样式时也和应用长得一样。
 *
 * 字体写在 `html` 上：小部件常见的 `font-family: inherit` 是从根节点继承的，
 * 只写 `body` 会让它落回浏览器默认（衬线）字体。
 */
const BASE_CSS = [
    // 根字体必须 !important：小部件常写 `html,body{…font-family:inherit}`，
    // 而根元素的 inherit 会掉回浏览器默认字体（WebView2 上是 Noto Sans SC），
    // 一并把我们注入的 emoji 字体也丢掉。
    'html{font-family:var(--app-widget-font-family,system-ui,sans-serif)!important;}',
    'html,body{margin:0;padding:0;background:transparent;}',
    'body{font-family:inherit;font-size:inherit;line-height:1.4;-webkit-font-smoothing:antialiased;',
    'overflow-wrap:break-word;color:inherit;}',
    'a{color:var(--tg-theme-link-color);}',
    '::selection{background:color-mix(in srgb,var(--tg-theme-link-color) 35%,transparent);}',
    'img,svg,video{max-width:100%;}',
    '*{box-sizing:border-box;}',
    '*::-webkit-scrollbar{width:var(--app-scrollbar-width,6px);height:var(--app-scrollbar-width,6px);}',
    '*::-webkit-scrollbar-track{background:transparent;}',
    '*::-webkit-scrollbar-corner{background:transparent;}',
    '*::-webkit-scrollbar-thumb{background-color:var(--app-scrollbar-thumb,rgba(100,116,139,.38));',
    'border-radius:var(--app-scrollbar-radius,999px);}',
    '*::-webkit-scrollbar-thumb:hover{background-color:var(--app-scrollbar-thumb-hover,rgba(71,85,105,.55));}',
].join('');

// ===== emoji 字体 =====

/**
 * 小部件文档里的 emoji 字体地址：`widget://…/__emoji-font`（与文档同源）。
 *
 * 字体在打包版里内嵌于前端资源、不在磁盘上；小部件又是 opaque origin 的独立源，
 * 既读不到应用资源也过不了 CORS。所以由前端 `fetch` 一次产物、把字节交给 Rust 存内存，
 * 再由协议同源回给 iframe（dev 与正式版同一套路径）。
 */
const EMOJI_FONT_ROUTE = '/__emoji-font';
let emojiFontSrcPromise: Promise<string> | null = null;

/** 解析 emoji 字体地址（整个应用只上传 / 注册一次） */
function emojiFontSrc(): Promise<string> {
    if (!emojiFontSrcPromise) {
        emojiFontSrcPromise = (async () => {
            try {
                const response = await fetch(emojiFontUrl);
                if (!response.ok) throw new Error(`emoji font HTTP ${response.status}`);
                const bytes = new Uint8Array(await response.arrayBuffer());
                await invoke('set_widget_emoji_font', bytes);
                return EMOJI_FONT_ROUTE;
            } catch (err) {
                // 拿不到字体就退回系统 emoji（CSS 字体栈里还有 Segoe UI Emoji / Noto Color Emoji）
                console.warn('[widget] emoji font unavailable:', err);
                return '';
            }
        })();
    }
    return emojiFontSrcPromise;
}

// ===== 小部件 JS 接口（宿主侧） =====

/** 小部件接口配置：随文档一起注入（chat_data / public_data / viewer 等） */
interface WidgetBridgeConfig {
    chatData: string;
    publicData: string;
    widgetId: string;
    canSendQueries: boolean;
    viewer: ReturnType<typeof widgetViewer>;
}

/** 当前用户资料只拉一次：小部件的 `viewer` 需要它 */
let viewerPromise: Promise<void> | null = null;
async function ensureViewer(): Promise<void> {
    if (userStore.userProfile) return;
    viewerPromise = viewerPromise ?? Promise.resolve(userStore.fetchUser());
    await viewerPromise;
}

function bridgeConfig(): WidgetBridgeConfig {
    const content = props.content;
    return {
        chatData: content.chat_data ?? '',
        publicData: content.public_data ?? '',
        widgetId: content.widget_id ?? '0',
        canSendQueries: !!content.can_send_queries,
        viewer: widgetViewer(userStore.userProfile),
    };
}

/**
 * 小部件接口实现（与官方 `window.TelegramWidget` 同名同语义）：
 * 只通过 `postMessage` 跟宿主通信，宿主侧的处理见 `utils/widget/widgetHost.ts`。
 */
const WIDGET_BRIDGE_SCRIPT = [
    '<script>(function(){',
    'var cfg=window.__TD_WIDGET_CONFIG__||{};',
    'var seq=0,pending=new Map(),listeners={};',
    'function call(method,args){return new Promise(function(resolve,reject){',
    'var id=++seq;pending.set(id,{resolve:resolve,reject:reject});',
    'try{parent.postMessage({tdgramWidgetCall:{id:id,method:method,args:args||[]}},"*");}',
    'catch(e){pending.delete(id);reject({code:"POST_FAILED"});return;}',
    'setTimeout(function(){if(pending.has(id)){pending.delete(id);reject({code:"TIMEOUT"});}},30000);',
    '});}',
    'window.addEventListener("message",function(e){var d=e.data;if(!d||typeof d!=="object")return;',
    'if(d.tdgramWidgetReply){var r=d.tdgramWidgetReply,p=pending.get(r.id);if(!p)return;pending.delete(r.id);',
    'if(r.ok){p.resolve(r.result);}else{p.reject(r.error||{code:"UNKNOWN"});}return;}',
    'if(d.tdgramWidgetEvent){var ev=d.tdgramWidgetEvent;',
    'if(ev.event==="chatDataChanged"){api.chatData=ev.data||"";}',
    'if(ev.event==="publicDataChanged"){api.publicData=ev.data||"";}',
    'var ls=listeners[ev.event]||[];for(var i=0;i<ls.length;i++){try{ls[i](ev.data);}catch(err){}}',
    '}});',
    'var api={',
    'chatData:cfg.chatData||"",publicData:cfg.publicData||"",widgetId:cfg.widgetId||"0",',
    'canSendQueries:!!cfg.canSendQueries,viewer:cfg.viewer||null,',
    'request:function(query){return call("request",[query]).then(function(r){return {result:(r&&r.result)||""};});},',
    'getPublicData:function(){return call("getPublicData",[]);},',
    'onEvent:function(name,cb){if(typeof cb!=="function")return;(listeners[name]=listeners[name]||[]).push(cb);},',
    'offEvent:function(name,cb){var ls=listeners[name];if(!ls)return;var i=ls.indexOf(cb);if(i>=0){ls.splice(i,1);}},',
    'copyText:function(text){return call("copyText",[text]);},',
    'openTelegramLink:function(url){return call("openTelegramLink",[url]);},',
    'openLink:function(url){return call("openLink",[url]);},',
    'ready:function(){return call("ready",[]);},',
    'HapticFeedback:{impactOccurred:function(){},notificationOccurred:function(){},selectionChanged:function(){}},',
    '};',
    'window.TelegramWidget=api;',
    'try{window.dispatchEvent(new Event("TelegramWidgetReady"));}catch(e){}',
    '})();<\/script>',
].join('');

/** 注入给文档的配置：转义 `<`，防止 JSON 里出现结束标签把脚本截断 */
function configScript(config: WidgetBridgeConfig): string {
    const json = JSON.stringify(config).replace(/</g, '\\u003c');
    return `<script>window.__TD_WIDGET_CONFIG__=${json};<\/script>`;
}

// ===== 小部件自带字体的 emoji 兜底 =====

const EMOJI_FAMILY = '"Apple Color Emoji"';
/** 单引号版本：往 `style="…"` 这类双引号属性里补字体时必须换引号，否则会截断属性 */
const EMOJI_FAMILY_SQ = "'Apple Color Emoji'";
/** CSS 关键字不能追加逗号列表 */
const FONT_FAMILY_KEYWORDS = /^(inherit|initial|unset|revert|revert-layer)$/i;

/**
 * 给一条 font-family 值补上我们的 emoji 字体：
 * `"Noto Sans SC"` → `"Noto Sans SC", "Apple Color Emoji"`。
 *
 * 这样小部件保留自己的正文字体，而它字体里没有的 emoji 会落到我们注入的 apple.ttf，
 * 不会掉回系统 emoji（Windows 上是 Fluent 设计，和应用里不一致）。
 *
 * @param raw   原始声明值（可能带 `!important`）
 * @param quote 追加时使用的引号（与所在 HTML 属性的引号必须不同）
 */
function withEmojiFallback(raw: string, quote: string): string {
    const match = raw.match(/^([\s\S]*?)(\s*!\s*important)?\s*$/i);
    const list = (match?.[1] ?? raw).trim();
    const important = match?.[2] ? ' !important' : '';
    if (!list || FONT_FAMILY_KEYWORDS.test(list)) return raw;
    if (list.toLowerCase().includes('apple color emoji')) return raw;
    return `${list}, ${quote === "'" ? EMOJI_FAMILY_SQ : EMOJI_FAMILY}${important}`;
}

/**
 * 把 emoji 兜底写进小部件自带的 `font-family` 声明（`<style>` 块 + 内联 style）。
 * 只改字体列表末尾，不动其它属性；`inherit` 之类关键字原样保留（由根节点规则兜住）。
 */
function appendEmojiFallback(html: string): string {
    const styleBlock = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
    const decl = /(font-family\s*:\s*)([^;{}]+)/gi;
    const declInAttr = /(font-family\s*:\s*)([^;"']+)/gi;
    return html
        .replace(styleBlock, (_all: string, open: string, css: string, close: string) =>
            open + css.replace(decl, (_m: string, head: string, value: string) => head + withEmojiFallback(value, '"')) + close)
        .replace(/(\sstyle\s*=\s*")([^"]*)(")/gi, (_all: string, open: string, css: string, close: string) =>
            open + css.replace(declInAttr, (_m: string, head: string, value: string) => head + withEmojiFallback(value, "'")) + close)
        .replace(/(\sstyle\s*=\s*')([^']*)(')/gi, (_all: string, open: string, css: string, close: string) =>
            open + css.replace(declInAttr, (_m: string, head: string, value: string) => head + withEmojiFallback(value, '"')) + close);
}

/** 组装交给 Rust 侧托管的完整文档 */
function buildDocument(html: string, fontSrc: string): string {
    const theme = currentTheme();
    const varBlock = Object.keys(theme.vars)
        .map((name) => `${name}:${theme.vars[name]};`)
        .join('');
    const fontFace = fontSrc
        ? `@font-face{font-family:"Apple Color Emoji";src:url("${fontSrc.replace(/"/g, '%22')}") format("truetype");font-display:swap;}`
        : '';
    return [
        `<!DOCTYPE html><html data-td-theme="${theme.dark ? 'dark' : 'light'}"><head><meta charset="utf-8">`,
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        `<meta name="color-scheme" content="${theme.dark ? 'dark' : 'light'}">`,
        IPC_GUARD_SCRIPT,
        configScript(bridgeConfig()),
        WIDGET_BRIDGE_SCRIPT,
        THEME_SCRIPT,
        // 根节点同时带上字号与字色：小部件的 `inherit` 才能拿到应用里的正文规格
        `<style>${fontFace}:root{${varBlock}font-size:${theme.fontSize}px;color:${theme.textColor};}${BASE_CSS}</style>`,
        '</head><body>',
        appendEmojiFallback(html),
        autoHeight.value ? HEIGHT_SCRIPT : '',
        '</body></html>',
    ].join('');
}

/** 注册文档拿到 iframe 地址：同一份 HTML 得到同一地址，重渲染不会重载小部件 */
async function register() {
    const html = props.content.html ?? '';
    const seq = ++registerSeq;
    if (!html.trim()) {
        frameSrc.value = '';
        return;
    }
    if (locked.value) {
        frameSrc.value = '';
        return;
    }
    try {
        // 字体地址与 viewer 资料都不阻塞首次渲染太久：并行拿，失败也照常渲染
        const [fontSrc] = await Promise.all([emojiFontSrc(), ensureViewer()]);
        const url = await invoke<string>('register_widget_html', { html: buildDocument(html, fontSrc) });
        if (seq !== registerSeq) return;
        frameSrc.value = url;
        measuredHeight.value = 0;
    } catch (err) {
        if (seq !== registerSeq) return;
        console.warn('[widget] register failed:', err);
        frameSrc.value = '';
    }
}

/** 主题 / 字号推给沙箱文档（无需重载 iframe） */
function pushTheme() {
    const win = iframeEl.value?.contentWindow;
    if (!win) return;
    win.postMessage({ [THEME_KEY]: currentTheme() }, '*');
}

/** 向沙箱文档推事件（chat_data 更新等） */
function pushEvent(event: string, data: unknown) {
    const win = iframeEl.value?.contentWindow;
    if (!win) return;
    win.postMessage({ tdgramWidgetEvent: { event, data } }, '*');
}

/** 同时进行的机器人 query 上限：恶意小部件狂刷会把 TDLib / 账号打到限流 */
const MAX_CONCURRENT_QUERIES = 8;
let inFlightQueries = 0;

/** 处理沙箱小部件发起的调用，把结果回给对应 iframe */
async function onWidgetCall(call: WidgetCallPayload) {
    const win = iframeEl.value?.contentWindow;
    if (!win || typeof call?.id !== 'number') return;
    const isQuery = call.method === 'request';
    if (isQuery && inFlightQueries >= MAX_CONCURRENT_QUERIES) {
        win.postMessage(
            {
                tdgramWidgetReply: {
                    id: call.id,
                    ok: false,
                    error: { code: 'TOO_MANY_REQUESTS', message: 'too many concurrent widget queries' },
                },
            },
            '*',
        );
        return;
    }
    if (isQuery) inFlightQueries++;
    try {
        const result = await handleWidgetCall(
            {
                chatId: props.chatId,
                messageId: props.messageId,
                canSendQueries: !!props.content.can_send_queries,
                viewer: userStore.userProfile,
                router,
            },
            call,
        );
        win.postMessage({ tdgramWidgetReply: { id: call.id, ok: true, result } }, '*');
    } catch (err) {
        const error = err as { code?: string; message?: string } | undefined;
        win.postMessage(
            {
                tdgramWidgetReply: {
                    id: call.id,
                    ok: false,
                    error: { code: error?.code ?? 'ERROR', message: error?.message ?? String(err) },
                },
            },
            '*',
        );
    } finally {
        if (isQuery) inFlightQueries--;
    }
}

function onFrameLoad() {
    pushTheme();
}

/** 小部件回报高度 / 发起调用：只认自己这个 iframe 发来的消息 */
function onWindowMessage(e: MessageEvent) {
    const win = iframeEl.value?.contentWindow;
    if (!win || e.source !== win) return;
    const data = e.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return;
    if (data.tdgramWidgetCall) {
        void onWidgetCall(data.tdgramWidgetCall as WidgetCallPayload);
        return;
    }
    const raw = data[HEIGHT_KEY];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    const next = Math.min(Math.max(Math.round(raw), MIN_WIDGET_HEIGHT), MAX_WIDGET_HEIGHT);
    if (next !== measuredHeight.value) measuredHeight.value = next;
}

// 首屏主题要读气泡的实际渲染色，得等挂载后再注册文档
onMounted(() => {
    window.addEventListener('message', onWindowMessage);
    void register();
});

onBeforeUnmount(() => {
    window.removeEventListener('message', onWindowMessage);
});

// 内容变化（机器人编辑小部件）才重新注册；主题变化只推变量，不重载。
// 内容一变就退回"未解锁"：确认过的旧内容不代表新内容也安全。
watch(
    [() => props.content.html, autoHeight],
    () => {
        unlockedByUser.value = false;
        void register();
    },
);

// 安全模式开关变化：开启时立刻收回已渲染的小部件并重新要求确认；关闭时补一次注册
watch(
    () => isLockdownRuleOn('widgets'),
    (on) => {
        unlockedByUser.value = false;
        if (on) {
            frameSrc.value = '';
            return;
        }
        void register();
    },
);

// 机器人改了 chat_data（例如点了「打个招呼」之后计数变化）→ 通知小部件
watch(
    () => props.content.chat_data,
    (chatData) => { pushEvent('chatDataChanged', chatData ?? ''); },
);

watch([isDark, () => settings.message.fontSize, () => props.accentColorId], () => {
    pushTheme();
});
</script>
