/**
 * Entity List Page
 * Phase 2A — Dashboard entity list with deterministic filtering + pagination
 *
 * Read-only list of entities mirroring GET /api/entities filtering contract.
 * No client components, no lifecycle actions, no schema changes.
 */
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  isValidEnum,
  VALID_CONTENT_ENTITY_TYPES,
  VALID_ENTITY_STATUSES,
} from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import { EntityFilters } from "./entity-filters";

interface SearchParams {
  entityType?: string;
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
}

async function getEntities(searchParams: SearchParams) {
  // Parse pagination
  const page = Math.max(1, parseInt(searchParams.page || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.limit || "20", 10)));
  const skip = (page - 1) * limit;

  // Build where clause - mirror GET /api/entities exactly
  const where: Prisma.EntityWhereInput = {};

  // Validate and apply entityType filter
  const entityType = searchParams.entityType;
  if (entityType) {
    if (!isValidEnum(entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return { error: `Invalid entityType: ${entityType}`, entities: [], total: 0, pagination: { page, limit, skip } };
    }
    where.entityType = entityType;
  }

  // Validate and apply status filter
  const status = searchParams.status;
  if (status) {
    if (!isValidEnum(status, VALID_ENTITY_STATUSES)) {
      return { error: `Invalid status: ${status}`, entities: [], total: 0, pagination: { page, limit, skip } };
    }
    where.status = status;
  }

  // Apply search filter - matches title OR slug, case-insensitive
  const search = searchParams.search;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          entityType: true,
          status: true,
          slug: true,
          updatedAt: true,
        },
      }),
      prisma.entity.count({ where }),
    ]);

    return {
      entities,
      total,
      pagination: { page, limit, skip },
      error: null,
    };
  } catch (error) {
    console.error("Error fetching entities:", error);
    return { error: "Failed to fetch entities", entities: [], total: 0, pagination: { page, limit, skip } };
  }
}

function buildPaginationUrl(searchParams: SearchParams, newPage: number) {
  const params = new URLSearchParams();
  
  if (searchParams.entityType) params.set("entityType", searchParams.entityType);
  if (searchParams.status) params.set("status", searchParams.status);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.limit && searchParams.limit !== "20") params.set("limit", searchParams.limit);
  
  params.set("page", newPage.toString());
  
  const query = params.toString();
  return query ? `/dashboard/entities?${query}` : `/dashboard/entities`;
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

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { entities, total, pagination, error } = await getEntities(searchParams);
  
  const hasResults = entities.length > 0;
  const hasPrevious = pagination.page > 1;
  const hasNext = pagination.skip + entities.length < total;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Entity Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and manage content entities across all types and statuses.
        </p>
      </div>

      {/* Filter Form */}
      <EntityFilters
        key={`${searchParams.entityType || "all"}-${searchParams.status || "all"}-${searchParams.search || ""}-${searchParams.limit || "20"}`}
        entityType={searchParams.entityType}
        status={searchParams.status}
        search={searchParams.search}
        limit={searchParams.limit}
      />

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Filters summary */}
      {(searchParams.entityType || searchParams.status || searchParams.search) && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-4 text-sm text-blue-800">
            <span className="font-medium">Active filters:</span>
            {searchParams.entityType && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Type: {searchParams.entityType}
              </span>
            )}
            {searchParams.status && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Status: {searchParams.status}
              </span>
            )}
            {searchParams.search && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Search: &quot;{searchParams.search}&quot;
              </span>
            )}
            <Link 
              href="/dashboard/entities"
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
            "Unable to load entities"
          ) : hasResults ? (
            <>
              Showing {pagination.skip + 1}–{pagination.skip + entities.length} of {total} entities
            </>
          ) : (
            total === 0 ? "No entities found" : "No results match your filters"
          )}
        </p>
      </div>

      {/* Entity list */}
      {hasResults ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entities.map((entity) => (
                <tr key={entity.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <Link
                        href={`/dashboard/entities/${entity.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {entity.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        {entity.slug}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 capitalize">
                      {entity.entityType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={entity.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {entity.updatedAt.toLocaleDateString()}
                    </span>
                    <p className="text-xs text-gray-500">
                      {entity.updatedAt.toLocaleTimeString()}
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
            <p className="text-gray-500">No entities found.</p>
            {(searchParams.entityType || searchParams.status || searchParams.search) && (
              <p className="text-sm text-gray-400 mt-2">
                Try adjusting your filters or{" "}
                <Link href="/dashboard/entities" className="text-blue-600 hover:underline">
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
