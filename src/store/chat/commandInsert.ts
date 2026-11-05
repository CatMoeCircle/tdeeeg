import { ref } from 'vue';

/**
 * 跨组件「点击 bot 命令 → 插入输入框」的轻量单例。
 *
 * 深层消息组件（如 MessageTextContent）点击 bot 命令（/start 等）时，
 * 调用 `requestInsertCommand(cmd)` 把要插入的命令写入响应式队列；
 * 输入框所在组件（ChatDetail/index.vue）watch 该值并把命令插入输入框最前面。
 * 消费完成后调用方需 `clearPendingCommand()` 清空，防止重复插入。
 */
const pendingCommand = ref<string | null>(null);

/** 请求把某条 bot 命令插入输入框（命令文本形如 /start 或 /start@bot） */
export function requestInsertCommand(cmd: string): void {
    pendingCommand.value = cmd;
}

/** 读取待插入的命令（供消费方读取/清空） */
export function useCommandInsert() {
    return { pendingCommand };
}

/** 清空待插入命令（消费完成后调用） */
export function clearPendingCommand(): void {
    pendingCommand.value = null;
}
