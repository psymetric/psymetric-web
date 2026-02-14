"use client";

/**
 * Relationship Creator Component
 * Deterministic relationship creation with strict validation and toast feedback.
 * No automation, no business logic beyond form submission.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RelationType } from "@prisma/client";
import { useToast } from "@/lib/use-toast";
import { ToastContainer } from "@/app/dashboard/toast-container";

interface Entity {
  id: string;
  title: string;
  entityType: string;
}

interface RelationshipCreatorProps {
  currentEntityId: string;
  availableEntities: Entity[];
}

// Valid relation types from schema
const VALID_RELATION_TYPES = Object.values(RelationType);

export function RelationshipCreator({
  currentEntityId,
  availableEntities,
}: RelationshipCreatorProps) {
  const router = useRouter();

  // Form state
  const [toEntityId, setToEntityId] = useState("");
  const [relationType, setRelationType] = useState("");

  // UI state
  const [creating, setCreating] = useState(false);
  const { toasts, addToast, dismissToast } = useToast();

  const handleSubmit = async () => {
    // Client-side validation
    if (!toEntityId) {
      addToast("error", "Please select a target entity");
      return;
    }

    if (!relationType) {
      addToast("error", "Please select a relation type");
      return;
    }

    setCreating(true);

    try {
      const response = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEntityId: currentEntityId,
          toEntityId,
          relationType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to create relationship");
      }

      addToast("success", "Relationship created successfully");

      // Reset form
      setToEntityId("");
      setRelationType("");

      // Refresh server component to show updated relationships
      router.refresh();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to create relationship");
    } finally {
      setCreating(false);
    }
  };

  // Filter out current entity from available targets
  const targetEntities = availableEntities.filter(entity => entity.id !== currentEntityId);

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Create Relationship</h2>
          <p className="text-sm text-gray-500">
            Add a new relationship from this entity to another entity.
          </p>
        </div>

        <div className="space-y-4">
          {/* Target Entity Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={toEntityId}
              onChange={(e) => setToEntityId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={creating}
            >
              <option value="">Select target entity...</option>
              {targetEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.title} ({entity.entityType})
                </option>
              ))}
            </select>
          </div>

          {/* Relation Type Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Relation Type <span className="text-red-500">*</span>
            </label>
            <select
              value={relationType}
              onChange={(e) => setRelationType(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={creating}
            >
              <option value="">Select relation type...</option>
              {VALID_RELATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={creating || !toEntityId || !relationType}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Relationship"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
