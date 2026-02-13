"use client";

/**
 * Entity Filters Component
 * Phase 2A — Client component for filtering entities via URL query params
 *
 * Updates URL query parameters and lets the server component re-render results.
 * No API calls, no client-side fetching, just URL manipulation.
 */
import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { VALID_CONTENT_ENTITY_TYPES, VALID_ENTITY_STATUSES } from "@/lib/validation";

interface EntityFiltersProps {
  entityType?: string;
  status?: string;
  search?: string;
  limit?: string;
}

export function EntityFilters({
  entityType,
  status,
  search,
  limit,
}: EntityFiltersProps) {
  const router = useRouter();

  // Form state initialized from props
  const [formEntityType, setFormEntityType] = useState(entityType || "");
  const [formStatus, setFormStatus] = useState(status || "");
  const [formSearch, setFormSearch] = useState(search || "");
  const [formLimit, setFormLimit] = useState(limit || "20");

  const handleApply = () => {
    const params = new URLSearchParams();
    
    // Only set non-empty values
    if (formEntityType) params.set("entityType", formEntityType);
    if (formStatus) params.set("status", formStatus);
    if (formSearch.trim()) params.set("search", formSearch.trim());
    if (formLimit !== "20") params.set("limit", formLimit);
    
    // Always reset to page 1 when filters change
    params.set("page", "1");
    
    const query = params.toString();
    const url = query ? `/dashboard/entities?${query}` : "/dashboard/entities";
    router.push(url);
  };

  const handleClear = () => {
    // Reset form state
    setFormEntityType("");
    setFormStatus("");
    setFormSearch("");
    setFormLimit("20");
    
    // Navigate to clean URL
    router.push("/dashboard/entities");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Entity Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entity Type
          </label>
          <select
            value={formEntityType}
            onChange={(e) => setFormEntityType(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All</option>
            {VALID_CONTENT_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All</option>
            {VALID_ENTITY_STATUSES.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search
          </label>
          <input
            type="text"
            value={formSearch}
            onChange={(e) => setFormSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Title or slug..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Per Page
          </label>
          <select
            value={formLimit}
            onChange={(e) => setFormLimit(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={handleApply}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          Apply Filters
        </button>
        <button
          onClick={handleClear}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-200 border border-gray-300"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
