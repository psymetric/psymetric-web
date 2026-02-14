"use client";

/**
 * Relationships Panel Component
 * Displays relationships table with remove functionality.
 * Moved from server component to support client-side removal actions.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/lib/use-toast";
import { ToastContainer } from "@/app/dashboard/toast-container";

interface RelationshipRow {
  id: string;
  direction: "Outgoing" | "Incoming";
  relationType: string;
  otherEntityLabel: string;
  otherEntityLink: string | null;
  createdAt: string; // ISO string
  fromEntityId: string;
  toEntityId: string;
}

interface RelationshipsPanelProps {
  relationships: RelationshipRow[];
}

export function RelationshipsPanel({ relationships }: RelationshipsPanelProps) {
  const router = useRouter();

  // UI state
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toasts, addToast, dismissToast } = useToast();

  const handleRemove = useCallback(async (relationship: RelationshipRow) => {
    const confirmed = confirm("Remove this relationship?");
    if (!confirmed) return;

    setRemovingId(relationship.id);

    try {
      const response = await fetch("/api/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEntityId: relationship.fromEntityId,
          toEntityId: relationship.toEntityId,
          relationType: relationship.relationType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to remove relationship");
      }

      addToast("success", "Relationship removed successfully");

      // Refresh server component to show updated relationships
      router.refresh();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to remove relationship");
    } finally {
      setRemovingId(null);
    }
  }, [router, addToast]);

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
                  <th className="text-left py-2 font-medium text-gray-600">Actions</th>
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
                      {new Date(relationship.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleRemove(relationship)}
                        disabled={removingId !== null}
                        className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {removingId === relationship.id ? "Removing..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
