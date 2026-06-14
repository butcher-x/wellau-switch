import type { WellauExtension } from "@wellau/extensions/types";

// Wellau 账户登录已移入「设置 → 通用」顶部（WellauAccountSection），
// 不再单独占用工具栏入口。如需新增工具栏功能再在此注册。
export const wellauExtensions: WellauExtension[] = [];

export function getWellauExtension(id: string): WellauExtension | undefined {
  return wellauExtensions.find((extension) => extension.id === id);
}
