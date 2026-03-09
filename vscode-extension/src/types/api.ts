// ─── types/api.ts ────────────────────────────────────────────────────────────

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export interface InvestigationPacket {
  project: {
    keywordCount: number;
    activeKeywordCount: number;
    weightedProjectVolatilityScore: number;
    volatilityConcentrationRatio: number;
    riskAttribution: {
      rankPercent: number | null;
      aiPercent: number | null;
      featurePercent: number | null;
    };
  };
  alertsSource: 'alerts' | 'fallback';
  alerts: Array<{
    keywordTargetId: string;
    query: string;
    volatilityScore: number;
    regime: string;
    source: string;
    maturity?: string;
  }>;
  investigations: Array<{
    keywordTargetId: string;
    overview: unknown;
    causality: unknown[];
  }>;
  reasoning: unknown;
}

export interface EnvironmentConfig {
  baseUrl: string;
}

export interface EnvironmentsConfig {
  [key: string]: EnvironmentConfig;
}
