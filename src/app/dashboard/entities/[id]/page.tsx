/**
 * Entity Detail Page
 * Phase 2A.1 — Read-only entity detail view
 * Phase 2A.2 — Enhanced with entity editor form
 * Phase 2A.3A — Added lifecycle action panel
 * Phase 2A.3B — Added EventLog timeline panel
 * Phase 2B.1 — Added read-only relationships panel
 *
 * Displays entity metadata in dashboard with editing capabilities, lifecycle actions,
 * event timeline, and relationship visualization.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EntityType } from "@prisma/client";
import { EntityEditor } from "./entity-editor";
import { LifecycleActions } from "./lifecycle-actions";

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
      summary: true,
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

async function getEntityEvents(entity: { id: string; entityType: string }) {
  const events = await prisma.eventLog.findMany({
    where: {
      entityType: entity.entityType as EntityType,
      entityId: entity.id,
    },
    orderBy: [
      { timestamp: "desc" },
      { id: "desc" },
    ],
    take: 50,
  });

  return events;
}

async function getEntityRelationships(entityId: string) {
  // Get all relationships where this entity is either from or to
  const relations = await prisma.entityRelation.findMany({
    where: {
      OR: [{ fromEntityId: entityId }, { toEntityId: entityId }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  if (relations.length === 0) {
    return [];
  }

  // Collect all content entity IDs that we need to look up
  const contentEntityTypes = ["guide", "concept", "project", "news"];
  const contentIds = new Set<string>();

  relations.forEach((relation) => {
    // For outgoing relationships, check the "to" side
    if (relation.fromEntityId === entityId && contentEntityTypes.includes(relation.toEntityType)) {
      contentIds.add(relation.toEntityId);
    }
    // For incoming relationships, check the "from" side
    if (relation.toEntityId === entityId && contentEntityTypes.includes(relation.fromEntityType)) {
      contentIds.add(relation.fromEntityId);
    }
  });

  // Batch fetch content entities for friendly labels
  const contentEntities = contentIds.size > 0 ? await prisma.entity.findMany({
    where: { id: { in: Array.from(contentIds) } },
    select: { id: true, title: true, entityType: true, slug: true },
  }) : [];

  // Build lookup map
  const entityLookup = new Map(
    contentEntities.map((entity) => [entity.id, entity])
  );

  // Process relations with direction and labels
  return relations.map((relation) => {
    const isOutgoing = relation.fromEntityId === entityId;
    const otherEntityType = isOutgoing ? relation.toEntityType : relation.fromEntityType;
    const otherEntityId = isOutgoing ? relation.toEntityId : relation.fromEntityId;

    let otherEntityLabel = `${otherEntityType} — ${otherEntityId}`;
    let otherEntityLink: string | null = null;

    // If it's a content entity, use the friendly label and link
    const contentEntity = entityLookup.get(otherEntityId);
    if (contentEntity) {
      otherEntityLabel = `${contentEntity.title} (${contentEntity.entityType})`;
      otherEntityLink = `/dashboard/entities/${contentEntity.id}`;
    }

    return {
      ...relation,
      direction: isOutgoing ? "Outgoing" : "Incoming",
      otherEntityType,
      otherEntityId,
      otherEntityLabel,
      otherEntityLink,
    };
  });
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

  const [events, relationships] = await Promise.all([
    getEntityEvents(entity),
    getEntityRelationships(entity.id),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Entity Details</h1>
        <p className="mt-1 text-sm text-gray-500">
          Entity metadata and editable fields.
        </p>
      </div>

      <div className="space-y-8">
        {/* Entity Editor */}
        <EntityEditor
          id={entity.id}
          title={entity.title}
          summary={entity.summary}
          contentRef={entity.contentRef}
          canonicalUrl={entity.canonicalUrl}
        />

        {/* Lifecycle Actions */}
        <LifecycleActions
          id={entity.id}
          status={entity.status}
        />

        {/* Read-only Information Sections */}
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

        {/* Relationships */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-gray-900">Relationships</h2>
            <p className="mt-1 text-sm text-gray-500">
              Inbound and outbound relationships for this entity (showing up to 50 relationships)
            </p>
          </div>
          
          {relationships.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No relationships recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-600">Direction</th>
                    <th className="text-left py-2 font-medium text-gray-600">Relation Type</th>
                    <th className="text-left py-2 font-medium text-gray-600">Related Entity</th>
                    <th className="text-left py-2 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {relationships.map((relationship) => (
                    <tr key={relationship.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          relationship.direction === "Outgoing"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}>
                          {relationship.direction}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {relationship.relationType}
                        </span>
                      </td>
                      <td className="py-3">
                        {relationship.otherEntityLink ? (
                          <Link 
                            href={relationship.otherEntityLink}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {relationship.otherEntityLabel}
                          </Link>
                        ) : (
                          <span className="text-gray-900">{relationship.otherEntityLabel}</span>
                        )}
                      </td>
                      <td className="py-3 text-gray-500">
                        {relationship.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Event Timeline */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-gray-900">Event Timeline</h2>
            <p className="mt-1 text-sm text-gray-500">
              Recent events for this entity (showing up to 50 events)
            </p>
          </div>
          
          {events.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No events recorded.</p>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div key={event.id} className="border-l-4 border-blue-200 pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {event.eventType}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {event.actor}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {event.timestamp.toLocaleDateString()} at {event.timestamp.toLocaleTimeString()}
                      </p>
                      {event.details && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700 mb-1">Details:</p>
                          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
