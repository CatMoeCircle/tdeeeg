import { FitzModifier } from "tlottie";

/** Telegram fitzpatrick_type（0-6）→ tlottie FitzModifier */
export function telegramFitzToFitzModifier(type: number): FitzModifier {
    if (type <= 0) return FitzModifier.None;
    if (type <= 2) return FitzModifier.Type12;
    if (type === 3) return FitzModifier.Type3;
    if (type === 4) return FitzModifier.Type4;
    if (type === 5) return FitzModifier.Type5;
    return FitzModifier.Type6;
}
