/**
 * Metric Snapshots List Page
 * Phase 2C — Dashboard metric snapshots list with deterministic filtering + pagination
 *
 * Read-only list of metric snapshots mirroring GET /api/metric-snapshots filtering contract.
 * No client components, no lifecycle actions, no schema changes.
 */
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  isValidEnum,
  VALID_PLATFORMS,
  VALID_METRIC_TYPES,
} from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import { MetricType } from "@prisma/client";

interface SearchParams {
  metricType?: string;
  platform?: string;
  entityId?: string;
  page?: string;
  limit?: string;
}

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getMetricSnapshots(searchParams: SearchParams) {
  // Parse pagination
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.limit || "20", 10)));
  const skip = (page - 1) * limit;

  // Build where clause - mirror GET /api/metric-snapshots exactly
  const where: Prisma.MetricSnapshotWhereInput = {};

  // Validate and apply metricType filter
  const metricType = searchParams.metricType;
  if (metricType) {
    if (!isValidEnum(metricType, VALID_METRIC_TYPES)) {
      return { error: `Invalid metricType: ${metricType}`, metricSnapshots: [], total: 0, pagination: { page, limit, skip } };
    }
    where.metricType = metricType as MetricType;
  }

  // Validate and apply platform filter
  const platform = searchParams.platform;
  if (platform) {
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return { error: `Invalid platform: ${platform}`, metricSnapshots: [], total: 0, pagination: { page, limit, skip } };
    }
    where.platform = platform;
  }

  // Validate and apply entityId filter
  const entityId = searchParams.entityId;
  if (entityId) {
    if (!UUID_RE.test(entityId)) {
      return { error: `Invalid entityId: must be a valid UUID`, metricSnapshots: [], total: 0, pagination: { page, limit, skip } };
    }
    where.entityId = entityId;
  }

  try {
    const [metricSnapshots, total] = await Promise.all([
      prisma.metricSnapshot.findMany({
        where,
        orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          metricType: true,
          value: true,
          platform: true,
          entityId: true,
          capturedAt: true,
          createdAt: true,
          notes: true,
        },
      }),
      prisma.metricSnapshot.count({ where }),
    ]);

    return {
      metricSnapshots,
      total,
      pagination: { page, limit, skip },
      error: null,
    };
  } catch (error) {
    console.error("Error fetching metric snapshots:", error);
    return { error: "Failed to fetch metric snapshots", metricSnapshots: [], total: 0, pagination: { page, limit, skip } };
  }
}

function buildPaginationUrl(searchParams: SearchParams, newPage: number) {
  const params = new URLSearchParams();
  
  if (searchParams.metricType) params.set("metricType", searchParams.metricType);
  if (searchParams.platform) params.set("platform", searchParams.platform);
  if (searchParams.entityId) params.set("entityId", searchParams.entityId);
  if (searchParams.limit && searchParams.limit !== "20") params.set("limit", searchParams.limit);
  
  params.set("page", newPage.toString());
  
  const query = params.toString();
  return query ? `/dashboard/metric-snapshots?${query}` : `/dashboard/metric-snapshots`;
}

export default async function MetricSnapshotsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const { metricSnapshots, total, pagination, error } = await getMetricSnapshots(searchParams);
  
  const hasResults = metricSnapshots.length > 0;
  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.skip + metricSnapshots.length < total;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Metric Snapshots</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and track metric data snapshots across all platforms and entities.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Filters summary */}
      {(searchParams.metricType || searchParams.platform || searchParams.entityId) && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-4 text-sm text-blue-800">
            <span className="font-medium">Active filters:</span>
            {searchParams.metricType && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Metric: {searchParams.metricType}
              </span>
            )}
            {searchParams.platform && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Platform: {searchParams.platform}
              </span>
            )}
            {searchParams.entityId && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Entity ID: {searchParams.entityId.substring(0, 8)}...
              </span>
            )}
            <Link 
              href="/dashboard/metric-snapshots"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Clear filters
            </Link>
          </div>
        </div>
      )}

      {/* Results summary */}
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          {error ? (
            "Unable to load metric snapshots"
          ) : hasResults ? (
            <>
              Showing {pagination.skip + 1}&ndash;{pagination.skip + metricSnapshots.length} of {total} metric snapshots
            </>
          ) : (
            total === 0 ? "No metric snapshots found" : "No results match your filters"
          )}
        </p>
      </div>

      {/* Metric snapshots list */}
      {hasResults ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Metric Type
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity ID
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Captured At
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {metricSnapshots.map((metricSnapshot) => (
                <tr key={metricSnapshot.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 font-mono">
                      {metricSnapshot.metricType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 font-medium">
                      {metricSnapshot.value.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 capitalize">
                      {metricSnapshot.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {UUID_RE.test(metricSnapshot.entityId) ? (
                      <Link
                        href={`/dashboard/entities/${metricSnapshot.entityId}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline font-mono"
                      >
                        {metricSnapshot.entityId}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-900 font-mono">
                        {metricSnapshot.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {metricSnapshot.capturedAt.toLocaleDateString()}
                    </span>
                    <p className="text-xs text-gray-500">
                      {metricSnapshot.capturedAt.toLocaleTimeString()}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {metricSnapshot.createdAt.toLocaleDateString()}
                    </span>
                    <p className="text-xs text-gray-500">
                      {metricSnapshot.createdAt.toLocaleTimeString()}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    {metricSnapshot.notes ? (
                      <span className="text-sm text-gray-900 max-w-xs truncate block">
                        {metricSnapshot.notes}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 italic">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-500">No metric snapshots found.</p>
            {(searchParams.metricType || searchParams.platform || searchParams.entityId) && (
              <p className="text-sm text-gray-400 mt-2">
                Try adjusting your filters or{" "}
                <Link href="/dashboard/metric-snapshots" className="text-blue-600 hover:underline">
                  clear all filters
                </Link>
                .
              </p>
            )}
          </div>
        )
      )}

      {/* Pagination */}
      {hasResults && (hasPrevious || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-2">
            {hasPrevious && (
              <Link
                href={buildPaginationUrl(searchParams, pagination.page - 1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {hasNext && (
              <Link
                href={buildPaginationUrl(searchParams, pagination.page + 1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
          
          <div className="text-sm text-gray-500">
            Page {pagination.page} of {Math.ceil(total / pagination.limit)}
          </div>
        </div>
      )}
    </div>
  );
}
