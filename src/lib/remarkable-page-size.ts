export const RM2_PAGE_SIZE = {
  width: 1404,
  height: 1872,
} as const;

export const PAPER_PRO_PAGE_SIZE = {
  width: 1620,
  height: 2160,
} as const;

export const DEFAULT_NOTEBOOK_PAGE_SIZE = PAPER_PRO_PAGE_SIZE;

export type RemarkablePageSize = {
  width: number;
  height: number;
};

export function resolveNotebookPageSize(
  pageSize?: Partial<RemarkablePageSize>,
): RemarkablePageSize {
  return {
    width: pageSize?.width ?? DEFAULT_NOTEBOOK_PAGE_SIZE.width,
    height: pageSize?.height ?? DEFAULT_NOTEBOOK_PAGE_SIZE.height,
  };
}
