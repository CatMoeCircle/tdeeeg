import type { textEntity, textEntity$Input } from 'tdlib-types';
import { tdlibSend } from './tdlib';

/** 可直接放进 TDLib inputMessageText / caption 的富文本（formattedText 形状） */
export interface SendText {
    text: string;
    entities: textEntity[];
}

/**
 * 发送前用 TDLib 判断文本里的 Markdown（parseMarkdown：容错，忽略 markup 错误），
 * 让 `**粗体**` / `` `代码` `` / `[文字](url)` 变成实体，而不是把标记原样发出去。
 *
 * 手工实体（格式菜单 / 自定义 emoji）优先：解析会消费标记字符、改变偏移，
 * 所以原文一旦被改写就只在没有手工实体时采用解析结果；解析失败退回原文，不让发送失败。
 */
export async function withParsedMarkdown(
    text: string,
    entities: textEntity$Input[] = [],
): Promise<SendText> {
    const keep = (): SendText => ({ text, entities: entities as textEntity[] });
    if (!text) return keep();
    try {
        const parsed = await tdlibSend({
            _: 'parseMarkdown',
            text: { _: 'formattedText', text, entities: [] },
        });
        if (parsed.text === text || entities.length > 0) return keep();
        return { text: parsed.text, entities: parsed.entities };
    } catch {
        return keep();
    }
}
