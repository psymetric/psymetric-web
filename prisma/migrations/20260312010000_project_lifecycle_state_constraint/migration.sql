-- Migration: project_lifecycle_state_constraint
-- Batch 3 — Project resolution safety hardening
--
-- Adds a CHECK constraint on Project.lifecycleState to enforce that only
-- known lifecycle state values can be persisted. This closes the gap where
-- any string could be written to lifecycleState without DB-level rejection.
--
-- Valid states per docs/veda-project-lifecycle-workflow.md:
--   created, draft, researching, targeting, observing, developing, seasoned,
--   paused, archived
--
-- NULL is still allowed (existing rows may have NULL; the Prisma default
-- of "created" is applied at the application layer before write).
--
-- This constraint does not touch transition logic — all transition rules
-- remain application-enforced. This only prevents unknown values from
-- being stored.

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_lifecycleState_check"
  CHECK (
    "lifecycleState" IS NULL OR "lifecycleState" IN (
      'created',
      'draft',
      'researching',
      'targeting',
      'observing',
      'developing',
      'seasoned',
      'paused',
      'archived'
    )
  );
