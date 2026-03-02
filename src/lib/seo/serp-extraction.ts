/**
 * serp-extraction.ts — Shared SERP payload extraction helpers
 *
 * Extracted from serp-deltas/route.ts so that serp-history and any future
 * read endpoints can reuse the same logic without duplication.
 *
 * Consumers:
 *   - src/app/api/seo/serp-deltas/route.ts
 *   - src/app/api/seo/keyword-targets/[id]/serp-history/route.ts
 *
 * Rules:
 *   - Pure functions. No DB access. No side effects.
 *   - Deterministic: same rawPayload always produces the same output.
 *   - parseWarning=true iff the payload structure was not recognized or was
 *     recognized but yielded zero items despite containing non-empty input.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A single organic result extracted from a rawPayload.
 * url is the canonical key for set comparisons.
 * rank is null if the payload structure didn't yield a numeric position.
 */
export interface ExtractedResult {
  url:    string;
  domain: string | null;
  rank:   number | null;
  title:  string | null;
}

export interface ExtractionResult {
  results:      ExtractedResult[];
  parseWarning: boolean;
}

// =============================================================================
// Internal helpers
// =============================================================================

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function sortResults(results: ExtractedResult[]): ExtractedResult[] {
  return results.slice().sort((a, b) => {
    if (a.rank === null && b.rank === null) return a.url.localeCompare(b.url);
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.url.localeCompare(b.url);
  });
}

// =============================================================================
// extractOrganicResults
// =============================================================================

/**
 * Extract organic results from a SERP rawPayload.
 *
 * Strategy 1 — DataForSEO Advanced SERP (primary):
 *   rawPayload.items[] where item.type === "organic"
 *   Fields: rank_absolute (preferred), position (fallback), url, domain, title
 *
 * Strategy 2 — Simple / test payloads:
 *   rawPayload.results[] where item.url is a string
 *   Fields: rank (preferred), position (fallback), url, domain, title
 *
 * Duplicate URLs: first-wins (results are sorted rank asc so lowest rank wins).
 * parseWarning: true when payload is unrecognized or recognized but empty
 *   despite non-empty input (signals extraction failure to callers).
 */
export function extractOrganicResults(rawPayload: unknown): ExtractionResult {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return { results: [], parseWarning: true };
  }

  const payload = rawPayload as Record<string, unknown>;

  // ── Strategy 1: DataForSEO items array ──────────────────────────────────────
  if (Array.isArray(payload.items)) {
    const organic = payload.items
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          (item as Record<string, unknown>).type === "organic" &&
          typeof (item as Record<string, unknown>).url === "string"
      )
      .map((item) => ({
        url:    item.url as string,
        domain:
          typeof item.domain === "string"
            ? item.domain
            : extractDomain(item.url as string),
        rank:
          typeof item.rank_absolute === "number"
            ? item.rank_absolute
            : typeof item.position === "number"
            ? item.position
            : null,
        title: typeof item.title === "string" ? item.title : null,
      }));

    const sorted = sortResults(organic);
    const parseWarning = organic.length === 0 && payload.items.length > 0;
    return { results: sorted, parseWarning };
  }

  // ── Strategy 2: Simple results array (test / mock payloads) ─────────────────
  if (Array.isArray(payload.results)) {
    const results = payload.results
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof (item as Record<string, unknown>).url === "string"
      )
      .map((item) => ({
        url:    item.url as string,
        domain:
          typeof item.domain === "string"
            ? item.domain
            : extractDomain(item.url as string),
        rank:
          typeof item.rank === "number"
            ? item.rank
            : typeof item.position === "number"
            ? item.position
            : null,
        title: typeof item.title === "string" ? item.title : null,
      }));

    const sorted = sortResults(results);
    return { results: sorted, parseWarning: false };
  }

  // ── Unrecognized structure ───────────────────────────────────────────────────
  return { results: [], parseWarning: true };
}
