/**
 * Dashboard Layout
 * Per docs/operations-planning/07-ADMIN-DASHBOARD-SCOPE.md:
 * - The dashboard is an operator tool. It is not public.
 * - Dashboard access requires an authenticated operator session.
 *
 * TODO: Authentication gate — v1 assumes single operator.
 * For now, the layout renders without auth check.
 * Auth must be added before production deployment.
 */
import React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-8">
              <span className="text-lg font-semibold text-gray-900">
                PsyMetric
              </span>
              <div className="flex gap-4">
                <a
                  href="/dashboard/inbox"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 px-2 py-1 rounded"
                >
                  Source Inbox
                </a>
                {/* Future Sprint screens */}
                <span className="text-sm text-gray-400 px-2 py-1">
                  Entity Library
                </span>
                <span className="text-sm text-gray-400 px-2 py-1">
                  Publish Queue
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
