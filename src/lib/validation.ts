/**
 * Validation utilities for Source Inbox APIs
 * Per docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 */

// --- Enum validation sets (from Prisma enums / canonical docs) ---

export const VALID_SOURCE_TYPES = [
  "rss",
  "webpage",
  "comment",
  "reply",
  "video",
  "other",
] as const;

export const VALID_PLATFORMS = [
  "website",
  "x",
  "youtube",
  "github",
  "reddit",
  "hackernews",
  "substack",
  "linkedin",
  "discord",
  "other",
] as const;

export const VALID_SOURCE_ITEM_STATUSES = [
  "ingested",
  "triaged",
  "used",
  "archived",
] as const;

export const VALID_CONTENT_ENTITY_TYPES = [
  "guide",
  "concept",
  "project",
  "news",
] as const;

export const VALID_ENTITY_STATUSES = [
  "draft",
  "publish_requested",
  "published",
  "archived",
] as const;

export const VALID_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const VALID_CONCEPT_KINDS = [
  "standard",
  "model",
  "comparison",
] as const;

export const VALID_METRIC_TYPES = [
  // X
  "x_impressions",
  "x_likes",
  "x_reposts",
  "x_replies",
  "x_bookmarks",

  // GSC
  "gsc_impressions",
  "gsc_clicks",

  // GA4
  "ga4_pageviews",
  "ga4_sessions",

  // YouTube
  "yt_views",
  "yt_watch_time_hours",
  "yt_ctr",
  "yt_avg_retention_pct",

  // GEO
  "geo_citability_score",
  "geo_extractability_score",
  "geo_factual_density",

  // AI
  "ai_search_volume",
] as const;

/**
 * Canonical relation types from docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md
 * Mapped by fromEntityType → toEntityType → allowed relation types
 */
export const VALID_RELATION_TYPES_BY_PAIR: Record<
  string,
  Record<string, string[]>
> = {
  guide: {
    concept: ["GUIDE_USES_CONCEPT", "GUIDE_EXPLAINS_CONCEPT"],
    sourceItem: ["GUIDE_REFERENCES_SOURCE"],
  },
  concept: {
    concept: ["CONCEPT_RELATES_TO_CONCEPT"],
    sourceItem: ["CONCEPT_REFERENCES_SOURCE"],
  },
  news: {
    sourceItem: ["NEWS_DERIVED_FROM_SOURCE", "NEWS_REFERENCES_SOURCE"],
    concept: ["NEWS_REFERENCES_CONCEPT"],
  },
  project: {
    concept: ["PROJECT_IMPLEMENTS_CONCEPT"],
    sourceItem: ["PROJECT_REFERENCES_SOURCE"],
    guide: ["PROJECT_HAS_GUIDE"],
  },
  distributionEvent: {
    guide: ["DISTRIBUTION_PROMOTES_GUIDE"],
    concept: ["DISTRIBUTION_PROMOTES_CONCEPT"],
    project: ["DISTRIBUTION_PROMOTES_PROJECT"],
    news: ["DISTRIBUTION_PROMOTES_NEWS"],
  },
  video: {
    guide: ["VIDEO_EXPLAINS_GUIDE"],
    concept: ["VIDEO_EXPLAINS_CONCEPT"],
    project: ["VIDEO_EXPLAINS_PROJECT"],
    news: ["VIDEO_EXPLAINS_NEWS"],
  },
};

// --- Simple helpers ---

export function isValidEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

export function isValidUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim().length === 0) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Generate a slug from a title.
 * Per docs: slugs are lowercase, hyphens, no spaces.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a content hash from a URL.
 * Per API contract: POST /api/source-items/capture generates contentHash from URL.
 * Using a simple hash since we're in a browser/edge-compatible context.
 */
export async function generateContentHash(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
