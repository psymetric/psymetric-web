-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."EntityType" ADD VALUE 'keywordTarget';
ALTER TYPE "public"."EntityType" ADD VALUE 'serpSnapshot';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."EventType" ADD VALUE 'KEYWORD_TARGET_CREATED';
ALTER TYPE "public"."EventType" ADD VALUE 'SERP_SNAPSHOT_RECORDED';

-- CreateTable
CREATE TABLE "public"."KeywordTarget" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "intent" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SERPSnapshot" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "validAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "payloadSchemaVersion" TEXT,
    "aiOverviewStatus" TEXT NOT NULL,
    "aiOverviewText" TEXT,
    "source" TEXT NOT NULL,
    "batchRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SERPSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordTarget_projectId_idx" ON "public"."KeywordTarget"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordTarget_projectId_query_locale_device_key" ON "public"."KeywordTarget"("projectId", "query", "locale", "device");

-- CreateIndex
CREATE INDEX "SERPSnapshot_projectId_query_locale_device_capturedAt_idx" ON "public"."SERPSnapshot"("projectId", "query", "locale", "device", "capturedAt");

-- CreateIndex
CREATE INDEX "SERPSnapshot_projectId_idx" ON "public"."SERPSnapshot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SERPSnapshot_projectId_query_locale_device_capturedAt_key" ON "public"."SERPSnapshot"("projectId", "query", "locale", "device", "capturedAt");

-- AddForeignKey
ALTER TABLE "public"."KeywordTarget" ADD CONSTRAINT "KeywordTarget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SERPSnapshot" ADD CONSTRAINT "SERPSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
