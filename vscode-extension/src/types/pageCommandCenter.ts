// ─── types/pageCommandCenter.ts ──────────────────────────────────────────────
//
// Contract type for GET /api/seo/page-command-center response.
// The backend wraps the packet in { data: PageCommandCenterPacket }.

export interface PageCommandCenterPacket {
  pageContext: {
    routeHint?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    isPageRelevant: boolean;
  };

  projectContext: {
    projectId: string;
    projectName: string;
    projectSlug?: string;
    lifecycleState?: string;
    maturitySummary?: string;
  };

  observatorySummary: {
    hasRiskSignals: boolean;
    topRiskKeywordCount: number;
    routeTextOverlapCount: number;
  };

  topRiskKeywords: {
    keywordTargetId: string;
    query: string;
    volatilityScore: number;
    regime: string;
    maturity?: string;
  }[];

  routeTextKeywordMatches: {
    keywordTargetId: string;
    query: string;
    matchTokens: string[];
  }[];

  availableActions: {
    action: string;
    label: string;
  }[];

  notes: string[];
}

/** API envelope returned by the backend for this endpoint. */
export interface PageCommandCenterResponse {
  data: PageCommandCenterPacket;
}
