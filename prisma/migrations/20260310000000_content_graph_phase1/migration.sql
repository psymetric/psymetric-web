-- Content Graph Phase 1 Migration
-- Per docs/specs/CONTENT-GRAPH-DATA-MODEL.md, docs/specs/CONTENT-GRAPH-PHASES.md
-- Adds: CgSurface, CgSite, CgPage, CgContentArchetype, CgTopic, CgEntity,
--       CgPageTopic, CgPageEntity, CgInternalLink, CgSchemaUsage
-- Also extends EventType and EntityType enums with Content Graph values.

-- Enums

CREATE TYPE "CgSurfaceType" AS ENUM ('website', 'wiki', 'blog', 'x', 'youtube');
CREATE TYPE "CgPublishingState" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "CgPageRole" AS ENUM ('primary', 'supporting', 'reviewed', 'compared', 'navigation');
CREATE TYPE "CgLinkRole" AS ENUM ('hub', 'support', 'navigation');

ALTER TYPE "EntityType" ADD VALUE 'cgSurface';
ALTER TYPE "EntityType" ADD VALUE 'cgSite';
ALTER TYPE "EntityType" ADD VALUE 'cgPage';
ALTER TYPE "EntityType" ADD VALUE 'cgContentArchetype';
ALTER TYPE "EntityType" ADD VALUE 'cgTopic';
ALTER TYPE "EntityType" ADD VALUE 'cgEntity';
ALTER TYPE "EntityType" ADD VALUE 'cgInternalLink';
ALTER TYPE "EntityType" ADD VALUE 'cgSchemaUsage';
ALTER TYPE "EntityType" ADD VALUE 'cgPageTopic';
ALTER TYPE "EntityType" ADD VALUE 'cgPageEntity';

ALTER TYPE "EventType" ADD VALUE 'CG_SURFACE_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_SITE_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_PAGE_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_ARCHETYPE_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_TOPIC_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_ENTITY_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_INTERNAL_LINK_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_SCHEMA_USAGE_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_PAGE_TOPIC_CREATED';
ALTER TYPE "EventType" ADD VALUE 'CG_PAGE_ENTITY_CREATED';

-- CgSurface

CREATE TABLE "CgSurface" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID         NOT NULL,
    "type"      "CgSurfaceType" NOT NULL,
    "key"       TEXT         NOT NULL,
    "label"     TEXT,
    "enabled"   BOOLEAN      NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgSurface_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgSurface" ADD CONSTRAINT "CgSurface_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgSurface_projectId_key_key" ON "CgSurface"("projectId", "key");
CREATE INDEX "CgSurface_projectId_type_idx" ON "CgSurface"("projectId", "type");

-- CgSite

CREATE TABLE "CgSite" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId"   UUID         NOT NULL,
    "surfaceId"   UUID         NOT NULL,
    "domain"      TEXT         NOT NULL,
    "framework"   TEXT,
    "isCanonical" BOOLEAN      NOT NULL DEFAULT true,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgSite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgSite" ADD CONSTRAINT "CgSite_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CgSite" ADD CONSTRAINT "CgSite_surfaceId_fkey"
    FOREIGN KEY ("surfaceId") REFERENCES "CgSurface"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgSite_projectId_domain_key" ON "CgSite"("projectId", "domain");
CREATE INDEX "CgSite_projectId_surfaceId_idx" ON "CgSite"("projectId", "surfaceId");

-- CgContentArchetype

CREATE TABLE "CgContentArchetype" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID         NOT NULL,
    "key"       TEXT         NOT NULL,
    "label"     TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgContentArchetype_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgContentArchetype" ADD CONSTRAINT "CgContentArchetype_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgContentArchetype_projectId_key_key" ON "CgContentArchetype"("projectId", "key");
CREATE INDEX "CgContentArchetype_projectId_idx" ON "CgContentArchetype"("projectId");

-- CgPage

CREATE TABLE "CgPage" (
    "id"                 UUID               NOT NULL DEFAULT gen_random_uuid(),
    "projectId"          UUID               NOT NULL,
    "siteId"             UUID               NOT NULL,
    "contentArchetypeId" UUID,
    "url"                TEXT               NOT NULL,
    "title"              TEXT               NOT NULL,
    "canonicalUrl"       TEXT,
    "publishingState"    "CgPublishingState" NOT NULL DEFAULT 'draft',
    "isIndexable"        BOOLEAN            NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "CgPage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgPage" ADD CONSTRAINT "CgPage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CgPage" ADD CONSTRAINT "CgPage_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "CgSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CgPage" ADD CONSTRAINT "CgPage_contentArchetypeId_fkey"
    FOREIGN KEY ("contentArchetypeId") REFERENCES "CgContentArchetype"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgPage_projectId_url_key" ON "CgPage"("projectId", "url");
CREATE INDEX "CgPage_projectId_siteId_publishingState_idx" ON "CgPage"("projectId", "siteId", "publishingState");

-- CgTopic

CREATE TABLE "CgTopic" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID         NOT NULL,
    "key"       TEXT         NOT NULL,
    "label"     TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgTopic_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgTopic" ADD CONSTRAINT "CgTopic_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgTopic_projectId_key_key" ON "CgTopic"("projectId", "key");
CREATE INDEX "CgTopic_projectId_idx" ON "CgTopic"("projectId");

-- CgEntity

CREATE TABLE "CgEntity" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId"  UUID         NOT NULL,
    "key"        TEXT         NOT NULL,
    "label"      TEXT         NOT NULL,
    "entityType" TEXT         NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgEntity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgEntity" ADD CONSTRAINT "CgEntity_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgEntity_projectId_key_key" ON "CgEntity"("projectId", "key");
CREATE INDEX "CgEntity_projectId_entityType_idx" ON "CgEntity"("projectId", "entityType");

-- CgPageTopic

CREATE TABLE "CgPageTopic" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID         NOT NULL,
    "pageId"    UUID         NOT NULL,
    "topicId"   UUID         NOT NULL,
    "role"      "CgPageRole" NOT NULL DEFAULT 'supporting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgPageTopic_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgPageTopic" ADD CONSTRAINT "CgPageTopic_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "CgPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CgPageTopic" ADD CONSTRAINT "CgPageTopic_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "CgTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgPageTopic_pageId_topicId_key" ON "CgPageTopic"("pageId", "topicId");
CREATE INDEX "CgPageTopic_projectId_topicId_idx" ON "CgPageTopic"("projectId", "topicId");

-- CgPageEntity

CREATE TABLE "CgPageEntity" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID         NOT NULL,
    "pageId"    UUID         NOT NULL,
    "entityId"  UUID         NOT NULL,
    "role"      "CgPageRole" NOT NULL DEFAULT 'supporting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgPageEntity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgPageEntity" ADD CONSTRAINT "CgPageEntity_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "CgPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CgPageEntity" ADD CONSTRAINT "CgPageEntity_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "CgEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgPageEntity_pageId_entityId_key" ON "CgPageEntity"("pageId", "entityId");
CREATE INDEX "CgPageEntity_projectId_entityId_idx" ON "CgPageEntity"("projectId", "entityId");

-- CgInternalLink

CREATE TABLE "CgInternalLink" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    UUID         NOT NULL,
    "sourcePageId" UUID         NOT NULL,
    "targetPageId" UUID         NOT NULL,
    "anchorText"   TEXT,
    "linkRole"     "CgLinkRole" NOT NULL DEFAULT 'support',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgInternalLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgInternalLink" ADD CONSTRAINT "CgInternalLink_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CgInternalLink" ADD CONSTRAINT "CgInternalLink_sourcePageId_fkey"
    FOREIGN KEY ("sourcePageId") REFERENCES "CgPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CgInternalLink" ADD CONSTRAINT "CgInternalLink_targetPageId_fkey"
    FOREIGN KEY ("targetPageId") REFERENCES "CgPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgInternalLink_sourcePageId_targetPageId_key" ON "CgInternalLink"("sourcePageId", "targetPageId");
CREATE INDEX "CgInternalLink_projectId_sourcePageId_idx" ON "CgInternalLink"("projectId", "sourcePageId");
CREATE INDEX "CgInternalLink_projectId_targetPageId_idx" ON "CgInternalLink"("projectId", "targetPageId");

-- CgSchemaUsage

CREATE TABLE "CgSchemaUsage" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "projectId"  UUID         NOT NULL,
    "pageId"     UUID         NOT NULL,
    "schemaType" TEXT         NOT NULL,
    "isPrimary"  BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgSchemaUsage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CgSchemaUsage" ADD CONSTRAINT "CgSchemaUsage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CgSchemaUsage" ADD CONSTRAINT "CgSchemaUsage_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "CgPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CgSchemaUsage_pageId_schemaType_key" ON "CgSchemaUsage"("pageId", "schemaType");
CREATE INDEX "CgSchemaUsage_projectId_schemaType_idx" ON "CgSchemaUsage"("projectId", "schemaType");
CREATE INDEX "CgSchemaUsage_projectId_pageId_idx" ON "CgSchemaUsage"("projectId", "pageId");
