import type { Component } from "vue";
import {
    MessageCircle, BellRing, Bot, Megaphone, Users, User, Settings, Cat, Crown, Star,
    Flower, Gamepad2, House, Heart, VenetianMask, PartyPopper, Dumbbell, GraduationCap,
    TrendingUp, Plane, Briefcase, BookOpen, Sun, ThumbsUp, Banknote, StickyNote, Palette,
    Folder,
} from "lucide-vue-next";

/**
 * TDLib 允许的 chatFolderIcon.name 取值（固定枚举，顺序即编辑器展示顺序）。
 * 对应 src/types/tdlib-types.d.ts 中 chatFolderIcon 的注释列表。
 */
export const FOLDER_ICON_NAMES = [
    'All', 'Unread', 'Unmuted', 'Bots', 'Channels', 'Groups', 'Private', 'Custom',
    'Setup', 'Cat', 'Crown', 'Favorite', 'Flower', 'Game', 'Home', 'Love', 'Mask',
    'Party', 'Sport', 'Study', 'Trade', 'Travel', 'Work', 'Airplane', 'Book', 'Light',
    'Like', 'Money', 'Note', 'Palette',
] as const;

/** 名称 → 图标；未知名（含空串）统一回退到 Folder */
const FOLDER_ICONS: Record<string, Component> = {
    All: MessageCircle,
    Unread: MessageCircle,
    Unmuted: BellRing,
    Bots: Bot,
    Channels: Megaphone,
    Groups: Users,
    Private: User,
    Custom: Folder,
    Setup: Settings,
    Cat,
    Crown,
    Favorite: Star,
    Flower,
    Game: Gamepad2,
    Home: House,
    Love: Heart,
    Mask: VenetianMask,
    Party: PartyPopper,
    Sport: Dumbbell,
    Study: GraduationCap,
    Trade: TrendingUp,
    Travel: Plane,
    Work: Briefcase,
    Airplane: Plane,
    Book: BookOpen,
    Light: Sun,
    Like: ThumbsUp,
    Money: Banknote,
    Note: StickyNote,
    Palette,
};

/** 分组图标组件（选项卡、列表、编辑器共用一套映射） */
export function folderIconFor(name?: string | null): Component {
    return (name && FOLDER_ICONS[name]) || Folder;
}
