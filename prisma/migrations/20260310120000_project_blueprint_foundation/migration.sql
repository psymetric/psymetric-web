-- Project Bootstrap / Blueprint Foundation
--
-- Approved schema additions (6 total):
--   Project.lifecycleState          — nullable String, default 'created'
--   EntityType.vedaProject          — EventLog discriminator for Project table
--   EventType.PROJECT_CREATED       — project creation audit
--   EventType.BLUEPRINT_PROPOSED    — blueprint proposal audit
--   EventType.BLUEPRINT_APPLIED     — blueprint apply audit
--   DraftArtifactKind.project_blueprint — blueprint storage in DraftArtifact
--
-- All additive. No existing data altered.

-- 1. Project.lifecycleState
ALTER TABLE "Project" ADD COLUMN "lifecycleState" TEXT DEFAULT 'created';
UPDATE "Project" SET "lifecycleState" = 'created' WHERE "lifecycleState" IS NULL;

-- 2. EntityType.vedaProject
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'vedaProject';

-- 3. EventType additions
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'PROJECT_CREATED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'BLUEPRINT_PROPOSED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'BLUEPRINT_APPLIED';

-- 4. DraftArtifactKind.project_blueprint
ALTER TYPE "DraftArtifactKind" ADD VALUE IF NOT EXISTS 'project_blueprint';
