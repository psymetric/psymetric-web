-- CreateEnum
CREATE TYPE "public"."MetricType" AS ENUM ('x_impressions', 'x_likes', 'x_reposts', 'x_replies', 'x_bookmarks');

-- CreateTable
CREATE TABLE "public"."DistributionEvent" (
    "id" UUID NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "status" "public"."EntityStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "primaryEntityType" "public"."ContentEntityType" NOT NULL,
    "primaryEntityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MetricSnapshot" (
    "id" UUID NOT NULL,
    "metricType" "public"."MetricType" NOT NULL,
    "value" INTEGER NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityType" "public"."ContentEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributionEvent_primaryEntityType_primaryEntityId_idx" ON "public"."DistributionEvent"("primaryEntityType", "primaryEntityId");

-- CreateIndex
CREATE INDEX "DistributionEvent_status_idx" ON "public"."DistributionEvent"("status");

-- CreateIndex
CREATE INDEX "DistributionEvent_platform_idx" ON "public"."DistributionEvent"("platform");

-- CreateIndex
CREATE INDEX "MetricSnapshot_metricType_capturedAt_idx" ON "public"."MetricSnapshot"("metricType", "capturedAt");

-- CreateIndex
CREATE INDEX "MetricSnapshot_entityType_entityId_capturedAt_idx" ON "public"."MetricSnapshot"("entityType", "entityId", "capturedAt");

-- AddForeignKey
ALTER TABLE "public"."DistributionEvent" ADD CONSTRAINT "DistributionEvent_primaryEntityId_fkey" FOREIGN KEY ("primaryEntityId") REFERENCES "public"."Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "public"."Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
