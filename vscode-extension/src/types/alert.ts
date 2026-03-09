// ─── types/alert.ts ──────────────────────────────────────────────────────────

export interface AlertItem {
  triggerType: string;        // T1 | T2 | T3
  severityRank: number;
  keywordTargetId?: string;
  query?: string;
  volatilityScore?: number;
  volatilityRegime?: string;
  maturity?: string;
}

export interface AlertListResponse {
  data: {
    items: AlertItem[];
    total?: number;
    nextCursor?: string | null;
  };
}
