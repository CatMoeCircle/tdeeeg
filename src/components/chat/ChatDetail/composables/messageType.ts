import type { message } from "tdlib-types";

/**
 * 媒体消息内容类型集合（单张图片/视频/GIF/动画）。用于判断消息是否为
 * 直接展示媒体内容的"媒体消息"（例如不套气泡、全宽展示等）。
 */
export const MEDIA_TYPES: ReadonlySet<string> = new Set([
  "messagePhoto",
  "messageVideo",
  "messageAnimation",
  // 转发的动态：按媒体消息排版（无内边距气泡 + 封面 + 文案）
  "messageStory",
]);

/**
 * 可组成相册（album）的媒体内容类型集合。仅图片与视频可以分组为相册，
 * 动画/贴纸等不能进入相册分组。
 */
export const ALBUM_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "messagePhoto",
  "messageVideo",
]);

/**
 * 可组成「文件相册」（file album）的内容类型集合。TDLib 规定文档只能与文档
 * 组成相册、音频只能与音频组成相册，二者都属于文件通道，在界面上统一按
 * 堆叠的文件列表渲染（区别于图片/视频的宫格相册）。
 */
export const FILE_ALBUM_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "messageDocument",
  "messageAudio",
]);

/**
 * 服务消息内容类型集合。这类消息非用户实质对话内容，居中显示、自成一组，
 * 不占用头像列，也不参与发送者分组。
 */
export const SERVICE_TYPES: ReadonlySet<string> = new Set([
  "messageBasicGroupChatCreate",
  "messageSupergroupChatCreate",
  "messageChatChangeTitle",
  "messageChatChangePhoto",
  "messageChatDeletePhoto",
  "messageChatAddMembers",
  "messageChatJoinByLink",
  "messageChatJoinByRequest",
  "messageChatJoinFromCommunity",
  "messageChatDeleteMember",
  "messageChatAddedToCommunity",
  "messageChatRemovedFromCommunity",
  "messageChatUpgradeTo",
  "messageChatUpgradeFrom",
  "messageChatHasProtectedContentToggled",
  "messagePinMessage",
  "messageScreenshotTaken",
  "messageChatSetBackground",
  "messageChatSetTheme",
  "messageChatSetMessageAutoDeleteTime",
  "messageChatBoost",
  "messageForumTopicCreated",
  "messageForumTopicEdited",
  "messageForumTopicIsClosedToggled",
  "messageForumTopicIsHiddenToggled",
  "messageSuggestProfilePhoto",
  "messageCustomServiceAction",
  "messageGameScore",
  "messagePaymentSuccessful",
  "messagePaymentSuccessfulBot",
  "messagePaymentRefunded",
  "messageGiftedPremium",
  "messagePremiumGiftCode",
  "messageGiveawayCreated",
  "messageGiveawayCompleted",
  "messageGiftedStars",
  "messageGiftedGrams",
  "messageGiveawayPrizeStars",
  "messageGift",
  "messageUpgradedGift",
  "messageRefundedUpgradedGift",
  "messageContactRegistered",
  "messageUsersShared",
  "messageChatShared",
  "messageBotWriteAccessAllowed",
  "messageWebAppDataSent",
  "messageWebAppDataReceived",
  "messagePassportDataSent",
  "messagePassportDataReceived",
  "messageProximityAlertTriggered",
  "messagePaidMedia",
  "messageChecklistTasksDone",
  "messageChecklistTasksAdded",
  "messagePollOptionAdded",
  "messagePollOptionDeleted",
  "messageSuggestedPostApprovalFailed",
  "messageSuggestedPostApproved",
  "messageSuggestedPostDeclined",
  "messageSuggestedPostPaid",
  "messageSuggestedPostRefunded",
  "messageCall",
]);

/**
 * 判断消息是否为媒体消息（单张图片 / 视频 / 动画）。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 是媒体消息返回 `true`，否则返回 `false`
 */
export function isMediaMessage(msg: message): boolean {
  return MEDIA_TYPES.has(msg.content._);
}

/**
 * 判断媒体消息是否带非空 caption（介绍文本）。
 */
export function hasMediaCaption(msg: message): boolean {
  const c = msg.content;
  // 动态消息的文案在动态自身上（story.caption，需 getStory 才知道有无），
  // 统一按「带文案的媒体」排版：保留气泡背景承载头部与文案。
  if (c._ === "messageStory") return true;
  return ("caption" in c) && !!(c as { caption?: { text?: string } }).caption?.text;
}

/**
 * 判断单条媒体是否应「气泡外」渲染（无气泡背景，媒体直接贴在消息流上）。
 * 仅当媒体类型且没有 caption 时成立——有 caption 时媒体与介绍同属一个气泡。
 */
export function isBubblelessMediaMessage(msg: message): boolean {
  return isMediaMessage(msg) && !hasMediaCaption(msg);
}

/**
 * 相册可见 caption 规则：仅当相册中【恰好一条】媒体带非空 caption 时才显示。
 * 0 条 → 无气泡；≥2 条 → 描述归属不明，也不显示 caption（同样无气泡）。
 */
export function albumHasVisibleCaption(messages: readonly message[]): boolean {
  let count = 0;
  for (const m of messages) {
    if (hasMediaCaption(m)) count++;
    if (count > 1) return false;
  }
  return count === 1;
}

/**
 * 判断消息是否可参与相册分组（仅图片与视频）。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 可分组为相册返回 `true`，否则返回 `false`
 */
export function isAlbumMedia(msg: message): boolean {
  return ALBUM_MEDIA_TYPES.has(msg.content._);
}

/**
 * 判断消息是否可参与「文件相册」分组（仅文档与音频）。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 可分组为文件相册返回 `true`，否则返回 `false`
 */
export function isFileAlbumMedia(msg: message): boolean {
  return FILE_ALBUM_MEDIA_TYPES.has(msg.content._);
}

/**
 * 判断消息是否可参与任意相册分组（图片/视频 或 文档/音频）。
 * 相册的 media_album_id 在同一组内必然同类型，因此分组时用同一个宽泛判断即可。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 可分组返回 `true`，否则返回 `false`
 */
export function isAnyAlbumMedia(msg: message): boolean {
  return isAlbumMedia(msg) || isFileAlbumMedia(msg);
}

/**
 * 判断一组消息是否构成「文件相册」（全部为文档或音频）。
 *
 * @param messages - 相册消息数组
 * @returns 是文件相册返回 `true`，否则返回 `false`
 */
export function isFileAlbum(messages: readonly message[]): boolean {
  return messages.length > 0 && messages.every(isFileAlbumMedia);
}

/**
 * 判断消息是否为"独立消息"（贴纸 / 动画表情 / 骰子 / 圆形视频）。
 * 独立消息不渲染常规气泡背景与时间状态行。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 是独立消息返回 `true`，否则返回 `false`
 */
export function isStandaloneMessage(msg: message): boolean {
  return (
    msg.content._ === "messageSticker" ||
    msg.content._ === "messageAnimatedEmoji" ||
    msg.content._ === "messageDice" ||
    msg.content._ === "messageVideoNote" ||
    msg.content._ === "messageLocation"
  );
}

/**
 * 判断消息是否应使用"内嵌时间"（时间 float 右对齐、跟随文本末行，参考网页版 time-seal）。
 * 仅普通文本消息（无置底链接预览）启用；其他消息类型仍在气泡底部独占一行显示时间。
 * 与 MessageContent 内部判定保持一致，用于 ChatDetail 决定是否渲染独立的底部时间行。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 应内嵌时间返回 `true`，否则返回 `false`
 */
export function isInlineTimeMessage(msg: message): boolean {
  const c = msg.content;
  if (c._ !== "messageText") return false;
  // 置底链接预览存在时，时间无法内嵌到文本末行，退回独立底部行
  if (c.link_preview && !c.link_preview.show_above_text) return false;
  // 有回应时禁用内嵌时间，将 ReactionsBar 放在文本和时间之间
  const reactions = msg.interaction_info?.reactions;
  if (reactions && reactions.reactions.length > 0) return false;
  return true;
}

/**
 * 判断消息是否为服务消息（居中显示、自成一组、不占头像列）。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 是服务消息返回 `true`，否则返回 `false`
 */
export function isServiceMessage(msg: message): boolean {
  return SERVICE_TYPES.has(msg.content._);
}

/**
 * 频道消息底部是否显示评论条（MessageBubble 的 Thread 行）：
 * 仅频道帖子（is_channel_post）且已关联讨论组（interaction_info.reply_info 存在）；
 * 服务消息与无气泡的独立消息（贴纸 / 动画表情 / 骰子）不显示。
 */
export function showChannelCommentsBar(msg: message): boolean {
  if (isServiceMessage(msg)) return false;
  if (isStandaloneMessage(msg)) return false;
  if (!msg.is_channel_post) return false;
  return !!msg.interaction_info?.reply_info;
}
