-- CreateEnum
CREATE TYPE "public"."SourceType" AS ENUM ('rss', 'webpage', 'comment', 'reply', 'video', 'other');

-- CreateEnum
CREATE TYPE "public"."Platform" AS ENUM ('website', 'x', 'youtube', 'github', 'other');

-- CreateEnum
CREATE TYPE "public"."SourceItemStatus" AS ENUM ('ingested', 'triaged', 'used', 'archived');

-- CreateEnum
CREATE TYPE "public"."CapturedBy" AS ENUM ('human', 'llm', 'system');

-- CreateEnum
CREATE TYPE "public"."EntityType" AS ENUM ('guide', 'concept', 'project', 'news', 'distributionEvent', 'video', 'sourceItem', 'sourceFeed');

-- CreateEnum
CREATE TYPE "public"."ContentEntityType" AS ENUM ('guide', 'concept', 'project', 'news');

-- CreateEnum
CREATE TYPE "public"."EntityStatus" AS ENUM ('draft', 'publish_requested', 'published', 'archived');

-- CreateEnum
CREATE TYPE "public"."Difficulty" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "public"."ConceptKind" AS ENUM ('standard', 'model', 'comparison');

-- CreateEnum
CREATE TYPE "public"."RelationType" AS ENUM ('GUIDE_USES_CONCEPT', 'GUIDE_EXPLAINS_CONCEPT', 'GUIDE_REFERENCES_SOURCE', 'CONCEPT_RELATES_TO_CONCEPT', 'CONCEPT_REFERENCES_SOURCE', 'NEWS_DERIVED_FROM_SOURCE', 'NEWS_REFERENCES_SOURCE', 'NEWS_REFERENCES_CONCEPT', 'PROJECT_IMPLEMENTS_CONCEPT', 'PROJECT_REFERENCES_SOURCE', 'PROJECT_HAS_GUIDE', 'DISTRIBUTION_PROMOTES_GUIDE', 'DISTRIBUTION_PROMOTES_CONCEPT', 'DISTRIBUTION_PROMOTES_PROJECT', 'DISTRIBUTION_PROMOTES_NEWS', 'VIDEO_EXPLAINS_GUIDE', 'VIDEO_EXPLAINS_CONCEPT', 'VIDEO_EXPLAINS_PROJECT', 'VIDEO_EXPLAINS_NEWS');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('ENTITY_CREATED', 'ENTITY_UPDATED', 'ENTITY_PUBLISH_REQUESTED', 'ENTITY_PUBLISH_REJECTED', 'ENTITY_PUBLISHED', 'ENTITY_ARCHIVED', 'ENTITY_VALIDATION_FAILED', 'SOURCE_CAPTURED', 'SOURCE_TRIAGED', 'RELATION_CREATED', 'RELATION_REMOVED', 'DISTRIBUTION_CREATED', 'DISTRIBUTION_PLANNED', 'DISTRIBUTION_PUBLISHED', 'VIDEO_CREATED', 'VIDEO_PUBLISHED', 'METRIC_SNAPSHOT_RECORDED', 'SYSTEM_CONFIG_CHANGED');

-- CreateEnum
CREATE TYPE "public"."ActorType" AS ENUM ('human', 'llm', 'system');

-- CreateTable
CREATE TABLE "public"."SourceItem" (
    "id" UUID NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "platform" "public"."Platform" NOT NULL DEFAULT 'other',
    "url" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" "public"."CapturedBy" NOT NULL DEFAULT 'human',
    "contentHash" TEXT NOT NULL,
    "snapshotRef" TEXT,
    "snapshotMime" TEXT,
    "snapshotBytes" INTEGER,
    "operatorIntent" TEXT NOT NULL,
    "notes" TEXT,
    "status" "public"."SourceItemStatus" NOT NULL DEFAULT 'ingested',
    "archivedAt" TIMESTAMP(3),
    "sourceFeedId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SourceFeed" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "platformLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Entity" (
    "id" UUID NOT NULL,
    "entityType" "public"."ContentEntityType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "difficulty" "public"."Difficulty",
    "conceptKind" "public"."ConceptKind",
    "comparisonTargets" UUID[] DEFAULT ARRAY[]::UUID[],
    "repoUrl" TEXT,
    "repoDefaultBranch" TEXT,
    "license" TEXT,
    "status" "public"."EntityStatus" NOT NULL DEFAULT 'draft',
    "canonicalUrl" TEXT,
    "contentRef" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EntityRelation" (
    "id" UUID NOT NULL,
    "fromEntityType" "public"."EntityType" NOT NULL,
    "fromEntityId" UUID NOT NULL,
    "toEntityType" "public"."EntityType" NOT NULL,
    "toEntityId" UUID NOT NULL,
    "relationType" "public"."RelationType" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventLog" (
    "id" UUID NOT NULL,
    "eventType" "public"."EventType" NOT NULL,
    "entityType" "public"."EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "actor" "public"."ActorType" NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfig" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" "public"."ActorType" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_url_key" ON "public"."SourceItem"("url");

-- CreateIndex
CREATE INDEX "SourceItem_status_capturedAt_idx" ON "public"."SourceItem"("status", "capturedAt");

-- CreateIndex
CREATE INDEX "SourceItem_sourceType_platform_idx" ON "public"."SourceItem"("sourceType", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFeed_feedUrl_key" ON "public"."SourceFeed"("feedUrl");

-- CreateIndex
CREATE INDEX "Entity_entityType_status_idx" ON "public"."Entity"("entityType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_entityType_slug_key" ON "public"."Entity"("entityType", "slug");

-- CreateIndex
CREATE INDEX "EntityRelation_fromEntityType_fromEntityId_idx" ON "public"."EntityRelation"("fromEntityType", "fromEntityId");

-- CreateIndex
CREATE INDEX "EntityRelation_toEntityType_toEntityId_idx" ON "public"."EntityRelation"("toEntityType", "toEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRelation_fromEntityType_fromEntityId_relationType_toE_key" ON "public"."EntityRelation"("fromEntityType", "fromEntityId", "relationType", "toEntityType", "toEntityId");

-- CreateIndex
CREATE INDEX "EventLog_entityType_entityId_timestamp_idx" ON "public"."EventLog"("entityType", "entityId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "public"."SystemConfig"("key");

-- AddForeignKey
ALTER TABLE "public"."SourceItem" ADD CONSTRAINT "SourceItem_sourceFeedId_fkey" FOREIGN KEY ("sourceFeedId") REFERENCES "public"."SourceFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
