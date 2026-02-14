-- Migration: Add Project model and projectId to all domain tables
-- Multi-project scoping for Voltron.
--
-- Strategy:
-- 1. Create Project table
-- 2. Insert default project with deterministic UUID
-- 3. Add projectId columns with default pointing to default project
-- 4. Backfill existing rows (safe even if tables are empty)
-- 5. Drop defaults (projectId must be explicit going forward)
-- 6. Add foreign key constraints and project-scoped indexes

-- =============================================================================
-- Step 1: Create Project table
-- =============================================================================

CREATE TABLE "public"."Project" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_slug_key" ON "public"."Project"("slug");

-- =============================================================================
-- Step 2: Insert default project (deterministic UUID for reproducibility)
-- =============================================================================

INSERT INTO "public"."Project" ("id", "name", "slug", "description", "createdAt", "updatedAt")
VALUES (
    '00000000-0000-4000-a000-000000000001',
    'PsyMetric',
    'psymetric',
    'Default project — AI/LLM learning content',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================================
-- Step 3: Add projectId columns with temporary default, then drop defaults
-- =============================================================================

-- Entity
ALTER TABLE "public"."Entity" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."Entity" ALTER COLUMN "projectId" DROP DEFAULT;

-- SourceItem
ALTER TABLE "public"."SourceItem" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."SourceItem" ALTER COLUMN "projectId" DROP DEFAULT;

-- SourceFeed
ALTER TABLE "public"."SourceFeed" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."SourceFeed" ALTER COLUMN "projectId" DROP DEFAULT;

-- EntityRelation
ALTER TABLE "public"."EntityRelation" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."EntityRelation" ALTER COLUMN "projectId" DROP DEFAULT;

-- EventLog
ALTER TABLE "public"."EventLog" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."EventLog" ALTER COLUMN "projectId" DROP DEFAULT;

-- Video
ALTER TABLE "public"."Video" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."Video" ALTER COLUMN "projectId" DROP DEFAULT;

-- DraftArtifact
ALTER TABLE "DraftArtifact" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "DraftArtifact" ALTER COLUMN "projectId" DROP DEFAULT;

-- DistributionEvent
ALTER TABLE "public"."DistributionEvent" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."DistributionEvent" ALTER COLUMN "projectId" DROP DEFAULT;

-- MetricSnapshot
ALTER TABLE "public"."MetricSnapshot" ADD COLUMN "projectId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "public"."MetricSnapshot" ALTER COLUMN "projectId" DROP DEFAULT;

-- =============================================================================
-- Step 4: Add foreign key constraints
-- =============================================================================

ALTER TABLE "public"."Entity" ADD CONSTRAINT "Entity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."SourceItem" ADD CONSTRAINT "SourceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."SourceFeed" ADD CONSTRAINT "SourceFeed_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."EntityRelation" ADD CONSTRAINT "EntityRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."EventLog" ADD CONSTRAINT "EventLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Video" ADD CONSTRAINT "Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DraftArtifact" ADD CONSTRAINT "DraftArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DistributionEvent" ADD CONSTRAINT "DistributionEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Step 5: Drop old indexes and create project-scoped composite indexes
-- =============================================================================

-- Entity: replace old unique + index with project-scoped
DROP INDEX IF EXISTS "public"."Entity_entityType_slug_key";
CREATE UNIQUE INDEX "Entity_projectId_entityType_slug_key" ON "public"."Entity"("projectId", "entityType", "slug");

DROP INDEX IF EXISTS "public"."Entity_entityType_status_idx";
CREATE INDEX "Entity_projectId_entityType_status_createdAt_idx" ON "public"."Entity"("projectId", "entityType", "status", "createdAt");

-- SourceItem: replace (status, capturedAt) with project-scoped
DROP INDEX IF EXISTS "public"."SourceItem_status_capturedAt_idx";
CREATE INDEX "SourceItem_projectId_status_capturedAt_idx" ON "public"."SourceItem"("projectId", "status", "capturedAt");

-- SourceFeed: add project index
CREATE INDEX "SourceFeed_projectId_idx" ON "public"."SourceFeed"("projectId");

-- EntityRelation: replace old unique + indexes with project-scoped
DROP INDEX IF EXISTS "public"."EntityRelation_fromEntityType_fromEntityId_relationType_toE_key";
CREATE UNIQUE INDEX "EntityRelation_projectId_fromEntityType_fromEntityId_relatio_key" ON "public"."EntityRelation"("projectId", "fromEntityType", "fromEntityId", "relationType", "toEntityType", "toEntityId");

DROP INDEX IF EXISTS "public"."EntityRelation_fromEntityType_fromEntityId_idx";
DROP INDEX IF EXISTS "public"."EntityRelation_toEntityType_toEntityId_idx";
CREATE INDEX "EntityRelation_projectId_fromEntityId_idx" ON "public"."EntityRelation"("projectId", "fromEntityId");
CREATE INDEX "EntityRelation_projectId_toEntityId_idx" ON "public"."EntityRelation"("projectId", "toEntityId");

-- EventLog: add project-scoped index (keep existing entity-scoped index for admin queries)
CREATE INDEX "EventLog_projectId_timestamp_id_idx" ON "public"."EventLog"("projectId", "timestamp", "id");

-- Video: replace (primaryEntityType, primaryEntityId) with project-scoped
DROP INDEX IF EXISTS "public"."Video_primaryEntityType_primaryEntityId_idx";
CREATE INDEX "Video_projectId_primaryEntityType_primaryEntityId_idx" ON "public"."Video"("projectId", "primaryEntityType", "primaryEntityId");

-- DraftArtifact: replace (kind, status) with project-scoped
DROP INDEX IF EXISTS "DraftArtifact_kind_status_idx";
CREATE INDEX "DraftArtifact_projectId_kind_status_idx" ON "DraftArtifact"("projectId", "kind", "status");

-- DistributionEvent: replace (primaryEntityType, primaryEntityId) with project-scoped
DROP INDEX IF EXISTS "public"."DistributionEvent_primaryEntityType_primaryEntityId_idx";
CREATE INDEX "DistributionEvent_projectId_primaryEntityType_primaryEntityId_idx" ON "public"."DistributionEvent"("projectId", "primaryEntityType", "primaryEntityId");

-- MetricSnapshot: replace old indexes with project-scoped
DROP INDEX IF EXISTS "public"."MetricSnapshot_metricType_capturedAt_idx";
DROP INDEX IF EXISTS "public"."MetricSnapshot_entityType_entityId_capturedAt_idx";
CREATE INDEX "MetricSnapshot_projectId_metricType_capturedAt_idx" ON "public"."MetricSnapshot"("projectId", "metricType", "capturedAt");
CREATE INDEX "MetricSnapshot_projectId_entityType_entityId_capturedAt_idx" ON "public"."MetricSnapshot"("projectId", "entityType", "entityId", "capturedAt");
