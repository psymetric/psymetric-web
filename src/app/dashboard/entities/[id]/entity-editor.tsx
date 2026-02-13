"use client";

/**
 * Entity Editor Component
 * Phase 2A.2 — Client form for editing allowlisted entity fields
 *
 * Handles PATCH calls to /api/entities/[id] for allowlisted fields only.
 * No lifecycle actions, follows existing dashboard patterns.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

interface EntityEditorProps {
  id: string;
  title: string;
  summary: string | null;
  contentRef: string | null;
  canonicalUrl: string | null;
}

export function EntityEditor({
  id,
  title: initialTitle,
  summary: initialSummary,
  contentRef: initialContentRef,
  canonicalUrl: initialCanonicalUrl,
}: EntityEditorProps) {
  const router = useRouter();
  
  // Form state
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary || "");
  const [contentRef, setContentRef] = useState(initialContentRef || "");
  const [canonicalUrl, setCanonicalUrl] = useState(initialCanonicalUrl || "");
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Toast helpers
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

  // Dirty check - has anything changed from initial values?
  const hasChanges = 
    title !== initialTitle ||
    summary !== (initialSummary || "") ||
    contentRef !== (initialContentRef || "") ||
    canonicalUrl !== (initialCanonicalUrl || "");

  // Build patch body with only changed fields
  const buildPatchBody = () => {
    const body: Record<string, string> = {};
    
    if (title !== initialTitle) {
      body.title = title;
    }
    if (summary !== (initialSummary || "")) {
      body.summary = summary;
    }
    if (contentRef !== (initialContentRef || "") && contentRef.trim() !== "") {
      body.contentRef = contentRef;
    }
    if (canonicalUrl !== (initialCanonicalUrl || "") && canonicalUrl.trim() !== "") {
      body.canonicalUrl = canonicalUrl;
    }
    
    return body;
  };

  const handleSave = async () => {
    // Client-side validation for canonicalUrl
    if (canonicalUrl.trim() !== "" && !canonicalUrl.startsWith("/")) {
      addToast("error", "Canonical URL must start with '/' if provided");
      return;
    }

    const patchBody = buildPatchBody();
    
    // Should not happen due to disabled state, but safety check
    if (Object.keys(patchBody).length === 0) {
      addToast("error", "No changes to save");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/entities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to save");
      }

      addToast("success", "Entity updated successfully");
      
      // Refresh the server component to show updated canonical values
      router.refresh();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save entity");
    } finally {
      setSaving(false);
    }
  };

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
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Edit Entity</h2>
          <p className="text-sm text-gray-500">
            Update allowlisted fields. Changes are saved to the entity immediately.
          </p>
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Entity title"
              required
            />
          </div>

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Brief summary of the entity"
            />
          </div>

          {/* Content Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Reference
            </label>
            <input
              type="text"
              value={contentRef}
              onChange={(e) => setContentRef(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Reference to content file or location"
            />
          </div>

          {/* Canonical URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Canonical URL
            </label>
            <input
              type="text"
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="/path/to/canonical/url"
            />
            <p className="mt-1 text-xs text-gray-500">
              Must start with &apos;/&apos; if provided
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges || !title.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {!hasChanges && (
              <p className="mt-2 text-xs text-gray-500">
                No changes detected
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
