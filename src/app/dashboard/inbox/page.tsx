/**
 * Source Inbox Page
 * Per docs/operations-planning-api/04-ADMIN-DASHBOARD-UI-CONTRACT.md:
 *
 * Goal: process captured material into usable drafts.
 *
 * Views:
 * - List SourceItems filtered by status (default: ingested) and sourceType
 *
 * Required Actions:
 * 1. Capture Source (POST /api/source-items/capture)
 * 2. Change Source Status (PUT /api/source-items/{id}/status)
 * 3. Attach Source to Entity (POST /api/relationships)
 * 4. Promote Source to Draft (POST /api/entities + POST /api/relationships)
 *
 * Per UI contract: "Archived items must appear visually muted."
 */
import { SourceInbox } from "./source-inbox";

export default function InboxPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Source Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          Capture, triage, and promote external material into content drafts.
        </p>
      </div>
      <SourceInbox />
    </div>
  );
}
