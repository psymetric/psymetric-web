-- CreateTable
CREATE TABLE "public"."Video" (
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

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Video_primaryEntityType_primaryEntityId_idx" ON "public"."Video"("primaryEntityType", "primaryEntityId");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "public"."Video"("status");

-- CreateIndex
CREATE INDEX "Video_platform_idx" ON "public"."Video"("platform");
