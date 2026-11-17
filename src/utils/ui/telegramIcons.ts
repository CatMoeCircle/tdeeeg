/**
 * Telegram 官方风格图标表（Fluent 线条/彩色图标，24 网格）。
 *
 * 仅收录本仓库用得到的特殊图标（Gram 钱包 / Stars / 助推 / 礼物 / Premium）。
 * 通用 UI 图标仍用 lucide-vue-next；这里的图标自带配色，不跟随文字颜色。
 */
import gramColored from '../../assets/icons/gram-colored.svg';
import gram from '../../assets/icons/gram.svg';
import gram20 from '../../assets/icons/gram-20.svg';
import starColored from '../../assets/icons/star-colored.svg';
import star from '../../assets/icons/star.svg';
import starsFilled from '../../assets/icons/stars-filled.svg';
import diamond from '../../assets/icons/diamond.svg';
import boost from '../../assets/icons/boost.svg';
import boostFilled from '../../assets/icons/boost-filled.svg';
import boosted from '../../assets/icons/boosted.svg';
import boostedFilled from '../../assets/icons/boosted-filled.svg';
import chatDollar from '../../assets/icons/chat-dollar.svg';
import coin from '../../assets/icons/coin.svg';
import crown from '../../assets/icons/crown-filled.svg';
import gift from '../../assets/icons/gift.svg';
import premium from '../../assets/icons/premium.svg';
import gramEarnings from '../../assets/icons/gram-earnings.svg';

export const TELEGRAM_ICONS = {
    'gram-color': gramColored,
    gram,
    'gram-20': gram20,
    'star-color': starColored,
    star,
    'stars-filled': starsFilled,
    diamond,
    boost,
    'boost-filled': boostFilled,
    boosted,
    'boosted-filled': boostedFilled,
    'chat-dollar': chatDollar,
    coin,
    crown,
    gift,
    premium,
    'gram-earnings': gramEarnings,
} as const;

export type TelegramIconName = keyof typeof TELEGRAM_ICONS;

/**
 * 单色图标（描边/填充为黑色或白色）：用 CSS mask + currentColor 渲染，
 * 以便跟随文字颜色与明暗主题；其余图标自带配色，按位图原样呈现。
 */
export const TELEGRAM_MONO_ICONS: ReadonlySet<TelegramIconName> = new Set<TelegramIconName>([
    'boost',
    'boost-filled',
    'boosted',
    'boosted-filled',
    'chat-dollar',
    'coin',
    'crown',
    'diamond',
    'gift',
    'gram',
    'gram-20',
    'star',
    'stars-filled',
]);
