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

  serpObservatory: {
    volatilityLevel: "stable" | "moderate" | "elevated" | "high";
    recentRankTurbulence: boolean;
    aiOverviewActivity: "none" | "present" | "increasing" | "volatile";
    dominantSerpFeatures: string[];
    recentEvents: {
      classification: string;
      capturedAt: string;
    }[];
  };

  serpDisturbance?: {
    volatilityCluster: boolean;
    featureShiftDetected: boolean;
    dominantNewFeatures: string[];
    rankingTurbulence: boolean;
    affectedKeywordCount: number;
    eventAttribution?: {
      cause: string;
      confidence: number;
      supportingSignals: string[];
    };
    weather?: {
      state: "calm" | "shifting" | "turbulent" | "unstable";
      driver: string;
      confidence: number;
      stability: "high" | "moderate" | "low";
      featureClimate: string;
      summary: string;
    };
  };

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
