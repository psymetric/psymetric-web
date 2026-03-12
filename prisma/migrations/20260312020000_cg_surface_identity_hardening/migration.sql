-- Migration: CgSurface identity hardening
--
-- Goals:
--   1. Add canonicalIdentifier — durable machine-readable platform identity.
--   2. Add canonicalUrl — optional presentation/reference URL.
--   3. Enforce key format: lowercase a-z, 0-9, hyphens only; no leading/trailing
--      hyphen; 1–100 chars. Protects against case drift on direct DB writes.
--   4. Enforce partial unique index on (projectId, type, canonicalIdentifier)
--      WHERE canonicalIdentifier IS NOT NULL, preventing duplicate platform
--      identities within a project while allowing surfaces with no identifier yet.
--
-- Multiple surfaces of the same type remain allowed (no singleton-per-type).
-- This preserves future multi-account use cases (e.g. two YouTube channels).

-- ---------------------------------------------------------------------------
-- 1. Add new columns
-- ---------------------------------------------------------------------------

ALTER TABLE "CgSurface"
  ADD COLUMN "canonicalIdentifier" TEXT,
  ADD COLUMN "canonicalUrl"        TEXT;

-- ---------------------------------------------------------------------------
-- 2. Key format CHECK constraint
--
-- Pattern: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
-- Allows single-char keys (e.g. "x") and multi-char lowercase-hyphen keys.
-- Rejects: uppercase, whitespace, leading/trailing hyphens, special chars.
-- ---------------------------------------------------------------------------

ALTER TABLE "CgSurface"
  ADD CONSTRAINT "CgSurface_key_format"
  CHECK ("key" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');

-- ---------------------------------------------------------------------------
-- 3. canonicalIdentifier format CHECK constraint
--
-- When present, must be non-empty and contain no whitespace.
-- Platform-specific format validation is enforced at the application layer.
-- ---------------------------------------------------------------------------

ALTER TABLE "CgSurface"
  ADD CONSTRAINT "CgSurface_canonicalIdentifier_format"
  CHECK ("canonicalIdentifier" IS NULL OR ("canonicalIdentifier" <> '' AND "canonicalIdentifier" !~ '\s'));

-- ---------------------------------------------------------------------------
-- 4. Partial unique index: one canonicalIdentifier per (project, type)
--
-- Using a partial index (WHERE NOT NULL) rather than a regular unique constraint
-- because NULL values must remain non-exclusive — surfaces without an identifier
-- yet must be able to coexist.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "CgSurface_projectId_type_canonicalIdentifier_key"
  ON "CgSurface" ("projectId", "type", "canonicalIdentifier")
  WHERE "canonicalIdentifier" IS NOT NULL;
