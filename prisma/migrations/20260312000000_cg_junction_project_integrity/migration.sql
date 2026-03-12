-- Batch 2: CG junction table project integrity
--
-- 1. Add DB-level project FK to CgPageTopic and CgPageEntity.
-- 2. Add cross-project consistency triggers for both tables:
--    CgPageTopic.projectId must match both CgPage.projectId and CgTopic.projectId.
--    CgPageEntity.projectId must match both CgPage.projectId and CgEntity.projectId.
-- 3. Update psymetric_resolve_entity_project_id to cover the implemented
--    Content Graph EntityType surface (cgSurface, cgSite, cgPage,
--    cgContentArchetype, cgTopic, cgEntity, cgInternalLink, cgSchemaUsage,
--    cgPageTopic, cgPageEntity).

-- ---------------------------------------------------------------------------
-- Task 1 & 2a: CgPageTopic — project FK
-- ---------------------------------------------------------------------------

ALTER TABLE "CgPageTopic"
  ADD CONSTRAINT "CgPageTopic_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Task 2a: CgPageTopic — cross-project consistency trigger
--
-- Enforces: CgPageTopic.projectId must equal CgPage.projectId
--           CgPageTopic.projectId must equal CgTopic.projectId
-- Rationale: pageId and topicId FKs cascade on delete but carry no project
-- assertion; app-layer checks alone are insufficient for DB-level isolation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION psymetric_enforce_cg_page_topic_project_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_page_project  uuid;
  v_topic_project uuid;
BEGIN
  SELECT "projectId" INTO v_page_project  FROM "CgPage"  WHERE "id" = NEW."pageId";
  SELECT "projectId" INTO v_topic_project FROM "CgTopic" WHERE "id" = NEW."topicId";

  IF v_page_project IS NULL THEN
    RAISE EXCEPTION 'CgPageTopic: pageId % not found', NEW."pageId"
      USING ERRCODE = '23503';
  END IF;

  IF v_topic_project IS NULL THEN
    RAISE EXCEPTION 'CgPageTopic: topicId % not found', NEW."topicId"
      USING ERRCODE = '23503';
  END IF;

  IF v_page_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'CgPageTopic project mismatch: row.projectId=% but page.projectId=%',
      NEW."projectId", v_page_project
      USING ERRCODE = '23514';
  END IF;

  IF v_topic_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'CgPageTopic project mismatch: row.projectId=% but topic.projectId=%',
      NEW."projectId", v_topic_project
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_psymetric_cg_page_topic_project_integrity
BEFORE INSERT OR UPDATE ON "CgPageTopic"
FOR EACH ROW
EXECUTE FUNCTION psymetric_enforce_cg_page_topic_project_integrity();

-- ---------------------------------------------------------------------------
-- Task 1 & 2b: CgPageEntity — project FK
-- ---------------------------------------------------------------------------

ALTER TABLE "CgPageEntity"
  ADD CONSTRAINT "CgPageEntity_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Task 2b: CgPageEntity — cross-project consistency trigger
--
-- Enforces: CgPageEntity.projectId must equal CgPage.projectId
--           CgPageEntity.projectId must equal CgEntity.projectId
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION psymetric_enforce_cg_page_entity_project_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_page_project   uuid;
  v_entity_project uuid;
BEGIN
  SELECT "projectId" INTO v_page_project   FROM "CgPage"   WHERE "id" = NEW."pageId";
  SELECT "projectId" INTO v_entity_project FROM "CgEntity" WHERE "id" = NEW."entityId";

  IF v_page_project IS NULL THEN
    RAISE EXCEPTION 'CgPageEntity: pageId % not found', NEW."pageId"
      USING ERRCODE = '23503';
  END IF;

  IF v_entity_project IS NULL THEN
    RAISE EXCEPTION 'CgPageEntity: entityId % not found', NEW."entityId"
      USING ERRCODE = '23503';
  END IF;

  IF v_page_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'CgPageEntity project mismatch: row.projectId=% but page.projectId=%',
      NEW."projectId", v_page_project
      USING ERRCODE = '23514';
  END IF;

  IF v_entity_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'CgPageEntity project mismatch: row.projectId=% but entity.projectId=%',
      NEW."projectId", v_entity_project
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_psymetric_cg_page_entity_project_integrity
BEFORE INSERT OR UPDATE ON "CgPageEntity"
FOR EACH ROW
EXECUTE FUNCTION psymetric_enforce_cg_page_entity_project_integrity();

-- ---------------------------------------------------------------------------
-- Task 3: Update psymetric_resolve_entity_project_id
--
-- Adds resolution for the implemented Content Graph EntityType values:
--   cgSurface, cgSite, cgPage, cgContentArchetype, cgTopic, cgEntity,
--   cgInternalLink, cgSchemaUsage, cgPageTopic, cgPageEntity
--
-- Types not yet implemented (e.g. vedaProject) continue to fail closed via
-- the ELSE RAISE branch, preserving the safety posture.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION psymetric_resolve_entity_project_id(
  p_entity_type "EntityType",
  p_entity_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := NULL;

  -- Original entity types
  IF p_entity_type IN ('guide','concept','project','news') THEN
    SELECT "projectId" INTO v_project_id
    FROM "Entity"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'sourceItem' THEN
    SELECT "projectId" INTO v_project_id
    FROM "SourceItem"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'sourceFeed' THEN
    SELECT "projectId" INTO v_project_id
    FROM "SourceFeed"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'distributionEvent' THEN
    SELECT "projectId" INTO v_project_id
    FROM "DistributionEvent"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'video' THEN
    SELECT "projectId" INTO v_project_id
    FROM "Video"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'metricSnapshot' THEN
    SELECT "projectId" INTO v_project_id
    FROM "MetricSnapshot"
    WHERE "id" = p_entity_id;

  -- Content Graph Phase 1 entity types
  ELSIF p_entity_type = 'cgSurface' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgSurface"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgSite' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgSite"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgPage' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgPage"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgContentArchetype' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgContentArchetype"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgTopic' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgTopic"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgEntity' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgEntity"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgInternalLink' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgInternalLink"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgSchemaUsage' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgSchemaUsage"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgPageTopic' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgPageTopic"
    WHERE "id" = p_entity_id;

  ELSIF p_entity_type = 'cgPageEntity' THEN
    SELECT "projectId" INTO v_project_id
    FROM "CgPageEntity"
    WHERE "id" = p_entity_id;

  ELSE
    -- Unknown / not-yet-implemented entity type: fail closed
    RAISE EXCEPTION 'Unsupported entityType for project resolution: %', p_entity_type
      USING ERRCODE = '23514';
  END IF;

  RETURN v_project_id;
END;
$$;
