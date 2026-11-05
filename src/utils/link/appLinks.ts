import type { Router } from 'vue-router';
import { resolveInternalLink } from './openInternalLink';

/** tdeeeg 官方群组用户名（反馈入口统一从这里取，避免多处写死走样） */
export const OFFICIAL_GROUP_USERNAME = 'CatMoeCircle_Group';

/** 项目仓库地址：TDLib 自己都解析不出的消息，引导用户到仓库反馈 */
export const PROJECT_REPO_URL = 'https://github.com/CatMoeCircle/tdeeeg';

/** 打开官方群组：与「消息里点 @ 用户名」同一套逻辑（t.me 链接 → resolveInternalLink） */
export function openOfficialGroup(router: Router): Promise<boolean> {
  return resolveInternalLink(`https://t.me/${OFFICIAL_GROUP_USERNAME}`, router);
}
