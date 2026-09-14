/**
 * Profile tab definitions — mirrors Unigram's ProfileTab system.
 *
 * Each tab type carries a key, label, optional count, and a `visible` predicate
 * that receives the current profile state to decide whether to render the tab.
 */

import type { chat } from 'tdlib-types';

import { td } from "../utils/tdLang";
// ── Tab type keys ────────────────────────────────────────────────────────────
export type ProfileTabKey =
  | 'stories'
  | 'archived'
  | 'gifts'
  | 'groups'
  | 'members'
  | 'topics'
  | 'media'
  | 'files'
  | 'links'
  | 'music'
  | 'voice'
  | 'gifs';

export interface ProfileTab {
  key: ProfileTabKey;
  label: string;
  /** 0 = always shown when visible; >0 = show count badge; <0 = hide badge */
  count: number;
  visible: boolean;
}

// ── Profile state passed to tab builder ──────────────────────────────────────
export interface ProfileTabContext {
  chatMode: boolean;
  isSelf: boolean;
  // User profile fields
  hasPostedStories: boolean;
  hasArchivedStories: boolean;
  giftCount: number;
  commonGroupCount: number;
  // Bot fields
  isBot: boolean;
  hasTopics: boolean;
  // Chat type
  chatType: chat['type'] | undefined;
  // Supergroup fields
  isChannel: boolean;
  hasForumTabs: boolean;
  memberCount: number;
  // Shared media counts
  mediaCount: number;
  fileCount: number;
  linkCount: number;
  musicCount: number;
  voiceCount: number;
  gifCount: number;
}

/**
 * Build the ordered tab list for a given profile context.
 * Matches Unigram's UpdateTabsAsync logic.
 */
export function buildProfileTabs(ctx: ProfileTabContext): ProfileTab[] {
  const tabs: ProfileTab[] = [];

  if (!ctx.chatMode) {
    // ── User profile tabs ──────────────────────────────────────────────────
    if (ctx.isSelf) {
      // Self-profile
      if (ctx.hasPostedStories) {
        tabs.push({ key: 'stories', label: '动态', count: -1, visible: true });
      }
      if (ctx.giftCount > 0) {
        tabs.push({ key: 'gifts', label: td('lng_sr_message_column_gift', '礼物'), count: ctx.giftCount, visible: true });
      }
      if (ctx.hasArchivedStories) {
        tabs.push({ key: 'archived', label: '归档动态', count: -1, visible: true });
      }
    } else {
      // Other user's profile
      if (ctx.isBot && ctx.hasTopics) {
        tabs.push({ key: 'topics', label: '话题', count: -1, visible: true });
      }
      if (ctx.hasPostedStories) {
        tabs.push({ key: 'stories', label: '动态', count: -1, visible: true });
      }
      if (ctx.giftCount > 0) {
        tabs.push({ key: 'gifts', label: td('lng_sr_message_column_gift', '礼物'), count: ctx.giftCount, visible: true });
      }

      // Shared media tabs
      pushSharedMediaTabs(tabs, ctx);

      if (ctx.commonGroupCount > 0) {
        tabs.push({ key: 'groups', label: '共同群组', count: ctx.commonGroupCount, visible: true });
      }
    }
  } else {
    // ── Chat profile tabs (supergroup / basic group) ───────────────────────
    if (ctx.chatType?._ === 'chatTypeSupergroup') {
      if (ctx.hasPostedStories) {
        tabs.push({ key: 'stories', label: '动态', count: -1, visible: true });
      }
      if (ctx.giftCount > 0) {
        tabs.push({ key: 'gifts', label: td('lng_sr_message_column_gift', '礼物'), count: ctx.giftCount, visible: true });
      }
      if (ctx.hasForumTabs && !ctx.isChannel) {
        tabs.push({ key: 'topics', label: '话题', count: -1, visible: true });
      }
      if (!ctx.isChannel) {
        tabs.push({ key: 'members', label: td('lng_profile_participants_section', '成员'), count: ctx.memberCount, visible: true });
      }
      pushSharedMediaTabs(tabs, ctx);
    } else if (ctx.chatType?._ === 'chatTypeBasicGroup') {
      tabs.push({ key: 'members', label: td('lng_profile_participants_section', '成员'), count: ctx.memberCount, visible: true });
      pushSharedMediaTabs(tabs, ctx);
    }
  }

  return tabs.filter((t) => t.visible);
}

/** Push shared media tabs with count > 0 */
function pushSharedMediaTabs(tabs: ProfileTab[], ctx: ProfileTabContext): void {
  if (ctx.mediaCount > 0) {
    tabs.push({ key: 'media', label: '媒体', count: ctx.mediaCount, visible: true });
  }
  if (ctx.fileCount > 0) {
    tabs.push({ key: 'files', label: td('lng_in_dlg_file', '文件'), count: ctx.fileCount, visible: true });
  }
  if (ctx.linkCount > 0) {
    tabs.push({ key: 'links', label: td('lng_link_header_short', '链接'), count: ctx.linkCount, visible: true });
  }
  if (ctx.musicCount > 0) {
    tabs.push({ key: 'music', label: td('lng_all_music', '音乐'), count: ctx.musicCount, visible: true });
  }
  if (ctx.voiceCount > 0) {
    tabs.push({ key: 'voice', label: '语音', count: ctx.voiceCount, visible: true });
  }
  if (ctx.gifCount > 0) {
    tabs.push({ key: 'gifs', label: 'GIF', count: ctx.gifCount, visible: true });
  }
}
