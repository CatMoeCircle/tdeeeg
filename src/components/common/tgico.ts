import { defineComponent, h } from "vue";

/** tgico 字形图标（供 ContextMenuItem.icon 等组件槽使用） */
function tgicoIcon(displayName: string, glyphClass: string) {
  return defineComponent({
    name: displayName,
    render() {
      return h("span", {
        class: ["tgico", glyphClass, "text-[15px]", "leading-none"],
        "aria-hidden": "true",
      });
    },
  });
}

/** 盾牌：添加/设置管理员（U+E909） */
export const ShieldAdminIcon = tgicoIcon("ShieldAdminIcon", "tgico-shield");

/** 密钥：限制成员（U+E9CE） */
export const RestrictKeyIcon = tgicoIcon("RestrictKeyIcon", "tgico-key");
