-- Enforce that SEO tables cannot reference entities across projects.
-- Mirrors 20260214193000_enforce_entity_relation_project_integrity.

CREATE OR REPLACE FUNCTION enforce_quotable_block_entity_project_integrity()
RETURNS trigger AS $$
DECLARE
  entity_project_id uuid;
BEGIN
  SELECT "projectId"
    INTO entity_project_id
    FROM "Entity"
   WHERE "id" = NEW."entityId";

  IF entity_project_id IS NULL THEN
    RAISE EXCEPTION 'QuotableBlock entityId % does not exist', NEW."entityId";
  END IF;

  IF entity_project_id <> NEW."projectId" THEN
    RAISE EXCEPTION
      'Cross-project QuotableBlock is not allowed: quotable.projectId=% entity.projectId=%',
      NEW."projectId", entity_project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_quotable_block_entity_project_integrity ON "QuotableBlock";
CREATE TRIGGER trg_enforce_quotable_block_entity_project_integrity
BEFORE INSERT OR UPDATE ON "QuotableBlock"
FOR EACH ROW
EXECUTE FUNCTION enforce_quotable_block_entity_project_integrity();


CREATE OR REPLACE FUNCTION enforce_search_performance_entity_project_integrity()
RETURNS trigger AS $$
DECLARE
  entity_project_id uuid;
BEGIN
  -- entityId is optional for SearchPerformance, so only enforce when present.
  IF NEW."entityId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "projectId"
    INTO entity_project_id
    FROM "Entity"
   WHERE "id" = NEW."entityId";

  IF entity_project_id IS NULL THEN
    RAISE EXCEPTION 'SearchPerformance entityId % does not exist', NEW."entityId";
  END IF;

  IF entity_project_id <> NEW."projectId" THEN
    RAISE EXCEPTION
      'Cross-project SearchPerformance is not allowed: sp.projectId=% entity.projectId=%',
      NEW."projectId", entity_project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_search_performance_entity_project_integrity ON "SearchPerformance";
CREATE TRIGGER trg_enforce_search_performance_entity_project_integrity
BEFORE INSERT OR UPDATE ON "SearchPerformance"
FOR EACH ROW
EXECUTE FUNCTION enforce_search_performance_entity_project_integrity();
