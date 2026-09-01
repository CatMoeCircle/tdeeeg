/**
 * Shared media count fetching — mirrors Unigram's UpdateSharedCountAsync.
 *
 * Calls getChatMessageCount for each media filter type and returns the counts.
 * These counts drive which shared-media tabs appear in the profile page.
 */

import { tdlibSend } from './tdlib';

export interface SharedMediaCounts {
  media: number;   // PhotoAndVideo
  files: number;   // Document
  links: number;   // Url (links)
  music: number;   // Audio
  voice: number;   // VoiceAndVideoNote
  gifs: number;    // Animation
}

const EMPTY_COUNTS: SharedMediaCounts = {
  media: 0,
  files: 0,
  links: 0,
  music: 0,
  voice: 0,
  gifs: 0,
};

type FilterDef = {
  key: keyof SharedMediaCounts;
  filter: { _: string };
};

const FILTERS: FilterDef[] = [
  { key: 'media', filter: { _: 'searchMessagesFilterPhotoAndVideo' } },
  { key: 'files', filter: { _: 'searchMessagesFilterDocument' } },
  { key: 'links', filter: { _: 'searchMessagesFilterUrl' } },
  { key: 'music', filter: { _: 'searchMessagesFilterAudio' } },
  { key: 'voice', filter: { _: 'searchMessagesFilterVoiceAndVideoNote' } },
  { key: 'gifs', filter: { _: 'searchMessagesFilterAnimation' } },
];

/**
 * Fetch shared media counts for a chat.
 *
 * @param chatId The chat ID to count messages in
 * @returns SharedMediaCounts with count for each media type
 */
export async function fetchSharedMediaCounts(chatId: number): Promise<SharedMediaCounts> {
  const results = { ...EMPTY_COUNTS };

  const tasks = FILTERS.map(async (def) => {
    try {
      const res = await tdlibSend({
        _: 'getChatMessageCount',
        chat_id: chatId,
        filter: def.filter as any,
        return_local: false,
      } as any);
      // getChatMessageCount returns a Count type: { _: 'count', count: number }
      results[def.key] = (res as any)?.count ?? 0;
    } catch {
      results[def.key] = 0;
    }
  });

  await Promise.allSettled(tasks);
  return results;
}

/** Check if any shared media count is > 0 */
export function hasAnySharedMedia(counts: SharedMediaCounts): boolean {
  return counts.media > 0 || counts.files > 0 || counts.links > 0
    || counts.music > 0 || counts.voice > 0 || counts.gifs > 0;
}
