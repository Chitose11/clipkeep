/** Selection-order plan for merge paste. Joining itself happens in Rust. */

export interface MergeClipRef {
  id: number;
  kind: string;
}

export type MergePastePlan = { ok: true; ids: number[] } | { ok: false; message: string };

export const MERGE_EMPTY = "没有选中条目";
export const MERGE_MISSING = "有选中条目已不存在，请重新选择";
export const MERGE_NOT_TEXT = "选中内容包含图片，合并粘贴只支持文本";

/**
 * Resolve `selectedIds` against the current list.
 * Ids stay in selection order. A non-text clip rejects the whole plan, even when
 * another id is missing, so images are not dropped and the rest pasted.
 */
export function planMergePaste(selectedIds: readonly number[], clips: readonly MergeClipRef[]): MergePastePlan {
  if (selectedIds.length === 0) return { ok: false, message: MERGE_EMPTY };
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const resolved = selectedIds.map((id) => byId.get(id) ?? null);
  if (resolved.some((clip) => clip !== null && clip.kind !== "text")) {
    return { ok: false, message: MERGE_NOT_TEXT };
  }
  const ids: number[] = [];
  for (const clip of resolved) {
    if (clip === null) return { ok: false, message: MERGE_MISSING };
    ids.push(clip.id);
  }
  return { ok: true, ids };
}
