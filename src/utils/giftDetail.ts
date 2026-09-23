import type {
    chat,
    chatPhotoInfo,
    formattedText,
    gift,
    messageGift,
    messageUpgradedGift,
    MessageSender,
    profilePhoto,
    receivedGift,
    sentGiftRegular,
    sentGiftUpgraded,
    sticker,
    UpgradedGiftAttributeRarity,
    upgradedGift,
    user,
} from 'tdlib-types';
import { tdlibSend } from './tdlib';

export type GiftDetailParty = {
    name: string;
    photo?: chatPhotoInfo | profilePhoto;
    accentColorId?: number;
};

export type GiftDetailRow = {
    label?: string;
    kind?: 'party' | 'stars' | 'attr' | 'value' | 'text' | 'note';
    value?: string;
    party?: GiftDetailParty;
    rarity?: string;
    learnMore?: string;
    formattedText?: formattedText | null;
    accent?: boolean;
};

export type GiftDetailData = {
    kind: 'regular' | 'upgraded';
    sticker: sticker;
    title: string;
    subtitle?: string;
    description?: string;
    rows: GiftDetailRow[];
    footer?: string;
    upgraded?: upgradedGift;
    showMore?: boolean;
};

export type GiftDetailSource =
    | { type: 'messageGift'; value: messageGift; date?: number }
    | { type: 'messageUpgradedGift'; value: messageUpgradedGift; date?: number }
    | { type: 'receivedGift'; value: receivedGift };

export type GiftT = (key: string, params?: Record<string, unknown>) => string;

/** 稀有度文案：千分比 → 百分比；档位走语言包 */
export function formatGiftRarity(
    rarity: UpgradedGiftAttributeRarity | undefined,
    t: GiftT,
): string {
    if (!rarity) return '';
    if (rarity._ === 'upgradedGiftAttributeRarityPerMille') {
        const percent = rarity.per_mille / 10;
        if (rarity.per_mille <= 0) return '';
        if (rarity.per_mille < 10 || !Number.isInteger(percent)) return `${percent.toFixed(1)}%`;
        return `${percent}%`;
    }
    if (rarity._ === 'upgradedGiftAttributeRarityUncommon') return t('lng_gift_uncommon_tag');
    if (rarity._ === 'upgradedGiftAttributeRarityRare') return t('lng_gift_rare_tag');
    if (rarity._ === 'upgradedGiftAttributeRarityEpic') return 'epic';
    if (rarity._ === 'upgradedGiftAttributeRarityLegendary') return 'legendary';
    return '';
}

/** 估算价值：smallest units → 「~¥132.00」 */
export function formatGiftValue(amount: number, currency: string): string {
    if (!amount || !currency) return '';
    // TDLib 金额为最小货币单位（分/厘等），常见两位小数
    const major = amount / 100;
    try {
        const text = new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency,
            currencyDisplay: 'narrowSymbol',
        }).format(major);
        return `~${text}`;
    } catch {
        return `~${major.toFixed(2)} ${currency}`;
    }
}

export function formatGiftDate(ts: number | undefined): string {
    if (!ts) return '';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(ts * 1000));
}

export function displayGiftPartyName(value: user): string {
    return `${value.first_name} ${value.last_name}`.trim() || '已删除账号';
}

export async function resolveGiftParty(id?: MessageSender): Promise<GiftDetailParty | undefined> {
    if (!id) return undefined;
    try {
        if (id._ === 'messageSenderUser') {
            const u = await tdlibSend({ _: 'getUser', user_id: id.user_id }) as user;
            return {
                name: displayGiftPartyName(u),
                photo: u.profile_photo,
                accentColorId: u.accent_color_id,
            };
        }
        const c = await tdlibSend({ _: 'getChat', chat_id: id.chat_id }) as chat;
        return {
            name: c.title,
            photo: c.photo as chatPhotoInfo | undefined,
            accentColorId: c.accent_color_id,
        };
    } catch {
        return undefined;
    }
}

function emptyText(): formattedText {
    return { _: 'formattedText', text: '', entities: [] };
}

function noteRow(text?: formattedText | null): GiftDetailRow | null {
    if (!text?.text) return null;
    return { kind: 'note', formattedText: text, value: text.text };
}

/** NFT 属性行（不含「所有者」，由调用方补齐） */
function upgradedAttrRows(ug: upgradedGift, t: GiftT): GiftDetailRow[] {
    const rows: GiftDetailRow[] = [];

    rows.push({
        label: t('lng_gift_unique_model'),
        kind: 'attr',
        value: ug.model?.name ?? '',
        rarity: formatGiftRarity(ug.model?.rarity, t),
    });
    rows.push({
        label: t('lng_gift_unique_backdrop'),
        kind: 'attr',
        value: ug.backdrop?.name ?? '',
        rarity: formatGiftRarity(ug.backdrop?.rarity, t),
    });
    rows.push({
        label: t('lng_gift_unique_symbol'),
        kind: 'attr',
        value: ug.symbol?.name ?? '',
        rarity: formatGiftRarity(ug.symbol?.rarity, t),
    });

    const valueText = formatGiftValue(ug.value_amount, ug.value_currency);
    if (valueText) {
        rows.push({
            label: t('lng_gift_unique_value'),
            kind: 'value',
            value: valueText,
            learnMore: t('lng_gift_unique_value_learn_more'),
        });
    }

    if (ug.total_upgraded_count || ug.max_upgraded_count) {
        const count = ug.total_upgraded_count.toLocaleString('zh-CN');
        const amount = ug.max_upgraded_count.toLocaleString('zh-CN');
        rows.push({
            label: t('lng_gift_unique_availability_label'),
            kind: 'text',
            value: t('lng_gift_unique_availability', { count, amount }),
        });
    }

    return rows;
}

/** NFT 详情行：所有者 + 属性 + 留言说明 */
async function upgradedDetailRows(
    ug: upgradedGift,
    ownerId: MessageSender | undefined,
    text: formattedText | undefined | null,
    t: GiftT,
): Promise<GiftDetailRow[]> {
    const owner = await resolveGiftParty(ownerId);
    const rows: GiftDetailRow[] = [{
        label: t('lng_gift_unique_owner'),
        kind: owner ? 'party' : 'text',
        party: owner ?? (ug.owner_name ? { name: ug.owner_name } : undefined),
        value: owner ? undefined : (ug.owner_name || ''),
        accent: !!owner,
    }];
    rows.push(...upgradedAttrRows(ug, t));
    const note = noteRow(text);
    if (note) rows.push(note);
    return rows;
}

function regularCoreRows(
    party: GiftDetailParty | undefined,
    partyLabel: string,
    date: number | undefined,
    starCount: number,
    t: GiftT,
): GiftDetailRow[] {
    const rows: GiftDetailRow[] = [];
    rows.push({
        label: partyLabel,
        kind: 'party',
        party,
        accent: true,
    });
    rows.push({
        label: t('lng_gift_link_label_date'),
        kind: 'text',
        value: formatGiftDate(date) || '—',
    });
    rows.push({
        label: t('lng_gift_link_label_value'),
        kind: 'stars',
        value: String(starCount),
    });
    return rows;
}

/**
 * 把三种礼物来源统一成 GiftDetailDialog 的展示模型。
 * 普通：来自/日期/价值 + 留言说明；NFT：所有者/型号/背景/符号/价值/数量 + 留言说明。
 */
export async function buildGiftDetailData(
    source: GiftDetailSource,
    t: GiftT,
    opts?: { isSelf?: boolean },
): Promise<GiftDetailData> {
    if (source.type === 'receivedGift') {
        const g = source.value;
        const sent = g.gift as sentGiftRegular | sentGiftUpgraded;
        const isUpgraded = sent?._ === 'sentGiftUpgraded';
        const sender = await resolveGiftParty(g.sender_id);
        const text = g.text ?? emptyText();

        if (isUpgraded) {
            const ug = (sent as sentGiftUpgraded).gift;
            const rows = await upgradedDetailRows(ug, ug.owner_id ?? g.sender_id, text, t);
            return {
                kind: 'upgraded',
                sticker: ug.model.sticker,
                title: ug.title || t('lng_sr_message_column_gift'),
                subtitle: t('lng_gift_unique_number', { index: ug.number }),
                rows,
                footer: g.is_saved ? t('lng_gift_display_on_page_hide') : undefined,
                upgraded: ug,
                showMore: true,
            };
        }

        const regular = (sent as sentGiftRegular).gift as gift;
        const rows = regularCoreRows(
            sender,
            t('lng_credits_box_history_entry_peer_in'),
            g.date,
            regular?.star_count ?? 0,
            t,
        );
        const note = noteRow(text);
        if (note) rows.push(note);

        return {
            kind: 'regular',
            sticker: regular.sticker,
            title: t('lng_action_gift_got_subtitle', { user: sender?.name || t('lng_credits_box_history_entry_anonymous') }),
            description: t('lng_action_gift_got_stars_text', { count: regular?.star_count ?? 0 })
                .replace(/\*\*/g, ''),
            rows,
            footer: g.is_saved
                ? t('lng_action_gift_displayed_self', { name: sender?.name || '' })
                : t('lng_action_gift_got_gift_text'),
        };
    }

    if (source.type === 'messageUpgradedGift') {
        const m = source.value;
        const ug = m.gift;
        const text = ug.original_details?.text ?? emptyText();
        const rows = await upgradedDetailRows(ug, ug.owner_id, text, t);

        return {
            kind: 'upgraded',
            sticker: ug.model.sticker,
            title: ug.title || t('lng_sr_message_column_gift'),
            subtitle: t('lng_gift_unique_number', { index: ug.number }),
            rows,
            footer: m.is_saved ? t('lng_gift_display_on_page_hide') : undefined,
            upgraded: ug,
            showMore: true,
        };
    }

    // messageGift：普通礼物
    const m = source.value;
    const regular = m.gift as gift;
    const sender = await resolveGiftParty(m.sender_id);
    const receiver = await resolveGiftParty(m.receiver_id);
    const text = m.text ?? emptyText();
    const isOutgoing = !!opts?.isSelf
        && m.sender_id?._ === 'messageSenderUser';
    const party = isOutgoing ? receiver : sender;
    const partyLabel = isOutgoing
        ? t('lng_gift_link_label_to')
        : t('lng_credits_box_history_entry_peer_in');
    const partyName = party?.name
        || (isOutgoing ? t('lng_credits_box_history_entry_anonymous') : t('lng_credits_box_history_entry_anonymous'));

    const rows = regularCoreRows(party, partyLabel, source.date, regular?.star_count ?? 0, t);
    const note = noteRow(text);
    if (note) rows.push(note);

    const starCost = t('lng_action_gift_for_stars', { count: regular?.star_count ?? 0 });
    const title = isOutgoing
        ? t('lng_action_gift_sent_subtitle', { user: receiver?.name || partyName })
        : t('lng_action_gift_got_subtitle', { user: sender?.name || partyName });

    return {
        kind: 'regular',
        sticker: regular.sticker,
        title,
        description: isOutgoing
            ? t('lng_action_gift_received_me', { user: receiver?.name || partyName, cost: starCost })
            : t('lng_action_gift_got_stars_text', { count: regular?.star_count ?? 0 }).replace(/\*\*/g, ''),
        rows,
        footer: m.is_saved
            ? t('lng_action_gift_displayed_self', { name: partyName })
            : t('lng_action_gift_got_gift_text'),
    };
}
