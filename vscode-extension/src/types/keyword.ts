// ─── types/keyword.ts ────────────────────────────────────────────────────────

export interface KeywordTarget {
  id: string;
  query: string;
  locale: string;
  device: string;
  isPrimary?: boolean;
}

export interface KeywordTargetListResponse {
  data: {
    items: KeywordTarget[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface KeywordDiagnosticPacket {
  keywordTargetId: string;
  query: string;
  overview?: unknown;
  timeline?: unknown;
  causality?: unknown;
  [key: string]: unknown;
}
