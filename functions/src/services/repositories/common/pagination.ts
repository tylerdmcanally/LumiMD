export type SortDirection = 'asc' | 'desc';

export type CursorPageRequest = {
  limit: number;
  cursor?: string | null;
  sortDirection?: SortDirection;
};

export type CursorPageResult<TRecord> = {
  items: TRecord[];
  hasMore: boolean;
  nextCursor: string | null;
};
