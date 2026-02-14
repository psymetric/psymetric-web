/**
 * Distribution Events List Page
 * Phase 2C.1 — Dashboard distribution events list with deterministic filtering + pagination
 *
 * Read-only list of distribution events mirroring GET /api/distribution-events filtering contract.
 * No client components, no lifecycle actions, no schema changes.
 */
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  isValidEnum,
  VALID_PLATFORMS,
  VALID_ENTITY_STATUSES,
} from "@/lib/validation";
import type { Prisma } from "@prisma/client";

interface SearchParams {
  platform?: string;
  primaryEntityId?: string;
  status?: string;
  page?: string;
  limit?: string;
}

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getDistributionEvents(searchParams: SearchParams) {
  // Parse pagination
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.limit || "20", 10)));
  const skip = (page - 1) * limit;

  // Build where clause - mirror GET /api/distribution-events exactly
  const where: Prisma.DistributionEventWhereInput = {};

  // Validate and apply platform filter
  const platform = searchParams.platform;
  if (platform) {
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return { error: `Invalid platform: ${platform}`, distributionEvents: [], total: 0, pagination: { page, limit, skip } };
    }
    where.platform = platform;
  }

  // Validate and apply status filter
  const status = searchParams.status;
  if (status) {
    if (!isValidEnum(status, VALID_ENTITY_STATUSES)) {
      return { error: `Invalid status: ${status}`, distributionEvents: [], total: 0, pagination: { page, limit, skip } };
    }
    where.status = status;
  }

  // Validate and apply primaryEntityId filter
  const primaryEntityId = searchParams.primaryEntityId;
  if (primaryEntityId) {
    if (!UUID_RE.test(primaryEntityId)) {
      return { error: `Invalid primaryEntityId: must be a valid UUID`, distributionEvents: [], total: 0, pagination: { page, limit, skip } };
    }
    where.primaryEntityId = primaryEntityId;
  }

  try {
    const [distributionEvents, total] = await Promise.all([
      prisma.distributionEvent.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          platform: true,
          primaryEntityId: true,
          externalUrl: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      prisma.distributionEvent.count({ where }),
    ]);

    return {
      distributionEvents,
      total,
      pagination: { page, limit, skip },
      error: null,
    };
  } catch (error) {
    console.error("Error fetching distribution events:", error);
    return { error: "Failed to fetch distribution events", distributionEvents: [], total: 0, pagination: { page, limit, skip } };
  }
}

function buildPaginationUrl(searchParams: SearchParams, newPage: number) {
  const params = new URLSearchParams();
  
  if (searchParams.platform) params.set("platform", searchParams.platform);
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.primaryEntityId) params.set("primaryEntityId", searchParams.primaryEntityId);
  if (searchParams.limit && searchParams.limit !== "20") params.set("limit", searchParams.limit);
  
  params.set("page", newPage.toString());
  
  const query = params.toString();
  return query ? `/dashboard/distribution-events?${query}` : `/dashboard/distribution-events`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    publish_requested: "bg-blue-100 text-blue-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-yellow-100 text-yellow-800",
  };
  
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

export default async function DistributionEventsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const { distributionEvents, total, pagination, error } = await getDistributionEvents(searchParams);
  
  const hasResults = distributionEvents.length > 0;
  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.skip + distributionEvents.length < total;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Distribution Events</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and track content distribution events across all platforms.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Filters summary */}
      {(searchParams.platform || searchParams.status || searchParams.primaryEntityId) && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-4 text-sm text-blue-800">
            <span className="font-medium">Active filters:</span>
            {searchParams.platform && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Platform: {searchParams.platform}
              </span>
            )}
            {searchParams.status && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Status: {searchParams.status}
              </span>
            )}
            {searchParams.primaryEntityId && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Entity ID: {searchParams.primaryEntityId.substring(0, 8)}...
              </span>
            )}
            <Link 
              href="/dashboard/distribution-events"
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
            "Unable to load distribution events"
          ) : hasResults ? (
            <>
              Showing {pagination.skip + 1}–{pagination.skip + distributionEvents.length} of {total} distribution events
            </>
          ) : (
            total === 0 ? "No distribution events found" : "No results match your filters"
          )}
        </p>
      </div>

      {/* Distribution events list */}
      {hasResults ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Primary Entity
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  External URL
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Published At
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {distributionEvents.map((distributionEvent) => (
                <tr key={distributionEvent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 capitalize">
                      {distributionEvent.platform}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {UUID_RE.test(distributionEvent.primaryEntityId) ? (
                      <Link
                        href={`/dashboard/entities/${distributionEvent.primaryEntityId}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline font-mono"
                      >
                        {distributionEvent.primaryEntityId}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-900 font-mono">
                        {distributionEvent.primaryEntityId}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={distributionEvent.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline max-w-xs truncate block"
                    >
                      {distributionEvent.externalUrl}
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={distributionEvent.status} />
                  </td>
                  <td className="px-6 py-4">
                    {distributionEvent.publishedAt ? (
                      <>
                        <span className="text-sm text-gray-900">
                          {distributionEvent.publishedAt.toLocaleDateString()}
                        </span>
                        <p className="text-xs text-gray-500">
                          {distributionEvent.publishedAt.toLocaleTimeString()}
                        </p>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Not published</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {distributionEvent.createdAt.toLocaleDateString()}
                    </span>
                    <p className="text-xs text-gray-500">
                      {distributionEvent.createdAt.toLocaleTimeString()}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-500">No distribution events found.</p>
            {(searchParams.platform || searchParams.status || searchParams.primaryEntityId) && (
              <p className="text-sm text-gray-400 mt-2">
                Try adjusting your filters or{" "}
                <Link href="/dashboard/distribution-events" className="text-blue-600 hover:underline">
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
