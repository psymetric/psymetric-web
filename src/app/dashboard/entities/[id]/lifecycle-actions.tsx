"use client";

/**
 * Lifecycle Actions Component
 * Phase 2A.3A — Client component for entity lifecycle operations
 *
 * Provides buttons for entity lifecycle transitions based on current status.
 * Calls existing API routes and follows strict state transition rules.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

interface LifecycleActionsProps {
  id: string;
  status: string;
}

export function LifecycleActions({ id, status }: LifecycleActionsProps) {
  const router = useRouter();
  
  // UI state
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Toast helpers
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const toastId = Date.now();
    setToasts((prev) => [...prev, { id: toastId, type, message }]);
    if (type === "success") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 3000);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Generic action handler
  const handleAction = useCallback(async (
    loadingKey: string,
    label: string,
    endpoint: string,
    method: "POST" = "POST",
    body?: Record<string, unknown>
  ) => {
    setLoading((prev) => ({ ...prev, [loadingKey]: true }));
    
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `${label} failed`);
      }

      const result = await response.json();
      
      // Handle validation response specifically
      if (loadingKey === "validate") {
        if (result.data.status === "pass") {
          addToast("success", "Entity validation passed");
        } else {
          const errorCount = result.data.errors?.length || 0;
          addToast("error", `Validation failed with ${errorCount} error(s)`);
        }
      } else {
        addToast("success", `${label} completed successfully`);
        router.refresh(); // Refresh server component to show updated status
      }
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  }, [router, addToast]);

  // Specific action handlers
  const handleValidate = useCallback(() => {
    handleAction("validate", "Validation", `/api/entities/${id}/validate`);
  }, [id, handleAction]);

  const handleRequestPublish = useCallback(() => {
    handleAction("requestPublish", "Request publish", `/api/entities/${id}/request-publish`);
  }, [id, handleAction]);

  const handlePublish = useCallback(() => {
    handleAction("publish", "Publish", `/api/entities/${id}/publish`);
  }, [id, handleAction]);

  const handleReject = useCallback(() => {
    handleAction("reject", "Reject", `/api/entities/${id}/reject`);
  }, [id, handleAction]);

  // Determine which buttons to show based on status
  const showValidate = status === "draft";
  const showRequestPublish = status === "draft";
  const showPublish = status === "publish_requested";
  const showReject = status === "publish_requested";

  // If no actions are available for this status, don't render the component
  if (!showValidate && !showRequestPublish && !showPublish && !showReject) {
    return null;
  }

  return (
    <>
      {/* Toast container */}
      {toasts.length > 0 && (
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
                onClick={() => dismissToast(toast.id)}
                className="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-gray-900">Lifecycle Actions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage entity publication workflow based on current status
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {showValidate && (
            <button
              onClick={handleValidate}
              disabled={loading.validate}
              className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.validate ? "Validating..." : "Validate"}
            </button>
          )}
          
          {showRequestPublish && (
            <button
              onClick={handleRequestPublish}
              disabled={loading.requestPublish}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.requestPublish ? "Requesting..." : "Request Publish"}
            </button>
          )}
          
          {showPublish && (
            <button
              onClick={handlePublish}
              disabled={loading.publish}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.publish ? "Publishing..." : "Publish"}
            </button>
          )}
          
          {showReject && (
            <button
              onClick={handleReject}
              disabled={loading.reject}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.reject ? "Rejecting..." : "Reject"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
