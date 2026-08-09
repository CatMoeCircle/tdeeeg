// 由 scripts/gen-emoji-panel.mjs 生成，勿手改。本地 emoji 面板的 8 大分类数据（来源 emoji-datasource-apple）。
export interface EmojiPayloadItem {
  /** 原生 emoji 字符串 */
  emoji: string;
  /** public/emoji/ 下的 Apple 风格图片文件名 */
  image: string;
  /** 是否需要肤色选择 */
  fitzpatrick: boolean;
}
export interface EmojiPayloadCategory {
  id: string;
  /** 本地化 key（如需翻译可走 i18n），此处为英文名 */
  name: string;
  count: number;
  items: EmojiPayloadItem[];
}
export const EMOJI_PAYLOAD: EmojiPayloadCategory[] = [
  {
    "id": "emojipeople",
    "name": "Emoji & People",
    "count": 555,
    "items": [
      {
        "emoji": "😀",
        "image": "1f600.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😃",
        "image": "1f603.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😄",
        "image": "1f604.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😁",
        "image": "1f601.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😆",
        "image": "1f606.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😅",
        "image": "1f605.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤣",
        "image": "1f923.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😂",
        "image": "1f602.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙂",
        "image": "1f642.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙃",
        "image": "1f643.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫠",
        "image": "1fae0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😉",
        "image": "1f609.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😊",
        "image": "1f60a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😇",
        "image": "1f607.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥰",
        "image": "1f970.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😍",
        "image": "1f60d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤩",
        "image": "1f929.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😘",
        "image": "1f618.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😗",
        "image": "1f617.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☺️",
        "image": "263a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😚",
        "image": "1f61a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😙",
        "image": "1f619.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥲",
        "image": "1f972.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😋",
        "image": "1f60b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😛",
        "image": "1f61b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😜",
        "image": "1f61c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤪",
        "image": "1f92a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😝",
        "image": "1f61d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤑",
        "image": "1f911.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤗",
        "image": "1f917.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤭",
        "image": "1f92d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫢",
        "image": "1fae2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫣",
        "image": "1fae3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤫",
        "image": "1f92b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤔",
        "image": "1f914.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫡",
        "image": "1fae1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤐",
        "image": "1f910.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤨",
        "image": "1f928.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😐",
        "image": "1f610.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😑",
        "image": "1f611.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😶",
        "image": "1f636.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫥",
        "image": "1fae5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😶‍🌫️",
        "image": "1f636-200d-1f32b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😏",
        "image": "1f60f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😒",
        "image": "1f612.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙄",
        "image": "1f644.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😬",
        "image": "1f62c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😮‍💨",
        "image": "1f62e-200d-1f4a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤥",
        "image": "1f925.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫨",
        "image": "1fae8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙂‍↔️",
        "image": "1f642-200d-2194-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙂‍↕️",
        "image": "1f642-200d-2195-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😌",
        "image": "1f60c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😔",
        "image": "1f614.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😪",
        "image": "1f62a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤤",
        "image": "1f924.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😴",
        "image": "1f634.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫩",
        "image": "1fae9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😷",
        "image": "1f637.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤒",
        "image": "1f912.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤕",
        "image": "1f915.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤢",
        "image": "1f922.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤮",
        "image": "1f92e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤧",
        "image": "1f927.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥵",
        "image": "1f975.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥶",
        "image": "1f976.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥴",
        "image": "1f974.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😵",
        "image": "1f635.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😵‍💫",
        "image": "1f635-200d-1f4ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤯",
        "image": "1f92f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤠",
        "image": "1f920.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥳",
        "image": "1f973.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥸",
        "image": "1f978.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😎",
        "image": "1f60e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤓",
        "image": "1f913.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧐",
        "image": "1f9d0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😕",
        "image": "1f615.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫤",
        "image": "1fae4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😟",
        "image": "1f61f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙁",
        "image": "1f641.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☹️",
        "image": "2639-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😮",
        "image": "1f62e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😯",
        "image": "1f62f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😲",
        "image": "1f632.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😳",
        "image": "1f633.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥺",
        "image": "1f97a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥹",
        "image": "1f979.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😦",
        "image": "1f626.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😧",
        "image": "1f627.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😨",
        "image": "1f628.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😰",
        "image": "1f630.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😥",
        "image": "1f625.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😢",
        "image": "1f622.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😭",
        "image": "1f62d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😱",
        "image": "1f631.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😖",
        "image": "1f616.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😣",
        "image": "1f623.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😞",
        "image": "1f61e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😓",
        "image": "1f613.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😩",
        "image": "1f629.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😫",
        "image": "1f62b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥱",
        "image": "1f971.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😤",
        "image": "1f624.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😡",
        "image": "1f621.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😠",
        "image": "1f620.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤬",
        "image": "1f92c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😈",
        "image": "1f608.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👿",
        "image": "1f47f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💀",
        "image": "1f480.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☠️",
        "image": "2620-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💩",
        "image": "1f4a9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤡",
        "image": "1f921.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👹",
        "image": "1f479.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👺",
        "image": "1f47a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👻",
        "image": "1f47b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👽",
        "image": "1f47d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👾",
        "image": "1f47e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤖",
        "image": "1f916.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😺",
        "image": "1f63a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😸",
        "image": "1f638.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😹",
        "image": "1f639.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😻",
        "image": "1f63b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😼",
        "image": "1f63c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😽",
        "image": "1f63d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙀",
        "image": "1f640.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😿",
        "image": "1f63f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "😾",
        "image": "1f63e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙈",
        "image": "1f648.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙉",
        "image": "1f649.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙊",
        "image": "1f64a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💌",
        "image": "1f48c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💘",
        "image": "1f498.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💝",
        "image": "1f49d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💖",
        "image": "1f496.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💗",
        "image": "1f497.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💓",
        "image": "1f493.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💞",
        "image": "1f49e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💕",
        "image": "1f495.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💟",
        "image": "1f49f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❣️",
        "image": "2763-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💔",
        "image": "1f494.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❤️‍🔥",
        "image": "2764-fe0f-200d-1f525.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❤️‍🩹",
        "image": "2764-fe0f-200d-1fa79.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❤️",
        "image": "2764-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩷",
        "image": "1fa77.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧡",
        "image": "1f9e1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💛",
        "image": "1f49b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💚",
        "image": "1f49a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💙",
        "image": "1f499.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩵",
        "image": "1fa75.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💜",
        "image": "1f49c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤎",
        "image": "1f90e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖤",
        "image": "1f5a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩶",
        "image": "1fa76.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤍",
        "image": "1f90d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💋",
        "image": "1f48b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💯",
        "image": "1f4af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💢",
        "image": "1f4a2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💥",
        "image": "1f4a5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💫",
        "image": "1f4ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💦",
        "image": "1f4a6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💨",
        "image": "1f4a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕳️",
        "image": "1f573-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💬",
        "image": "1f4ac.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👁️‍🗨️",
        "image": "1f441-fe0f-200d-1f5e8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗨️",
        "image": "1f5e8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗯️",
        "image": "1f5ef-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💭",
        "image": "1f4ad.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💤",
        "image": "1f4a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👋",
        "image": "1f44b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤚",
        "image": "1f91a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖐️",
        "image": "1f590-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✋",
        "image": "270b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖖",
        "image": "1f596.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫱",
        "image": "1faf1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫲",
        "image": "1faf2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫳",
        "image": "1faf3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫴",
        "image": "1faf4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫷",
        "image": "1faf7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫸",
        "image": "1faf8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👌",
        "image": "1f44c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤌",
        "image": "1f90c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤏",
        "image": "1f90f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✌️",
        "image": "270c-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤞",
        "image": "1f91e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫰",
        "image": "1faf0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤟",
        "image": "1f91f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤘",
        "image": "1f918.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤙",
        "image": "1f919.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👈",
        "image": "1f448.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👉",
        "image": "1f449.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👆",
        "image": "1f446.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖕",
        "image": "1f595.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👇",
        "image": "1f447.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☝️",
        "image": "261d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫵",
        "image": "1faf5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👍",
        "image": "1f44d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👎",
        "image": "1f44e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✊",
        "image": "270a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👊",
        "image": "1f44a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤛",
        "image": "1f91b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤜",
        "image": "1f91c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👏",
        "image": "1f44f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙌",
        "image": "1f64c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫶",
        "image": "1faf6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👐",
        "image": "1f450.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤲",
        "image": "1f932.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤝",
        "image": "1f91d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙏",
        "image": "1f64f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✍️",
        "image": "270d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💅",
        "image": "1f485.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤳",
        "image": "1f933.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💪",
        "image": "1f4aa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦾",
        "image": "1f9be.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦿",
        "image": "1f9bf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦵",
        "image": "1f9b5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦶",
        "image": "1f9b6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👂",
        "image": "1f442.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦻",
        "image": "1f9bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👃",
        "image": "1f443.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧠",
        "image": "1f9e0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫀",
        "image": "1fac0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫁",
        "image": "1fac1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦷",
        "image": "1f9b7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦴",
        "image": "1f9b4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👀",
        "image": "1f440.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👁️",
        "image": "1f441-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👅",
        "image": "1f445.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👄",
        "image": "1f444.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫦",
        "image": "1fae6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👶",
        "image": "1f476.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧒",
        "image": "1f9d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👦",
        "image": "1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👧",
        "image": "1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑",
        "image": "1f9d1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👱",
        "image": "1f471.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨",
        "image": "1f468.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧔",
        "image": "1f9d4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧔‍♂️",
        "image": "1f9d4-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧔‍♀️",
        "image": "1f9d4-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦰",
        "image": "1f468-200d-1f9b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦱",
        "image": "1f468-200d-1f9b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦳",
        "image": "1f468-200d-1f9b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦲",
        "image": "1f468-200d-1f9b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩",
        "image": "1f469.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦰",
        "image": "1f469-200d-1f9b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦰",
        "image": "1f9d1-200d-1f9b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦱",
        "image": "1f469-200d-1f9b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦱",
        "image": "1f9d1-200d-1f9b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦳",
        "image": "1f469-200d-1f9b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦳",
        "image": "1f9d1-200d-1f9b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦲",
        "image": "1f469-200d-1f9b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦲",
        "image": "1f9d1-200d-1f9b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👱‍♀️",
        "image": "1f471-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👱‍♂️",
        "image": "1f471-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧓",
        "image": "1f9d3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👴",
        "image": "1f474.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👵",
        "image": "1f475.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙍",
        "image": "1f64d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙍‍♂️",
        "image": "1f64d-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙍‍♀️",
        "image": "1f64d-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙎",
        "image": "1f64e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙎‍♂️",
        "image": "1f64e-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙎‍♀️",
        "image": "1f64e-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙅",
        "image": "1f645.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙅‍♂️",
        "image": "1f645-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙅‍♀️",
        "image": "1f645-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙆",
        "image": "1f646.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙆‍♂️",
        "image": "1f646-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙆‍♀️",
        "image": "1f646-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💁",
        "image": "1f481.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💁‍♂️",
        "image": "1f481-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💁‍♀️",
        "image": "1f481-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙋",
        "image": "1f64b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙋‍♂️",
        "image": "1f64b-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙋‍♀️",
        "image": "1f64b-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧏",
        "image": "1f9cf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧏‍♂️",
        "image": "1f9cf-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧏‍♀️",
        "image": "1f9cf-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙇",
        "image": "1f647.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙇‍♂️",
        "image": "1f647-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🙇‍♀️",
        "image": "1f647-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤦",
        "image": "1f926.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤦‍♂️",
        "image": "1f926-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤦‍♀️",
        "image": "1f926-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤷",
        "image": "1f937.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤷‍♂️",
        "image": "1f937-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤷‍♀️",
        "image": "1f937-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍⚕️",
        "image": "1f9d1-200d-2695-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍⚕️",
        "image": "1f468-200d-2695-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍⚕️",
        "image": "1f469-200d-2695-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🎓",
        "image": "1f9d1-200d-1f393.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🎓",
        "image": "1f468-200d-1f393.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🎓",
        "image": "1f469-200d-1f393.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🏫",
        "image": "1f9d1-200d-1f3eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🏫",
        "image": "1f468-200d-1f3eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🏫",
        "image": "1f469-200d-1f3eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍⚖️",
        "image": "1f9d1-200d-2696-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍⚖️",
        "image": "1f468-200d-2696-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍⚖️",
        "image": "1f469-200d-2696-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🌾",
        "image": "1f9d1-200d-1f33e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🌾",
        "image": "1f468-200d-1f33e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🌾",
        "image": "1f469-200d-1f33e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🍳",
        "image": "1f9d1-200d-1f373.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🍳",
        "image": "1f468-200d-1f373.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🍳",
        "image": "1f469-200d-1f373.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🔧",
        "image": "1f9d1-200d-1f527.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🔧",
        "image": "1f468-200d-1f527.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🔧",
        "image": "1f469-200d-1f527.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🏭",
        "image": "1f9d1-200d-1f3ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🏭",
        "image": "1f468-200d-1f3ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🏭",
        "image": "1f469-200d-1f3ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍💼",
        "image": "1f9d1-200d-1f4bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍💼",
        "image": "1f468-200d-1f4bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍💼",
        "image": "1f469-200d-1f4bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🔬",
        "image": "1f9d1-200d-1f52c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🔬",
        "image": "1f468-200d-1f52c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🔬",
        "image": "1f469-200d-1f52c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍💻",
        "image": "1f9d1-200d-1f4bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍💻",
        "image": "1f468-200d-1f4bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍💻",
        "image": "1f469-200d-1f4bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🎤",
        "image": "1f9d1-200d-1f3a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🎤",
        "image": "1f468-200d-1f3a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🎤",
        "image": "1f469-200d-1f3a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🎨",
        "image": "1f9d1-200d-1f3a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🎨",
        "image": "1f468-200d-1f3a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🎨",
        "image": "1f469-200d-1f3a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍✈️",
        "image": "1f9d1-200d-2708-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍✈️",
        "image": "1f468-200d-2708-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍✈️",
        "image": "1f469-200d-2708-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🚀",
        "image": "1f9d1-200d-1f680.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🚀",
        "image": "1f468-200d-1f680.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🚀",
        "image": "1f469-200d-1f680.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🚒",
        "image": "1f9d1-200d-1f692.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🚒",
        "image": "1f468-200d-1f692.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🚒",
        "image": "1f469-200d-1f692.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👮",
        "image": "1f46e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👮‍♂️",
        "image": "1f46e-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👮‍♀️",
        "image": "1f46e-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕵️",
        "image": "1f575-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕵️‍♂️",
        "image": "1f575-fe0f-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕵️‍♀️",
        "image": "1f575-fe0f-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💂",
        "image": "1f482.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💂‍♂️",
        "image": "1f482-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💂‍♀️",
        "image": "1f482-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥷",
        "image": "1f977.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👷",
        "image": "1f477.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👷‍♂️",
        "image": "1f477-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👷‍♀️",
        "image": "1f477-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫅",
        "image": "1fac5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤴",
        "image": "1f934.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👸",
        "image": "1f478.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👳",
        "image": "1f473.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👳‍♂️",
        "image": "1f473-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👳‍♀️",
        "image": "1f473-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👲",
        "image": "1f472.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧕",
        "image": "1f9d5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤵",
        "image": "1f935.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤵‍♂️",
        "image": "1f935-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤵‍♀️",
        "image": "1f935-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👰",
        "image": "1f470.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👰‍♂️",
        "image": "1f470-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👰‍♀️",
        "image": "1f470-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤰",
        "image": "1f930.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫃",
        "image": "1fac3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫄",
        "image": "1fac4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤱",
        "image": "1f931.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🍼",
        "image": "1f469-200d-1f37c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🍼",
        "image": "1f468-200d-1f37c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🍼",
        "image": "1f9d1-200d-1f37c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👼",
        "image": "1f47c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎅",
        "image": "1f385.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤶",
        "image": "1f936.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🎄",
        "image": "1f9d1-200d-1f384.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦸",
        "image": "1f9b8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦸‍♂️",
        "image": "1f9b8-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦸‍♀️",
        "image": "1f9b8-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦹",
        "image": "1f9b9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦹‍♂️",
        "image": "1f9b9-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦹‍♀️",
        "image": "1f9b9-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧙",
        "image": "1f9d9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧙‍♂️",
        "image": "1f9d9-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧙‍♀️",
        "image": "1f9d9-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧚",
        "image": "1f9da.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧚‍♂️",
        "image": "1f9da-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧚‍♀️",
        "image": "1f9da-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧛",
        "image": "1f9db.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧛‍♂️",
        "image": "1f9db-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧛‍♀️",
        "image": "1f9db-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧜",
        "image": "1f9dc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧜‍♂️",
        "image": "1f9dc-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧜‍♀️",
        "image": "1f9dc-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧝",
        "image": "1f9dd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧝‍♂️",
        "image": "1f9dd-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧝‍♀️",
        "image": "1f9dd-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧞",
        "image": "1f9de.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧞‍♂️",
        "image": "1f9de-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧞‍♀️",
        "image": "1f9de-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧟",
        "image": "1f9df.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧟‍♂️",
        "image": "1f9df-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧟‍♀️",
        "image": "1f9df-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧌",
        "image": "1f9cc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💆",
        "image": "1f486.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💆‍♂️",
        "image": "1f486-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💆‍♀️",
        "image": "1f486-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💇",
        "image": "1f487.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💇‍♂️",
        "image": "1f487-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💇‍♀️",
        "image": "1f487-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶",
        "image": "1f6b6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶‍♂️",
        "image": "1f6b6-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶‍♀️",
        "image": "1f6b6-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶‍➡️",
        "image": "1f6b6-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶‍♀️‍➡️",
        "image": "1f6b6-200d-2640-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚶‍♂️‍➡️",
        "image": "1f6b6-200d-2642-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧍",
        "image": "1f9cd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧍‍♂️",
        "image": "1f9cd-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧍‍♀️",
        "image": "1f9cd-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎",
        "image": "1f9ce.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎‍♂️",
        "image": "1f9ce-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎‍♀️",
        "image": "1f9ce-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎‍➡️",
        "image": "1f9ce-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎‍♀️‍➡️",
        "image": "1f9ce-200d-2640-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧎‍♂️‍➡️",
        "image": "1f9ce-200d-2642-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦯",
        "image": "1f9d1-200d-1f9af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦯‍➡️",
        "image": "1f9d1-200d-1f9af-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦯",
        "image": "1f468-200d-1f9af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦯‍➡️",
        "image": "1f468-200d-1f9af-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦯",
        "image": "1f469-200d-1f9af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦯‍➡️",
        "image": "1f469-200d-1f9af-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦼",
        "image": "1f9d1-200d-1f9bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦼‍➡️",
        "image": "1f9d1-200d-1f9bc-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦼",
        "image": "1f468-200d-1f9bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦼‍➡️",
        "image": "1f468-200d-1f9bc-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦼",
        "image": "1f469-200d-1f9bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦼‍➡️",
        "image": "1f469-200d-1f9bc-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦽",
        "image": "1f9d1-200d-1f9bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🦽‍➡️",
        "image": "1f9d1-200d-1f9bd-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦽",
        "image": "1f468-200d-1f9bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍🦽‍➡️",
        "image": "1f468-200d-1f9bd-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦽",
        "image": "1f469-200d-1f9bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍🦽‍➡️",
        "image": "1f469-200d-1f9bd-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃",
        "image": "1f3c3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃‍♂️",
        "image": "1f3c3-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃‍♀️",
        "image": "1f3c3-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃‍➡️",
        "image": "1f3c3-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃‍♀️‍➡️",
        "image": "1f3c3-200d-2640-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏃‍♂️‍➡️",
        "image": "1f3c3-200d-2642-fe0f-200d-27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💃",
        "image": "1f483.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕺",
        "image": "1f57a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕴️",
        "image": "1f574-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👯",
        "image": "1f46f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👯‍♂️",
        "image": "1f46f-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👯‍♀️",
        "image": "1f46f-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧖",
        "image": "1f9d6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧖‍♂️",
        "image": "1f9d6-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧖‍♀️",
        "image": "1f9d6-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧗",
        "image": "1f9d7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧗‍♂️",
        "image": "1f9d7-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧗‍♀️",
        "image": "1f9d7-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤺",
        "image": "1f93a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏇",
        "image": "1f3c7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛷️",
        "image": "26f7-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏂",
        "image": "1f3c2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏌️",
        "image": "1f3cc-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏌️‍♂️",
        "image": "1f3cc-fe0f-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏌️‍♀️",
        "image": "1f3cc-fe0f-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏄",
        "image": "1f3c4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏄‍♂️",
        "image": "1f3c4-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏄‍♀️",
        "image": "1f3c4-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚣",
        "image": "1f6a3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚣‍♂️",
        "image": "1f6a3-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚣‍♀️",
        "image": "1f6a3-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏊",
        "image": "1f3ca.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏊‍♂️",
        "image": "1f3ca-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏊‍♀️",
        "image": "1f3ca-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛹️",
        "image": "26f9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛹️‍♂️",
        "image": "26f9-fe0f-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛹️‍♀️",
        "image": "26f9-fe0f-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏋️",
        "image": "1f3cb-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏋️‍♂️",
        "image": "1f3cb-fe0f-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏋️‍♀️",
        "image": "1f3cb-fe0f-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚴",
        "image": "1f6b4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚴‍♂️",
        "image": "1f6b4-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚴‍♀️",
        "image": "1f6b4-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚵",
        "image": "1f6b5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚵‍♂️",
        "image": "1f6b5-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚵‍♀️",
        "image": "1f6b5-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤸",
        "image": "1f938.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤸‍♂️",
        "image": "1f938-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤸‍♀️",
        "image": "1f938-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤼",
        "image": "1f93c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤼‍♂️",
        "image": "1f93c-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤼‍♀️",
        "image": "1f93c-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤽",
        "image": "1f93d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤽‍♂️",
        "image": "1f93d-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤽‍♀️",
        "image": "1f93d-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤾",
        "image": "1f93e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤾‍♂️",
        "image": "1f93e-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤾‍♀️",
        "image": "1f93e-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤹",
        "image": "1f939.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤹‍♂️",
        "image": "1f939-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤹‍♀️",
        "image": "1f939-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧘",
        "image": "1f9d8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧘‍♂️",
        "image": "1f9d8-200d-2642-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧘‍♀️",
        "image": "1f9d8-200d-2640-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛀",
        "image": "1f6c0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛌",
        "image": "1f6cc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🤝‍🧑",
        "image": "1f9d1-200d-1f91d-200d-1f9d1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👭",
        "image": "1f46d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👫",
        "image": "1f46b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👬",
        "image": "1f46c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💏",
        "image": "1f48f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍❤️‍💋‍👨",
        "image": "1f469-200d-2764-fe0f-200d-1f48b-200d-1f468.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍❤️‍💋‍👨",
        "image": "1f468-200d-2764-fe0f-200d-1f48b-200d-1f468.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍❤️‍💋‍👩",
        "image": "1f469-200d-2764-fe0f-200d-1f48b-200d-1f469.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💑",
        "image": "1f491.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍❤️‍👨",
        "image": "1f469-200d-2764-fe0f-200d-1f468.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍❤️‍👨",
        "image": "1f468-200d-2764-fe0f-200d-1f468.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍❤️‍👩",
        "image": "1f469-200d-2764-fe0f-200d-1f469.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👩‍👦",
        "image": "1f468-200d-1f469-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👩‍👧",
        "image": "1f468-200d-1f469-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👩‍👧‍👦",
        "image": "1f468-200d-1f469-200d-1f467-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👩‍👦‍👦",
        "image": "1f468-200d-1f469-200d-1f466-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👩‍👧‍👧",
        "image": "1f468-200d-1f469-200d-1f467-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👨‍👦",
        "image": "1f468-200d-1f468-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👨‍👧",
        "image": "1f468-200d-1f468-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👨‍👧‍👦",
        "image": "1f468-200d-1f468-200d-1f467-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👨‍👦‍👦",
        "image": "1f468-200d-1f468-200d-1f466-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👨‍👧‍👧",
        "image": "1f468-200d-1f468-200d-1f467-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👩‍👦",
        "image": "1f469-200d-1f469-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👩‍👧",
        "image": "1f469-200d-1f469-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👩‍👧‍👦",
        "image": "1f469-200d-1f469-200d-1f467-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👩‍👦‍👦",
        "image": "1f469-200d-1f469-200d-1f466-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👩‍👧‍👧",
        "image": "1f469-200d-1f469-200d-1f467-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👦",
        "image": "1f468-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👦‍👦",
        "image": "1f468-200d-1f466-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👧",
        "image": "1f468-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👧‍👦",
        "image": "1f468-200d-1f467-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👨‍👧‍👧",
        "image": "1f468-200d-1f467-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👦",
        "image": "1f469-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👦‍👦",
        "image": "1f469-200d-1f466-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👧",
        "image": "1f469-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👧‍👦",
        "image": "1f469-200d-1f467-200d-1f466.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👩‍👧‍👧",
        "image": "1f469-200d-1f467-200d-1f467.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗣️",
        "image": "1f5e3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👤",
        "image": "1f464.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👥",
        "image": "1f465.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫂",
        "image": "1fac2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👪",
        "image": "1f46a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🧑‍🧒",
        "image": "1f9d1-200d-1f9d1-200d-1f9d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🧑‍🧒‍🧒",
        "image": "1f9d1-200d-1f9d1-200d-1f9d2-200d-1f9d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🧒",
        "image": "1f9d1-200d-1f9d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧑‍🧒‍🧒",
        "image": "1f9d1-200d-1f9d2-200d-1f9d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👣",
        "image": "1f463.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫆",
        "image": "1fac6.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "animalsandnature",
    "name": "Animals and nature",
    "count": 159,
    "items": [
      {
        "emoji": "🐵",
        "image": "1f435.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐒",
        "image": "1f412.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦍",
        "image": "1f98d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦧",
        "image": "1f9a7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐶",
        "image": "1f436.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐕",
        "image": "1f415.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦮",
        "image": "1f9ae.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐕‍🦺",
        "image": "1f415-200d-1f9ba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐩",
        "image": "1f429.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐺",
        "image": "1f43a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦊",
        "image": "1f98a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦝",
        "image": "1f99d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐱",
        "image": "1f431.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐈",
        "image": "1f408.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐈‍⬛",
        "image": "1f408-200d-2b1b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦁",
        "image": "1f981.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐯",
        "image": "1f42f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐅",
        "image": "1f405.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐆",
        "image": "1f406.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐴",
        "image": "1f434.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫎",
        "image": "1face.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫏",
        "image": "1facf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐎",
        "image": "1f40e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦄",
        "image": "1f984.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦓",
        "image": "1f993.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦌",
        "image": "1f98c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦬",
        "image": "1f9ac.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐮",
        "image": "1f42e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐂",
        "image": "1f402.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐃",
        "image": "1f403.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐄",
        "image": "1f404.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐷",
        "image": "1f437.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐖",
        "image": "1f416.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐗",
        "image": "1f417.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐽",
        "image": "1f43d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐏",
        "image": "1f40f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐑",
        "image": "1f411.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐐",
        "image": "1f410.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐪",
        "image": "1f42a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐫",
        "image": "1f42b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦙",
        "image": "1f999.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦒",
        "image": "1f992.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐘",
        "image": "1f418.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦣",
        "image": "1f9a3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦏",
        "image": "1f98f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦛",
        "image": "1f99b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐭",
        "image": "1f42d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐁",
        "image": "1f401.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐀",
        "image": "1f400.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐹",
        "image": "1f439.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐰",
        "image": "1f430.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐇",
        "image": "1f407.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐿️",
        "image": "1f43f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦫",
        "image": "1f9ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦔",
        "image": "1f994.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦇",
        "image": "1f987.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐻",
        "image": "1f43b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐻‍❄️",
        "image": "1f43b-200d-2744-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐨",
        "image": "1f428.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐼",
        "image": "1f43c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦥",
        "image": "1f9a5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦦",
        "image": "1f9a6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦨",
        "image": "1f9a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦘",
        "image": "1f998.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦡",
        "image": "1f9a1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐾",
        "image": "1f43e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦃",
        "image": "1f983.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐔",
        "image": "1f414.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐓",
        "image": "1f413.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐣",
        "image": "1f423.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐤",
        "image": "1f424.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐥",
        "image": "1f425.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐦",
        "image": "1f426.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐧",
        "image": "1f427.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕊️",
        "image": "1f54a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦅",
        "image": "1f985.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦆",
        "image": "1f986.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦢",
        "image": "1f9a2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦉",
        "image": "1f989.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦤",
        "image": "1f9a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪶",
        "image": "1fab6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦩",
        "image": "1f9a9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦚",
        "image": "1f99a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦜",
        "image": "1f99c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪽",
        "image": "1fabd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐦‍⬛",
        "image": "1f426-200d-2b1b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪿",
        "image": "1fabf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐦‍🔥",
        "image": "1f426-200d-1f525.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐸",
        "image": "1f438.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐊",
        "image": "1f40a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐢",
        "image": "1f422.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦎",
        "image": "1f98e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐍",
        "image": "1f40d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐲",
        "image": "1f432.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐉",
        "image": "1f409.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦕",
        "image": "1f995.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦖",
        "image": "1f996.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐳",
        "image": "1f433.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐋",
        "image": "1f40b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐬",
        "image": "1f42c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦭",
        "image": "1f9ad.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐟",
        "image": "1f41f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐠",
        "image": "1f420.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐡",
        "image": "1f421.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦈",
        "image": "1f988.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐙",
        "image": "1f419.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐚",
        "image": "1f41a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪸",
        "image": "1fab8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪼",
        "image": "1fabc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦀",
        "image": "1f980.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦞",
        "image": "1f99e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦐",
        "image": "1f990.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦑",
        "image": "1f991.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦪",
        "image": "1f9aa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐌",
        "image": "1f40c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦋",
        "image": "1f98b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐛",
        "image": "1f41b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐜",
        "image": "1f41c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐝",
        "image": "1f41d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪲",
        "image": "1fab2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🐞",
        "image": "1f41e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦗",
        "image": "1f997.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪳",
        "image": "1fab3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕷️",
        "image": "1f577-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕸️",
        "image": "1f578-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦂",
        "image": "1f982.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦟",
        "image": "1f99f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪰",
        "image": "1fab0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪱",
        "image": "1fab1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦠",
        "image": "1f9a0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💐",
        "image": "1f490.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌸",
        "image": "1f338.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💮",
        "image": "1f4ae.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪷",
        "image": "1fab7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏵️",
        "image": "1f3f5-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌹",
        "image": "1f339.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥀",
        "image": "1f940.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌺",
        "image": "1f33a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌻",
        "image": "1f33b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌼",
        "image": "1f33c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌷",
        "image": "1f337.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪻",
        "image": "1fabb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌱",
        "image": "1f331.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪴",
        "image": "1fab4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌲",
        "image": "1f332.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌳",
        "image": "1f333.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌴",
        "image": "1f334.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌵",
        "image": "1f335.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌾",
        "image": "1f33e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌿",
        "image": "1f33f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☘️",
        "image": "2618-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍀",
        "image": "1f340.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍁",
        "image": "1f341.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍂",
        "image": "1f342.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍃",
        "image": "1f343.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪹",
        "image": "1fab9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪺",
        "image": "1faba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍄",
        "image": "1f344.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪾",
        "image": "1fabe.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "foodanddrink",
    "name": "Food and drink",
    "count": 131,
    "items": [
      {
        "emoji": "🍇",
        "image": "1f347.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍈",
        "image": "1f348.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍉",
        "image": "1f349.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍊",
        "image": "1f34a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍋",
        "image": "1f34b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍋‍🟩",
        "image": "1f34b-200d-1f7e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍌",
        "image": "1f34c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍍",
        "image": "1f34d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥭",
        "image": "1f96d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍎",
        "image": "1f34e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍏",
        "image": "1f34f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍐",
        "image": "1f350.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍑",
        "image": "1f351.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍒",
        "image": "1f352.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍓",
        "image": "1f353.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫐",
        "image": "1fad0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥝",
        "image": "1f95d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍅",
        "image": "1f345.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫒",
        "image": "1fad2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥥",
        "image": "1f965.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥑",
        "image": "1f951.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍆",
        "image": "1f346.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥔",
        "image": "1f954.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥕",
        "image": "1f955.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌽",
        "image": "1f33d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌶️",
        "image": "1f336-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫑",
        "image": "1fad1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥒",
        "image": "1f952.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥬",
        "image": "1f96c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥦",
        "image": "1f966.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧄",
        "image": "1f9c4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧅",
        "image": "1f9c5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥜",
        "image": "1f95c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫘",
        "image": "1fad8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌰",
        "image": "1f330.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫚",
        "image": "1fada.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫛",
        "image": "1fadb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍄‍🟫",
        "image": "1f344-200d-1f7eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫜",
        "image": "1fadc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍞",
        "image": "1f35e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥐",
        "image": "1f950.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥖",
        "image": "1f956.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫓",
        "image": "1fad3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥨",
        "image": "1f968.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥯",
        "image": "1f96f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥞",
        "image": "1f95e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧇",
        "image": "1f9c7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧀",
        "image": "1f9c0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍖",
        "image": "1f356.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍗",
        "image": "1f357.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥩",
        "image": "1f969.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥓",
        "image": "1f953.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍔",
        "image": "1f354.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍟",
        "image": "1f35f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍕",
        "image": "1f355.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌭",
        "image": "1f32d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥪",
        "image": "1f96a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌮",
        "image": "1f32e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌯",
        "image": "1f32f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫔",
        "image": "1fad4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥙",
        "image": "1f959.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧆",
        "image": "1f9c6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥚",
        "image": "1f95a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍳",
        "image": "1f373.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥘",
        "image": "1f958.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍲",
        "image": "1f372.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫕",
        "image": "1fad5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥣",
        "image": "1f963.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥗",
        "image": "1f957.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍿",
        "image": "1f37f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧈",
        "image": "1f9c8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧂",
        "image": "1f9c2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥫",
        "image": "1f96b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍱",
        "image": "1f371.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍘",
        "image": "1f358.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍙",
        "image": "1f359.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍚",
        "image": "1f35a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍛",
        "image": "1f35b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍜",
        "image": "1f35c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍝",
        "image": "1f35d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍠",
        "image": "1f360.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍢",
        "image": "1f362.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍣",
        "image": "1f363.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍤",
        "image": "1f364.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍥",
        "image": "1f365.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥮",
        "image": "1f96e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍡",
        "image": "1f361.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥟",
        "image": "1f95f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥠",
        "image": "1f960.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥡",
        "image": "1f961.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍦",
        "image": "1f366.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍧",
        "image": "1f367.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍨",
        "image": "1f368.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍩",
        "image": "1f369.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍪",
        "image": "1f36a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎂",
        "image": "1f382.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍰",
        "image": "1f370.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧁",
        "image": "1f9c1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥧",
        "image": "1f967.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍫",
        "image": "1f36b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍬",
        "image": "1f36c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍭",
        "image": "1f36d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍮",
        "image": "1f36e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍯",
        "image": "1f36f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍼",
        "image": "1f37c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥛",
        "image": "1f95b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☕",
        "image": "2615.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫖",
        "image": "1fad6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍵",
        "image": "1f375.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍶",
        "image": "1f376.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍾",
        "image": "1f37e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍷",
        "image": "1f377.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍸",
        "image": "1f378.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍹",
        "image": "1f379.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍺",
        "image": "1f37a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍻",
        "image": "1f37b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥂",
        "image": "1f942.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥃",
        "image": "1f943.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫗",
        "image": "1fad7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥤",
        "image": "1f964.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧋",
        "image": "1f9cb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧃",
        "image": "1f9c3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧉",
        "image": "1f9c9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧊",
        "image": "1f9ca.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥢",
        "image": "1f962.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍽️",
        "image": "1f37d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🍴",
        "image": "1f374.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥄",
        "image": "1f944.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔪",
        "image": "1f52a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫙",
        "image": "1fad9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏺",
        "image": "1f3fa.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "activity",
    "name": "Activity",
    "count": 85,
    "items": [
      {
        "emoji": "🎃",
        "image": "1f383.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎄",
        "image": "1f384.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎆",
        "image": "1f386.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎇",
        "image": "1f387.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧨",
        "image": "1f9e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✨",
        "image": "2728.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎈",
        "image": "1f388.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎉",
        "image": "1f389.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎊",
        "image": "1f38a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎋",
        "image": "1f38b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎍",
        "image": "1f38d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎎",
        "image": "1f38e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎏",
        "image": "1f38f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎐",
        "image": "1f390.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎑",
        "image": "1f391.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧧",
        "image": "1f9e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎀",
        "image": "1f380.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎁",
        "image": "1f381.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎗️",
        "image": "1f397-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎟️",
        "image": "1f39f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎫",
        "image": "1f3ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎖️",
        "image": "1f396-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏆",
        "image": "1f3c6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏅",
        "image": "1f3c5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥇",
        "image": "1f947.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥈",
        "image": "1f948.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥉",
        "image": "1f949.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚽",
        "image": "26bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚾",
        "image": "26be.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥎",
        "image": "1f94e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏀",
        "image": "1f3c0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏐",
        "image": "1f3d0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏈",
        "image": "1f3c8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏉",
        "image": "1f3c9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎾",
        "image": "1f3be.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥏",
        "image": "1f94f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎳",
        "image": "1f3b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏏",
        "image": "1f3cf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏑",
        "image": "1f3d1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏒",
        "image": "1f3d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥍",
        "image": "1f94d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏓",
        "image": "1f3d3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏸",
        "image": "1f3f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥊",
        "image": "1f94a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥋",
        "image": "1f94b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥅",
        "image": "1f945.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛳",
        "image": "26f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛸️",
        "image": "26f8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎣",
        "image": "1f3a3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🤿",
        "image": "1f93f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎽",
        "image": "1f3bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎿",
        "image": "1f3bf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛷",
        "image": "1f6f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥌",
        "image": "1f94c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎯",
        "image": "1f3af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪀",
        "image": "1fa80.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪁",
        "image": "1fa81.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔫",
        "image": "1f52b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎱",
        "image": "1f3b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔮",
        "image": "1f52e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪄",
        "image": "1fa84.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎮",
        "image": "1f3ae.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕹️",
        "image": "1f579-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎰",
        "image": "1f3b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎲",
        "image": "1f3b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧩",
        "image": "1f9e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧸",
        "image": "1f9f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪅",
        "image": "1fa85.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪩",
        "image": "1faa9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪆",
        "image": "1fa86.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♠️",
        "image": "2660-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♥️",
        "image": "2665-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♦️",
        "image": "2666-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♣️",
        "image": "2663-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♟️",
        "image": "265f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🃏",
        "image": "1f0cf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🀄",
        "image": "1f004.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎴",
        "image": "1f3b4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎭",
        "image": "1f3ad.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖼️",
        "image": "1f5bc-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎨",
        "image": "1f3a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧵",
        "image": "1f9f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪡",
        "image": "1faa1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧶",
        "image": "1f9f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪢",
        "image": "1faa2.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "travelandplaces",
    "name": "Travel and places",
    "count": 218,
    "items": [
      {
        "emoji": "🌍",
        "image": "1f30d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌎",
        "image": "1f30e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌏",
        "image": "1f30f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌐",
        "image": "1f310.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗺️",
        "image": "1f5fa-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗾",
        "image": "1f5fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧭",
        "image": "1f9ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏔️",
        "image": "1f3d4-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛰️",
        "image": "26f0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌋",
        "image": "1f30b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗻",
        "image": "1f5fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏕️",
        "image": "1f3d5-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏖️",
        "image": "1f3d6-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏜️",
        "image": "1f3dc-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏝️",
        "image": "1f3dd-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏞️",
        "image": "1f3de-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏟️",
        "image": "1f3df-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏛️",
        "image": "1f3db-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏗️",
        "image": "1f3d7-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧱",
        "image": "1f9f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪨",
        "image": "1faa8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪵",
        "image": "1fab5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛖",
        "image": "1f6d6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏘️",
        "image": "1f3d8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏚️",
        "image": "1f3da-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏠",
        "image": "1f3e0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏡",
        "image": "1f3e1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏢",
        "image": "1f3e2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏣",
        "image": "1f3e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏤",
        "image": "1f3e4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏥",
        "image": "1f3e5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏦",
        "image": "1f3e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏨",
        "image": "1f3e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏩",
        "image": "1f3e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏪",
        "image": "1f3ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏫",
        "image": "1f3eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏬",
        "image": "1f3ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏭",
        "image": "1f3ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏯",
        "image": "1f3ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏰",
        "image": "1f3f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💒",
        "image": "1f492.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗼",
        "image": "1f5fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗽",
        "image": "1f5fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛪",
        "image": "26ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕌",
        "image": "1f54c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛕",
        "image": "1f6d5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕍",
        "image": "1f54d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛩️",
        "image": "26e9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕋",
        "image": "1f54b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛲",
        "image": "26f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛺",
        "image": "26fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌁",
        "image": "1f301.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌃",
        "image": "1f303.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏙️",
        "image": "1f3d9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌄",
        "image": "1f304.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌅",
        "image": "1f305.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌆",
        "image": "1f306.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌇",
        "image": "1f307.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌉",
        "image": "1f309.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♨️",
        "image": "2668-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎠",
        "image": "1f3a0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛝",
        "image": "1f6dd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎡",
        "image": "1f3a1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎢",
        "image": "1f3a2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💈",
        "image": "1f488.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎪",
        "image": "1f3aa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚂",
        "image": "1f682.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚃",
        "image": "1f683.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚄",
        "image": "1f684.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚅",
        "image": "1f685.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚆",
        "image": "1f686.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚇",
        "image": "1f687.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚈",
        "image": "1f688.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚉",
        "image": "1f689.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚊",
        "image": "1f68a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚝",
        "image": "1f69d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚞",
        "image": "1f69e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚋",
        "image": "1f68b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚌",
        "image": "1f68c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚍",
        "image": "1f68d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚎",
        "image": "1f68e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚐",
        "image": "1f690.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚑",
        "image": "1f691.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚒",
        "image": "1f692.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚓",
        "image": "1f693.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚔",
        "image": "1f694.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚕",
        "image": "1f695.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚖",
        "image": "1f696.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚗",
        "image": "1f697.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚘",
        "image": "1f698.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚙",
        "image": "1f699.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛻",
        "image": "1f6fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚚",
        "image": "1f69a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚛",
        "image": "1f69b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚜",
        "image": "1f69c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏎️",
        "image": "1f3ce-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏍️",
        "image": "1f3cd-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛵",
        "image": "1f6f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦽",
        "image": "1f9bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦼",
        "image": "1f9bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛺",
        "image": "1f6fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚲",
        "image": "1f6b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛴",
        "image": "1f6f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛹",
        "image": "1f6f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛼",
        "image": "1f6fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚏",
        "image": "1f68f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛣️",
        "image": "1f6e3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛤️",
        "image": "1f6e4-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛢️",
        "image": "1f6e2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛽",
        "image": "26fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛞",
        "image": "1f6de.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚨",
        "image": "1f6a8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚥",
        "image": "1f6a5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚦",
        "image": "1f6a6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛑",
        "image": "1f6d1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚧",
        "image": "1f6a7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚓",
        "image": "2693.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛟",
        "image": "1f6df.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛵",
        "image": "26f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛶",
        "image": "1f6f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚤",
        "image": "1f6a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛳️",
        "image": "1f6f3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛴️",
        "image": "26f4-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛥️",
        "image": "1f6e5-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚢",
        "image": "1f6a2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✈️",
        "image": "2708-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛩️",
        "image": "1f6e9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛫",
        "image": "1f6eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛬",
        "image": "1f6ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪂",
        "image": "1fa82.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💺",
        "image": "1f4ba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚁",
        "image": "1f681.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚟",
        "image": "1f69f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚠",
        "image": "1f6a0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚡",
        "image": "1f6a1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛰️",
        "image": "1f6f0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚀",
        "image": "1f680.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛸",
        "image": "1f6f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛎️",
        "image": "1f6ce-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧳",
        "image": "1f9f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⌛",
        "image": "231b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏳",
        "image": "23f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⌚",
        "image": "231a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏰",
        "image": "23f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏱️",
        "image": "23f1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏲️",
        "image": "23f2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕰️",
        "image": "1f570-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕛",
        "image": "1f55b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕧",
        "image": "1f567.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕐",
        "image": "1f550.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕜",
        "image": "1f55c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕑",
        "image": "1f551.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕝",
        "image": "1f55d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕒",
        "image": "1f552.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕞",
        "image": "1f55e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕓",
        "image": "1f553.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕟",
        "image": "1f55f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕔",
        "image": "1f554.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕠",
        "image": "1f560.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕕",
        "image": "1f555.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕡",
        "image": "1f561.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕖",
        "image": "1f556.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕢",
        "image": "1f562.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕗",
        "image": "1f557.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕣",
        "image": "1f563.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕘",
        "image": "1f558.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕤",
        "image": "1f564.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕙",
        "image": "1f559.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕥",
        "image": "1f565.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕚",
        "image": "1f55a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕦",
        "image": "1f566.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌑",
        "image": "1f311.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌒",
        "image": "1f312.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌓",
        "image": "1f313.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌔",
        "image": "1f314.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌕",
        "image": "1f315.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌖",
        "image": "1f316.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌗",
        "image": "1f317.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌘",
        "image": "1f318.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌙",
        "image": "1f319.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌚",
        "image": "1f31a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌛",
        "image": "1f31b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌜",
        "image": "1f31c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌡️",
        "image": "1f321-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☀️",
        "image": "2600-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌝",
        "image": "1f31d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌞",
        "image": "1f31e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪐",
        "image": "1fa90.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⭐",
        "image": "2b50.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌟",
        "image": "1f31f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌠",
        "image": "1f320.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌌",
        "image": "1f30c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☁️",
        "image": "2601-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛅",
        "image": "26c5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛈️",
        "image": "26c8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌤️",
        "image": "1f324-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌥️",
        "image": "1f325-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌦️",
        "image": "1f326-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌧️",
        "image": "1f327-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌨️",
        "image": "1f328-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌩️",
        "image": "1f329-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌪️",
        "image": "1f32a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌫️",
        "image": "1f32b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌬️",
        "image": "1f32c-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌀",
        "image": "1f300.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌈",
        "image": "1f308.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌂",
        "image": "1f302.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☂️",
        "image": "2602-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☔",
        "image": "2614.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛱️",
        "image": "26f1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚡",
        "image": "26a1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❄️",
        "image": "2744-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☃️",
        "image": "2603-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛄",
        "image": "26c4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☄️",
        "image": "2604-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔥",
        "image": "1f525.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💧",
        "image": "1f4a7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🌊",
        "image": "1f30a.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "objects",
    "name": "Objects",
    "count": 264,
    "items": [
      {
        "emoji": "👓",
        "image": "1f453.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕶️",
        "image": "1f576-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥽",
        "image": "1f97d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥼",
        "image": "1f97c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦺",
        "image": "1f9ba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👔",
        "image": "1f454.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👕",
        "image": "1f455.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👖",
        "image": "1f456.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧣",
        "image": "1f9e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧤",
        "image": "1f9e4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧥",
        "image": "1f9e5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧦",
        "image": "1f9e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👗",
        "image": "1f457.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👘",
        "image": "1f458.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥻",
        "image": "1f97b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩱",
        "image": "1fa71.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩲",
        "image": "1fa72.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩳",
        "image": "1fa73.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👙",
        "image": "1f459.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👚",
        "image": "1f45a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪭",
        "image": "1faad.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👛",
        "image": "1f45b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👜",
        "image": "1f45c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👝",
        "image": "1f45d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛍️",
        "image": "1f6cd-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎒",
        "image": "1f392.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩴",
        "image": "1fa74.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👞",
        "image": "1f45e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👟",
        "image": "1f45f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥾",
        "image": "1f97e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥿",
        "image": "1f97f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👠",
        "image": "1f460.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👡",
        "image": "1f461.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩰",
        "image": "1fa70.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👢",
        "image": "1f462.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪮",
        "image": "1faae.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👑",
        "image": "1f451.png",
        "fitzpatrick": false
      },
      {
        "emoji": "👒",
        "image": "1f452.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎩",
        "image": "1f3a9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎓",
        "image": "1f393.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧢",
        "image": "1f9e2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪖",
        "image": "1fa96.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛑️",
        "image": "26d1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📿",
        "image": "1f4ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💄",
        "image": "1f484.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💍",
        "image": "1f48d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💎",
        "image": "1f48e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔇",
        "image": "1f507.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔈",
        "image": "1f508.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔉",
        "image": "1f509.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔊",
        "image": "1f50a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📢",
        "image": "1f4e2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📣",
        "image": "1f4e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📯",
        "image": "1f4ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔔",
        "image": "1f514.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔕",
        "image": "1f515.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎼",
        "image": "1f3bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎵",
        "image": "1f3b5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎶",
        "image": "1f3b6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎙️",
        "image": "1f399-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎚️",
        "image": "1f39a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎛️",
        "image": "1f39b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎤",
        "image": "1f3a4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎧",
        "image": "1f3a7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📻",
        "image": "1f4fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎷",
        "image": "1f3b7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪗",
        "image": "1fa97.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎸",
        "image": "1f3b8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎹",
        "image": "1f3b9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎺",
        "image": "1f3ba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎻",
        "image": "1f3bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪕",
        "image": "1fa95.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🥁",
        "image": "1f941.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪘",
        "image": "1fa98.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪇",
        "image": "1fa87.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪈",
        "image": "1fa88.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪉",
        "image": "1fa89.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📱",
        "image": "1f4f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📲",
        "image": "1f4f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☎️",
        "image": "260e-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📞",
        "image": "1f4de.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📟",
        "image": "1f4df.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📠",
        "image": "1f4e0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔋",
        "image": "1f50b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪫",
        "image": "1faab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔌",
        "image": "1f50c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💻",
        "image": "1f4bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖥️",
        "image": "1f5a5-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖨️",
        "image": "1f5a8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⌨️",
        "image": "2328-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖱️",
        "image": "1f5b1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖲️",
        "image": "1f5b2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💽",
        "image": "1f4bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💾",
        "image": "1f4be.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💿",
        "image": "1f4bf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📀",
        "image": "1f4c0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧮",
        "image": "1f9ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎥",
        "image": "1f3a5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎞️",
        "image": "1f39e-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📽️",
        "image": "1f4fd-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎬",
        "image": "1f3ac.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📺",
        "image": "1f4fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📷",
        "image": "1f4f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📸",
        "image": "1f4f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📹",
        "image": "1f4f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📼",
        "image": "1f4fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔍",
        "image": "1f50d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔎",
        "image": "1f50e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕯️",
        "image": "1f56f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💡",
        "image": "1f4a1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔦",
        "image": "1f526.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏮",
        "image": "1f3ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪔",
        "image": "1fa94.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📔",
        "image": "1f4d4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📕",
        "image": "1f4d5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📖",
        "image": "1f4d6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📗",
        "image": "1f4d7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📘",
        "image": "1f4d8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📙",
        "image": "1f4d9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📚",
        "image": "1f4da.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📓",
        "image": "1f4d3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📒",
        "image": "1f4d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📃",
        "image": "1f4c3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📜",
        "image": "1f4dc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📄",
        "image": "1f4c4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📰",
        "image": "1f4f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗞️",
        "image": "1f5de-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📑",
        "image": "1f4d1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔖",
        "image": "1f516.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏷️",
        "image": "1f3f7-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💰",
        "image": "1f4b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪙",
        "image": "1fa99.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💴",
        "image": "1f4b4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💵",
        "image": "1f4b5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💶",
        "image": "1f4b6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💷",
        "image": "1f4b7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💸",
        "image": "1f4b8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💳",
        "image": "1f4b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧾",
        "image": "1f9fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💹",
        "image": "1f4b9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✉️",
        "image": "2709-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📧",
        "image": "1f4e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📨",
        "image": "1f4e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📩",
        "image": "1f4e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📤",
        "image": "1f4e4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📥",
        "image": "1f4e5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📦",
        "image": "1f4e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📫",
        "image": "1f4eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📪",
        "image": "1f4ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📬",
        "image": "1f4ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📭",
        "image": "1f4ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📮",
        "image": "1f4ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗳️",
        "image": "1f5f3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✏️",
        "image": "270f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✒️",
        "image": "2712-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖋️",
        "image": "1f58b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖊️",
        "image": "1f58a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖌️",
        "image": "1f58c-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖍️",
        "image": "1f58d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📝",
        "image": "1f4dd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💼",
        "image": "1f4bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📁",
        "image": "1f4c1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📂",
        "image": "1f4c2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗂️",
        "image": "1f5c2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📅",
        "image": "1f4c5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📆",
        "image": "1f4c6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗒️",
        "image": "1f5d2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗓️",
        "image": "1f5d3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📇",
        "image": "1f4c7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📈",
        "image": "1f4c8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📉",
        "image": "1f4c9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📊",
        "image": "1f4ca.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📋",
        "image": "1f4cb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📌",
        "image": "1f4cc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📍",
        "image": "1f4cd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📎",
        "image": "1f4ce.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🖇️",
        "image": "1f587-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📏",
        "image": "1f4cf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📐",
        "image": "1f4d0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✂️",
        "image": "2702-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗃️",
        "image": "1f5c3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗄️",
        "image": "1f5c4-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗑️",
        "image": "1f5d1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔒",
        "image": "1f512.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔓",
        "image": "1f513.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔏",
        "image": "1f50f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔐",
        "image": "1f510.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔑",
        "image": "1f511.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗝️",
        "image": "1f5dd-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔨",
        "image": "1f528.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪓",
        "image": "1fa93.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛏️",
        "image": "26cf-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚒️",
        "image": "2692-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛠️",
        "image": "1f6e0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗡️",
        "image": "1f5e1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚔️",
        "image": "2694-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💣",
        "image": "1f4a3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪃",
        "image": "1fa83.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏹",
        "image": "1f3f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛡️",
        "image": "1f6e1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪚",
        "image": "1fa9a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔧",
        "image": "1f527.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪛",
        "image": "1fa9b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔩",
        "image": "1f529.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚙️",
        "image": "2699-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗜️",
        "image": "1f5dc-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚖️",
        "image": "2696-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🦯",
        "image": "1f9af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔗",
        "image": "1f517.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛓️‍💥",
        "image": "26d3-fe0f-200d-1f4a5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛓️",
        "image": "26d3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪝",
        "image": "1fa9d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧰",
        "image": "1f9f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧲",
        "image": "1f9f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪜",
        "image": "1fa9c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪏",
        "image": "1fa8f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚗️",
        "image": "2697-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧪",
        "image": "1f9ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧫",
        "image": "1f9eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧬",
        "image": "1f9ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔬",
        "image": "1f52c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔭",
        "image": "1f52d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📡",
        "image": "1f4e1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💉",
        "image": "1f489.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩸",
        "image": "1fa78.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💊",
        "image": "1f48a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩹",
        "image": "1fa79.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩼",
        "image": "1fa7c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩺",
        "image": "1fa7a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🩻",
        "image": "1fa7b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚪",
        "image": "1f6aa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛗",
        "image": "1f6d7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪞",
        "image": "1fa9e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪟",
        "image": "1fa9f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛏️",
        "image": "1f6cf-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛋️",
        "image": "1f6cb-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪑",
        "image": "1fa91.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚽",
        "image": "1f6bd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪠",
        "image": "1faa0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚿",
        "image": "1f6bf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛁",
        "image": "1f6c1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪤",
        "image": "1faa4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪒",
        "image": "1fa92.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧴",
        "image": "1f9f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧷",
        "image": "1f9f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧹",
        "image": "1f9f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧺",
        "image": "1f9fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧻",
        "image": "1f9fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪣",
        "image": "1faa3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧼",
        "image": "1f9fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫧",
        "image": "1fae7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪥",
        "image": "1faa5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧽",
        "image": "1f9fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧯",
        "image": "1f9ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛒",
        "image": "1f6d2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚬",
        "image": "1f6ac.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚰️",
        "image": "26b0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪦",
        "image": "1faa6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚱️",
        "image": "26b1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🧿",
        "image": "1f9ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪬",
        "image": "1faac.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🗿",
        "image": "1f5ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪧",
        "image": "1faa7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪪",
        "image": "1faaa.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "symbols",
    "name": "Symbols",
    "count": 221,
    "items": [
      {
        "emoji": "🏧",
        "image": "1f3e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚮",
        "image": "1f6ae.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚰",
        "image": "1f6b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♿",
        "image": "267f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚹",
        "image": "1f6b9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚺",
        "image": "1f6ba.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚻",
        "image": "1f6bb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚼",
        "image": "1f6bc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚾",
        "image": "1f6be.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛂",
        "image": "1f6c2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛃",
        "image": "1f6c3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛄",
        "image": "1f6c4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛅",
        "image": "1f6c5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚠️",
        "image": "26a0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚸",
        "image": "1f6b8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛔",
        "image": "26d4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚫",
        "image": "1f6ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚳",
        "image": "1f6b3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚭",
        "image": "1f6ad.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚯",
        "image": "1f6af.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚱",
        "image": "1f6b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚷",
        "image": "1f6b7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📵",
        "image": "1f4f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔞",
        "image": "1f51e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☢️",
        "image": "2622-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☣️",
        "image": "2623-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⬆️",
        "image": "2b06-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↗️",
        "image": "2197-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➡️",
        "image": "27a1-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↘️",
        "image": "2198-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⬇️",
        "image": "2b07-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↙️",
        "image": "2199-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⬅️",
        "image": "2b05-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↖️",
        "image": "2196-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↕️",
        "image": "2195-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↔️",
        "image": "2194-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↩️",
        "image": "21a9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "↪️",
        "image": "21aa-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⤴️",
        "image": "2934-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⤵️",
        "image": "2935-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔃",
        "image": "1f503.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔄",
        "image": "1f504.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔙",
        "image": "1f519.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔚",
        "image": "1f51a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔛",
        "image": "1f51b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔜",
        "image": "1f51c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔝",
        "image": "1f51d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛐",
        "image": "1f6d0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚛️",
        "image": "269b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕉️",
        "image": "1f549-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✡️",
        "image": "2721-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☸️",
        "image": "2638-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☯️",
        "image": "262f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✝️",
        "image": "271d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☦️",
        "image": "2626-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☪️",
        "image": "262a-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☮️",
        "image": "262e-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🕎",
        "image": "1f54e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔯",
        "image": "1f52f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🪯",
        "image": "1faaf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♈",
        "image": "2648.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♉",
        "image": "2649.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♊",
        "image": "264a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♋",
        "image": "264b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♌",
        "image": "264c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♍",
        "image": "264d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♎",
        "image": "264e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♏",
        "image": "264f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♐",
        "image": "2650.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♑",
        "image": "2651.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♒",
        "image": "2652.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♓",
        "image": "2653.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⛎",
        "image": "26ce.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔀",
        "image": "1f500.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔁",
        "image": "1f501.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔂",
        "image": "1f502.png",
        "fitzpatrick": false
      },
      {
        "emoji": "▶️",
        "image": "25b6-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏩",
        "image": "23e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏭️",
        "image": "23ed-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏯️",
        "image": "23ef-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "◀️",
        "image": "25c0-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏪",
        "image": "23ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏮️",
        "image": "23ee-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔼",
        "image": "1f53c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏫",
        "image": "23eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔽",
        "image": "1f53d.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏬",
        "image": "23ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏸️",
        "image": "23f8-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏹️",
        "image": "23f9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏺️",
        "image": "23fa-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⏏️",
        "image": "23cf-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎦",
        "image": "1f3a6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔅",
        "image": "1f505.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔆",
        "image": "1f506.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📶",
        "image": "1f4f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🛜",
        "image": "1f6dc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📳",
        "image": "1f4f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📴",
        "image": "1f4f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚧️",
        "image": "26a7-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✖️",
        "image": "2716-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➕",
        "image": "2795.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➖",
        "image": "2796.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➗",
        "image": "2797.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟰",
        "image": "1f7f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♾️",
        "image": "267e-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "‼️",
        "image": "203c-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⁉️",
        "image": "2049-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❓",
        "image": "2753.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❔",
        "image": "2754.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❕",
        "image": "2755.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❗",
        "image": "2757.png",
        "fitzpatrick": false
      },
      {
        "emoji": "〰️",
        "image": "3030-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💱",
        "image": "1f4b1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💲",
        "image": "1f4b2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "♻️",
        "image": "267b-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚜️",
        "image": "269c-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔱",
        "image": "1f531.png",
        "fitzpatrick": false
      },
      {
        "emoji": "📛",
        "image": "1f4db.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔰",
        "image": "1f530.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⭕",
        "image": "2b55.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✅",
        "image": "2705.png",
        "fitzpatrick": false
      },
      {
        "emoji": "☑️",
        "image": "2611-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✔️",
        "image": "2714-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❌",
        "image": "274c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❎",
        "image": "274e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➰",
        "image": "27b0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "➿",
        "image": "27bf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "〽️",
        "image": "303d-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✳️",
        "image": "2733-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "✴️",
        "image": "2734-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "❇️",
        "image": "2747-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "©️",
        "image": "00a9-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "®️",
        "image": "00ae-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "™️",
        "image": "2122-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🫟",
        "image": "1fadf.png",
        "fitzpatrick": false
      },
      {
        "emoji": "#️⃣",
        "image": "0023-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "*️⃣",
        "image": "002a-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "0️⃣",
        "image": "0030-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "1️⃣",
        "image": "0031-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "2️⃣",
        "image": "0032-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "3️⃣",
        "image": "0033-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "4️⃣",
        "image": "0034-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "5️⃣",
        "image": "0035-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "6️⃣",
        "image": "0036-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "7️⃣",
        "image": "0037-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "8️⃣",
        "image": "0038-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "9️⃣",
        "image": "0039-fe0f-20e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔟",
        "image": "1f51f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔠",
        "image": "1f520.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔡",
        "image": "1f521.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔢",
        "image": "1f522.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔣",
        "image": "1f523.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔤",
        "image": "1f524.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🅰️",
        "image": "1f170-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆎",
        "image": "1f18e.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🅱️",
        "image": "1f171-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆑",
        "image": "1f191.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆒",
        "image": "1f192.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆓",
        "image": "1f193.png",
        "fitzpatrick": false
      },
      {
        "emoji": "ℹ️",
        "image": "2139-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆔",
        "image": "1f194.png",
        "fitzpatrick": false
      },
      {
        "emoji": "Ⓜ️",
        "image": "24c2-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆕",
        "image": "1f195.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆖",
        "image": "1f196.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🅾️",
        "image": "1f17e-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆗",
        "image": "1f197.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🅿️",
        "image": "1f17f-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆘",
        "image": "1f198.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆙",
        "image": "1f199.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🆚",
        "image": "1f19a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈁",
        "image": "1f201.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈂️",
        "image": "1f202-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈷️",
        "image": "1f237-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈶",
        "image": "1f236.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈯",
        "image": "1f22f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🉐",
        "image": "1f250.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈹",
        "image": "1f239.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈚",
        "image": "1f21a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈲",
        "image": "1f232.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🉑",
        "image": "1f251.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈸",
        "image": "1f238.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈴",
        "image": "1f234.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈳",
        "image": "1f233.png",
        "fitzpatrick": false
      },
      {
        "emoji": "㊗️",
        "image": "3297-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "㊙️",
        "image": "3299-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈺",
        "image": "1f23a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🈵",
        "image": "1f235.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔴",
        "image": "1f534.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟠",
        "image": "1f7e0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟡",
        "image": "1f7e1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟢",
        "image": "1f7e2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔵",
        "image": "1f535.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟣",
        "image": "1f7e3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟤",
        "image": "1f7e4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚫",
        "image": "26ab.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⚪",
        "image": "26aa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟥",
        "image": "1f7e5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟧",
        "image": "1f7e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟨",
        "image": "1f7e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟩",
        "image": "1f7e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟦",
        "image": "1f7e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟪",
        "image": "1f7ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🟫",
        "image": "1f7eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⬛",
        "image": "2b1b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "⬜",
        "image": "2b1c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "◼️",
        "image": "25fc-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "◻️",
        "image": "25fb-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "◾",
        "image": "25fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "◽",
        "image": "25fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "▪️",
        "image": "25aa-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "▫️",
        "image": "25ab-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔶",
        "image": "1f536.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔷",
        "image": "1f537.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔸",
        "image": "1f538.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔹",
        "image": "1f539.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔺",
        "image": "1f53a.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔻",
        "image": "1f53b.png",
        "fitzpatrick": false
      },
      {
        "emoji": "💠",
        "image": "1f4a0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔘",
        "image": "1f518.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔳",
        "image": "1f533.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🔲",
        "image": "1f532.png",
        "fitzpatrick": false
      }
    ]
  },
  {
    "id": "flags",
    "name": "Flags",
    "count": 270,
    "items": [
      {
        "emoji": "🏁",
        "image": "1f3c1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🚩",
        "image": "1f6a9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🎌",
        "image": "1f38c.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏴",
        "image": "1f3f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏳️",
        "image": "1f3f3-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏳️‍🌈",
        "image": "1f3f3-fe0f-200d-1f308.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏳️‍⚧️",
        "image": "1f3f3-fe0f-200d-26a7-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏴‍☠️",
        "image": "1f3f4-200d-2620-fe0f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇨",
        "image": "1f1e6-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇩",
        "image": "1f1e6-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇪",
        "image": "1f1e6-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇫",
        "image": "1f1e6-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇬",
        "image": "1f1e6-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇮",
        "image": "1f1e6-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇱",
        "image": "1f1e6-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇲",
        "image": "1f1e6-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇴",
        "image": "1f1e6-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇶",
        "image": "1f1e6-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇷",
        "image": "1f1e6-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇸",
        "image": "1f1e6-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇹",
        "image": "1f1e6-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇺",
        "image": "1f1e6-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇼",
        "image": "1f1e6-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇽",
        "image": "1f1e6-1f1fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇦🇿",
        "image": "1f1e6-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇦",
        "image": "1f1e7-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇧",
        "image": "1f1e7-1f1e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇩",
        "image": "1f1e7-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇪",
        "image": "1f1e7-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇫",
        "image": "1f1e7-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇬",
        "image": "1f1e7-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇭",
        "image": "1f1e7-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇮",
        "image": "1f1e7-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇯",
        "image": "1f1e7-1f1ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇱",
        "image": "1f1e7-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇲",
        "image": "1f1e7-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇳",
        "image": "1f1e7-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇴",
        "image": "1f1e7-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇶",
        "image": "1f1e7-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇷",
        "image": "1f1e7-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇸",
        "image": "1f1e7-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇹",
        "image": "1f1e7-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇻",
        "image": "1f1e7-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇼",
        "image": "1f1e7-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇾",
        "image": "1f1e7-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇧🇿",
        "image": "1f1e7-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇦",
        "image": "1f1e8-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇨",
        "image": "1f1e8-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇩",
        "image": "1f1e8-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇫",
        "image": "1f1e8-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇬",
        "image": "1f1e8-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇭",
        "image": "1f1e8-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇮",
        "image": "1f1e8-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇰",
        "image": "1f1e8-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇱",
        "image": "1f1e8-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇲",
        "image": "1f1e8-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇳",
        "image": "1f1e8-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇴",
        "image": "1f1e8-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇵",
        "image": "1f1e8-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇶",
        "image": "1f1e8-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇷",
        "image": "1f1e8-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇺",
        "image": "1f1e8-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇻",
        "image": "1f1e8-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇼",
        "image": "1f1e8-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇽",
        "image": "1f1e8-1f1fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇾",
        "image": "1f1e8-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇨🇿",
        "image": "1f1e8-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇪",
        "image": "1f1e9-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇬",
        "image": "1f1e9-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇯",
        "image": "1f1e9-1f1ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇰",
        "image": "1f1e9-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇲",
        "image": "1f1e9-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇴",
        "image": "1f1e9-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇩🇿",
        "image": "1f1e9-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇦",
        "image": "1f1ea-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇨",
        "image": "1f1ea-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇪",
        "image": "1f1ea-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇬",
        "image": "1f1ea-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇭",
        "image": "1f1ea-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇷",
        "image": "1f1ea-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇸",
        "image": "1f1ea-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇹",
        "image": "1f1ea-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇪🇺",
        "image": "1f1ea-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇮",
        "image": "1f1eb-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇯",
        "image": "1f1eb-1f1ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇰",
        "image": "1f1eb-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇲",
        "image": "1f1eb-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇴",
        "image": "1f1eb-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇫🇷",
        "image": "1f1eb-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇦",
        "image": "1f1ec-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇧",
        "image": "1f1ec-1f1e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇩",
        "image": "1f1ec-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇪",
        "image": "1f1ec-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇫",
        "image": "1f1ec-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇬",
        "image": "1f1ec-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇭",
        "image": "1f1ec-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇮",
        "image": "1f1ec-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇱",
        "image": "1f1ec-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇲",
        "image": "1f1ec-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇳",
        "image": "1f1ec-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇵",
        "image": "1f1ec-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇶",
        "image": "1f1ec-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇷",
        "image": "1f1ec-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇸",
        "image": "1f1ec-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇹",
        "image": "1f1ec-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇺",
        "image": "1f1ec-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇼",
        "image": "1f1ec-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇬🇾",
        "image": "1f1ec-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇰",
        "image": "1f1ed-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇲",
        "image": "1f1ed-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇳",
        "image": "1f1ed-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇷",
        "image": "1f1ed-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇹",
        "image": "1f1ed-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇭🇺",
        "image": "1f1ed-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇨",
        "image": "1f1ee-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇩",
        "image": "1f1ee-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇪",
        "image": "1f1ee-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇱",
        "image": "1f1ee-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇲",
        "image": "1f1ee-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇳",
        "image": "1f1ee-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇴",
        "image": "1f1ee-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇶",
        "image": "1f1ee-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇷",
        "image": "1f1ee-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇸",
        "image": "1f1ee-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇮🇹",
        "image": "1f1ee-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇯🇪",
        "image": "1f1ef-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇯🇲",
        "image": "1f1ef-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇯🇴",
        "image": "1f1ef-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇯🇵",
        "image": "1f1ef-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇪",
        "image": "1f1f0-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇬",
        "image": "1f1f0-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇭",
        "image": "1f1f0-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇮",
        "image": "1f1f0-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇲",
        "image": "1f1f0-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇳",
        "image": "1f1f0-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇵",
        "image": "1f1f0-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇷",
        "image": "1f1f0-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇼",
        "image": "1f1f0-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇾",
        "image": "1f1f0-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇰🇿",
        "image": "1f1f0-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇦",
        "image": "1f1f1-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇧",
        "image": "1f1f1-1f1e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇨",
        "image": "1f1f1-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇮",
        "image": "1f1f1-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇰",
        "image": "1f1f1-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇷",
        "image": "1f1f1-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇸",
        "image": "1f1f1-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇹",
        "image": "1f1f1-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇺",
        "image": "1f1f1-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇻",
        "image": "1f1f1-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇱🇾",
        "image": "1f1f1-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇦",
        "image": "1f1f2-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇨",
        "image": "1f1f2-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇩",
        "image": "1f1f2-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇪",
        "image": "1f1f2-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇫",
        "image": "1f1f2-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇬",
        "image": "1f1f2-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇭",
        "image": "1f1f2-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇰",
        "image": "1f1f2-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇱",
        "image": "1f1f2-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇲",
        "image": "1f1f2-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇳",
        "image": "1f1f2-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇴",
        "image": "1f1f2-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇵",
        "image": "1f1f2-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇶",
        "image": "1f1f2-1f1f6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇷",
        "image": "1f1f2-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇸",
        "image": "1f1f2-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇹",
        "image": "1f1f2-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇺",
        "image": "1f1f2-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇻",
        "image": "1f1f2-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇼",
        "image": "1f1f2-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇽",
        "image": "1f1f2-1f1fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇾",
        "image": "1f1f2-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇲🇿",
        "image": "1f1f2-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇦",
        "image": "1f1f3-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇨",
        "image": "1f1f3-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇪",
        "image": "1f1f3-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇫",
        "image": "1f1f3-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇬",
        "image": "1f1f3-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇮",
        "image": "1f1f3-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇱",
        "image": "1f1f3-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇴",
        "image": "1f1f3-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇵",
        "image": "1f1f3-1f1f5.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇷",
        "image": "1f1f3-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇺",
        "image": "1f1f3-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇳🇿",
        "image": "1f1f3-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇴🇲",
        "image": "1f1f4-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇦",
        "image": "1f1f5-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇪",
        "image": "1f1f5-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇫",
        "image": "1f1f5-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇬",
        "image": "1f1f5-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇭",
        "image": "1f1f5-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇰",
        "image": "1f1f5-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇱",
        "image": "1f1f5-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇲",
        "image": "1f1f5-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇳",
        "image": "1f1f5-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇷",
        "image": "1f1f5-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇸",
        "image": "1f1f5-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇹",
        "image": "1f1f5-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇼",
        "image": "1f1f5-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇵🇾",
        "image": "1f1f5-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇶🇦",
        "image": "1f1f6-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇷🇪",
        "image": "1f1f7-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇷🇴",
        "image": "1f1f7-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇷🇸",
        "image": "1f1f7-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇷🇺",
        "image": "1f1f7-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇷🇼",
        "image": "1f1f7-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇦",
        "image": "1f1f8-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇧",
        "image": "1f1f8-1f1e7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇨",
        "image": "1f1f8-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇩",
        "image": "1f1f8-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇪",
        "image": "1f1f8-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇬",
        "image": "1f1f8-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇭",
        "image": "1f1f8-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇮",
        "image": "1f1f8-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇯",
        "image": "1f1f8-1f1ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇰",
        "image": "1f1f8-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇱",
        "image": "1f1f8-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇲",
        "image": "1f1f8-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇳",
        "image": "1f1f8-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇴",
        "image": "1f1f8-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇷",
        "image": "1f1f8-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇸",
        "image": "1f1f8-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇹",
        "image": "1f1f8-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇻",
        "image": "1f1f8-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇽",
        "image": "1f1f8-1f1fd.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇾",
        "image": "1f1f8-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇸🇿",
        "image": "1f1f8-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇦",
        "image": "1f1f9-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇨",
        "image": "1f1f9-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇩",
        "image": "1f1f9-1f1e9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇫",
        "image": "1f1f9-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇬",
        "image": "1f1f9-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇭",
        "image": "1f1f9-1f1ed.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇯",
        "image": "1f1f9-1f1ef.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇰",
        "image": "1f1f9-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇱",
        "image": "1f1f9-1f1f1.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇲",
        "image": "1f1f9-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇳",
        "image": "1f1f9-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇴",
        "image": "1f1f9-1f1f4.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇷",
        "image": "1f1f9-1f1f7.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇹",
        "image": "1f1f9-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇻",
        "image": "1f1f9-1f1fb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇼",
        "image": "1f1f9-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇹🇿",
        "image": "1f1f9-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇦",
        "image": "1f1fa-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇬",
        "image": "1f1fa-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇲",
        "image": "1f1fa-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇳",
        "image": "1f1fa-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇸",
        "image": "1f1fa-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇾",
        "image": "1f1fa-1f1fe.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇺🇿",
        "image": "1f1fa-1f1ff.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇦",
        "image": "1f1fb-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇨",
        "image": "1f1fb-1f1e8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇪",
        "image": "1f1fb-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇬",
        "image": "1f1fb-1f1ec.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇮",
        "image": "1f1fb-1f1ee.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇳",
        "image": "1f1fb-1f1f3.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇻🇺",
        "image": "1f1fb-1f1fa.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇼🇫",
        "image": "1f1fc-1f1eb.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇼🇸",
        "image": "1f1fc-1f1f8.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇽🇰",
        "image": "1f1fd-1f1f0.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇾🇪",
        "image": "1f1fe-1f1ea.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇾🇹",
        "image": "1f1fe-1f1f9.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇿🇦",
        "image": "1f1ff-1f1e6.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇿🇲",
        "image": "1f1ff-1f1f2.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🇿🇼",
        "image": "1f1ff-1f1fc.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        "image": "1f3f4-e0067-e0062-e0065-e006e-e0067-e007f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
        "image": "1f3f4-e0067-e0062-e0073-e0063-e0074-e007f.png",
        "fitzpatrick": false
      },
      {
        "emoji": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
        "image": "1f3f4-e0067-e0062-e0077-e006c-e0073-e007f.png",
        "fitzpatrick": false
      }
    ]
  }
];
export const EMOJI_PAYLOAD_TOTAL = 1903;
