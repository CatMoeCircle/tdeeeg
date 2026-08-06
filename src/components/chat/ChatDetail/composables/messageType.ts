import type { message } from "tdlib-types";

/**
 * 媒体消息内容类型集合（单张图片/视频/GIF/动画）。用于判断消息是否为
 * 直接展示媒体内容的"媒体消息"（例如不套气泡、全宽展示等）。
 */
export const MEDIA_TYPES: ReadonlySet<string> = new Set([
  "messagePhoto",
  "messageVideo",
  "messageAnimation",
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
  "messageChatDeleteMember",
  "messageChatUpgradeTo",
  "messageChatUpgradeFrom",
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
  "messageGiftedTon",
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
 * 判断消息是否可参与相册分组（仅图片与视频）。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 可分组为相册返回 `true`，否则返回 `false`
 */
export function isAlbumMedia(msg: message): boolean {
  return ALBUM_MEDIA_TYPES.has(msg.content._);
}

/**
 * 判断消息是否为"独立消息"（贴纸 / 动画表情）。
 * 独立消息不渲染常规气泡背景与时间状态行。
 *
 * @param msg - 待判断的 TDLib 消息对象
 * @returns 是独立消息返回 `true`，否则返回 `false`
 */
export function isStandaloneMessage(msg: message): boolean {
  return (
    msg.content._ === "messageSticker" ||
    msg.content._ === "messageAnimatedEmoji"
  );
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
