"use client";

/**
 * Source Inbox — Client Component
 *
 * Implements all Source Inbox actions per:
 * - docs/operations-planning-api/04-ADMIN-DASHBOARD-UI-CONTRACT.md
 * - docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md
 * - docs/operations-planning/07-ADMIN-DASHBOARD-SCOPE.md
 *
 * Actions:
 * 1. List SourceItems with filters (status, sourceType)
 * 2. Capture Source modal
 * 3. Change Source status
 * 4. Attach Source to Entity
 * 5. Promote Source to Draft entity
 *
 * Error handling per UI contract:
 * - Success: brief confirmation toast
 * - Error: persistent inline error with retry option
 * - 404 → item not found
 * - 409 → state conflict → prompt refresh
 */

import React, { useState, useEffect, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

interface SourceItem {
  id: string;
  sourceType: string;
  platform: string;
  url: string;
  capturedAt: string;
  capturedBy: string;
  contentHash: string;
  operatorIntent: string;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface EntitySummary {
  id: string;
  entityType: string;
  title: string;
  slug: string;
  status: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

// =============================================================================
// Constants — from canonical enums
// =============================================================================

const SOURCE_TYPES = ["rss", "webpage", "comment", "reply", "video", "other"];
const SOURCE_STATUSES = ["ingested", "triaged", "used", "archived"];
const PLATFORMS = ["website", "x", "youtube", "github", "other"];
const CONTENT_ENTITY_TYPES = ["guide", "concept", "project", "news"];
const CONCEPT_KINDS = ["standard", "model", "comparison"];

/**
 * Per docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md
 * Source-referencing relation types by entity type.
 */
const SOURCE_RELATION_TYPES: Record<string, string> = {
  guide: "GUIDE_REFERENCES_SOURCE",
  concept: "CONCEPT_REFERENCES_SOURCE",
  project: "PROJECT_REFERENCES_SOURCE",
  news: "NEWS_REFERENCES_SOURCE",
};

// =============================================================================
// Main Component
// =============================================================================

export function SourceInbox() {
  // --- State ---
  const [items, setItems] = useState<SourceItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [filterStatus, setFilterStatus] = useState<string>("ingested");
  const [filterSourceType, setFilterSourceType] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Modal states
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState<SourceItem | null>(null);
  const [showPromoteModal, setShowPromoteModal] = useState<SourceItem | null>(null);

  // --- Toast helpers ---
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    if (type === "success") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Fetch source items ---
  const fetchItems = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterStatus) params.set("status", filterStatus);
        if (filterSourceType) params.set("sourceType", filterSourceType);
        params.set("page", String(page));
        params.set("limit", "20");

        const res = await fetch(`/api/source-items?${params}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || "Failed to fetch");
        }
        const json = await res.json();
        setItems(json.data);
        setPagination(json.pagination);
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : "Failed to fetch source items");
      } finally {
        setLoading(false);
      }
    },
    [filterStatus, filterSourceType, addToast]
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // --- Change status ---
  const changeStatus = async (item: SourceItem, newStatus: string) => {
    try {
      const res = await fetch(`/api/source-items/${item.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 404) {
          addToast("error", "Source item not found — it may have been removed.");
        } else if (res.status === 409) {
          addToast("error", "State conflict — please refresh.");
        } else {
          throw new Error(err.error?.message || "Failed to update status");
        }
        return;
      }
      addToast("success", `Status changed to ${newStatus}`);
      fetchItems(pagination.page);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to update status");
    }
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="space-y-4">
      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Filters + Actions bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg p-4">
        {/* Status filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="">All</option>
            {SOURCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Source type filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Type:</label>
          <select
            value={filterSourceType}
            onChange={(e) => setFilterSourceType(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="">All</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Capture button */}
        <button
          onClick={() => setShowCaptureModal(true)}
          className="text-sm font-medium bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700"
        >
          + Capture Source
        </button>
      </div>

      {/* Source items list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No source items found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Type
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  URL
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Platform
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Status
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Captured
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    item.status === "archived" ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {item.sourceType}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {item.url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.platform}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(item.capturedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Triage actions */}
                      {item.status === "ingested" && (
                        <>
                          <button
                            onClick={() => changeStatus(item, "triaged")}
                            className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded hover:bg-green-100"
                          >
                            Keep
                          </button>
                          <button
                            onClick={() => changeStatus(item, "archived")}
                            className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100"
                          >
                            Ignore
                          </button>
                        </>
                      )}
                      {/* Promote + Attach available for ingested/triaged */}
                      {(item.status === "ingested" ||
                        item.status === "triaged") && (
                        <>
                          <button
                            onClick={() => setShowPromoteModal(item)}
                            className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100"
                          >
                            Promote
                          </button>
                          <button
                            onClick={() => setShowAttachModal(item)}
                            className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded hover:bg-purple-100"
                          >
                            Attach
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-600">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total
              )}{" "}
              of {pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchItems(pagination.page - 1)}
                className="text-sm px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={!pagination.hasMore}
                onClick={() => fetchItems(pagination.page + 1)}
                className="text-sm px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCaptureModal && (
        <CaptureModal
          onClose={() => setShowCaptureModal(false)}
          onSuccess={() => {
            setShowCaptureModal(false);
            addToast("success", "Source captured");
            fetchItems();
          }}
          onError={(msg) => addToast("error", msg)}
        />
      )}

      {showAttachModal && (
        <AttachModal
          sourceItem={showAttachModal}
          onClose={() => setShowAttachModal(null)}
          onSuccess={() => {
            setShowAttachModal(null);
            addToast("success", "Source attached to entity");
            fetchItems(pagination.page);
          }}
          onError={(msg) => addToast("error", msg)}
        />
      )}

      {showPromoteModal && (
        <PromoteModal
          sourceItem={showPromoteModal}
          onClose={() => setShowPromoteModal(null)}
          onSuccess={() => {
            setShowPromoteModal(null);
            addToast("success", "Source promoted to draft entity");
            fetchItems(pagination.page);
          }}
          onError={(msg) => addToast("error", msg)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ingested: "bg-yellow-50 text-yellow-700 border-yellow-200",
    triaged: "bg-blue-50 text-blue-700 border-blue-200",
    used: "bg-green-50 text-green-700 border-green-200",
    archived: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        colors[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Capture Source Modal
// =============================================================================

function CaptureModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [sourceType, setSourceType] = useState("webpage");
  const [url, setUrl] = useState("");
  const [operatorIntent, setOperatorIntent] = useState("");
  const [platform, setPlatform] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/source-items/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          url,
          operatorIntent,
          ...(platform ? { platform } : {}),
          ...(notes ? { notes } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Capture failed");
      }
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Capture Source</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Type <span className="text-red-500">*</span>
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            required
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="https://..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Why are you capturing this? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={operatorIntent}
            onChange={(e) => setOperatorIntent(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="e.g., Good reference for a future guide on tool calling"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Platform <span className="text-gray-400">(optional)</span>
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="">Auto-detect / Other</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            rows={2}
            placeholder="Additional context..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Capturing…" : "Capture"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// =============================================================================
// Attach Source to Entity Modal
// =============================================================================

function AttachModal({
  sourceItem,
  onClose,
  onSuccess,
  onError,
}: {
  sourceItem: SourceItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const searchEntities = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: searchQuery, limit: "10" });
      const res = await fetch(`/api/entities?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      setEntities(json.data);
    } catch {
      onError("Failed to search entities");
    } finally {
      setSearching(false);
    }
  };

  const attachToEntity = async (entity: EntitySummary) => {
    const relationType = SOURCE_RELATION_TYPES[entity.entityType];
    if (!relationType) {
      onError(
        `Cannot attach source to ${entity.entityType} — no canonical relation type defined for this pair.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEntityType: entity.entityType,
          fromEntityId: entity.id,
          toEntityType: "sourceItem",
          toEntityId: sourceItem.id,
          relationType,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          onError("This relationship already exists");
        } else if (res.status === 404) {
          onError("Entity or source item not found");
        } else {
          throw new Error(err.error?.message || "Failed to attach");
        }
        return;
      }

      await fetch(`/api/source-items/${sourceItem.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "used" }),
      });

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to attach");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Attach Source to Entity
        </h2>
        <p className="text-sm text-gray-600 truncate">
          Source: {sourceItem.url}
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchEntities()}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Search entities by title or slug..."
          />
          <button
            onClick={searchEntities}
            disabled={searching}
            className="text-sm px-4 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
          >
            {searching ? "…" : "Search"}
          </button>
        </div>

        {entities.length > 0 && (
          <div className="border border-gray-200 rounded max-h-60 overflow-y-auto">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 hover:bg-gray-50"
              >
                <div>
                  <span className="text-sm font-medium">{entity.title}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {entity.entityType} · {entity.status}
                  </span>
                </div>
                <button
                  onClick={() => attachToEntity(entity)}
                  disabled={submitting}
                  className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded hover:bg-purple-100 disabled:opacity-50"
                >
                  Attach
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// =============================================================================
// Promote Source to Draft Modal
// =============================================================================

function PromoteModal({
  sourceItem,
  onClose,
  onSuccess,
  onError,
}: {
  sourceItem: SourceItem;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [entityType, setEntityType] = useState("guide");
  const [title, setTitle] = useState("");
  const [conceptKind, setConceptKind] = useState("standard");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const entityRes = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          title,
          ...(entityType === "concept" ? { conceptKind } : {}),
        }),
      });
      if (!entityRes.ok) {
        const err = await entityRes.json();
        throw new Error(err.error?.message || "Failed to create entity");
      }
      const entityData = await entityRes.json();
      const newEntityId = entityData.data.id;

      const relationType = SOURCE_RELATION_TYPES[entityType];
      if (relationType) {
        const relRes = await fetch("/api/relationships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromEntityType: entityType,
            fromEntityId: newEntityId,
            toEntityType: "sourceItem",
            toEntityId: sourceItem.id,
            relationType,
          }),
        });
        if (!relRes.ok) {
          const err = await relRes.json();
          onError(
            `Entity created but relationship failed: ${err.error?.message || "Unknown error"}. ` +
            `You can attach the source manually.`
          );
          return;
        }
      }

      await fetch(`/api/source-items/${sourceItem.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "used" }),
      });

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Promote to Draft Entity
        </h2>
        <p className="text-sm text-gray-600 truncate">
          Source: {sourceItem.url}
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Entity Type <span className="text-red-500">*</span>
          </label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {CONTENT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {entityType === "concept" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Concept Kind
            </label>
            <select
              value={conceptKind}
              onChange={(e) => setConceptKind(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {CONCEPT_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Title for the new draft..."
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Draft"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// =============================================================================
// Shared Modal Overlay
// =============================================================================

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
