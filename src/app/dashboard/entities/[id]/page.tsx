/**
 * Entity Detail Page
 * Phase 2A.1 — Read-only entity detail view
 *
 * Displays entity metadata in dashboard without editing capabilities.
 * No lifecycle actions, no joins, no relationships yet.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getEntity(id: string) {
  const entity = await prisma.entity.findUnique({
    where: { id },
    select: {
      id: true,
      entityType: true,
      title: true,
      slug: true,
      status: true,
      canonicalUrl: true,
      contentRef: true,
      publishedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return entity;
}

export default async function EntityDetailPage(
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Validate UUID format
  if (!UUID_RE.test(id)) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Entity Details</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Invalid entity ID format. Must be a valid UUID.</p>
        </div>
      </div>
    );
  }

  const entity = await getEntity(id);

  if (!entity) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Entity Details</h1>
        <p className="mt-1 text-sm text-gray-500">
          Read-only view of entity metadata and status.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">ID</label>
                <p className="mt-1 text-sm text-gray-900 font-mono">{entity.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Entity Type</label>
                <p className="mt-1 text-sm text-gray-900">{entity.entityType}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 text-sm text-gray-900">{entity.title}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Slug</label>
                <p className="mt-1 text-sm text-gray-900 font-mono">{entity.slug}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    entity.status === "published" 
                      ? "bg-green-100 text-green-800"
                      : entity.status === "draft"
                      ? "bg-gray-100 text-gray-800"
                      : entity.status === "publish_requested"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {entity.status}
                  </span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Canonical URL</label>
                <p className="mt-1 text-sm text-gray-900">
                  {entity.canonicalUrl || <span className="text-gray-400 italic">Not set</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Content Information */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Content</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Content Reference</label>
              <p className="mt-1 text-sm text-gray-900">
                {entity.contentRef || <span className="text-gray-400 italic">No content reference</span>}
              </p>
            </div>
          </div>

          {/* Timestamps */}
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Timestamps</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Created At</label>
                <p className="mt-1 text-sm text-gray-900">
                  {entity.createdAt.toLocaleDateString()} at {entity.createdAt.toLocaleTimeString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Updated At</label>
                <p className="mt-1 text-sm text-gray-900">
                  {entity.updatedAt.toLocaleDateString()} at {entity.updatedAt.toLocaleTimeString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Published At</label>
                <p className="mt-1 text-sm text-gray-900">
                  {entity.publishedAt 
                    ? `${entity.publishedAt.toLocaleDateString()} at ${entity.publishedAt.toLocaleTimeString()}`
                    : <span className="text-gray-400 italic">Not published</span>
                  }
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Archived At</label>
                <p className="mt-1 text-sm text-gray-900">
                  {entity.archivedAt 
                    ? `${entity.archivedAt.toLocaleDateString()} at ${entity.archivedAt.toLocaleTimeString()}`
                    : <span className="text-gray-400 italic">Not archived</span>
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
