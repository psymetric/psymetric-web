-- Enforce project integrity for polymorphic EntityRelation graph
--
-- Prevent cross-project relationships by asserting that any entity IDs referenced
-- by EntityRelation belong to the same projectId as the relation row.
--
-- Implemented as a trigger because EntityRelation uses polymorphic IDs
-- (Entity, SourceItem, SourceFeed, DistributionEvent, Video, MetricSnapshot).

-- Helper: resolve owning projectId for any (EntityType, id)
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

  ELSE
    -- Unknown / unsupported entity type
    RAISE EXCEPTION 'Unsupported entityType for project resolution: %', p_entity_type
      USING ERRCODE = '23514';
  END IF;

  RETURN v_project_id;
END;
$$;

-- Trigger: enforce from/to project IDs match relation.projectId
CREATE OR REPLACE FUNCTION psymetric_enforce_entity_relation_project_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_from_project uuid;
  v_to_project   uuid;
BEGIN
  v_from_project := psymetric_resolve_entity_project_id(NEW."fromEntityType", NEW."fromEntityId");
  v_to_project   := psymetric_resolve_entity_project_id(NEW."toEntityType", NEW."toEntityId");

  IF v_from_project IS NULL THEN
    RAISE EXCEPTION 'EntityRelation fromEntity not found: % %', NEW."fromEntityType", NEW."fromEntityId"
      USING ERRCODE = '23503';
  END IF;

  IF v_to_project IS NULL THEN
    RAISE EXCEPTION 'EntityRelation toEntity not found: % %', NEW."toEntityType", NEW."toEntityId"
      USING ERRCODE = '23503';
  END IF;

  IF v_from_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'EntityRelation project mismatch (from): relation projectId % but fromEntity projectId %', NEW."projectId", v_from_project
      USING ERRCODE = '23514';
  END IF;

  IF v_to_project <> NEW."projectId" THEN
    RAISE EXCEPTION 'EntityRelation project mismatch (to): relation projectId % but toEntity projectId %', NEW."projectId", v_to_project
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (migration runs once; no need for drop/recreate idempotency)
CREATE TRIGGER trg_psymetric_entity_relation_project_integrity
BEFORE INSERT OR UPDATE ON "EntityRelation"
FOR EACH ROW
EXECUTE FUNCTION psymetric_enforce_entity_relation_project_integrity();
