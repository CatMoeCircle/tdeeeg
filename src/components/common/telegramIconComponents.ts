/**
 * Telegram 风格图标的语义化包装组件，便于直接用于 <component :is="..."> 或模板。
 * 尺寸默认 18px，与设置列表 / 资料页的瓷片图标一致。
 */
import { defineComponent, h } from 'vue';
import TgIcon from './TgIcon.vue';
import type { TelegramIconName } from '../../utils/ui/telegramIcons';

function createIcon(name: TelegramIconName, defaultSize = 18) {
    return defineComponent({
        name: 'TgIcon' + name.replace(/(^|-)([a-z])/g, (_m, _d, c: string) => c.toUpperCase()),
        setup: () => () => h(TgIcon, { name, size: defaultSize }),
    });
}

export const TgGramIcon = createIcon('gram-20', 20);
export const TgGramColoredIcon = createIcon('gram-color');
export const TgStarIcon = createIcon('star');
export const TgStarColoredIcon = createIcon('star-color');
export const TgStarsFilledIcon = createIcon('stars-filled', 20);
export const TgDiamondIcon = createIcon('diamond', 20);
export const TgBoostIcon = createIcon('boost', 20);
export const TgBoostFilledIcon = createIcon('boost-filled', 18);
export const TgBoostedIcon = createIcon('boosted');
export const TgCoinIcon = createIcon('coin', 20);
export const TgCrownIcon = createIcon('crown');
export const TgGiftIcon = createIcon('gift');
export const TgPremiumIcon = createIcon('premium');
export const TgGramEarningsIcon = createIcon('gram-earnings', 20);
