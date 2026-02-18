-- CreateEnum
CREATE TYPE "public"."ClaimType" AS ENUM ('statistic', 'comparison', 'definition', 'howto_step');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_keyword_research';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_serp_snapshot';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_content_brief';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_competitor_notes';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_llm_mentions';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'seo_llm_response';
ALTER TYPE "public"."DraftArtifactKind" ADD VALUE 'byda_s_audit';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."EntityType" ADD VALUE 'quotableBlock';
ALTER TYPE "public"."EntityType" ADD VALUE 'searchPerformance';
ALTER TYPE "public"."EntityType" ADD VALUE 'draftArtifact';

-- AlterEnum
ALTER TYPE "public"."EventType" ADD VALUE 'QUOTABLE_BLOCK_CREATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."MetricType" ADD VALUE 'gsc_impressions';
ALTER TYPE "public"."MetricType" ADD VALUE 'gsc_clicks';
ALTER TYPE "public"."MetricType" ADD VALUE 'ga4_pageviews';
ALTER TYPE "public"."MetricType" ADD VALUE 'ga4_sessions';
ALTER TYPE "public"."MetricType" ADD VALUE 'yt_views';
ALTER TYPE "public"."MetricType" ADD VALUE 'yt_watch_time_hours';
ALTER TYPE "public"."MetricType" ADD VALUE 'yt_ctr';
ALTER TYPE "public"."MetricType" ADD VALUE 'yt_avg_retention_pct';
ALTER TYPE "public"."MetricType" ADD VALUE 'geo_citability_score';
ALTER TYPE "public"."MetricType" ADD VALUE 'geo_extractability_score';
ALTER TYPE "public"."MetricType" ADD VALUE 'geo_factual_density';
ALTER TYPE "public"."MetricType" ADD VALUE 'ai_search_volume';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."Platform" ADD VALUE 'reddit';
ALTER TYPE "public"."Platform" ADD VALUE 'hackernews';
ALTER TYPE "public"."Platform" ADD VALUE 'substack';
ALTER TYPE "public"."Platform" ADD VALUE 'linkedin';
ALTER TYPE "public"."Platform" ADD VALUE 'discord';

-- AlterTable
ALTER TABLE "public"."DraftArtifact" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "schemaVersion" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "public"."Entity" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."MetricSnapshot" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."SearchPerformance" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "entityId" UUID,
    "pageUrl" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "avgPosition" DOUBLE PRECISION NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuotableBlock" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "claimType" "public"."ClaimType" NOT NULL,
    "sourceCitation" TEXT,
    "verifiedUntil" TIMESTAMP(3),
    "topicTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotableBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchPerformance_projectId_capturedAt_idx" ON "public"."SearchPerformance"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "SearchPerformance_projectId_pageUrl_dateStart_idx" ON "public"."SearchPerformance"("projectId", "pageUrl", "dateStart");

-- CreateIndex
CREATE INDEX "SearchPerformance_projectId_query_dateStart_idx" ON "public"."SearchPerformance"("projectId", "query", "dateStart");

-- CreateIndex
CREATE UNIQUE INDEX "SearchPerformance_projectId_query_pageUrl_dateStart_dateEnd_key" ON "public"."SearchPerformance"("projectId", "query", "pageUrl", "dateStart", "dateEnd");

-- CreateIndex
CREATE INDEX "QuotableBlock_projectId_entityId_idx" ON "public"."QuotableBlock"("projectId", "entityId");

-- CreateIndex
CREATE INDEX "QuotableBlock_projectId_claimType_idx" ON "public"."QuotableBlock"("projectId", "claimType");

-- CreateIndex
CREATE INDEX "DraftArtifact_contentHash_idx" ON "public"."DraftArtifact"("contentHash");

-- AddForeignKey
ALTER TABLE "public"."SearchPerformance" ADD CONSTRAINT "SearchPerformance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SearchPerformance" ADD CONSTRAINT "SearchPerformance_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "public"."Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuotableBlock" ADD CONSTRAINT "QuotableBlock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuotableBlock" ADD CONSTRAINT "QuotableBlock_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "public"."Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
