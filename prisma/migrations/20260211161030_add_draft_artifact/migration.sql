-- CreateEnum
CREATE TYPE "DraftArtifactKind" AS ENUM ('x_reply');

-- CreateEnum
CREATE TYPE "DraftArtifactStatus" AS ENUM ('draft', 'archived');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'DRAFT_CREATED';
ALTER TYPE "EventType" ADD VALUE 'DRAFT_EXPIRED';

-- CreateTable
CREATE TABLE "DraftArtifact" (
    "id" UUID NOT NULL,
    "kind" "DraftArtifactKind" NOT NULL,
    "status" "DraftArtifactStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "sourceItemId" UUID,
    "entityId" UUID,
    "createdBy" "ActorType" NOT NULL,
    "llmModel" TEXT,
    "llmMeta" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftArtifact_kind_status_idx" ON "DraftArtifact"("kind", "status");

-- CreateIndex
CREATE INDEX "DraftArtifact_sourceItemId_kind_idx" ON "DraftArtifact"("sourceItemId", "kind");

-- CreateIndex
CREATE INDEX "DraftArtifact_expiresAt_deletedAt_idx" ON "DraftArtifact"("expiresAt", "deletedAt");
