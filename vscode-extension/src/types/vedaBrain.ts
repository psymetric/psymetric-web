// ─── types/vedaBrain.ts ──────────────────────────────────────────────────────
//
// Extension-side type contract for the VEDA Brain diagnostics API.
// Source of truth for vedaClient.ts and vedaBrainProvider.ts.
// Mirrors the shape of GET /api/veda-brain/project-diagnostics.

// ── Readiness Classification ──────────────────────────────────────────────────

export type ReadinessCategory =
  | 'structurally_aligned'
  | 'under_covered'
  | 'archetype_misaligned'
  | 'entity_incomplete'
  | 'weak_authority_support'
  | 'schema_underpowered'
  | 'unmapped';

export interface KeywordReadiness {
  query: string;
  categories: ReadinessCategory[];
  isPrimary: boolean;
  mappedPageId: string | null;
}

export interface ReadinessClassification {
  classifications: KeywordReadiness[];
  categoryCounts: Record<ReadinessCategory, number>;
  fullyAlignedCount: number;
  keywordsWithIssues: number;
}

// ── Archetype Alignment ───────────────────────────────────────────────────────

export interface SerpArchetypeSignal {
  archetype: string;
  count: number;
}

export interface ArchetypeAlignmentEntry {
  query: string;
  mappedPageId: string | null;
  mappedPageUrl: string | null;
  mappedPageArchetype: string | null;
  serpDominantArchetypes: SerpArchetypeSignal[];
  aligned: boolean;
  mismatchReason: string | null;
}

export interface ArchetypeAlignment {
  entries: ArchetypeAlignmentEntry[];
  alignedCount: number;
  misalignedCount: number;
  noDataCount: number;
}

// ── Entity Gap Analysis ───────────────────────────────────────────────────────

export interface EntityGapEntry {
  query: string;
  mappedPageId: string | null;
  mappedPageUrl: string | null;
  projectEntities: string[];
  serpMentionedTerms: string[];
  missingFromProject: string[];
  uniqueToProject: string[];
}

export interface EntityGapAnalysis {
  entries: EntityGapEntry[];
  totalGaps: number;
  keywordsWithGaps: number;
  keywordsWithoutMapping: number;
}

// ── Topic Territory Gaps ──────────────────────────────────────────────────────

export interface TopicTerritory {
  topicId: string;
  topicKey: string;
  topicLabel: string;
  pageCount: number;
  matchedKeywords: string[];
  unmatchedKeywords: boolean;
}

export interface UncategorizedKeyword {
  query: string;
  mappedPageId: string | null;
  hasMapping: boolean;
}

export interface TopicTerritoryGaps {
  topicTerritories: TopicTerritory[];
  untrackedTopics: string[];
  thinTopics: string[];
  uncategorizedKeywords: UncategorizedKeyword[];
  summary: {
    totalTopics: number;
    untrackedTopicCount: number;
    thinTopicCount: number;
    uncategorizedKeywordCount: number;
  };
}

// ── Authority Opportunity ─────────────────────────────────────────────────────

export type AuthorityOpportunityType =
  | 'isolated_target'
  | 'high_value_undersupported'
  | 'weak_support'
  | 'none';

export interface AuthorityOpportunityEntry {
  query: string;
  isPrimary: boolean;
  mappedPageId: string;
  mappedPageUrl: string;
  inboundLinkCount: number;
  outboundLinkCount: number;
  isIsolated: boolean;
  isWeaklySupported: boolean;
  gscAvgPosition: number | null;
  gscImpressions: number | null;
  opportunityType: AuthorityOpportunityType;
}

export interface AuthorityOpportunity {
  opportunities: AuthorityOpportunityEntry[];
  summary: {
    isolatedTargets: number;
    weaklySupported: number;
    highValueUndersupported: number;
    wellSupported: number;
  };
}

// ── Schema Opportunity ────────────────────────────────────────────────────────

export interface SchemaOpportunityEntry {
  query: string;
  mappedPageId: string | null;
  mappedPageUrl: string | null;
  pageSchemaTypes: string[];
  serpSchemaSignals: string[];
  missingSchemaTypes: string[];
  hasNoSchema: boolean;
}

export interface SchemaOpportunity {
  entries: SchemaOpportunityEntry[];
  pagesWithoutSchema: number;
  totalMissingSchemaOpportunities: number;
  serpSchemaFrequency: { schemaType: string; count: number }[];
}

// ── Top-level response ────────────────────────────────────────────────────────

export interface VedaBrainDiagnostics {
  readinessClassification: ReadinessClassification;
  archetypeAlignment: ArchetypeAlignment;
  entityGapAnalysis: EntityGapAnalysis;
  topicTerritoryGaps: TopicTerritoryGaps;
  authorityOpportunity: AuthorityOpportunity;
  schemaOpportunity: SchemaOpportunity;
}

export interface VedaBrainDiagnosticsResponse {
  projectId: string;
  diagnostics: VedaBrainDiagnostics;
}
